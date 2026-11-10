import json
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import StreamingResponse

from app.schemas import AIRequest, CourseResearchRequest, InitializeWorkspace, ProviderInput, ProviderSelection, UpdateWorkspace
from app.services.course_research import search_courses
from app.services.documents import MAX_BYTES, read_material, save_material
from app.services.course_jobs import user_provider
from app.services.provider import STREAMABLE_KINDS


router = APIRouter(prefix="/api")


def database(request: Request):
    return request.app.state.database


def provider(request: Request):
    return user_provider(request.app, request.state.user)


def workspace(request: Request):
    return request.state.user["workspace_id"]


@router.get("/health")
def health(db=Depends(database)):
    with db.connect() as connection:
        connection.execute("SELECT 1")
    return {"ok": True, "backend": "python", "database": "postgresql", "version": "2.0.0"}


@router.get("/workspace")
def get_workspace(workspace_id=Depends(workspace), db=Depends(database)):
    return db.get(workspace_id)


@router.post("/workspace")
def initialize_workspace(payload: InitializeWorkspace, workspace_id=Depends(workspace), db=Depends(database)):
    return db.initialize(workspace_id, payload.state.model_dump())


@router.patch("/workspace")
def update_workspace(payload: UpdateWorkspace, workspace_id=Depends(workspace), db=Depends(database)):
    return db.update(workspace_id, payload.revision, payload.operations)


@router.post("/materials", status_code=201)
def upload_material(file: Annotated[UploadFile, File()], workspace_id=Depends(workspace), db=Depends(database)):
    db.get(workspace_id)
    content = file.file.read(MAX_BYTES + 1)
    return save_material(db, workspace_id, file.filename, content)


@router.get("/materials/{material_id}/file")
def original_material(material_id: UUID, workspace_id=Depends(workspace), db=Depends(database)):
    name, content = read_material(db, workspace_id, material_id)
    fallback = name.encode("ascii", "ignore").decode().strip() or "material"
    return Response(content=content, media_type="application/octet-stream", headers={
        "Content-Disposition": f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(name)}",
        "Content-Length": str(len(content)),
    })


@router.get("/provider")
def get_provider(service=Depends(provider)):
    return service.public()


@router.put("/provider")
def save_provider(payload: ProviderInput, service=Depends(provider)):
    return service.save(payload)


@router.post("/provider", status_code=201)
def add_provider(payload: ProviderInput, service=Depends(provider)):
    return service.save(payload, create=True)


@router.put("/provider/active")
def select_provider(payload: ProviderSelection, service=Depends(provider)):
    return service.activate(payload.id)


@router.delete("/provider/{profile_id}")
def delete_provider(profile_id: str, service=Depends(provider)):
    return service.delete(profile_id)


@router.post("/ai")
async def ai(payload: AIRequest, request: Request, service=Depends(provider)):
    return await service.complete(payload, is_disconnected=request.is_disconnected)


@router.post("/ai/stream")
async def ai_stream(payload: AIRequest, request: Request, service=Depends(provider)):
    if payload.kind not in STREAMABLE_KINDS:
        raise HTTPException(400, "这个生成任务暂不支持流式输出。")

    async def events():
        content = ""
        try:
            async for delta in service.stream(payload, is_disconnected=request.is_disconnected):
                content += delta
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True, 'content': content}, ensure_ascii=False)}\n\n"
        except HTTPException as error:
            detail = error.detail if isinstance(error.detail, str) else "请求失败，请重试。"
            yield f"data: {json.dumps({'error': detail}, ensure_ascii=False)}\n\n"
        except Exception:
            yield f"data: {json.dumps({'error': '模型响应中断，请重试。'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={
        "Cache-Control": "no-store", "X-Accel-Buffering": "no",
    })


@router.post("/provider/test")
async def test_provider(payload: ProviderSelection, service=Depends(provider)):
    return await service.test(payload.id)


@router.post("/course-research")
@router.post("/web-search")
async def course_research(payload: CourseResearchRequest):
    return await search_courses(payload.queries)
