"""Install pinned Chatterbox multilingual Q4 weights and a Mandarin female voice."""
import argparse
import hashlib
import os
from pathlib import Path
import urllib.request

REVISION = "452d3f434aa592098f1eedac9099f33642ab2da5"
CHECKSUMS = {
    "conditional_decoder": "51d58345a272747665ec9d5bb61e01835258a940e321a288582ac4c18cf01b5a",
    "embed_tokens": "2a15f7dd73b2ee47f6edf87740324011594b5a528ed6471ae55e327ed6cad68c",
    "language_model_q4": "e79ab8784122a501718868b9631ff46e151c552d9b24e50f25d721f375e3526c",
    "speech_encoder": "92f8f290fc9720e169bc2412c507209e20b03f6564bc3243739e25c56f7dfb8f",
}
VOICE_REVISION = "b02d7e61f743839a93d4058d9c11e79f82fad041"
VOICE_SHA256 = "c7b31d6dbe7cc6a716dded00550db5b50940bf209e424e4ad207b12e657c8ff6"


def verify(path, expected):
    with path.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != expected:
            raise RuntimeError(f"Checksum mismatch: {path.name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / ".local/tts/models/chatterbox-multilingual")
    args = parser.parse_args()
    # Honor environment proxy settings, or the Windows system proxy used by urllib.
    for scheme, proxy in urllib.request.getproxies().items():
        if scheme in ("http", "https"):
            os.environ.setdefault(f"{scheme.upper()}_PROXY", proxy)
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    from huggingface_hub import snapshot_download
    names = [f"onnx/{name}.onnx{suffix}" for name in CHECKSUMS for suffix in ("", "_data")]
    snapshot_download("onnx-community/chatterbox-multilingual-ONNX", revision=REVISION,
                      local_dir=args.directory, allow_patterns=names + ["tokenizer.json", "Cangjie5_TC.json", "README.md"], max_workers=4)
    for name, digest in CHECKSUMS.items():
        verify(args.directory / "onnx" / f"{name}.onnx_data", digest)
    voice = args.directory / "friendly-female.wav"
    if not voice.exists():
        temporary = voice.with_suffix(".download")
        urllib.request.urlretrieve(f"https://raw.githubusercontent.com/QwenAudio/CosyVoice/{VOICE_REVISION}/asset/zero_shot_prompt.wav", temporary)
        verify(temporary, VOICE_SHA256)
        temporary.replace(voice)
    verify(voice, VOICE_SHA256)
    print(f"Ready: {args.directory}")


if __name__ == "__main__":
    main()
