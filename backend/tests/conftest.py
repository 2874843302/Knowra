import sys
import secrets
import os
from pathlib import Path
from uuid import uuid4
from dotenv import dotenv_values

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import Settings
from app.main import create_app


@pytest.fixture(autouse=True)
def isolated_postgres(monkeypatch):
    """Every test has its own disposable schema on a real PostgreSQL server."""
    import psycopg
    from psycopg import sql
    url = os.environ.get("KNOWRA_TEST_DATABASE_URL") or dotenv_values(Path(__file__).parents[2] / ".env").get("KNOWRA_TEST_DATABASE_URL")
    if not url:
        pytest.fail("Set KNOWRA_TEST_DATABASE_URL to a dedicated PostgreSQL test database.")
    schema = "test_" + uuid4().hex
    monkeypatch.setenv("KNOWRA_DATABASE_URL", url)
    monkeypatch.setenv("KNOWRA_DATABASE_SCHEMA", schema)
    yield
    with psycopg.connect(url, autocommit=True) as db:
        db.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))


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
