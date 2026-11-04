"""Database isolation for standalone desktop QA servers."""
import atexit
import os
from uuid import uuid4

import psycopg
from psycopg import sql
from dotenv import dotenv_values

from app.core.config import ROOT, Settings


def fixture_settings(**kwargs):
    url = os.environ.get("KNOWRA_TEST_DATABASE_URL") or dotenv_values(ROOT / ".env").get("KNOWRA_TEST_DATABASE_URL")
    if not url:
        raise RuntimeError("Desktop QA requires KNOWRA_TEST_DATABASE_URL pointing to a dedicated PostgreSQL test database.")
    schema = "qa_" + uuid4().hex
    def cleanup():
        with psycopg.connect(url, autocommit=True) as db:
            db.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
    atexit.register(cleanup)
    return Settings(knowra_database_url=url, knowra_database_schema=schema, **kwargs)
