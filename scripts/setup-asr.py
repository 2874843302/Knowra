"""Install the pinned sherpa-onnx SenseVoice int8 model for local voice questions."""
import argparse
import hashlib
from pathlib import Path
import shutil
import tarfile
import urllib.request
from urllib.parse import urlencode

MODEL = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
ARCHIVE_MODEL = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17"
URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{ARCHIVE_MODEL}.tar.bz2"
ARCHIVE_SHA256 = "7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e"
MODEL_SHA256 = "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51"
MIRROR = "https://modelscope.cn/api/v1/models/WEAAEW/" + MODEL + "/repo?"
# ModelScope resolves branch names; each downloaded file is pinned by SHA-256.
MIRROR_REVISION = "master"
HASHES = {
    "model.int8.onnx": MODEL_SHA256,
    "tokens.txt": "f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc",
    "LICENSE": "221c6df10b0931a5629adad671ea48fb7747e034c414b6d2bfa275bc3dd4ea17",
    "README.md": "8448f57df89fd25ece36fe5d59cbf414380263e63148ca02e149a6103d7797cd",
}


def install_mirror(directory):
    target = directory / MODEL
    target.mkdir(parents=True, exist_ok=True)
    for name, expected in HASHES.items():
        destination = target / name
        if destination.is_file() and digest(destination) == expected:
            continue
        print(f"Downloading {name} from ModelScope...", flush=True)
        temporary = destination.with_suffix(destination.suffix + ".download")
        url = MIRROR + urlencode({"Revision": MIRROR_REVISION, "FilePath": name})
        with urllib.request.urlopen(url, timeout=40) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
        if digest(temporary) != expected:
            raise RuntimeError(f"Checksum mismatch: {name}; refusing to install.")
        temporary.replace(destination)
    print(f"Ready: {target}", flush=True)


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / ".local/asr/models")
    parser.add_argument("--source", choices=["github", "modelscope"], default="github")
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    if args.source == "modelscope":
        install_mirror(args.directory)
        return
    archive = args.directory / f"{ARCHIVE_MODEL}.tar.bz2"
    if not archive.is_file() or digest(archive) != ARCHIVE_SHA256:
        print("Downloading SenseVoice int8 (163 MB)...", flush=True)
        temporary = archive.with_suffix(".download")
        with urllib.request.urlopen(URL, timeout=40) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
        if digest(temporary) != ARCHIVE_SHA256:
            raise RuntimeError("Model archive checksum mismatch; refusing to install.")
        temporary.replace(archive)
    target = args.directory / MODEL
    target.mkdir(parents=True, exist_ok=True)
    # Select files explicitly: never extract executable code or archive paths.
    with tarfile.open(archive, "r:bz2") as source:
        for name in ["model.int8.onnx", "tokens.txt", "LICENSE", "README.md", "test_wavs/zh.wav", "test_wavs/en.wav"]:
            destination = target / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix(destination.suffix + ".download")
            member = source.extractfile(f"{ARCHIVE_MODEL}/{name}")
            if member is None:
                raise RuntimeError(f"Missing model file: {name}")
            with member, temporary.open("wb") as output:
                shutil.copyfileobj(member, output)
            if name == "model.int8.onnx" and digest(temporary) != MODEL_SHA256:
                raise RuntimeError("ONNX checksum mismatch; refusing to install.")
            temporary.replace(destination)
    print(f"Ready: {target}", flush=True)


if __name__ == "__main__":
    main()
