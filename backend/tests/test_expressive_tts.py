from types import SimpleNamespace
import numpy as np
import pytest

from app.services.expressive_tts import ExpressiveTTS, SpeechGenerationError, sample_token


def test_chinese_punctuation_and_new_tokenizer_symbols_fit_exported_embeddings():
    # Reproduces the exported graph's Gather failure on a full-width comma.
    # Tokenization must not require loading the 1.5 GB inference graphs.
    engine = ExpressiveTTS.__new__(ExpressiveTTS)
    engine.codes, engine.variants = {}, {}
    captured = []
    def encode(text):
        captured.append(text)
        return SimpleNamespace(ids=[6563, 255, 2387, 200, 6561, 6561])
    engine.tokenizer = SimpleNamespace(encode=encode)
    assert engine.tokens('“先别着急”，一起试试！') == [6563, 255, 1, 200, 6561, 6561]
    assert all(symbol not in captured[0] for symbol in ('“', '”', '，', '！'))
    assert ',' in captured[0] and '!' in captured[0]


def test_sampling_escapes_greedy_path_but_never_outputs_start_marker():
    scores = np.full(6563, -100.0)
    scores[6561] = 100
    scores[12], scores[13], scores[6562] = 3, 2.9, 2.8
    rng = np.random.default_rng(7)
    choices = {sample_token(scores, rng) for _ in range(80)}
    assert choices == {12, 13, 6562}


def test_nonterminating_attempt_retries_once_and_never_returns_partial_audio(monkeypatch):
    engine = ExpressiveTTS.__new__(ExpressiveTTS)
    calls = []
    complete = SimpleNamespace(samples=[.1], sample_rate=24000)
    def generate(*args):
        calls.append(args)
        if len(calls) == 1:
            raise SpeechGenerationError("missing EOS")
        return complete
    monkeypatch.setattr(engine, "_generate", generate, raising=False)
    assert engine.generate("自动重试。") is complete
    assert len(calls) == 2
    def fails(*args):
        calls.append(args)
        raise SpeechGenerationError("missing EOS")
    monkeypatch.setattr(engine, "_generate", fails)
    calls.clear()
    with pytest.raises(SpeechGenerationError):
        engine.generate("仍然无法结束。")
    assert len(calls) == 2
