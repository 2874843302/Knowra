import json
import secrets
from datetime import date

import httpx


def test_chat_agent_routing_uses_selected_model_and_safe_system_contract(client, monkeypatch):
    response = client.post("/api/provider", json={"baseUrl": "https://chat.example.test/v1", "model": "search-capable", "apiKey": secrets.token_urlsafe(24)})
    profile_id = response.json()["activeId"]
    captured = []

    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"action":"search","queries":["Python official docs"]}'}}]})

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    result = client.post("/api/ai", json={"provider_id": profile_id, "kind": "chat_agent", "messages": [{"role": "user", "content": "帮我查文档"}]})
    assert result.status_code == 200
    assert json.loads(result.json()["content"])["action"] == "search"
    assert captured[0]["model"] == "search-capable"
    assert captured[0]["response_format"] == {"type": "json_object"}
    system = captured[0]["messages"][0]["content"]
    assert "web_search" in system and "不伪造来源" in system and "不能声称读过全文" in system
    assert date.today().isoformat() in system
    assert client.post("/api/ai", json={"kind": "unsupported_tool", "messages": [{"role": "user", "content": "test"}]}).status_code == 422


def test_search_still_requires_login(client):
    client.post("/api/auth/logout")
    assert client.post("/api/web-search", json={"queries": ["Python docs"]}).status_code == 401
