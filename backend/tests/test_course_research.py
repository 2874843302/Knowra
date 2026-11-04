import base64
from html import escape

import httpx
import pytest

from app.services.course_research import SearchResults, destination


def result(title, url, snippet):
    return f'<li class="b_algo"><div><a href="https://ignored.example">Ignored</a></div><h2><a href="{escape(url)}">{title}</a></h2><div><p>{snippet}</p></div></li>'


def test_search_parser_keeps_actual_titles_excerpts_and_destinations():
    target = "https://vuejs.org/guide/introduction.html"
    redirect = "https://www.bing.com/ck/a?u=a1" + base64.urlsafe_b64encode(target.encode()).decode().rstrip("=")
    parser = SearchResults()
    parser.feed("<ul>" + result("Vue <strong>Guide</strong>", redirect, "Learn &amp; build") +
                result("Private", "http://127.0.0.1/private", "Exclude") +
                result("Unsafe", "javascript:alert(1)", "Exclude") + "</ul>")
    assert parser.results == [{"title": "Vue Guide", "url": target, "snippet": "Learn & build"}]
    assert destination("https://www.bing.com/ck/a?u=a1@@@") is None
    assert destination("http://localhost/a") is None
    assert destination("https://user:password@example.com/a") is None


@pytest.mark.parametrize("endpoint", ["/api/course-research", "/api/web-search"])
def test_research_contract_queries_and_real_response_parsing(client, monkeypatch, endpoint):
    captured = []

    def handler(request):
        captured.append(request)
        query = request.url.params["q"]
        if "Spring" in query:
            return httpx.Response(200, text="<ul>" + result("Spring Boot", "https://spring.io/projects/spring-boot", "Build services") + "</ul>")
        return httpx.Response(200, text="<ul>" + result("Vue guide", "https://vuejs.org/guide/", "Build user interfaces") * 2 + "</ul>")

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.course_research.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    response = client.post(endpoint, json={"queries": [" Vue guide ", "Spring Boot guide", "Vue guide"]})
    assert response.status_code == 200
    data = response.json()
    assert data["queries"] == ["Vue guide", "Spring Boot guide"]
    assert data["scope"] == "search_snippets"
    assert data["retrievedAt"]
    assert data["failedQueries"] == []
    assert len(data["sources"]) == 2
    assert data["sources"][1]["url"].startswith("https://spring.io/")
    assert data["sources"][0]["snippet"] == "Build user interfaces"
    assert len(captured) == 2
    assert all(r.url.host == "cn.bing.com" and r.url.path == "/search" for r in captured)
    assert all("authorization" not in r.headers for r in captured)


@pytest.mark.parametrize("mode", ["empty", "blocked", "timeout", "redirect", "oversize"])
def test_research_failures_are_explicit_never_fabricated(client, monkeypatch, mode):
    def handler(request):
        if mode == "timeout":
            raise httpx.ReadTimeout("network unavailable", request=request)
        if mode == "blocked":
            return httpx.Response(429)
        if mode == "redirect":
            return httpx.Response(302, headers={"location": "http://127.0.0.1/private"})
        if mode == "oversize":
            return httpx.Response(200, text="x" * 1_500_001)
        return httpx.Response(200, text="<html>Challenge or no results</html>")

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.course_research.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    response = client.post("/api/course-research", json={"queries": ["topic"]})
    assert response.status_code == 502
    assert "未检索到可用资料" in response.json()["error"]
    assert "sources" not in response.json()


def test_partial_research_and_invalid_queries(client, monkeypatch):
    def handler(request):
        return httpx.Response(200, text=result("Vue", "https://vuejs.org/", "Vue introduction") if request.url.params["q"] == "Vue" else "")

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.course_research.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    data = client.post("/api/course-research", json={"queries": ["Vue", "unavailable"]}).json()
    assert data["failedQueries"] == ["unavailable"]
    assert len(data["sources"]) == 1
    for queries in [[], [""], ["  "], ["x" * 201], ["a", "b", "c", "d"]]:
        assert client.post("/api/course-research", json={"queries": queries}).status_code == 422
