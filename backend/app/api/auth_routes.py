from fastapi import APIRouter, Request, Response

from app.services.auth import Credentials, Recovery, Registration, TokenInput

router = APIRouter(prefix="/api/auth")


@router.post("/register", status_code=201)
def register(payload: Registration, request: Request, response: Response):
    service = request.app.state.auth
    user, recovery = service.register(payload, request.client.host if request.client else "local")
    result = service.session(user, response, request.url.scheme == "https")
    result["recoveryCode"] = recovery
    return result


@router.post("/login")
def login(payload: Credentials, request: Request, response: Response):
    service = request.app.state.auth
    user = service.login(payload, request.client.host if request.client else "local")
    return service.session(user, response, request.url.scheme == "https")


@router.post("/recover")
def recover(payload: Recovery, request: Request):
    return request.app.state.auth.recover(payload, request.client.host if request.client else "local")


@router.get("/me")
def me(request: Request):
    return {"user": request.app.state.auth.public(request.app.state.auth.user(request))}


@router.post("/logout")
def logout(request: Request, response: Response):
    request.app.state.auth.logout(request, response)
    return {"ok": True}


@router.get("/tokens")
def tokens(request: Request):
    return {"tokens": request.app.state.auth.tokens(request.state.user)}


@router.post("/tokens", status_code=201)
def create_token(payload: TokenInput, request: Request):
    return request.app.state.auth.create_token(request.state.user, payload)


@router.delete("/tokens/{token_id}")
def revoke_token(token_id: str, request: Request):
    request.app.state.auth.revoke(request.state.user, token_id)
    return {"ok": True}
