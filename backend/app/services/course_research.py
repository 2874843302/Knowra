"""Bounded public search discovery. Returned excerpts are search snippets, not page bodies."""
import asyncio
import base64
import ipaddress
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import HTTPException


def public_url(value):
    try:
        parsed = urlparse(value)
        host = parsed.hostname
        if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
            return None
        if host == "localhost" or "." not in host or host.endswith((".local", ".localhost", ".internal")):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            pass
        if parsed.port not in {None, 80, 443}:
            return None
        return value[:2000]
    except (ValueError, TypeError):
        return None


def destination(value):
    """Unwrap search redirects for display only; never fetch result URLs."""
    parsed = urlparse(value)
    if parsed.hostname in {"www.bing.com", "bing.com", "cn.bing.com"}:
        encoded = parse_qs(parsed.query).get("u", [""])[0]
        if not encoded.startswith("a1"):
            return None
        try:
            value = base64.urlsafe_b64decode(encoded[2:] + "=" * (-len(encoded[2:]) % 4)).decode()
        except (ValueError, UnicodeError):
            return None
    return public_url(value)


class SearchResults(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results = []
        self.item = None
        self.depth = 0
        self.heading = False
        self.paragraph = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "li":
            if self.item is not None:
                self.depth += 1
            elif "b_algo" in attrs.get("class", "").split():
                self.item = {"title": "", "url": "", "snippet": ""}
                self.depth = 1
        if self.item is None:
            return
        if tag == "h2":
            self.heading = True
        if tag == "a" and self.heading and not self.item["url"]:
            self.item["url"] = destination(attrs.get("href", "")) or ""
        if tag == "p":
            self.paragraph = True

    def handle_endtag(self, tag):
        if self.item is None:
            return
        if tag == "h2":
            self.heading = False
        if tag == "p":
            self.paragraph = False
        if tag == "li":
            self.depth -= 1
            if self.depth == 0:
                if all(self.item.values()):
                    self.results.append({key: " ".join(value.split()) for key, value in self.item.items()})
                self.item = None
                self.heading = self.paragraph = False

    def handle_data(self, data):
        if self.item is not None:
            if self.heading:
                self.item["title"] += data
            elif self.paragraph:
                self.item["snippet"] += data


async def search_courses(queries):
    async def search(client, query):
        try:
            # Fixed origin, no redirects or arbitrary result-page requests.
            async with client.stream("GET", "https://cn.bing.com/search",
                                     params={"q": query, "count": 6},
                                     headers={"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"}) as response:
                response.raise_for_status()
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > 1_500_000:
                        return []
            parser = SearchResults()
            parser.feed(content.decode("utf-8", errors="replace"))
            return [{**item, "query": query} for item in parser.results[:6]]
        except (httpx.HTTPError, ValueError):
            return []

    async with httpx.AsyncClient(timeout=18, follow_redirects=False) as client:
        groups = await asyncio.gather(*(search(client, query) for query in queries))
    sources, seen = [], set()
    # Interleave queries so a multi-topic request doesn't lose its second subject.
    for index in range(6):
        for group in groups:
            if index >= len(group):
                continue
            item = group[index]
            if item["url"] in seen:
                continue
            seen.add(item["url"])
            sources.append({"id": f"source-{len(sources) + 1}", "title": item["title"][:250],
                            "url": item["url"], "snippet": item["snippet"][:700], "query": item["query"]})
            if len(sources) == 8:
                break
        if len(sources) == 8:
            break
    if not sources:
        raise HTTPException(502, "暂时未检索到可用资料，可能是网络或检索服务不可用。请重试或调整学习主题。")
    failed = [query for query, group in zip(queries, groups) if not group]
    return {"queries": queries, "sources": sources, "engine": "Bing",
            "retrievedAt": datetime.now(timezone.utc).isoformat(), "failedQueries": failed,
            "scope": "search_snippets"}
