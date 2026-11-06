from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import HTTPException
from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp_types import ToolAnnotations
from pydantic import Field

from app.services.course_jobs import CourseInput, SchoolContext


def create_mcp(app, settings):
    server = MCPServer("Knowra", version="2.1.0", instructions="将用户明确要求学习的主题、代码片段或提交 diff 变成课程或聚焦讲解。调用 create_course 前，询问或依据用户明确给出的基础、学习目标、详细度与范围；代码或提交请求默认使用 mode=explain，围绕本次改动讲清楚，只有用户明确要求系统课程时才用 mode=course。不要擅自上传整个仓库或凭空补全代码。create_course 返回后台任务，不要重复创建；使用 get_course_generation 查看进度，完成后把 learningUrl 提供给用户。失败时已完成讲次保留，仅在用户要求后调用 resume_course_generation。")

    def principal(ctx, scope):
        try:
            return app.state.auth.bearer(ctx.request_context.request.headers.get("authorization", ""), scope)
        except HTTPException as error:
            raise ToolError(str(error.detail))

    def invoke(action):
        try:
            return action()
        except HTTPException as error:
            raise ToolError(str(error.detail))

    @server.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=True))
    async def create_course(
        topic: Annotated[str, Field(min_length=1, max_length=2000)], ctx: Context,
        context: Annotated[str, Field(max_length=60000)] = "",
        source_type: Literal["topic", "code", "commit", "document"] = "topic",
        goal: Annotated[str, Field(max_length=2000)] = "",
        foundation: Annotated[str, Field(max_length=1000)] = "",
        depth: Literal["recommended", "overview", "systematic", "deep"] = "recommended",
        scale: Annotated[str, Field(max_length=1000)] = "",
        mode: Literal["auto", "explain", "course"] = "auto",
        request_id: UUID | None = None,
        learningMode: Literal["self", "school"] = "self",
        schoolContext: SchoolContext | None = None,
    ) -> dict[str, Any]:
        """为当前凭证所属用户创建课程或聚焦讲解。context 接收用户指定的代码、提交 diff 或文字资料，不接收文件路径来读取服务器文件。mode=explain 适合讲解一次提交或一段代码，按用户需求决定讲次，不扩展成完整学科；mode=course 用于用户明确要求的系统课程；auto 由服务端根据请求判断。任务在后台生成，返回 jobUrl，完成后再返回 learningUrl。建议提供稳定的 request_id(UUID) 防止重试重复创建。"""
        user = principal(ctx, "courses:create")
        payload = CourseInput(topic=topic, context=context, source_type=source_type, goal=goal, foundation=foundation, depth=depth, scale=scale, mode=mode, request_id=request_id, learningMode=learningMode, schoolContext=schoolContext or SchoolContext())
        return invoke(lambda: app.state.jobs.create(user, payload))

    @server.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=False))
    async def get_course_generation(job_id: UUID, ctx: Context) -> dict[str, Any]:
        """查询自己创建的课程任务。completed 才表示可学习；将 learningUrl 返回给学习者。任务未完成时不要重新调用 create_course。"""
        user = principal(ctx, "courses:read")
        return invoke(lambda: app.state.jobs.view(app.state.jobs.row(user, job_id)))

    @server.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=False))
    async def list_courses(ctx: Context) -> dict[str, Any]:
        """列出本账号自建课程与学习链接，不返回其他账号的课程。"""
        user = principal(ctx, "courses:read")
        try:
            state = app.state.database.get(user["workspace_id"])["state"]
        except HTTPException as error:
            if error.status_code == 404:
                return {"courses": []}
            raise
        courses = []
        base = settings.knowra_public_url.rstrip("/")
        for original in state.get("customCourses", []):
            course = {**original, **state.get("courseEdits", {}).get(original["id"], {})}
            first = course["units"][0]["lessons"][0]
            courses.append({"id": course["id"], "title": course["title"], "description": course.get("description", ""), "courseUrl": f'{base}/course/{course["id"]}', "learningUrl": f'{base}/learn/{course["id"]}/{first["id"]}'})
        return {"courses": courses}

    @server.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, openWorldHint=True))
    async def resume_course_generation(job_id: UUID, ctx: Context) -> dict[str, Any]:
        """用户要求继续时恢复失败或中断的任务，复用已生成讲次。不要在上游限流期间自动重复调用。"""
        user = principal(ctx, "courses:create")
        return invoke(lambda: app.state.jobs.resume(user, job_id))

    @server.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, openWorldHint=False))
    async def cancel_course_generation(job_id: UUID, ctx: Context) -> dict[str, Any]:
        """停止当前账号的课程生成任务，保留已完成讲次。"""
        user = principal(ctx, "courses:create")
        try:
            return await app.state.jobs.cancel(user, job_id)
        except HTTPException as error:
            raise ToolError(str(error.detail))

    from urllib.parse import urlparse
    hostname = urlparse(settings.knowra_public_url).hostname
    security = TransportSecuritySettings(allowed_hosts=["127.0.0.1:*", "localhost:*", "testserver", hostname, f"{hostname}:*"], allowed_origins=[settings.knowra_public_url.rstrip("/"), "http://127.0.0.1:5173", "http://localhost:5173"])
    return server, server.streamable_http_app(streamable_http_path="/", stateless_http=True, json_response=True, transport_security=security)
