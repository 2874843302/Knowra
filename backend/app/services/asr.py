"""Local, bounded speech recognition. Audio is decoded in memory and never saved."""
import io
import logging
import math
import re
import threading
import wave

import numpy as np
from scipy.signal import resample_poly

MODEL = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
MAX_SECONDS = 60
MAX_BYTES = 12 * 1024 * 1024


class RecognitionUnavailable(Exception):
    pass


def read_recording(data):
    if len(data) > MAX_BYTES:
        raise ValueError("录音过大，请将问题控制在 60 秒以内。")
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            rate, frames = audio.getframerate(), audio.getnframes()
            if (audio.getnchannels() != 1 or audio.getsampwidth() != 2
                    or audio.getcomptype() != "NONE" or not 8000 <= rate <= 96000):
                raise ValueError("录音格式不支持，请重新录音。")
            duration = frames / rate
            if not 0.15 <= duration <= MAX_SECONDS:
                raise ValueError("请录制 0.15 至 60 秒的问题。")
            raw = audio.readframes(frames)
            if len(raw) != frames * 2:
                raise ValueError("录音不完整，请重新录音。")
    except (wave.Error, EOFError) as error:
        raise ValueError("无法读取录音，请重新录音。") from error
    samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768
    if rate != 16000:
        divisor = math.gcd(rate, 16000)
        samples = resample_poly(samples, 16000 // divisor, rate // divisor).astype(np.float32)
    return samples, duration


class LocalASR:
    def __init__(self, settings):
        self.directory = settings.knowra_asr_model_dir or settings.knowra_data_dir / "asr" / "models" / MODEL
        self.threads = settings.knowra_asr_threads
        self._recognizer = None
        self._lock = threading.Lock()

    def status(self):
        ready = all((self.directory / name).is_file() for name in ("model.int8.onnx", "tokens.txt"))
        return {"ready": ready, "local": True, "model": "SenseVoice Small", "maxSeconds": MAX_SECONDS,
                "message": "可以开始语音提问" if ready else "语音识别尚未准备好，暂时可以打字提问。"}

    def transcribe(self, data):
        samples, duration = read_recording(data)
        if not self.status()["ready"]:
            raise RecognitionUnavailable(self.status()["message"])
        # Silence must not become hallucinated questions.
        if float(np.max(np.abs(samples))) < 0.0001:
            return {"text": "", "duration": round(duration, 3)}
        if not self._lock.acquire(blocking=False):
            raise RecognitionUnavailable("正在识别另一段录音，请稍后重试。")
        try:
            if self._recognizer is None:
                import sherpa_onnx
                self._recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                    model=str(self.directory / "model.int8.onnx"), tokens=str(self.directory / "tokens.txt"),
                    num_threads=self.threads, language="auto", use_itn=True, provider="cpu",
                )
            stream = self._recognizer.create_stream()
            stream.accept_waveform(16000, samples)
            self._recognizer.decode_stream(stream)
            text = re.sub(r"<\|[^|]*\|>", "", stream.result.text).strip()
            return {"text": text, "duration": round(duration, 3)}
        except Exception as error:
            logging.getLogger(__name__).exception("Local speech recognition failed")
            raise RecognitionUnavailable("这段语音暂时没能识别，请重新录音或打字提问。") from error
        finally:
            self._lock.release()
