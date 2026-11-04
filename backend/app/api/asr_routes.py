import asyncio
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.services.asr import MAX_BYTES, RecognitionUnavailable

router = APIRouter(prefix="/api/asr", tags=["speech recognition"])


@router.get("/status")
def status(request: Request):
    return request.app.state.asr.status()


@router.post("/transcribe")
async def transcribe(file: Annotated[UploadFile, File()], request: Request):
    try:
        data = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "录音过大，请将问题控制在 60 秒以内。")
    try:
        return await asyncio.to_thread(request.app.state.asr.transcribe, data)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except RecognitionUnavailable as error:
        raise HTTPException(503, str(error)) from error
