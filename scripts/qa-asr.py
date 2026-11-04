"""Decode supplied fixture WAVs with the real local model (no external AI calls)."""
import json
import argparse
from pathlib import Path
import sys
import time
import tempfile
import secrets
from contextlib import nullcontext

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.core.config import Settings
from app.services.asr import LocalASR

sys.stdout.reconfigure(encoding="utf-8")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--api", action="store_true", help="Use authenticated HTTP in an isolated PostgreSQL fixture")
parser.add_argument("recordings", nargs="+")
args = parser.parse_args()
service = LocalASR(Settings())
results = []
with tempfile.TemporaryDirectory(prefix="knowra-asr-qa-") as temporary:
    if args.api:
        from fastapi.testclient import TestClient
        from app.main import create_app
        from qa_database import fixture_settings
        manager = TestClient(create_app(fixture_settings(knowra_data_dir=Path(temporary),
            knowra_asr_model_dir=service.directory, ai_api_key="", ai_base_url="", ai_model="", _env_file=None)))
    else:
        manager = nullcontext()
    with manager as client:
        if client:
            assert client.get("/api/asr/status").status_code == 401
            assert client.post("/api/auth/register", json={"name":"Voice QA", "email":"voice@example.test", "password":secrets.token_urlsafe(20)}).status_code == 201
            assert client.get("/api/asr/status").json()["ready"]
        for filename in args.recordings:
            data = Path(filename).read_bytes()
            start = time.perf_counter()
            if client:
                response = client.post("/api/asr/transcribe", files={"file":("question.wav", data, "audio/wav")})
                assert response.status_code == 200, response.text
                result = response.json()
            else:
                result = service.transcribe(data)
            result.update(file=Path(filename).name, seconds=round(time.perf_counter() - start, 3), authenticatedAPI=args.api)
            assert result["text"], "Fixture speech must not produce an empty transcript"
            results.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
Path(".test/report/asr-model-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
