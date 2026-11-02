import sys
import secrets
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def client(tmp_path):
    settings = Settings(knowra_data_dir=tmp_path, ai_api_key="", ai_base_url="", ai_model="", _env_file=None)
    with TestClient(create_app(settings)) as value:
        value.test_credentials = {"email": "fixture@example.test", "password": secrets.token_urlsafe(18)}
        assert value.post("/api/auth/register", json={**value.test_credentials, "name": "Fixture"}).status_code == 201
        yield value


@pytest.fixture
def workspace(client):
    headers = {"X-Workspace-Id": str(uuid4())}
    response = client.post("/api/workspace", headers=headers, json={"state": {"version": 1, "joined": ["python"], "notes": {"python/variables": "old note"}}})
    assert response.status_code == 200
    return headers
