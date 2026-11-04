"""Isolated desktop QA: disposable accounts, deterministic model, no real keys."""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from qa_database import fixture_settings
from app.main import create_app

directory = tempfile.TemporaryDirectory(prefix="knowra-auth-qa-")
port = int(os.environ.get("KNOWRA_QA_PORT", "8021"))
app = create_app(fixture_settings(knowra_data_dir=Path(directory.name), knowra_public_url=f"http://127.0.0.1:{port}", ai_api_key="", ai_base_url="", ai_model="", _env_file=None))
app.state.provider.public = lambda: {"configured": True, "model": "deterministic-qa"}
fixture = json.loads((ROOT / "scripts/fixtures/mcp-course.json").read_text(encoding="utf-8"))


async def complete(payload, **kwargs):
    await asyncio.sleep(.3)
    result = json.loads(json.dumps(fixture))
    if payload.kind != "course_plan":
        index = int("Store 的使用" in payload.messages[0].content.split("只展开")[1])
        result["units"][0]["lessons"] = [result["units"][0]["lessons"][index]]
    return {"content": json.dumps(result, ensure_ascii=False)}


app.state.provider.complete = complete
