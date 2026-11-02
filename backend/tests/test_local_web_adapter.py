import json
from uuid import uuid4

import httpx
import pytest

from app.services.provider import SYSTEMS, uses_local_web_adapter


@pytest.mark.parametrize("kind", list(SYSTEMS))
def test_local_web_adapter_sends_only_supported_fields_and_waits_for_reasoning(client, monkeypatch, kind):
    client.put("/api/provider", json={
        "baseUrl": "http://127.0.0.1:8787/v1", "model": "deepseek-web", "apiKey": "fixture-only",
    })
    requests = []
    timeouts = []

    def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        assert set(body) == {"model", "messages"}
        assert body["messages"][0] == {"role": "system", "content": SYSTEMS[kind]}
        assert request.url.path == "/v1/chat/completions"
        return httpx.Response(200, json={"choices": [{"message": {
            "content": "adapter fixture answer", "reasoning_content": "separate reasoning",
        }, "finish_reason": "stop"}]})

    original = httpx.AsyncClient

    def factory(**kwargs):
        timeouts.append(kwargs["timeout"])
        return original(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", factory)
    response = client.post("/api/ai", json={"kind": kind, "messages": [{"role": "user", "content": "fixture"}]})
    assert response.status_code == 200
    assert response.json() == {"content": "adapter fixture answer"}
    assert len(requests) == 1
    assert timeouts == [360]


@pytest.mark.parametrize("base_url,model,expected", [
    ("http://127.0.0.1:8787/v1", "deepseek-web", True),
    ("http://localhost:8788/v1/", "deepseek-web-thinking", True),
    ("http://127.0.0.1:8787/v1", "deepseek-web-search", True),
    ("http://[::1]:8787/v1", "deepseek-web-thinking-search", True),
    ("https://api.deepseek.com/v1", "deepseek-chat", False),
    ("https://example.com/v1", "deepseek-web", False),
    ("http://127.0.0.1:8787/v1", "another-model", False),
    ("http://127.0.0.1:8787/v1/chat/completions", "deepseek-web", False),
])
def test_local_web_profile_does_not_change_other_provider_contracts(base_url, model, expected):
    assert uses_local_web_adapter({"baseUrl": base_url, "model": model}) is expected


def test_local_web_errors_do_not_trigger_json_fallback_or_automatic_replay(client, monkeypatch):
    client.put("/api/provider", json={
        "baseUrl": "http://127.0.0.1:8787/v1", "model": "deepseek-web", "apiKey": "fixture-only",
    })
    attempts = []

    def handler(request):
        attempts.append(request)
        return httpx.Response(429, json={"error": {"code": "hourly_budget_exhausted"}})

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    response = client.post("/api/ai", json={"kind": "course_plan", "messages": [{"role": "user", "content": "fixture"}]})
    assert response.status_code == 429
    assert "一小时" in response.json()["error"]
    assert len(attempts) == 1


@pytest.mark.parametrize("status,code,expected,retry", [
    (429, "hourly_budget_exhausted", "一小时", "65"),
    (429, "daily_budget_exhausted", "24 小时", "3600"),
    (429, "busy", "另一个请求", ""),
    (429, "duplicate_request", "重复请求", "120"),
    (429, "local_rate_limit", "请求间隔", "1"),
    (429, "upstream_rate_limited", "DeepSeek 返回了限流", "1800"),
    (503, "safety_paused", "保护暂停", "1800"),
    (503, "safety_paused", "手动恢复", "invalid"),
    (409, "conversation_uncertain", "结果不确定", ""),
    (409, "conversation_conflict", "另一个请求", ""),
    (409, "conversation_settings_changed", "思考或搜索", ""),
    (409, "conversation_instructions_changed", "系统指令", ""),
    (502, "identity_unavailable", "账号信息未加载", ""),
    (409, "upstream_conversation_limit", "容量限制", ""),
    (502, "generation_failed", "未完成本次生成", ""),
])
def test_local_guard_errors_show_reason_and_retry_after_without_replay(client, monkeypatch, status, code, expected, retry):
    client.put("/api/provider", json={
        "baseUrl": "http://127.0.0.1:8787/v1", "model": "deepseek-web", "apiKey": "fixture-only",
    })
    attempts = []

    def handler(request):
        attempts.append(request)
        return httpx.Response(status, headers={"Retry-After": retry}, json={
            "error": {"code": code, "message": "sensitive-fixture-do-not-forward"},
        })

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    response = client.post("/api/ai", json={"kind": "course_unit", "messages": [{"role": "user", "content": "fixture"}]})
    assert response.status_code == status
    assert expected in response.json()["error"]
    assert "已完成的讲次已保留" in response.json()["error"]
    assert "sensitive-fixture" not in response.text
    assert response.headers.get("Retry-After") == (retry if retry.isdigit() else None)
    assert len(attempts) == 1


def test_real_rate_cooldown_reason_is_preserved_without_exposing_upstream_text(client, monkeypatch):
    client.put("/api/provider", json={"baseUrl": "http://127.0.0.1:8787/v1", "model": "deepseek-web", "apiKey": "fixture-only"})
    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(
        transport=httpx.MockTransport(lambda request: httpx.Response(503, headers={"Retry-After": "1777"}, json={
            "error": {"code": "safety_paused", "pause_reason": "upstream_rate_limited", "message": "sensitive-fixture"},
        })), **kwargs))
    response = client.post("/api/ai", json={"kind": "course_unit", "messages": [{"role": "user", "content": "fixture"}]})
    assert response.status_code == 503
    assert "DeepSeek 已实际限流" in response.json()["error"]
    assert "1777 秒" in response.json()["error"]
    assert response.headers["Retry-After"] == "1777"
    assert "sensitive-fixture" not in response.text


@pytest.mark.parametrize("body", [b"not-json", b'{"error":{"code":["busy"]}}', b'{"error":{"code":"unknown","message":"sensitive-fixture"}}'])
def test_unknown_local_proxy_errors_remain_sanitized(client, monkeypatch, body):
    client.put("/api/provider", json={
        "baseUrl": "http://127.0.0.1:8787/v1", "model": "deepseek-web", "apiKey": "fixture-only",
    })
    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(
        transport=httpx.MockTransport(lambda request: httpx.Response(429, content=body)), **kwargs))
    response = client.post("/api/ai", json={"kind": "chat", "messages": [{"role": "user", "content": "fixture"}]})
    assert response.status_code == 502
    assert "429" in response.json()["error"]
    assert "sensitive-fixture" not in response.text


def test_course_lectures_and_repairs_keep_one_native_session_per_course(client, monkeypatch):
    client.put("/api/provider", json={
        "baseUrl": "http://127.0.0.1:8787/v1", "model": "deepseek-web", "apiKey": "fixture-only",
    })
    captured = []

    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]})

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    course_a, course_b = str(uuid4()), str(uuid4())
    cases = [
        (course_a, [{"role": "user", "content": "A lecture one"}]),
        (course_b, [{"role": "user", "content": "B lecture one"}]),
        (course_a, [{"role": "user", "content": "A lecture two"}]),
        (course_a, [{"role": "user", "content": "A lecture two"}, {"role": "user", "content": "Repair missing quiz"}]),
    ]
    for course_id, messages in cases:
        result = client.post("/api/ai", json={"kind": "course_unit", "conversation_id": course_id, "messages": messages})
        assert result.status_code == 200
    assert captured[0]["session_id"] == captured[2]["session_id"] == captured[3]["session_id"]
    assert captured[0]["session_id"] != captured[1]["session_id"]
    assert captured[0]["session_id"] == "knowra_course_unit_" + course_a
    for body in captured:
        assert len(body["messages"]) == 2
        assert body["messages"][0] == {"role": "system", "content": SYSTEMS["course_unit"]}
        assert body["messages"][1]["role"] == "user"
    assert captured[3]["messages"][1]["content"] == "A lecture two\n\nRepair missing quiz"


def test_course_truncation_continues_native_parent_without_changing_system(client, monkeypatch):
    client.put("/api/provider", json={
        "baseUrl": "http://127.0.0.1:8787/v1", "model": "deepseek-web", "apiKey": "fixture-only",
    })
    captured = []

    def handler(request):
        captured.append(json.loads(request.content))
        fragments = ['{"title":', '"complete', '"}']
        return httpx.Response(200, json={"choices": [{"message": {"content": fragments[len(captured) - 1]}, "finish_reason": "length" if len(captured) < 3 else "stop"}]})

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    response = client.post("/api/ai", json={"kind": "course_unit", "conversation_id": str(uuid4()), "messages": [{"role": "user", "content": "Generate lecture"}]})
    assert response.json() == {"content": '{"title":"complete"}'}
    assert len(captured) == 3
    assert captured[0]["session_id"] == captured[1]["session_id"] == captured[2]["session_id"]
    assert captured[0]["messages"][0] == captured[1]["messages"][0] == captured[2]["messages"][0]
    assert [message["role"] for message in captured[1]["messages"]] == ["system", "user"]
    assert "续写模式" in captured[1]["messages"][1]["content"]
    assert captured[1]["messages"][1]["content"] != captured[2]["messages"][1]["content"]


@pytest.mark.parametrize("base_url,model,kind", [
    ("https://example.com/v1", "another-model", "course_unit"),
    ("http://127.0.0.1:8787/v1", "deepseek-web", "chat"),
    ("http://127.0.0.1:8787/v1", "deepseek-web", "course_plan"),
])
def test_course_session_extension_only_applies_to_local_lecture_generation(client, monkeypatch, base_url, model, kind):
    client.put("/api/provider", json={"baseUrl": base_url, "model": model, "apiKey": "fixture-only"})
    captured = []

    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]})

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    assert client.post("/api/ai", json={"kind": kind, "conversation_id": str(uuid4()), "messages": [{"role": "user", "content": "fixture"}]}).status_code == 200
    assert "session_id" not in captured[0]


def test_course_session_id_must_be_a_valid_uuid(client):
    for value in ["", "../other", "course with spaces", 123]:
        response = client.post("/api/ai", json={"kind": "course_unit", "conversation_id": value, "messages": [{"role": "user", "content": "fixture"}]})
        assert response.status_code == 422
