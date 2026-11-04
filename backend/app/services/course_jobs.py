import asyncio
import json
import shutil
from psycopg.errors import UniqueViolation
import subprocess
import time
from typing import Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.config import ROOT
from app.schemas import AIRequest, WorkspaceState
from app.services.database import now
from app.services.provider import Provider


class SchoolContext(BaseModel):
    model_config = {"str_strip_whitespace": True}
    textbook: str = Field(default="", max_length=1000)
    chapter: str = Field(default="", max_length=1000)
    schedule: str = Field(default="", max_length=1000)
    assessment: str = Field(default="", max_length=1000)


class CourseInput(BaseModel):
    topic: str = Field(min_length=1, max_length=2000)
    context: str = Field(default="", max_length=60000)
    source_type: Literal["topic", "code", "commit", "document"] = "topic"
    goal: str = Field(default="", max_length=2000)
    foundation: str = Field(default="", max_length=1000)
    depth: Literal["recommended", "overview", "systematic", "deep"] = "recommended"
    scale: str = Field(default="", max_length=1000)
    request_id: UUID | None = None
    learningMode: Literal["self", "school"] = "self"
    schoolContext: SchoolContext = Field(default_factory=SchoolContext)

    @model_validator(mode="after")
    def school_reference_required(self):
        if self.learningMode == "school" and not (self.context.strip() or self.schoolContext.textbook or self.schoolContext.chapter):
            raise ValueError("学校同步需要教材／大纲、当前章节或参考资料。")
        return self

    @field_validator("topic")
    @classmethod
    def topic_required(cls, value):
        if not value.strip():
            raise ValueError("Topic required")
        return value.strip()


def user_provider(app, user):
    if user["is_owner"]:
        return app.state.provider
    settings = app.state.provider.settings.model_copy(update={"knowra_data_dir": app.state.database.directory / "users" / user["id"]})
    settings.knowra_data_dir.mkdir(parents=True, exist_ok=True)
    return Provider(settings)


class CourseJobs:
    def __init__(self, app, settings):
        self.app = app
        self.db = app.state.database
        self.public_url = settings.knowra_public_url.rstrip("/")
        self.tasks = {}
        self.queue = asyncio.Semaphore(1)
        # An interrupted process never silently replays a chargeable request.
        with self.db.connect() as db:
            db.execute("UPDATE course_jobs SET status='interrupted',error=%s,updated_at=%s WHERE status IN ('queued','running')", ("服务已重启，已生成的讲次保留，可继续生成。", now()))

    def row(self, user, job_id):
        with self.db.connect() as db:
            row = db.execute("SELECT * FROM course_jobs WHERE id=%s AND user_id=%s", (str(job_id), user["id"])).fetchone()
        if not row:
            raise HTTPException(404, "没有找到这个课程生成任务。")
        return row

    def view(self, row):
        checkpoint, payload = json.loads(row["checkpoint"]), json.loads(row["payload"])
        plan = checkpoint.get("plan")
        completed = sum(len(u["lessons"]) for u in checkpoint.get("completedUnits", []))
        partial = checkpoint.get("partialUnit")
        if partial:
            completed += len(partial["unit"]["lessons"])
        completed += len(checkpoint.get("pendingLectures", {}))
        course_url = f'{self.public_url}/course/{row["course_id"]}' if row["course_id"] else None
        return {"id": row["id"], "status": row["status"], "topic": payload["topic"], "depth": payload["depth"], "completedLectures": completed,
                "totalLectures": sum(len(u["lessons"]) for u in plan["units"]) if plan else None,
                "title": plan["title"] if plan else payload["topic"], "error": row["error"],
                "jobUrl": f'{self.public_url}/generation/{row["id"]}', "courseUrl": course_url,
                "learningUrl": f'{self.public_url}/learn/{row["course_id"]}/lesson-0-0' if row["course_id"] else None,
                "createdAt": row["created_at"], "updatedAt": row["updated_at"]}

    def create(self, user, payload):
        if payload.request_id:
            with self.db.connect() as db:
                existing = db.execute("SELECT * FROM course_jobs WHERE user_id=%s AND request_id=%s", (user["id"], str(payload.request_id))).fetchone()
            if existing:
                if CourseInput.model_validate(json.loads(existing["payload"])) != payload:
                    raise HTTPException(409, "这个 request_id 已用于另一个课程需求。")
                return self.view(existing)
        if not user_provider(self.app, user).public()["configured"]:
            raise HTTPException(503, "请先登录 Knowra，在设置中连接 AI 模型，再创建课程。")
        if not shutil.which("node"):
            raise HTTPException(503, "课程生成需要 Node.js 22+，请检查服务运行环境。")
        job_id = str(uuid4())
        with self.db.connect() as db:
            db.execute("SELECT id FROM users WHERE id=%s FOR UPDATE", (user["id"],))
            if db.execute("SELECT 1 FROM course_jobs WHERE user_id=%s AND status IN ('queued','running')", (user["id"],)).fetchone():
                raise HTTPException(409, "已有课程正在生成，请先查看或取消当前任务。")
            try:
                db.execute("INSERT INTO course_jobs VALUES (%s,%s,%s,'queued',%s,'{}','',NULL,%s,%s)", (job_id, user["id"], str(payload.request_id) if payload.request_id else None, json.dumps(payload.model_dump(mode="json"), ensure_ascii=False), now(), now()))
            except UniqueViolation:
                raise HTTPException(409, "请求正在创建，请使用同一 request_id 查询任务。")
        self.start(user, job_id)
        return self.view(self.row(user, job_id))

    def start(self, user, job_id):
        task = asyncio.create_task(self.run(dict(user), job_id))
        self.tasks[job_id] = task
        task.add_done_callback(lambda finished: self.tasks.pop(job_id, None) if self.tasks.get(job_id) is finished else None)

    def set_status(self, job_id, status, error=""):
        with self.db.connect() as db:
            db.execute("UPDATE course_jobs SET status=%s,error=%s,updated_at=%s WHERE id=%s AND status!='completed'", (status, error, now(), str(job_id)))

    async def run(self, user, job_id):
        process = None
        requests = set()
        request_slots = asyncio.Semaphore(2)
        provider_error = None
        provider_id = None

        async def answer_request(event, provider):
            nonlocal provider_error
            try:
                async with request_slots:
                    payload = AIRequest(messages=event["messages"], kind=event["kind"], conversation_id=event.get("conversationId"), provider_id=provider_id)
                    result = await provider.complete(payload)
                reply = {"id": event["id"], "content": result["content"]}
            except Exception as error:
                if provider_error is None:
                    provider_error = error
                message = error.detail if isinstance(error, HTTPException) and isinstance(error.detail, str) else "模型调用暂未完成，已完成的讲次保留。"
                reply = {"id": event["id"], "error": message}
            # Replies carry request IDs, so out-of-order lectures are safe. No
            # await between write/flush: each JSON line stays intact.
            try:
                process.stdin.write(json.dumps(reply, ensure_ascii=False) + "\n")
                process.stdin.flush()
            except (BrokenPipeError, OSError):
                # The reader reports worker exit; cancellation/cleanup owns the
                # process rather than trying to publish a late model response.
                return

        try:
            async with self.queue:
                row = self.row(user, job_id)
                if row["status"] != "queued":
                    return
                self.db.initialize(user["workspace_id"], WorkspaceState(name=user["name"]).model_dump())
                self.set_status(job_id, "running")
                provider = user_provider(self.app, user)
                provider_id = provider.public().get("activeId")
                process = subprocess.Popen([shutil.which("node"), str(ROOT / "scripts/course-job-worker.mjs")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1, cwd=ROOT, creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0)
                process.stdin.write(json.dumps({"id": job_id, "input": json.loads(row["payload"]), "checkpoint": json.loads(row["checkpoint"]), "provider": provider.public()}, ensure_ascii=False) + "\n")
                process.stdin.flush()
                while True:
                    line = await asyncio.to_thread(process.stdout.readline)
                    if not line:
                        raise HTTPException(500, "生成进程已停止，已完成内容保留，可继续生成。")
                    event = json.loads(line)
                    if event["event"] == "request":
                        task = asyncio.create_task(answer_request(event, provider))
                        requests.add(task)
                        task.add_done_callback(requests.discard)
                    elif event["event"] == "progress":
                        with self.db.connect() as db:
                            db.execute("UPDATE course_jobs SET checkpoint=%s,updated_at=%s WHERE id=%s", (json.dumps(event["checkpoint"], ensure_ascii=False), now(), job_id))
                    elif event["event"] == "complete":
                        self.finish(user, job_id, event["course"])
                        return
                    elif event["event"] == "error":
                        if provider_error is not None:
                            raise provider_error
                        raise HTTPException(422, str(event["message"])[:1000])
        except asyncio.CancelledError:
            row = self.row(user, job_id)
            if row["status"] not in {"cancelled", "completed"}:
                self.set_status(job_id, "interrupted", "生成已中断，已完成的讲次保留，可继续生成。")
            raise
        except Exception as error:
            retry = (error.headers or {}).get("Retry-After", "") if isinstance(error, HTTPException) else ""
            if retry.isdigit() and int(retry) > 0:
                with self.db.connect() as db:
                    saved = json.loads(db.execute("SELECT checkpoint FROM course_jobs WHERE id=%s", (job_id,)).fetchone()["checkpoint"])
                    saved["retryNotBefore"] = int(time.time()) + int(retry)
                    db.execute("UPDATE course_jobs SET checkpoint=%s WHERE id=%s", (json.dumps(saved, ensure_ascii=False), job_id))
            self.set_status(job_id, "failed", error.detail if isinstance(error, HTTPException) and isinstance(error.detail, str) else "课程暂未生成完成，已完成的讲次保留，请稍后继续。")
        finally:
            for task in requests:
                task.cancel()
            await asyncio.gather(*requests, return_exceptions=True)
            if process:
                if process.poll() is None:
                    process.kill()
                await asyncio.to_thread(process.wait)
                process.stdin.close()
                process.stdout.close()

    def finish(self, user, job_id, course):
        with self.db.connect() as db:
            db.execute("SELECT id FROM users WHERE id=%s FOR UPDATE", (user["id"],))
            job = db.execute("SELECT status FROM course_jobs WHERE id=%s AND user_id=%s FOR UPDATE", (job_id, user["id"])).fetchone()
            if job["status"] != "running":
                return
            row = db.execute("SELECT * FROM workspaces WHERE id=%s FOR UPDATE", (user["workspace_id"],)).fetchone()
            state = json.loads(row["state"])
            state.setdefault("customCourses", []).append(course)
            if course["id"] not in state.setdefault("joined", []):
                state["joined"].append(course["id"])
            state.setdefault("activities", []).insert(0, {"id": str(uuid4()), "title": f'Agent 创建课程：{course["title"]}', "type": "course", "url": f'/course/{course["id"]}', "date": now()})
            db.execute("UPDATE workspaces SET state=%s,revision=revision+1,updated_at=%s WHERE id=%s", (self.db.serialize(state), now(), user["workspace_id"]))
            db.execute("UPDATE course_jobs SET status='completed',course_id=%s,error='',updated_at=%s WHERE id=%s", (course["id"], now(), job_id))

    async def cancel(self, user, job_id):
        row = self.row(user, job_id)
        if row["status"] == "completed":
            raise HTTPException(409, "课程已生成完成。")
        self.set_status(job_id, "cancelled", "已停止生成，已完成的讲次保留。")
        task = self.tasks.get(str(job_id))
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        return self.view(self.row(user, job_id))

    def resume(self, user, job_id):
        row = self.row(user, job_id)
        if row["status"] in {"completed", "queued", "running"}:
            return self.view(row)
        retry = json.loads(row["checkpoint"]).get("retryNotBefore", 0) - int(time.time())
        if retry > 0:
            raise HTTPException(429, f"模型仍在冷却，请在 {retry} 秒后继续。", headers={"Retry-After": str(retry)})
        with self.db.connect() as db:
            db.execute("SELECT id FROM users WHERE id=%s FOR UPDATE", (user["id"],))
            if db.execute("SELECT 1 FROM course_jobs WHERE user_id=%s AND status IN ('queued','running')", (user["id"],)).fetchone():
                raise HTTPException(409, "已有课程正在生成。")
            db.execute("UPDATE course_jobs SET status='queued',error='',updated_at=%s WHERE id=%s", (now(), str(job_id)))
        self.start(user, str(job_id))
        return self.view(self.row(user, job_id))

    async def close(self):
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
