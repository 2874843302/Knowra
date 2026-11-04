from urllib.parse import urlparse
from contextlib import asynccontextmanager
import asyncio
import mimetypes

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.api.auth_routes import router as auth_router
from app.core.config import ROOT, Settings
from app.services.database import Database
from app.services.provider import Provider
from app.services.auth import Auth
from app.services.course_jobs import CourseJobs
from app.api.course_job_routes import router as jobs_router
from app.api.mcp_server import create_mcp
from app.api.tts_routes import router as tts_router
from app.services.tts import LocalTTS
from app.services.asr import LocalASR
from app.api.asr_routes import router as asr_router


def create_app(settings=None):
    # Windows registry MIME mappings may omit web fonts.
    mimetypes.add_type("font/woff2", ".woff2")
    config = settings or Settings()
    @asynccontextmanager
    async def lifespan(app):
        async with app.state.mcp.session_manager.run():
            app.state.tts.warmup()
            try:
                yield
            finally:
                await app.state.jobs.close()
                await asyncio.to_thread(app.state.tts.close)
                await asyncio.to_thread(app.state.database.close)

    app = FastAPI(title="Knowra Learning API", version="2.1.0", lifespan=lifespan)
    app.state.database = Database(config)
    app.state.provider = Provider(config)
    app.state.auth = Auth(app.state.database)
    app.state.tts = LocalTTS(config)
    app.state.asr = LocalASR(config)
    app.state.jobs = CourseJobs(app, config)
    app.state.mcp, mcp_app = create_mcp(app, config)

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        origin = request.headers.get("origin")
        public = urlparse(config.knowra_public_url)
        host = request.url.hostname
        if host not in {"127.0.0.1", "localhost", "testserver", public.hostname}:
            return JSONResponse({"error": "仅允许本机访问。"}, status_code=403)
        origins = {config.knowra_public_url.rstrip("/"), "http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000", "http://localhost:8000"}
        if origin and origin not in origins:
            return JSONResponse({"error": "不允许此来源访问。"}, status_code=403)
        length = request.headers.get("content-length", "0")
        if length.isdigit() and int(length) > 26 * 1024 * 1024:
            return JSONResponse({"error": "请求过大。"}, status_code=413)
        public_paths = {"/api/health", "/api/auth/register", "/api/auth/login", "/api/auth/me"}
        mcp_path = request.url.path == "/api/mcp" or request.url.path.startswith("/api/mcp/")
        if mcp_path:
            try:
                app.state.auth.bearer(request.headers.get("authorization", ""))
            except HTTPException as error:
                return JSONResponse({"error": error.detail}, status_code=error.status_code, headers={**(error.headers or {}), "Cache-Control": "no-store"})
        elif request.url.path.startswith("/api/") and request.url.path not in public_paths:
            try:
                request.state.user = app.state.auth.user(request)
                expected = request.headers.get("x-account-id")
                if expected and expected != request.state.user["id"]:
                    raise HTTPException(401, "账号已切换，请重新打开学习空间。")
            except HTTPException as error:
                return JSONResponse({"error": error.detail}, status_code=error.status_code, headers={"Cache-Control": "no-store"})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(HTTPException)
    async def http_error(_request, error):
        payload = {"error": error.detail} if isinstance(error.detail, str) else {"error": "学习数据有更新。", **error.detail}
        return JSONResponse(payload, status_code=error.status_code, headers=error.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, _error):
        return JSONResponse({"error": "请求格式不正确，请检查输入。"}, status_code=422)

    app.include_router(router)
    app.include_router(auth_router)
    app.include_router(jobs_router)
    app.include_router(tts_router)
    app.include_router(asr_router)
    app.mount("/api/mcp", mcp_app)
    dist = ROOT / "dist"
    if (dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
    if (dist / "images").exists():
        app.mount("/images", StaticFiles(directory=dist / "images"), name="images")
    if (dist / "reference").exists():
        app.mount("/reference", StaticFiles(directory=dist / "reference"), name="reference")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "接口不存在。")
        if path == "favicon.svg":
            return FileResponse(ROOT / "public" / "favicon.svg")
        if not (dist / "index.html").exists():
            raise HTTPException(503, "请先运行 npm run build。")
        return FileResponse(dist / "index.html")

    return app


app = create_app()
