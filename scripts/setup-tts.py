"""Install the pinned, Apache-2.0 Kokoro Chinese/English ONNX model locally."""
import argparse
import hashlib
from pathlib import Path
import tarfile
import urllib.request

MODEL = "kokoro-int8-multi-lang-v1_1"
URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/{MODEL}.tar.bz2"
SHA256 = "259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / ".local" / "tts" / "models")
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    archive = args.directory / f"{MODEL}.tar.bz2"
    if not archive.exists() or hashlib.file_digest(archive.open("rb"), "sha256").hexdigest() != SHA256:
        print(f"Downloading {MODEL} (147 MB)...", flush=True)
        temporary = archive.with_suffix(".download")
        urllib.request.urlretrieve(URL, temporary)
        with temporary.open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != SHA256:
                raise RuntimeError("Model checksum mismatch; refusing to install.")
        temporary.replace(archive)
    with tarfile.open(archive, "r:bz2") as source:
        source.extractall(args.directory, filter="data")
    print(f"Ready: {args.directory / MODEL}", flush=True)


if __name__ == "__main__":
    main()
