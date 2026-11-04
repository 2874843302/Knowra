import json
import secrets

import httpx

from app.services.provider import Provider


def add(client, model, key=None):
    key = key or secrets.token_urlsafe(24)
    response = client.post("/api/provider", json={
        "name": f"学习 {model}", "baseUrl": f"https://{model}.example.test/v1/",
        "model": model, "apiKey": key,
    })
    assert response.status_code == 201
    profile = next(p for p in response.json()["profiles"] if p["model"] == model)
    assert "apiKey" not in profile and key not in response.text
    return profile["id"], key


def test_profile_crud_default_and_key_retention(client, monkeypatch):
    first, first_key = add(client, "first")
    second, second_key = add(client, "second")
    assert client.get("/api/provider").json()["activeId"] == first
    assert client.put("/api/provider/active", json={"id": second}).json()["model"] == "second"
    response = client.put("/api/provider", json={
        "id": first, "name": "重命名", "baseUrl": "https://first.example.test/v1", "model": "updated",
    })
    assert response.status_code == 200
    assert response.json()["activeId"] == second
    assert len(response.json()["profiles"]) == 2
    captured = []

    def handler(request):
        captured.append((request.url.host, json.loads(request.content)["model"], request.headers["authorization"]))
        return httpx.Response(200, json={"choices": [{"message": {"content": "answer"}}]})

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    messages = [{"role": "user", "content": "解释变量"}]
    assert client.post("/api/ai", json={"messages": messages, "provider_id": first}).status_code == 200
    assert client.post("/api/ai", json={"messages": messages}).status_code == 200
    assert captured == [
        ("first.example.test", "updated", "Bearer " + first_key),
        ("second.example.test", "second", "Bearer " + second_key),
    ]
    assert client.delete(f"/api/provider/{second}").json()["activeId"] == first
    assert client.delete(f"/api/provider/{first}").json()["profiles"] == []
    assert client.get("/api/provider").json()["configured"] is False
    assert client.post("/api/ai", json={"messages": messages}).status_code == 503
    assert first_key not in client.get("/api/provider").text


def test_unknown_profile_cannot_fall_back_or_reuse_another_key(client):
    first, _ = add(client, "first")
    assert client.post("/api/provider", json={"baseUrl": "https://second.example.test", "model": "second"}).status_code == 400
    assert client.put("/api/provider/active", json={"id": "missing"}).status_code == 404
    assert client.delete("/api/provider/missing").status_code == 404
    assert client.put("/api/provider", json={"id": "missing", "baseUrl": "https://example.test", "model": "m"}).status_code == 404
    assert client.post("/api/ai", json={"provider_id": "missing", "messages": [{"role": "user", "content": "hello"}]}).status_code == 404
    for url in ["https://example.test:bad", "https://[invalid", "https://user:pass@example.test", "javascript:alert(1)"]:
        assert client.post("/api/provider", json={"baseUrl": url, "model": "m", "apiKey": secrets.token_urlsafe(20)}).status_code == 400
    assert client.get("/api/provider").json()["activeId"] == first
    assert len(client.get("/api/provider").json()["profiles"]) == 1


def test_legacy_environment_and_file_migration(client):
    service = client.app.state.provider
    key = secrets.token_urlsafe(24)
    service.path.write_text(json.dumps({"baseUrl": "https://legacy.example.test/v1", "model": "legacy", "apiKey": key}), encoding="utf-8")
    initial = client.get("/api/provider").json()
    assert initial["activeId"] == "default" and len(initial["profiles"]) == 1
    assert service.read()["apiKey"] == key
    new_id, _ = add(client, "new")
    restored = Provider(service.settings)
    assert restored.read("default")["apiKey"] == key
    assert len(restored.public()["profiles"]) == 2
    assert client.put("/api/provider/active", json={"id": new_id}).status_code == 200
    assert Provider(service.settings).public()["activeId"] == new_id
    service.path.unlink()
    service.settings.ai_base_url = "https://environment.example.test/v1"
    service.settings.ai_model = "environment"
    service.settings.ai_api_key = key
    assert client.get("/api/provider").json()["model"] == "environment"
    assert client.delete("/api/provider/default").status_code == 200
    # An explicitly emptied list must not silently resurrect environment defaults.
    assert Provider(service.settings).public()["profiles"] == []


def test_profiles_are_account_scoped(client):
    first, _ = add(client, "private")
    response = client.post("/api/auth/register", json={
        "email": "other-models@example.test", "password": secrets.token_urlsafe(20), "name": "其他用户",
    })
    assert response.status_code == 201
    assert client.get("/api/provider").json()["profiles"] == []
    assert client.put("/api/provider/active", json={"id": first}).status_code == 404
    assert client.delete(f"/api/provider/{first}").status_code == 404
    assert client.post("/api/ai", json={"provider_id": first, "messages": [{"role": "user", "content": "hello"}]}).status_code == 404
    add(client, "other")
    assert client.post("/api/auth/login", json=client.test_credentials).status_code == 200
    assert [p["id"] for p in client.get("/api/provider").json()["profiles"]] == [first]


def test_inflight_continuation_keeps_its_selected_model(client, monkeypatch):
    first, key = add(client, "first")
    second, _ = add(client, "second")
    captured = []

    def handler(request):
        captured.append((request.url.host, request.headers["authorization"], json.loads(request.content)["model"]))
        initial = len(captured) == 1
        if initial:
            client.app.state.provider.activate(second)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"title":' if initial else '"complete"}'}, "finish_reason": "length" if initial else "stop"}]})

    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    response = client.post("/api/ai", json={"kind": "course_plan", "provider_id": first, "messages": [{"role": "user", "content": "generate"}]})
    assert response.json() == {"content": '{"title":"complete"}'}
    assert captured == [("first.example.test", "Bearer " + key, "first")] * 2
    assert client.get("/api/provider").json()["activeId"] == second
