"""Local model inference. No text or voice is sent to a hosted service."""
import hashlib
import importlib.util
import io
import logging
import os
import re
import threading
import wave
from pathlib import Path
from app.services.expressive_tts import ExpressiveWorker, SpeechGenerationError, FILES as EXPRESSIVE_FILES, MODEL as EXPRESSIVE_MODEL, REVISION

MODEL = "kokoro-int8-multi-lang-v1_1"
VOICES = [
    {"id": "friendly-female", "name": "亲切女声 · 高品质", "engine": "Chatterbox"},
    {"id": "zf_001", "name": "中文女声 · 01", "sid": 3},
    {"id": "zf_006", "name": "自然女声 · 流畅优先", "sid": 8},
    {"id": "zm_009", "name": "中文男声 · 01", "sid": 58},
    {"id": "zm_015", "name": "中文男声 · 02", "sid": 64},
    {"id": "af_maple", "name": "英语女声 · Maple", "sid": 0},
    {"id": "bf_vale", "name": "英语女声 · Vale", "sid": 2},
]
DEFAULT_VOICE = "zf_006"
logger = logging.getLogger(__name__)


class SpeechUnavailable(Exception):
    pass


def speech_chunks(text, limit):
    while len(text) > limit:
        boundaries = [m.end() for m in re.finditer(r"[。！？；，!?;,]|\s+", text[:limit]) if m.end() >= limit // 2]
        end = boundaries[-1] if boundaries else limit
        yield text[:end]
        text = text[end:]
    if text:
        yield text


class LocalTTS:
    def __init__(self, settings):
        self.model_dir = settings.knowra_tts_model_dir or settings.knowra_data_dir / "tts" / "models" / MODEL
        self.cache_dir = settings.knowra_data_dir / "tts" / "audio"
        self.threads = settings.knowra_tts_threads
        self._engine = None
        self.expressive_dir = self.model_dir.parent / "chatterbox-multilingual"
        self._expressive_engine = None
        self._lock = threading.RLock()
        self._expressive_lock = threading.RLock()
        self._cache_lock = threading.Lock()

    def status(self):
        installed = importlib.util.find_spec("sherpa_onnx") is not None
        model_ready = all((self.model_dir / name).exists() for name in (
            "model.int8.onnx", "voices.bin", "tokens.txt", "lexicon-us-en.txt", "lexicon-zh.txt", "espeak-ng-data",
        ))
        kokoro_ready = installed and model_ready
        expressive_ready = self.expressive_ready()
        ready = kokoro_ready or expressive_ready
        available = [v for v in VOICES if (expressive_ready if v["id"] == "friendly-female" else kokoro_ready)]
        return {
            "ready": ready, "model": MODEL if kokoro_ready or not expressive_ready else EXPRESSIVE_MODEL,
            "defaultVoice": DEFAULT_VOICE if kokoro_ready or not expressive_ready else "friendly-female",
            "voices": [{"id": v["id"], "name": v["name"], "engine": v.get("engine", "Kokoro")} for v in available],
            "message": "本地语音已就绪" if ready else "本地语音模型尚未安装，请按项目说明安装。",
        }

    def expressive_ready(self):
        return all(importlib.util.find_spec(name) is not None for name in ("onnxruntime", "tokenizers", "soundfile", "jieba", "scipy")) and all((self.expressive_dir / name).is_file() for name in EXPRESSIVE_FILES)

    def _load_expressive(self):
        if self._expressive_engine is None:
            self._expressive_engine = ExpressiveWorker(self.expressive_dir, max(6, self.threads))
        return self._expressive_engine

    def warmup(self):
        if any(v["id"] == DEFAULT_VOICE for v in self.status()["voices"]):
            def prepare_fast():
                try:
                    with self._lock:
                        self._load()
                except Exception:
                    logger.exception("Local fluent voice warmup failed")
            threading.Thread(target=prepare_fast, name="tts-warmup", daemon=True).start()
            return
        if not self.expressive_ready():
            return
        self._load_expressive().prepare().add_done_callback(self._warmup_done)

    @staticmethod
    def _warmup_done(future):
        if not future.cancelled() and future.exception():
            logger.error("Expressive voice warmup failed: %s", future.exception())

    def close(self):
        if self._expressive_engine is not None:
            self._expressive_engine.close()

    def _load(self):
        if self._engine is not None:
            return self._engine
        if not any(v["id"] == DEFAULT_VOICE for v in self.status()["voices"]):
            raise SpeechUnavailable("Kokoro 本地语音模型尚未安装。")
        import sherpa_onnx
        directory = self.model_dir
        kokoro = sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=str(directory / "model.int8.onnx"), voices=str(directory / "voices.bin"),
            tokens=str(directory / "tokens.txt"), data_dir=str(directory / "espeak-ng-data"),
            lexicon=",".join(str(directory / n) for n in ("lexicon-us-en.txt", "lexicon-zh.txt")),
        )
        rules = [directory / n for n in ("date-zh.fst", "number-zh.fst", "phone-zh.fst")]
        config = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(kokoro=kokoro, num_threads=self.threads, provider="cpu"),
            rule_fsts=",".join(str(p) for p in rules if p.exists()), max_num_sentences=1,
        )
        if not config.validate():
            raise SpeechUnavailable("本地语音模型文件不完整，请重新安装模型。")
        self._engine = sherpa_onnx.OfflineTts(config)
        return self._engine

    def synthesize(self, text: str, voice: str, user_id: str):
        text = re.sub(r"\s+", " ", text).strip()
        selected = next((v for v in VOICES if v["id"] == voice), None)
        if selected is None or not text or len(text) > 600:
            raise ValueError("请选择可用音色，并提供 1–600 字的讲解内容。")
        # Separate account directories; cached audio can never be fetched by path.
        owner = hashlib.sha256(user_id.encode()).hexdigest()[:32]
        model = f"{EXPRESSIVE_MODEL}:{REVISION}:warm-0.6-ref-c7b31d6d" if voice == "friendly-female" else f"{MODEL}:1"
        key = hashlib.sha256(f"{model}\0{voice}\0{text}".encode()).hexdigest()
        folder = self.cache_dir / owner
        target = folder / f"{key}.wav"
        # ONNX inference is serialized, including duplicate in-flight requests.
        # FastAPI runs this sync method in its worker pool, outside the event loop.
        def cached_audio():
            try:
                data = target.read_bytes()
            except FileNotFoundError:
                return None
            try:
                os.utime(target, None)
            except FileNotFoundError:
                pass
            return data, True, voice
        # Playback of completed audio must never wait for unrelated synthesis.
        if (cached := cached_audio()) is not None:
            return cached
        lock = self._expressive_lock if voice == "friendly-female" else self._lock
        with lock:
            if (cached := cached_audio()) is not None:
                return cached
            try:
                import numpy as np
                if voice == "friendly-female":
                    if not self.expressive_ready():
                        raise SpeechUnavailable("亲切女声模型尚未安装，请先安装高品质语音模型。")
                    engine = self._load_expressive()
                else:
                    engine = self._load()
                # Keep individual phoneme inputs short, even for an unpunctuated paragraph.
                chunks = speech_chunks(text, 60 if voice == "friendly-female" else 100)
                samples = []
                for chunk in chunks:
                    audio = engine.generate(chunk, exaggeration=0.6) if voice == "friendly-female" else engine.generate(chunk, sid=selected["sid"], speed=1.0)
                    samples.append(np.asarray(audio.samples, dtype=np.float32))
                pcm = np.concatenate(samples)
                if not pcm.size or not np.isfinite(pcm).all() or not np.any(pcm):
                    raise SpeechUnavailable("语音合成没有产生有效音频，请重试。")
                buffer = io.BytesIO()
                with wave.open(buffer, "wb") as out:
                    out.setnchannels(1)
                    out.setsampwidth(2)
                    out.setframerate(audio.sample_rate)
                    out.writeframes((np.clip(pcm, -1, 1) * 32767).astype("<i2").tobytes())
                data = buffer.getvalue()
            except (SpeechGenerationError, TimeoutError):
                if voice != "friendly-female" or not any(v["id"] == "zf_006" for v in self.status()["voices"]):
                    raise SpeechUnavailable("本句语音暂时无法完成，请稍后重试。")
                # A failed high-quality utterance must not stop the lesson.
                # Cache the replacement under its actual voice, so a later
                # preferred-voice request never mistakes it for that voice.
                logger.warning("Using local backup female voice after incomplete expressive speech")
                return self.synthesize(text, "zf_006", user_id)
            except SpeechUnavailable:
                raise
            except Exception as error:
                logger.exception("Local speech synthesis failed")
                raise SpeechUnavailable("本地语音合成暂时失败，请重试或关闭朗读继续学习。") from error
            with self._cache_lock:
                folder.mkdir(parents=True, exist_ok=True)
                temporary = target.with_suffix(".tmp")
                temporary.write_bytes(data)
                temporary.replace(target)
                # Bound disk usage across accounts; oldest audio can be regenerated.
                files = sorted(self.cache_dir.glob("*/*.wav"), key=lambda p: p.stat().st_mtime, reverse=True)
                total = 0
                for file in files:
                    total += file.stat().st_size
                    if total > 512 * 1024 * 1024 and file != target:
                        file.unlink(missing_ok=True)
            return data, False, voice
