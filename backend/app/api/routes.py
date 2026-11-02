from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.schemas import AIRequest, CourseResearchRequest, InitializeWorkspace, ProviderInput, UpdateWorkspace
from app.services.course_research import search_courses
from app.services.documents import MAX_BYTES, save_material
from app.services.course_jobs import user_provider


router = APIRouter(prefix="/api")


def database(request: Request):
    return request.app.state.database


def provider(request: Request):
    return user_provider(request.app, request.state.user)


def workspace(request: Request):
    return request.state.user["workspace_id"]


@router.get("/health")
def health():
    return {"ok": True, "backend": "python", "database": "sqlite", "version": "2.0.0"}


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
    with db.connect() as connection:
        row = connection.execute("SELECT name FROM materials WHERE id = ? AND workspace_id = ?",
                                 (str(material_id), workspace_id)).fetchone()
    if row is None:
        raise HTTPException(404, "原文件不存在。")
    return FileResponse(db.directory / "uploads" / workspace_id / str(material_id),
                        filename=row["name"], media_type="application/octet-stream")


@router.get("/provider")
def get_provider(service=Depends(provider)):
    return service.public()


@router.put("/provider")
def save_provider(payload: ProviderInput, service=Depends(provider)):
    return service.save(payload)


@router.post("/ai")
async def ai(payload: AIRequest, request: Request, service=Depends(provider)):
    return await service.complete(payload, is_disconnected=request.is_disconnected)


@router.post("/course-research")
async def course_research(payload: CourseResearchRequest):
    return await search_courses(payload.queries)
