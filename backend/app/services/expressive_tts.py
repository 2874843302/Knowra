"""CPU ONNX Chatterbox multilingual inference with a fixed Mandarin voice.

Adapted from the MIT-licensed onnx-community/chatterbox-multilingual-ONNX
inference example (revision 452d3f434aa592098f1eedac9099f33642ab2da5).
"""
import json
import logging
from pathlib import Path
from types import SimpleNamespace
import unicodedata
import time

logger = logging.getLogger(__name__)

MODEL = "chatterbox-multilingual-q4"
REVISION = "452d3f434aa592098f1eedac9099f33642ab2da5"
FILES = (
    "onnx/conditional_decoder.onnx", "onnx/conditional_decoder.onnx_data",
    "onnx/embed_tokens.onnx", "onnx/embed_tokens.onnx_data",
    "onnx/language_model_q4.onnx", "onnx/language_model_q4.onnx_data",
    "onnx/speech_encoder.onnx", "onnx/speech_encoder.onnx_data",
    "tokenizer.json", "Cangjie5_TC.json", "friendly-female.wav",
)

_worker_engine = None


class SpeechGenerationError(RuntimeError):
    """No complete utterance was produced; partial audio must not be played."""


def sample_token(scores, rng):
    """Chatterbox temperature/min-p/nucleus sampling (0.8 / 0.05 / 0.95)."""
    import numpy as np
    values = np.asarray(scores, dtype=np.float64).copy()
    # START_SPEECH is an input marker, never an output audio code.
    values[6561] = -np.inf
    if np.isnan(values).any() or np.isposinf(values).any() or not np.isfinite(values).any():
        raise SpeechGenerationError("Invalid speech probabilities")
    probabilities = np.exp((values - np.max(values)) / 0.8)
    probabilities[probabilities < probabilities.max() * 0.05] = 0
    probabilities /= probabilities.sum()
    order = np.argsort(probabilities)[::-1]
    ordered = probabilities[order]
    keep = np.cumsum(ordered) - ordered < 0.95
    candidates, weights = order[keep], ordered[keep]
    return int(rng.choice(candidates, p=weights / weights.sum()))


def prepare_voice(directory, threads):
    global _worker_engine
    if _worker_engine is None:
        _worker_engine = ExpressiveTTS(Path(directory), threads)
    return True


def generate_voice(directory, threads, text, exaggeration, deadline):
    prepare_voice(directory, threads)
    return _worker_engine.generate(text, exaggeration=exaggeration, deadline=deadline)


class ExpressiveWorker:
    """Keep ONNX session construction off the HTTP process's Python GIL."""
    def __init__(self, directory, threads):
        from concurrent.futures import ProcessPoolExecutor
        import multiprocessing
        self.directory, self.threads = str(directory), threads
        self.pool = ProcessPoolExecutor(max_workers=1, mp_context=multiprocessing.get_context("spawn"))

    def prepare(self):
        return self.pool.submit(prepare_voice, self.directory, self.threads)

    def generate(self, text, *, exaggeration):
        return self.pool.submit(generate_voice, self.directory, self.threads, text, exaggeration, time.monotonic() + 70).result(timeout=75)

    def close(self):
        self.pool.shutdown(wait=True, cancel_futures=True)


class ExpressiveTTS:
    def __init__(self, directory: Path, threads: int):
        import onnxruntime as ort
        import numpy as np
        import soundfile as sf
        from scipy.signal import resample_poly
        from tokenizers import Tokenizer
        from math import gcd

        options = ort.SessionOptions()
        options.intra_op_num_threads = max(1, min(8, threads))
        options.inter_op_num_threads = 1
        sessions = []
        for name in ("speech_encoder.onnx", "embed_tokens.onnx", "language_model_q4.onnx", "conditional_decoder.onnx"):
            started = time.monotonic()
            sessions.append(ort.InferenceSession(str(directory / "onnx" / name), sess_options=options, providers=["CPUExecutionProvider"]))
            logger.info("Speech graph %s loaded in %.2fs", name, time.monotonic() - started)
        self.encoder, self.embed, self.language, self.decoder = sessions
        self.tokenizer = Tokenizer.from_file(str(directory / "tokenizer.json"))
        self.codes, self.variants = {}, {}
        for entry in json.loads((directory / "Cangjie5_TC.json").read_text(encoding="utf-8")):
            glyph, code = entry.split("\t")[:2]
            self.codes[glyph] = code
            self.variants.setdefault(code, []).append(glyph)
        prompt, sample_rate = sf.read(directory / "friendly-female.wav", dtype="float32")
        if prompt.ndim > 1:
            prompt = prompt.mean(axis=1)
        if sample_rate != 24000:
            divisor = gcd(sample_rate, 24000)
            prompt = resample_poly(prompt, 24000 // divisor, sample_rate // divisor).astype(np.float32)
        # Voice conditioning is computed once, rather than on every sentence.
        self.condition, self.prompt_tokens, self.speaker, self.features = self.encoder.run(None, {"audio_values": prompt[None, :].astype(np.float32)})

    def tokens(self, text):
        import jieba
        # The published tokenizer contains newer full-width punctuation entries
        # beyond the exported graph's 2352 text embeddings. Normalize punctuation
        # before segmentation and use the model's UNK for unsupported symbols.
        text = unicodedata.normalize("NFKC", text).translate(str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'", "—": "-", "…": "."}))
        text = " ".join(text.split())
        if text and text[-1] not in '.!?,。！？、':
            text += '.'
        parts = []
        for glyph in " ".join(jieba.cut(text)):
            code = self.codes.get(glyph)
            if unicodedata.category(glyph) != "Lo" or code is None:
                parts.append(glyph)
                continue
            index = self.variants[code].index(glyph)
            code += str(index) if index else ""
            parts.append("".join(f"[cj_{c}]" for c in code) + "[cj_.]")
        ids = self.tokenizer.encode("[zh]" + "".join(parts)).ids
        return [i if i < 2352 or i in (6561, 6563) else 1 for i in ids]

    def generate(self, text, *, exaggeration=0.6, deadline=None):
        deadline = deadline if deadline is not None else time.monotonic() + 45
        for attempt in range(2):
            try:
                return self._generate(text, exaggeration, min(deadline, time.monotonic() + 20))
            except SpeechGenerationError:
                if attempt or time.monotonic() >= deadline:
                    raise
                logger.warning("Retrying incomplete speech with fresh sampling (characters=%d)", len(text))

    def _generate(self, text, exaggeration, deadline):
        import numpy as np
        rng = np.random.default_rng()
        ids = np.array([self.tokens(text)], dtype=np.int64)
        positions = np.where(ids >= 6561, 0, np.arange(ids.shape[1])[None, :] - 1).astype(np.int64)
        generated = np.array([[6561]], dtype=np.int64)
        past = None
        maximum = min(1000, max(250, len(text) * 16))
        for index in range(maximum):
            if time.monotonic() >= deadline:
                raise SpeechGenerationError("Speech generation exceeded its time budget")
            embeds = self.embed.run(None, {"input_ids": ids, "position_ids": positions, "exaggeration": np.array([exaggeration], dtype=np.float32)})[0]
            if past is None:
                embeds = np.concatenate((self.condition, embeds), axis=1)
                batch, length, _ = embeds.shape
                past = {f"past_key_values.{layer}.{kind}": np.zeros((batch, 16, 0, 64), dtype=np.float32) for layer in range(30) for kind in ("key", "value")}
                mask = np.ones((batch, length), dtype=np.int64)
            logits, *present = self.language.run(None, {"inputs_embeds": embeds, "attention_mask": mask, **past})
            scores = logits[:, -1, :].copy()
            repeated = np.take_along_axis(scores, generated, axis=1)
            np.put_along_axis(scores, generated, np.where(repeated < 0, repeated * 1.2, repeated / 1.2), axis=1)
            ids = np.array([[sample_token(scores[0], rng)]], dtype=np.int64)
            generated = np.concatenate((generated, ids), axis=1)
            if int(ids[0, 0]) == 6562:
                break
            positions = np.full((1, 1), index + 1, dtype=np.int64)
            mask = np.concatenate((mask, np.ones((1, 1), dtype=np.int64)), axis=1)
            past = dict(zip(past, present))
        else:
            raise SpeechGenerationError("Speech did not finish; refusing to cache truncated audio")
        if generated.shape[1] < 4:
            raise SpeechGenerationError("Speech stopped before producing audio codes")
        samples = self.decoder.run(None, {
            "speech_tokens": np.concatenate((self.prompt_tokens, generated[:, 1:-1]), axis=1),
            "speaker_embeddings": self.speaker,
            "speaker_features": self.features,
        })[0]
        return SimpleNamespace(samples=samples.flatten(), sample_rate=24000)
