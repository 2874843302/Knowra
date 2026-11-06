from fastapi import APIRouter, Query, Request

router = APIRouter(prefix="/api/library")


def service(request: Request):
    return request.app.state.library


@router.get("/courses")
def catalog(
    request: Request,
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return service(request).catalog(request.state.user, q, limit, offset)


@router.get("/joined")
def joined(request: Request):
    return service(request).joined(request.state.user)


@router.get("/mine")
def mine(request: Request):
    return service(request).mine(request.state.user)


@router.get("/courses/{course_id}")
def course(course_id: str, request: Request):
    return service(request).course(request.state.user, course_id)


@router.post("/courses/{course_id}/publish")
def publish(course_id: str, request: Request):
    return service(request).publish(request.state.user, course_id)


@router.post("/courses/{course_id}/unpublish")
def unpublish(course_id: str, request: Request):
    return service(request).unpublish(request.state.user, course_id)