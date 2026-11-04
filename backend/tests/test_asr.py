import io
import wave
from types import SimpleNamespace

import numpy as np
import pytest

from app.services.asr import LocalASR, MAX_BYTES, RecognitionUnavailable, read_recording


def recording(seconds=1, rate=16000, channels=1, amplitude=3000):
    samples = np.full(int(seconds * rate) * channels, amplitude, dtype="<i2")
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(samples.tobytes())
    return output.getvalue()


def engine(tmp_path, ready=True):
    if ready:
        (tmp_path / "model.int8.onnx").touch()
        (tmp_path / "tokens.txt").touch()
    return LocalASR(SimpleNamespace(knowra_asr_model_dir=tmp_path, knowra_asr_threads=2))


def test_recording_resamples_and_preserves_duration():
    samples, duration = read_recording(recording(rate=48000))
    assert duration == 1
    assert samples.shape == (16000,)
    assert samples.dtype == np.float32
    assert np.mean(samples) == pytest.approx(3000 / 32768, abs=0.001)


@pytest.mark.parametrize("data", [b"not audio", recording(seconds=0.1), recording(seconds=60.1),
    recording(channels=2), recording()[:-10], b"0" * (MAX_BYTES + 1)],
    ids=["not-wav", "too-short", "too-long", "stereo", "truncated", "too-large"])
def test_invalid_audio_rejected(data):
    with pytest.raises(ValueError):
        read_recording(data)


def test_missing_model_has_actionable_error(tmp_path):
    service = engine(tmp_path, ready=False)
    assert not service.status()["ready"]
    with pytest.raises(RecognitionUnavailable, match="打字提问"):
        service.transcribe(recording())


def test_silence_does_not_load_recognizer(tmp_path):
    service = engine(tmp_path)
    assert service.transcribe(recording(amplitude=0)) == {"text": "", "duration": 1.0}
    assert service._recognizer is None


def test_recognition_strips_tags_and_reuses_engine(tmp_path):
    service = engine(tmp_path)
    captured = []
    stream = SimpleNamespace(result=SimpleNamespace(text="<|zh|><|NEUTRAL|>老师，这里为什么相加？"),
        accept_waveform=lambda rate, samples: captured.append((rate, len(samples))))
    service._recognizer = SimpleNamespace(create_stream=lambda: stream, decode_stream=lambda stream: None)
    assert service.transcribe(recording(rate=48000))["text"] == "老师，这里为什么相加？"
    assert captured == [(16000, 16000)]


def test_busy_and_failed_recognition_release_lock(tmp_path):
    service = engine(tmp_path)
    service._lock.acquire()
    with pytest.raises(RecognitionUnavailable, match="另一段"):
        service.transcribe(recording())
    service._lock.release()
    service._recognizer = SimpleNamespace(create_stream=lambda: (_ for _ in ()).throw(RuntimeError("internal")))
    with pytest.raises(RecognitionUnavailable, match="重新录音") as result:
        service.transcribe(recording())
    assert "internal" not in str(result.value)
    assert not service._lock.locked()


def test_authenticated_api_and_validation(client, monkeypatch):
    service = client.app.state.asr
    monkeypatch.setattr(service, "transcribe", lambda data: {"text": "什么是变量？", "duration": 1})
    response = client.post("/api/asr/transcribe", files={"file": ("question.wav", recording(), "audio/wav")})
    assert response.status_code == 200
    assert response.json()["text"] == "什么是变量？"
    monkeypatch.undo()
    invalid = client.post("/api/asr/transcribe", files={"file": ("broken.wav", b"bad")})
    assert invalid.status_code == 422
    missing = client.post("/api/asr/transcribe", files={"file": ("question.wav", recording())})
    assert missing.status_code == 503
    assert "打字提问" in missing.json()["error"]
    oversized = client.post("/api/asr/transcribe", files={"file": ("question.wav", b"0" * (MAX_BYTES + 1))})
    assert oversized.status_code == 413
    client.cookies.clear()
    assert client.get("/api/asr/status").status_code == 401
    assert client.post("/api/asr/transcribe", files={"file": ("q.wav", recording())}).status_code == 401
