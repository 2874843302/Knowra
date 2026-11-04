from uuid import UUID

from fastapi import APIRouter, Request

from app.services.course_jobs import CourseInput

router = APIRouter(prefix="/api/course-jobs")


@router.get("")
async def list_jobs(request: Request):
    service = request.app.state.jobs
    with service.db.connect() as db:
        rows = db.execute("SELECT * FROM course_jobs WHERE user_id=%s ORDER BY created_at DESC LIMIT 50", (request.state.user["id"],)).fetchall()
    return {"jobs": [service.view(row) for row in rows]}


@router.post("", status_code=202)
async def create_job(payload: CourseInput, request: Request):
    return request.app.state.jobs.create(request.state.user, payload)


@router.get("/{job_id}")
async def get_job(job_id: UUID, request: Request):
    service = request.app.state.jobs
    return service.view(service.row(request.state.user, job_id))


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: UUID, request: Request):
    return await request.app.state.jobs.cancel(request.state.user, job_id)


@router.post("/{job_id}/resume")
async def resume_job(job_id: UUID, request: Request):
    return request.app.state.jobs.resume(request.state.user, job_id)
