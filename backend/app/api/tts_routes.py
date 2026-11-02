import io
import wave

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.services.tts import SpeechUnavailable

router = APIRouter(prefix="/api/tts", tags=["speech"])


class SpeechInput(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    voice: str | None = None


@router.get("/status")
def status(request: Request):
    return request.app.state.tts.status()


@router.post("/speech")
def speech(payload: SpeechInput, request: Request):
    try:
        voice = payload.voice if payload.voice is not None else request.app.state.tts.status()["defaultVoice"]
        data, cached, actual_voice = request.app.state.tts.synthesize(payload.text, voice, request.state.user["id"])
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except SpeechUnavailable as error:
        raise HTTPException(503, str(error)) from error
    with wave.open(io.BytesIO(data), "rb") as audio:
        duration = audio.getnframes() / audio.getframerate()
    return Response(data, media_type="audio/wav", headers={
        "X-Audio-Duration": f"{duration:.3f}", "X-Speech-Cache": "hit" if cached else "miss",
        "X-Speech-Voice": actual_voice, "X-Speech-Fallback": str(actual_voice != voice).lower(),
    })
