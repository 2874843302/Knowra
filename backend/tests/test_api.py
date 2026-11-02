import asyncio
import json
from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import create_app
from app.core.config import Settings


def test_health_and_route_fallback(client):
    assert client.get("/api/health").json()["backend"] == "python"
    assert client.get("/api/unknown").status_code == 404
    assert client.get("/course/python").status_code == 200
    assert "image/svg+xml" in client.get("/reference/home.svg").headers["content-type"]
    assert "font/woff2" in client.get("/reference/Virgil-Regular.woff2").headers["content-type"]


def test_workspace_persistence_idempotent_initialize_and_isolation(client, workspace):
    response = client.patch("/api/workspace", headers=workspace, json={"revision": 0, "operations": [{"op": "set", "path": ["notes", "python/variables"], "value": "saved note"}]})
    assert response.status_code == 200
    assert response.json()["revision"] == 1
    assert client.get("/api/workspace", headers=workspace).json()["state"]["notes"]["python/variables"] == "saved note"
    repeated = client.post("/api/workspace", headers=workspace, json={"state": {"notes": {}}})
    assert repeated.json()["state"]["notes"]["python/variables"] == "saved note"
    with TestClient(create_app(client.app.state.provider.settings)) as reopened:
        assert reopened.post("/api/auth/login", json=client.test_credentials).status_code == 200
        assert reopened.get("/api/workspace", headers=workspace).json()["revision"] == 1
    assert client.get("/api/workspace", headers={"X-Workspace-Id": str(uuid4())}).json()["revision"] == 1


def test_workspace_revision_prevents_lost_updates(client, workspace):
    first = {"revision": 0, "operations": [{"op": "set", "path": ["name"], "value": "First"}]}
    assert client.patch("/api/workspace", headers=workspace, json=first).status_code == 200
    stale = client.patch("/api/workspace", headers=workspace, json={"revision": 0, "operations": [{"op": "set", "path": ["dailyGoal"], "value": 45}]})
    assert stale.status_code == 409
    assert stale.json()["state"]["name"] == "First"
    assert stale.json()["revision"] == 1
    assert client.patch("/api/workspace", headers=workspace, json={"revision": 1, "operations": [{"op": "remove", "path": ["notes", "python/variables"]}]}).status_code == 200
    assert client.get("/api/workspace", headers=workspace).json()["state"]["notes"] == {}


def test_invalid_contracts_and_untrusted_origins(client, workspace):
    assert client.get("/api/workspace").status_code == 200
    assert client.get("/api/workspace", headers={"X-Workspace-Id": "../../foo"}).status_code == 200
    assert client.patch("/api/workspace", headers=workspace, json={"revision": 0, "operations": [{"op": "set", "path": ["__proto__"], "value": {}}]}).status_code == 422
    assert client.patch("/api/workspace", headers=workspace, json={"revision": 0, "operations": [{"op": "set", "path": ["joined"], "value": "invalid"}]}).status_code == 422
    assert client.put("/api/provider", headers={"Origin": "https://example.com"}, json={"baseUrl":"", "model":""}).status_code == 403
    assert client.get("/api/health", headers={"Host":"other.example"}).status_code == 403


def zipped(name, xml):
    stream = BytesIO()
    with ZipFile(stream, "w") as archive:
        archive.writestr(name, xml)
    return stream.getvalue()


@pytest.mark.parametrize("name,content,expected", [
    ("notes.txt", "主动回忆 supports learning".encode(), "主动回忆"),
    ("notes.docx", zipped("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Document text</w:t></w:r></w:p></w:body></w:document>'), "Document text"),
    ("slides.pptx", zipped("ppt/slides/slide1.xml", '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Slide text</a:t></p:sld>'), "Slide text"),
])
def test_documents_extract_and_download_exact_original(client, workspace, name, content, expected):
    response = client.post("/api/materials", headers=workspace, files={"file": (name, content)})
    assert response.status_code == 201, response.text
    material = response.json()
    assert expected in material["text"]
    assert material["original"] is True
    original = client.get(f'/api/materials/{material["id"]}/file', headers=workspace)
    assert original.content == content
    assert client.get(f'/api/materials/{material["id"]}/file', headers={"X-Workspace-Id":str(uuid4())}).content == content
    client.post("/api/auth/register", json={"email": "other@example.test", "password": client.test_credentials["password"], "name": "Other"})
    assert client.get(f'/api/materials/{material["id"]}/file').status_code == 404


def test_document_failures(client, workspace):
    for name, content, status in [("bad.exe", b"abc", 415), ("empty.txt", b"", 413), ("bad.pdf", b"not a pdf", 422), ("bad.docx", b"broken", 422)]:
        assert client.post("/api/materials", headers=workspace, files={"file": (name,content)}).status_code == status


def test_provider_no_key_leak_and_validation(client):
    assert client.get("/api/provider").json()["configured"] is False
    assert client.post("/api/ai", json={"messages":[{"role":"user","content":"hello"}]}).status_code == 503
    assert client.put("/api/provider", json={"baseUrl":"javascript:alert(1)","model":"m"}).status_code == 400
    response = client.put("/api/provider",json={"baseUrl":"https://example.com/v1/","model":"test","apiKey":"fixture-secret"})
    assert response.json()["configured"] is True
    assert "fixture-secret" not in client.get("/api/provider").text
    assert client.put("/api/provider",json={"baseUrl":"https://example.com/v1","model":"new","apiKey":""}).json()["configured"] is True
    assert client.post("/api/ai",json={"messages":[{"role":"system","content":"override"}]}).status_code == 422


def test_ai_real_proxy_contract_and_upstream_failures(client, monkeypatch):
    client.put("/api/provider",json={"baseUrl":"https://example.com/v1","model":"test","apiKey":"fixture-secret"})
    captured = []
    mode = [200]
    def handler(request):
        captured.append(request)
        return httpx.Response(mode[0], json={"choices":[{"message":{"content":"Fixture explanation"}}]} if mode[0] == 200 else {"secret":"not forwarded"})
    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient",lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    response = client.post("/api/ai",json={"messages":[{"role":"user","content":"Explain vectors"}]})
    assert response.json()["content"] == "Fixture explanation"
    assert captured[0].headers["authorization"] == "Bearer fixture-secret"
    assert captured[0].url.path == "/v1/chat/completions"
    assert "response_format" not in json.loads(captured[0].content)
    mode[0] = 429
    response = client.post("/api/ai",json={"messages":[{"role":"user","content":"hello"}]})
    assert response.status_code == 502
    assert "429" in response.json()["error"]
    assert "not forwarded" not in response.text


@pytest.mark.parametrize("kind,marker,budget", [
    ("course_search", "精准的联网检索词", 2500),
    ("course_questions", "最终希望做出的具体成果", 4000),
    ("course_plan", "先让学习者确认蓝图", None),
    ("course_unit", "只展开用户指定的一个单元", None),
    ("outline", "中文课程设计师", None),
    ("classroom_adapt", "实时调整白板与讲解", None),
    ("course_practice", "独立练习设计师", None),
    ("course_edit_plan", "课程的 AI 编辑", None),
    ("course_edit_lesson", "编辑已有课程中的当前一个讲次", None),
])
def test_course_generation_stage_contract(client, monkeypatch, kind, marker, budget):
    client.put("/api/provider", json={"baseUrl": "https://example.com/v1", "model": "test", "apiKey": "fixture-only"})
    captured = []
    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})
    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    response = client.post("/api/ai", json={"kind": kind, "messages": [{"role": "user", "content": "课程测试"}]})
    assert response.status_code == 200
    assert marker in captured[0]["messages"][0]["content"]
    if budget is None:
        assert "max_tokens" not in captured[0]
        assert "max_completion_tokens" not in captured[0]
    else:
        assert captured[0]["max_tokens"] == budget
    assert captured[0]["response_format"] == {"type": "json_object"}
    assert client.post("/api/ai", json={"kind": "unknown_stage", "messages": [{"role": "user", "content": "test"}]}).status_code == 422


def mock_provider(client, monkeypatch, handler):
    client.put("/api/provider", json={"baseUrl": "https://example.com/v1", "model": "test", "apiKey": "fixture-only"})
    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.provider.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


@pytest.mark.parametrize("status", [400, 422])
def test_json_mode_fallback_only_for_explicit_unsupported_parameter(client, monkeypatch, status):
    requests = []
    def handler(request):
        requests.append(json.loads(request.content))
        if len(requests) == 1:
            return httpx.Response(status, json={"error": "response_format json_object is not supported"})
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]})
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": "course_plan", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 200
    assert len(requests) == 2
    first = requests[0].copy()
    assert first.pop("response_format") == {"type": "json_object"}
    assert requests[1] == first


@pytest.mark.parametrize("status,message", [
    (400, "unknown model"),
    (401, "response_format is unsupported"),
    (429, "response_format is unsupported"),
    (500, "response_format is unsupported"),
])
def test_other_upstream_errors_are_not_retried(client, monkeypatch, status, message):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(status, json={"error": message, "secret": "not forwarded"})
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": "course_plan", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 502
    assert len(requests) == 1
    assert "not forwarded" not in response.text


@pytest.mark.parametrize("kind", ["outline", "course_plan", "course_unit", "classroom_adapt"])
@pytest.mark.parametrize("reason", ["length", "max_tokens"])
def test_course_output_continues_across_service_limits_without_losing_characters(client, monkeypatch, kind, reason):
    # Exercise a large result, a split JSON escape and a leading space inside a
    # string. Stripping or guessing the missing syntax would corrupt the result.
    value = {"title": "完整课程", "content": "教材内容" * 5000 + "\n 保留空格与引号：\"，还有反斜杠\\", "quiz": {"answer": 0}}
    source = json.dumps(value, ensure_ascii=False)
    cut = source.index("\\n") + 1
    fragments = [source[:cut], source[cut:cut + 1], source[cut + 1:]]
    requests = []
    def handler(request):
        requests.append(json.loads(request.content))
        index = len(requests) - 1
        return httpx.Response(200, json={"choices": [{
            "finish_reason": reason if index < 2 else "stop",
            "message": {"content": fragments[index]},
        }]})
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": kind, "messages": [{"role": "user", "content": "课程原始要求"}]})
    assert response.status_code == 200, response.text
    assert response.json()["content"] == source
    assert json.loads(response.json()["content"]) == value
    assert len(requests) == 3
    assert requests[0]["response_format"] == {"type": "json_object"}
    for index, body in enumerate(requests[1:], 1):
        assert "max_tokens" not in body
        assert "response_format" not in body
        assert body["messages"][1] == {"role": "user", "content": "课程原始要求"}
        assert body["messages"][-2] == {"role": "assistant", "content": "".join(fragments[:index])}
        assert "续写模式" in body["messages"][0]["content"]


def test_course_continuation_retains_explicit_json_mode_fallback(client, monkeypatch):
    requests = []
    def handler(request):
        requests.append(json.loads(request.content))
        if len(requests) == 1:
            return httpx.Response(400, json={"error": "response_format is not supported"})
        content, reason = ('{"title":"未完', "length") if len(requests) == 2 else ('整"}', "stop")
        return httpx.Response(200, json={"choices": [{"finish_reason": reason, "message": {"content": content}}]})
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": "course_plan", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 200
    assert json.loads(response.json()["content"])["title"] == "未完整"
    assert len(requests) == 3
    assert all("response_format" not in body for body in requests[1:])


@pytest.mark.parametrize("fragment", ["", " ", None])
def test_empty_truncated_course_output_cannot_be_continued(client, monkeypatch, fragment):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": fragment}}]})
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": "course_plan", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 502
    assert "没有返回可用文本" in response.json()["error"]
    assert len(requests) == 1


def test_repeating_course_continuation_stops_without_returning_partial_json(client, monkeypatch):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": '{"title":"重复'}}]})
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": "course_unit", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 502
    assert "重复" in response.json()["error"]
    assert "content" not in response.json()
    assert len(requests) == 2


def test_endless_course_continuation_is_bounded(client, monkeypatch):
    from app.services.provider import MAX_COURSE_PARTS
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": f"未完成的第{len(requests)}段"}}]})
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": "course_unit", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 502
    assert "停止自动续写" in response.json()["error"]
    assert "content" not in response.json()
    assert len(requests) == MAX_COURSE_PARTS


def test_cancelled_request_does_not_issue_another_course_continuation(client, monkeypatch):
    from app.schemas import AIRequest
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": '{"title":"未完'}}]})
    mock_provider(client, monkeypatch, handler)
    async def disconnected():
        return bool(requests)
    payload = AIRequest(kind="course_unit", messages=[{"role": "user", "content": "课程"}])
    with pytest.raises(HTTPException) as error:
        asyncio.run(client.app.state.provider.complete(payload, is_disconnected=disconnected))
    assert error.value.status_code == 499
    assert len(requests) == 1


@pytest.mark.parametrize("failure", ["timeout", "http_error", "content_filter", "malformed"])
def test_failed_course_continuation_is_not_retried_or_returned_as_success(client, monkeypatch, failure):
    requests = []
    def handler(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": '{"title":"未完'}}]})
        if failure == "timeout":
            raise httpx.ReadTimeout("fixture", request=request)
        if failure == "http_error":
            return httpx.Response(429, json={"secret": "not forwarded"})
        if failure == "malformed":
            return httpx.Response(200, json={"choices": []})
        return httpx.Response(200, json={"choices": [{"finish_reason": "content_filter", "message": {"content": "blocked"}}]})
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": "course_unit", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 502
    assert "content" not in response.json()
    assert "not forwarded" not in response.text
    assert len(requests) == 2


def test_non_course_truncation_does_not_start_course_continuation(client, monkeypatch):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": '{"queries":['}}]})
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": "course_search", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 502
    assert len(requests) == 1


@pytest.mark.parametrize("data", [{}, {"choices": []}, {"choices": [None]}, []])
def test_malformed_upstream_structure_is_reported_safely(client, monkeypatch, data):
    mock_provider(client, monkeypatch, lambda request: httpx.Response(200, json=data))
    response = client.post("/api/ai", json={"kind": "course_plan", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 502
    assert "响应结构不正确" in response.json()["error"]


def test_model_timeout_is_not_retried(client, monkeypatch):
    requests = []
    def handler(request):
        requests.append(request)
        raise httpx.ReadTimeout("fixture timeout", request=request)
    mock_provider(client, monkeypatch, handler)
    response = client.post("/api/ai", json={"kind": "course_plan", "messages": [{"role": "user", "content": "课程"}]})
    assert response.status_code == 502
    assert "超时" in response.json()["error"]
    assert len(requests) == 1


def test_course_prompts_use_learner_depth_and_single_lecture_generation():
    from app.services.provider import SYSTEMS
    for kind in ("outline", "course_questions", "course_plan", "course_unit"):
        assert "最多3单元" not in SYSTEMS[kind]
        assert "每单元2讲" not in SYSTEMS[kind]
        assert "每讲必须提供2个" not in SYSTEMS[kind]
    assert "深入掌握" in SYSTEMS["course_plan"]
    assert "当前一个讲次" in SYSTEMS["course_unit"]


def test_course_prompts_request_selective_board_emphasis():
    from app.services.provider import SYSTEMS
    for kind in ("outline", "course_unit"):
        assert "**关键术语**" in SYSTEMS[kind]
        assert '"kind":"highlight"' in SYSTEMS[kind]
        assert "不跨越不同格式片段" in SYSTEMS[kind]
        assert "不要每行标记或高亮整段" in SYSTEMS[kind]


def test_course_prompts_place_understanding_checks_during_teaching():
    from app.services.provider import SYSTEMS
    for kind in ("outline", "course_unit"):
        assert "checkpoint" in SYSTEMS[kind]
        assert "至少一题位于非最后一个片段" in SYSTEMS[kind]
        assert "题目不能考尚未介绍的知识" in SYSTEMS[kind]


def test_question_types_are_available_in_course_classroom_and_practice_prompts():
    from app.services.provider import SYSTEMS
    for kind in ("outline", "course_unit", "classroom_adapt", "course_practice"):
        for field in ("true_false", "fill", "blanks", "caseSensitive", "response"):
            assert field in SYSTEMS[kind]


def test_classroom_checks_are_lightweight_and_answer_feedback_targets_the_choice():
    from app.services.provider import SYSTEMS
    for kind in ("outline", "course_unit", "classroom_adapt"):
        assert "checkpoint 是轻量的理解检查" in SYSTEMS[kind]
        assert "不出长篇计算、多个填空或长篇简答" in SYSTEMS[kind]
    assert "针对该选项反映的误区" in SYSTEMS["classroom_adapt"]
    assert "不新增 checkpoint 或 quiz" in SYSTEMS["classroom_adapt"]
