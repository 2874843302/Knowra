import io
import wave
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace

import numpy as np
import pytest

from app.services.tts import LocalTTS, SpeechUnavailable, speech_chunks
from app.core.config import Settings


def test_long_speech_is_losslessly_split_at_phrase_boundaries():
    text = "我们先确定输入和输出，再检查停止条件。" * 12 + "最后总结。"
    chunks = list(speech_chunks(text, 60))
    assert "".join(chunks) == text
    assert all(0 < len(chunk) <= 60 for chunk in chunks)
    assert all(chunk[-1] in "。，" for chunk in chunks[:-1])
    unpunctuated = "连续讲解" * 40
    assert "".join(speech_chunks(unpunctuated, 60)) == unpunctuated


def test_tts_requires_account_and_valid_voice(client):
    assert client.get("/api/tts/status").status_code == 200
    assert client.get("/api/tts/status").json()["defaultVoice"] == "zf_006"
    for payload in ({"text": " "}, {"text": "测试", "voice": "../../other.wav"}, {"text": "字" * 601}):
        assert client.post("/api/tts/speech", json=payload).status_code == 422
    client.cookies.clear()
    assert client.get("/api/tts/status").status_code == 401
    assert client.post("/api/tts/speech", json={"text": "你好。"}).status_code == 401


def test_uninstalled_model_has_actionable_status_and_503(client):
    assert client.get("/api/tts/status").json()["ready"] is False
    response = client.post("/api/tts/speech", json={"text": "你好。"})
    assert response.status_code == 503
    assert "未安装" in response.json()["error"]


def test_audio_cache_is_account_voice_and_text_specific(tmp_path, monkeypatch):
    service = LocalTTS(Settings(knowra_data_dir=tmp_path, _env_file=None))
    calls = []
    def generate(text, sid, speed):
        calls.append((text, sid, speed))
        return SimpleNamespace(samples=np.sin(np.arange(2400) * 0.1) * 0.2, sample_rate=24000)
    monkeypatch.setattr(service, "_load", lambda: SimpleNamespace(generate=generate))
    first, cached, actual_voice = service.synthesize("你好。", "zf_001", "account-a")
    assert not cached
    assert actual_voice == "zf_001"
    with wave.open(io.BytesIO(first), "rb") as audio:
        assert (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) == (24000, 1, 2)
        assert audio.getnframes() == 2400
    assert service.synthesize("你好。", "zf_001", "account-a") == (first, True, "zf_001")
    assert len(calls) == 1
    service.synthesize("你好。", "zm_009", "account-a")
    service.synthesize("你好。", "zf_001", "account-b")
    service.synthesize("另一个句子。", "zf_001", "account-a")
    assert len(calls) == 4
    assert len(list(service.cache_dir.glob("*"))) == 2
    assert {v[1] for v in calls} == {3, 58}


def test_silent_or_invalid_model_audio_is_never_cached(tmp_path, monkeypatch):
    service = LocalTTS(Settings(knowra_data_dir=tmp_path, _env_file=None))
    monkeypatch.setattr(service, "_load", lambda: SimpleNamespace(generate=lambda *a, **k: SimpleNamespace(samples=[0.0] * 20, sample_rate=24000)))
    with pytest.raises(SpeechUnavailable):
        service.synthesize("你好。", "zf_001", "account-a")
    assert not list(service.cache_dir.glob("*/*.wav"))


def test_cached_audio_bypasses_busy_inference_and_engines_are_independent(tmp_path, monkeypatch):
    service = LocalTTS(Settings(knowra_data_dir=tmp_path, _env_file=None))
    audio = SimpleNamespace(samples=[0.1] * 2400, sample_rate=24000)
    monkeypatch.setattr(service, "_load", lambda: SimpleNamespace(generate=lambda *a, **k: audio))
    cached = service.synthesize("已经准备好了。", "zf_006", "account-a")[0]
    for lock in (service._lock, service._expressive_lock):
        acquired, release = Event(), Event()
        def busy_inference():
            with lock:
                acquired.set()
                assert release.wait(5)
        with ThreadPoolExecutor(max_workers=2) as executor:
            busy = executor.submit(busy_inference)
            try:
                assert acquired.wait(1)
                # A cached clip must return before the blocked synthesis finishes.
                result = executor.submit(service.synthesize, "已经准备好了。", "zf_006", "account-a").result(timeout=1)
                assert result == (cached, True, "zf_006")
                if lock is service._expressive_lock:
                    # Selecting a quick voice also bypasses ongoing quality inference.
                    result = executor.submit(service.synthesize, "新的流畅语音。", "zf_006", "account-a").result(timeout=1)
                    assert result[1:] == (False, "zf_006")
            finally:
                release.set()
            busy.result(timeout=1)


def test_speech_contract_returns_wav_and_cache_headers(client, monkeypatch):
    service = client.app.state.tts
    monkeypatch.setattr(service, "_load", lambda: SimpleNamespace(generate=lambda *a, **k: SimpleNamespace(samples=[0.1] * 2400, sample_rate=24000)))
    for hit in ("miss", "hit"):
        response = client.post("/api/tts/speech", json={"text": "测试课堂语音。", "voice": "zf_001"})
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/wav"
        assert response.headers["x-speech-cache"] == hit
        assert response.headers["x-speech-voice"] == "zf_001"
        assert response.headers["x-speech-fallback"] == "false"
        assert float(response.headers["x-audio-duration"]) == 0.1
        assert response.headers["cache-control"] == "no-store"
        assert response.content[:4] == b"RIFF"


def test_expressive_default_routes_to_conditioned_voice_and_caches(client, monkeypatch):
    service = client.app.state.tts
    monkeypatch.setattr(service, "expressive_ready", lambda: True)
    calls = []
    def generate(text, exaggeration):
        calls.append((text, exaggeration))
        return SimpleNamespace(samples=[0.1] * 2400, sample_rate=24000)
    service._expressive_engine = SimpleNamespace(generate=generate, close=lambda: None)
    assert service.status()["defaultVoice"] == "friendly-female"
    for cache in ("miss", "hit"):
        response = client.post("/api/tts/speech", json={"text": "一起理解这个例子。"})
        assert response.status_code == 200
        assert response.headers["x-speech-cache"] == cache
    assert calls == [("一起理解这个例子。", 0.6)]


def test_incomplete_expressive_audio_uses_backup_without_poisoning_preferred_cache(client, monkeypatch):
    from app.services.expressive_tts import SpeechGenerationError
    service = client.app.state.tts
    monkeypatch.setattr(service, "status", lambda: {"defaultVoice": "friendly-female", "voices": [{"id": "zf_006"}]})
    monkeypatch.setattr(service, "expressive_ready", lambda: True)
    calls = []
    def incomplete(*args, **kwargs):
        calls.append("preferred")
        raise SpeechGenerationError("Speech did not finish")
    service._expressive_engine = SimpleNamespace(generate=incomplete, close=lambda: None)
    monkeypatch.setattr(service, "_load", lambda: SimpleNamespace(generate=lambda *a, **k: SimpleNamespace(samples=[0.1] * 2400, sample_rate=24000)))
    response = client.post("/api/tts/speech", json={"text": "本句自动恢复。"})
    assert response.status_code == 200
    assert response.headers["x-speech-voice"] == "zf_006"
    assert response.headers["x-speech-fallback"] == "true"
    assert response.content[:4] == b"RIFF"
    response = client.post("/api/tts/speech", json={"text": "本句自动恢复。", "voice": "zf_006"})
    assert response.headers["x-speech-cache"] == "hit"
    assert calls == ["preferred"]
    # A subsequent request tries the preferred engine again, rather than
    # silently persisting the backup as the user's selected voice.
    client.post("/api/tts/speech", json={"text": "本句自动恢复。"})
    assert calls == ["preferred", "preferred"]
    assert len(list(service.cache_dir.glob("*/*.wav"))) == 1
