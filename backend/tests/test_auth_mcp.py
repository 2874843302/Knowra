import asyncio
import json
import secrets
import time
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.auth import COOKIE, digest


def signup(client, email="learner@example.test", **extra):
    credentials = {"email": email, "password": secrets.token_urlsafe(20)}
    response = client.post("/api/auth/register", json={**credentials, "name": "学习者", **extra})
    assert response.status_code == 201
    return credentials, response


def rpc(client, token, method, params=None):
    return client.post("/api/mcp/", headers={"Authorization": f"Bearer {token}", "Accept": "application/json, text/event-stream"}, json={"jsonrpc": "2.0", "id": 1, "method": method, **({"params": params} if params else {})})


def tool(client, token, name, arguments=None):
    response = rpc(client, token, "tools/call", {"name": name, "arguments": arguments or {}})
    assert response.status_code == 200
    return response.json()["result"]


def test_real_login_cookie_logout_and_expiry(tmp_path):
    with TestClient(create_app(Settings(knowra_data_dir=tmp_path, _env_file=None))) as client:
        assert client.get("/api/auth/me").status_code == 401
        for path in ("/api/workspace", "/api/provider", "/api/course-jobs", "/api/auth/tokens"):
            assert client.get(path, headers={"X-Workspace-Id": str(uuid4())}).status_code == 401
        credentials, response = signup(client)
        cookie = response.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=lax" in cookie
        raw_cookie = client.cookies[COOKIE]
        with client.app.state.database.connect() as db:
            user = db.execute("SELECT * FROM users").fetchone()
            assert user["password_hash"] != credentials["password"]
            assert user["password_hash"].startswith("pbkdf2_sha256$600000$")
            assert db.execute("SELECT token_hash FROM sessions").fetchone()["token_hash"] == digest(raw_cookie)
        assert client.post("/api/auth/register", json={**credentials, "name": "重复"}).status_code == 409
        assert client.post("/api/auth/logout").status_code == 200
        client.cookies.set(COOKIE, raw_cookie)
        assert client.get("/api/auth/me").status_code == 401
        client.cookies.clear()
        assert client.post("/api/auth/login", json={**credentials, "password": secrets.token_urlsafe(20)}).status_code == 401
        assert client.post("/api/auth/login", json=credentials).status_code == 200
        with client.app.state.database.connect() as db:
            db.execute("UPDATE sessions SET expires_at=0")
        assert client.get("/api/auth/me").status_code == 401


def test_https_cookie_and_validation(tmp_path):
    with TestClient(create_app(Settings(knowra_data_dir=tmp_path, _env_file=None)), base_url="https://testserver") as client:
        _, response = signup(client)
        assert "Secure" in response.headers["set-cookie"]
        for payload in ({"email": "bad", "password": "12345678", "name": "学习者"}, {"email": "valid@example.test", "password": "short", "name": "学习者"}, {"email": "valid@example.test", "password": "12345678", "name": " "}):
            assert client.post("/api/auth/register", json=payload).status_code == 422


def test_account_workspace_originals_and_provider_isolation(client, workspace):
    original_user = client.get("/api/auth/me").json()["user"]
    client.put("/api/provider", json={"baseUrl": "https://example.test/v1", "model": "fixture", "apiKey": secrets.token_urlsafe(20)})
    upload = client.post("/api/materials", files={"file": ("private.txt", b"owner only")}).json()
    signup(client, "second@example.test")
    assert client.get("/api/provider").json()["configured"] is False
    assert client.get("/api/workspace", headers={"X-Workspace-Id": original_user["workspaceId"]}).status_code == 404
    assert client.get(f'/api/materials/{upload["id"]}/file').status_code == 404
    assert client.post("/api/workspace", json={"state": {"name": "第二位"}}).status_code == 200
    assert client.get("/api/workspace", headers={"X-Account-Id": original_user["id"]}).status_code == 401
    assert client.get("/api/workspace", headers={"X-Workspace-Id": original_user["workspaceId"]}).json()["state"]["name"] == "第二位"
    assert client.post("/api/auth/login", json=client.test_credentials).status_code == 200
    assert client.get("/api/workspace").json()["state"]["notes"]["python/variables"] == "old note"
    assert client.get("/api/provider").json()["configured"] is True


def test_explicit_legacy_import_retains_text_not_original_file_access(client):
    state = {"version": 1, "name": "旧名字", "notes": {"course/lesson": "保留笔记"}, "materials": {"course": [{"id": str(uuid4()), "text": "资料内容", "original": True}]}}
    signup(client, "import@example.test", import_state=state)
    imported = client.get("/api/workspace").json()["state"]
    assert imported["name"] == "学习者"
    assert imported["notes"] == state["notes"]
    assert imported["materials"]["course"][0]["original"] is False


def test_mcp_protocol_scopes_revocation_expiry_and_account_ownership(client, workspace):
    fresh = client.post("/api/auth/tokens", json={"name": "Agent", "scopes": ["courses:read"]}).json()
    token = fresh["token"]
    assert token not in client.get("/api/auth/tokens").text
    with client.app.state.database.connect() as db:
        assert db.execute("SELECT token_hash FROM mcp_tokens").fetchone()["token_hash"] == digest(token)
    assert client.post("/api/mcp/", json={}).status_code == 401
    init = rpc(client, token, "initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "fixture", "version": "1"}})
    assert init.status_code == 200
    assert init.json()["result"]["serverInfo"]["name"] == "Knowra"
    tools = rpc(client, token, "tools/list").json()["result"]["tools"]
    assert {t["name"] for t in tools} == {"create_course", "get_course_generation", "list_courses", "cancel_course_generation", "resume_course_generation"}
    assert all("ctx" not in t["inputSchema"]["properties"] for t in tools)
    assert tool(client, token, "list_courses")["structuredContent"] == {"courses": []}
    denied = tool(client, token, "create_course", {"topic": "Python"})
    assert denied["isError"] is True
    assert "权限" in denied["content"][0]["text"]
    assert client.get("/api/workspace", headers={"Origin": "https://untrusted.example"}).status_code == 403
    signup(client, "mcp-other@example.test")
    assert client.delete(f'/api/auth/tokens/{fresh["id"]}').status_code == 404
    assert client.get("/api/auth/tokens").json()["tokens"] == []
    assert client.post("/api/auth/login", json=client.test_credentials).status_code == 200
    with client.app.state.database.connect() as db:
        db.execute("UPDATE mcp_tokens SET expires_at=0 WHERE id=%s", (fresh["id"],))
    assert rpc(client, token, "tools/list").status_code == 401
    fresh = client.post("/api/auth/tokens", json={"name": "To revoke"}).json()
    assert client.delete(f'/api/auth/tokens/{fresh["id"]}').status_code == 200
    assert rpc(client, fresh["token"], "tools/list").status_code == 401


def test_login_throttling_is_generic_and_has_retry_after(client):
    for _ in range(10):
        assert client.post("/api/auth/login", json={"email": "absent@example.test", "password": secrets.token_urlsafe(18)}).status_code == 401
    response = client.post("/api/auth/login", json={"email": "absent@example.test", "password": secrets.token_urlsafe(18)})
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0


def test_official_sdk_client_streamable_http_interoperability(client):
    import httpx2
    from mcp.client import Client
    from mcp.client.streamable_http import streamable_http_client
    token = client.post("/api/auth/tokens", json={"name": "Official SDK"}).json()["token"]
    async def exercise():
        async with httpx2.AsyncClient(transport=httpx2.ASGITransport(app=client.app), headers={"Authorization": f"Bearer {token}"}) as http:
            async with Client(streamable_http_client("http://testserver/api/mcp/", http_client=http)) as sdk:
                tools = await sdk.list_tools()
                assert len(tools.tools) == 5
                result = await sdk.call_tool("list_courses", {})
                assert not result.is_error
                assert result.structured_content == {"courses": []}
    client.portal.call(exercise)


def test_restart_retains_checkpoint_without_replaying_generation(client):
    from app.services.course_jobs import CourseJobs
    with client.app.state.database.connect() as db:
        user = db.execute("SELECT * FROM users").fetchone()
        job_id = str(uuid4())
        checkpoint = {"completedUnits": [{"title": "已完成", "lessons": [{"id": "lesson-0-0"}]}]}
        db.execute("INSERT INTO course_jobs VALUES (%s,%s,NULL,'running',%s,%s,'',NULL,'now','now')", (job_id, user["id"], json.dumps({"topic": "重启恢复", "depth": "deep"}), json.dumps(checkpoint)))
    service = CourseJobs(client.app, client.app.state.provider.settings)
    row = service.row(user, job_id)
    assert row["status"] == "interrupted"
    assert json.loads(row["checkpoint"]) == checkpoint
    assert service.tasks == {}


def test_generation_resume_obeys_provider_cooldown(client):
    with client.app.state.database.connect() as db:
        user = db.execute("SELECT * FROM users").fetchone()
        job_id = str(uuid4())
        db.execute("INSERT INTO course_jobs VALUES (%s,%s,NULL,'failed',%s,%s,'',NULL,'now','now')", (job_id, user["id"], json.dumps({"topic": "冷却", "depth": "deep"}), json.dumps({"retryNotBefore": int(time.time()) + 600})))
    response = client.post(f"/api/course-jobs/{job_id}/resume")
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 500
    assert client.get(f"/api/course-jobs/{job_id}").json()["status"] == "failed"


@pytest.fixture
def model_fixture():
    lesson = {"title": "认识 Store", "summary": "用购物车解释共享状态", "content": "## 概念\n明确数据来源。\n\n## 实例\n购物车共享数量。\n\n## 验证\n检查组件间的同步。", "teaching": {"design": {"problem": "如何用具体场景理解共享状态？", "approach": "先观察例子，再解释结论与使用边界。", "representations": ["worked-example"], "rationale": "用具体操作检验当前结论。"}, "steps": [{"title": "统一状态", "board": "组件 → Store → 组件", "narration": "想象多个收银台共享同一本账本，各组件从同一份状态读取数量。", "role": "example", "delivery": {"write": "想象多个收银台共享"}}]}, "quiz": {"question": "状态应该从哪里读取？", "options": ["统一的 Store", "每个组件重复创建"], "answer": 0, "explanation": "同一个数据来源保持同步。"}}
    return {"title": "共享状态课程", "description": "用购物车掌握跨组件数据流", "units": [{"title": "共享状态", "summary": "理解跨组件数据流", "lessons": [lesson, {**lesson, "title": "Store 的使用"}]}]}


def wait_job(client, job_id, statuses):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        value = client.get(f"/api/course-jobs/{job_id}").json()
        if value["status"] in statuses:
            return value
        time.sleep(.05)
    pytest.fail("Course worker timed out")


def lecture_reply(model_fixture, payload):
    fixture = json.loads(json.dumps(model_fixture))
    second = "Store 的使用" in payload.messages[0].content.split("只展开")[1]
    fixture["units"][0]["lessons"] = [fixture["units"][0]["lessons"][int(second)]]
    return {"content": json.dumps(fixture, ensure_ascii=False)}


def test_remote_worker_runs_two_lectures_and_checkpoints_out_of_order(client, monkeypatch, model_fixture):
    release_first = asyncio.Event()
    active = peak = 0
    async def complete(payload, **kwargs):
        nonlocal active, peak
        if payload.kind == "course_plan":
            return {"content": json.dumps(model_fixture, ensure_ascii=False)}
        active += 1
        peak = max(peak, active)
        try:
            if "Store 的使用" not in payload.messages[0].content.split("只展开")[1]:
                await asyncio.wait_for(release_first.wait(), 15)
            return lecture_reply(model_fixture, payload)
        finally:
            active -= 1
    monkeypatch.setattr(client.app.state.provider, "complete", complete)
    monkeypatch.setattr(client.app.state.provider, "public", lambda: {"configured": True, "baseUrl": "https://example.com/v1", "model": "fixture"})
    job_id = client.post("/api/course-jobs", json={"topic": "并行课程"}).json()["id"]
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        job = client.get(f"/api/course-jobs/{job_id}").json()
        if job["completedLectures"] == 1:
            break
        time.sleep(.05)
    assert job["status"] == "running" and job["completedLectures"] == 1
    with client.app.state.database.connect() as db:
        checkpoint = json.loads(db.execute("SELECT checkpoint FROM course_jobs WHERE id=%s", (job_id,)).fetchone()["checkpoint"])
    assert checkpoint["pendingLectures"]["0:1"]["title"] == "Store 的使用"
    assert not checkpoint["completedUnits"]
    client.portal.call(release_first.set)
    done = wait_job(client, job_id, {"completed", "failed"})
    assert done["status"] == "completed", done["error"]
    assert peak == 2
    saved = client.get("/api/workspace").json()["state"]["customCourses"][0]
    assert [lesson["title"] for lesson in saved["units"][0]["lessons"]] == ["认识 Store", "Store 的使用"]


@pytest.mark.parametrize("base_url,model", [("http://127.0.0.1:8787/v1", "deepseek-web"), ("https://example.com/v1", "deepseek-web"), ("http://localhost:8001/v1", "local-model")])
def test_native_and_local_worker_keep_serial_sessions(client, monkeypatch, model_fixture, base_url, model):
    active = peak = 0
    async def complete(payload, **kwargs):
        nonlocal active, peak
        if payload.kind == "course_plan":
            return {"content": json.dumps(model_fixture, ensure_ascii=False)}
        active += 1
        peak = max(peak, active)
        try:
            await asyncio.sleep(.05)
            return lecture_reply(model_fixture, payload)
        finally:
            active -= 1
    monkeypatch.setattr(client.app.state.provider, "complete", complete)
    monkeypatch.setattr(client.app.state.provider, "public", lambda: {"configured": True, "baseUrl": base_url, "model": model})
    job_id = client.post("/api/course-jobs", json={"topic": "串行课程"}).json()["id"]
    done = wait_job(client, job_id, {"completed", "failed"})
    assert done["status"] == "completed", done["error"]
    assert peak == 1


def test_parallel_failure_retains_other_lecture_and_provider_cooldown(client, monkeypatch, model_fixture):
    second_started = asyncio.Event()
    blocked = True
    calls = []
    async def complete(payload, **kwargs):
        if payload.kind == "course_plan":
            return {"content": json.dumps(model_fixture, ensure_ascii=False)}
        second = "Store 的使用" in payload.messages[0].content.split("只展开")[1]
        calls.append(int(second))
        if second:
            second_started.set()
            await asyncio.sleep(.05)
        elif blocked:
            await asyncio.wait_for(second_started.wait(), 10)
            raise HTTPException(429, "模型冷却", headers={"Retry-After": "60"})
        return lecture_reply(model_fixture, payload)
    monkeypatch.setattr(client.app.state.provider, "complete", complete)
    monkeypatch.setattr(client.app.state.provider, "public", lambda: {"configured": True, "baseUrl": "https://example.com/v1", "model": "fixture"})
    job_id = client.post("/api/course-jobs", json={"topic": "恢复课程"}).json()["id"]
    failed = wait_job(client, job_id, {"failed", "completed"})
    assert failed["status"] == "failed" and failed["completedLectures"] == 1
    assert sorted(calls) == [0, 1]
    assert client.post(f"/api/course-jobs/{job_id}/resume").status_code == 429
    with client.app.state.database.connect() as db:
        checkpoint = json.loads(db.execute("SELECT checkpoint FROM course_jobs WHERE id=%s", (job_id,)).fetchone()["checkpoint"])
        assert checkpoint["pendingLectures"]["0:1"]["title"] == "Store 的使用"
        checkpoint["retryNotBefore"] = 0
        db.execute("UPDATE course_jobs SET checkpoint=%s WHERE id=%s", (json.dumps(checkpoint), job_id))
    blocked = False
    assert client.post(f"/api/course-jobs/{job_id}/resume").status_code == 200
    done = wait_job(client, job_id, {"completed", "failed"})
    assert done["status"] == "completed", done["error"]
    assert calls.count(0) == 2 and calls.count(1) == 1


def test_cancel_parallel_worker_cancels_both_model_requests(client, monkeypatch, model_fixture):
    both_started = asyncio.Event()
    never_release = asyncio.Event()
    started = cancelled = 0
    async def complete(payload, **kwargs):
        nonlocal started, cancelled
        if payload.kind == "course_plan":
            return {"content": json.dumps(model_fixture, ensure_ascii=False)}
        started += 1
        if started == 2:
            both_started.set()
        try:
            await never_release.wait()
        except asyncio.CancelledError:
            cancelled += 1
            raise
        return lecture_reply(model_fixture, payload)
    monkeypatch.setattr(client.app.state.provider, "complete", complete)
    monkeypatch.setattr(client.app.state.provider, "public", lambda: {"configured": True, "baseUrl": "https://example.com/v1", "model": "fixture"})
    job_id = client.post("/api/course-jobs", json={"topic": "取消并行课程"}).json()["id"]
    client.portal.call(asyncio.wait_for, both_started.wait(), 10)
    response = client.post(f"/api/course-jobs/{job_id}/cancel")
    assert response.json()["status"] == "cancelled"
    assert started == cancelled == 2
    assert client.get("/api/workspace").json()["state"]["customCourses"] == []


def test_real_node_worker_validates_retries_preserves_progress_and_returns_learning_links(client, monkeypatch, model_fixture):
    calls = []
    blocked = [True]
    invalid = [True]
    async def complete(payload, **kwargs):
        calls.append(payload.kind)
        if payload.kind == "course_plan":
            return {"content": json.dumps(model_fixture, ensure_ascii=False)}
        is_second = "Store 的使用" in payload.messages[0].content.split("只展开")[1]
        if is_second and blocked[0]:
            raise HTTPException(503, "测试提供方暂时不可用")
        if invalid[0]:
            invalid[0] = False
            return {"content": "invalid model JSON"}
        fixture = json.loads(json.dumps(model_fixture))
        fixture["units"][0]["lessons"] = [fixture["units"][0]["lessons"][1 if is_second else 0]]
        return {"content": json.dumps(fixture, ensure_ascii=False)}
    monkeypatch.setattr(client.app.state.provider, "complete", complete)
    monkeypatch.setattr(client.app.state.provider, "public", lambda: {"configured": True})
    token = client.post("/api/auth/tokens", json={"name": "Course creator"}).json()["token"]
    request = {"topic": "学习这次提交中的状态管理", "source_type": "commit", "context": "diff --git a/store.js b/store.js", "depth": "deep", "scale": "按需要讲清楚", "request_id": str(uuid4())}
    result = tool(client, token, "create_course", request)
    assert not result.get("isError"), result
    job = result["structuredContent"]
    duplicate = tool(client, token, "create_course", request)["structuredContent"]
    assert duplicate["id"] == job["id"]
    failed = wait_job(client, job["id"], {"failed"})
    assert failed["completedLectures"] == 1
    assert failed["totalLectures"] == 2
    assert calls == ["course_plan", "course_unit", "course_unit", "course_unit"]
    blocked[0] = False
    resumed = tool(client, token, "resume_course_generation", {"job_id": job["id"]})
    assert not resumed.get("isError")
    done = wait_job(client, job["id"], {"completed", "failed"})
    assert done["status"] == "completed", done["error"]
    assert done["learningUrl"].endswith(f'/learn/mcp-{job["id"]}/lesson-0-0')
    assert len(calls) == 5  # No regenerated plan or first lecture.
    saved = client.get("/api/workspace").json()["state"]
    assert saved["customCourses"][0]["id"] in saved["joined"]
    assert len(saved["customCourses"][0]["units"][0]["lessons"]) == 2
    assert tool(client, token, "list_courses")["structuredContent"]["courses"][0]["learningUrl"] == done["learningUrl"]
    assert "context" not in done
    signup(client, "job-intruder@example.test")
    assert client.get(f'/api/course-jobs/{job["id"]}').status_code == 404
    other_token = client.post("/api/auth/tokens", json={"name": "Other"}).json()["token"]
    assert tool(client, other_token, "get_course_generation", {"job_id": job["id"]})["isError"] is True


def test_cancel_worker_and_late_model_results_do_not_create_course(client, monkeypatch):
    calls = []
    async def complete(payload, **kwargs):
        calls.append(payload.kind)
        await asyncio.sleep(60)
        return {"content": "{}"}
    monkeypatch.setattr(client.app.state.provider, "complete", complete)
    monkeypatch.setattr(client.app.state.provider, "public", lambda: {"configured": True})
    job = client.post("/api/course-jobs", json={"topic": "取消测试"}).json()
    assert client.post("/api/course-jobs", json={"topic": "不能同时创建"}).status_code == 409
    wait_job(client, job["id"], {"running"})
    response = client.post(f'/api/course-jobs/{job["id"]}/cancel')
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert client.get("/api/workspace").json()["state"]["customCourses"] == []


def test_school_mode_contract_requires_reference_and_validates_fields(client):
    for payload in [
        {"topic": "导数", "learningMode": "school"},
        {"topic": "导数", "learningMode": "unknown"},
        {"topic": "导数", "learningMode": "school", "schoolContext": {"textbook": " "}},
        {"topic": "导数", "learningMode": "school", "schoolContext": {"chapter": "章" * 1001}},
    ]:
        assert client.post("/api/course-jobs", json=payload).status_code == 422
    with client.app.state.database.connect() as db:
        assert db.execute("SELECT count(*) AS n FROM course_jobs").fetchone()["n"] == 0


def test_mcp_school_mode_reaches_plan_lectures_and_saved_course(client, monkeypatch, model_fixture):
    school = {"textbook": "学校状态管理讲义", "chapter": "第二章 Store", "schedule": "本周复习", "assessment": "重点解释跨组件数据流"}
    calls = []
    async def complete(payload, **kwargs):
        calls.append(payload.kind)
        content = payload.messages[0].content
        assert "学校同步" in content
        for text in school.values():
            assert text in content
        if payload.kind == "course_plan":
            return {"content": json.dumps(model_fixture, ensure_ascii=False)}
        is_second = "Store 的使用" in content.split("只展开")[1]
        fixture = json.loads(json.dumps(model_fixture))
        fixture["units"][0]["lessons"] = [fixture["units"][0]["lessons"][1 if is_second else 0]]
        return {"content": json.dumps(fixture, ensure_ascii=False)}
    monkeypatch.setattr(client.app.state.provider, "complete", complete)
    monkeypatch.setattr(client.app.state.provider, "public", lambda: {"configured": True})
    token = client.post("/api/auth/tokens", json={"name": "School fixture"}).json()["token"]
    result = tool(client, token, "create_course", {"topic": "状态管理", "learningMode": "school", "schoolContext": school})
    assert not result.get("isError"), result
    done = wait_job(client, result["structuredContent"]["id"], {"completed", "failed"})
    assert done["status"] == "completed", done["error"]
    assert calls == ["course_plan", "course_unit", "course_unit"]
    course = client.get("/api/workspace").json()["state"]["customCourses"][0]
    assert course["learningMode"] == "school"
    assert course["schoolContext"] == school


def test_old_idempotency_payload_without_mode_is_still_self_study(client, monkeypatch):
    from app.services.course_jobs import CourseInput
    request_id, job_id = str(uuid4()), str(uuid4())
    old = CourseInput(topic="旧请求", request_id=request_id).model_dump(mode="json")
    old.pop("learningMode")
    old.pop("schoolContext")
    with client.app.state.database.connect() as db:
        user = db.execute("SELECT * FROM users").fetchone()
        db.execute("INSERT INTO course_jobs VALUES (%s,%s,%s,'completed',%s,'{}','',NULL,'now','now')", (job_id, user["id"], request_id, json.dumps(old)))
    response = client.post("/api/course-jobs", json={"topic": "旧请求", "request_id": request_id})
    assert response.status_code == 202
    assert response.json()["id"] == job_id
