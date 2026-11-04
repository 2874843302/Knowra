import importlib.util
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.schemas import UpdateWorkspace
from app.services.auth import Auth
from app.services.database import Database


def test_real_postgres_transactions_and_concurrent_revisions(tmp_path):
    db = Database(Settings(knowra_data_dir=tmp_path, _env_file=None))
    try:
        db.initialize("workspace", {"notes": {}})
        barrier = Barrier(2)
        def edit(name):
            barrier.wait()
            try:
                return db.update("workspace", 0, UpdateWorkspace(revision=0, operations=[{"op": "set", "path": ["name"], "value": name}]).operations)["revision"]
            except HTTPException as error:
                return error.status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            assert sorted(executor.map(edit, ["first", "second"])) == [1, 409]
        with pytest.raises(RuntimeError):
            with db.connect() as connection:
                connection.execute("UPDATE workspaces SET revision=99")
                raise RuntimeError("rollback")
        assert db.get("workspace")["revision"] == 1
        db.migrate()
        with db.connect() as connection:
            assert connection.execute("SELECT count(*) AS n FROM schema_migrations").fetchone()["n"] == 1
    finally:
        db.close()


def test_rate_limit_is_atomic_and_rollover_resets(tmp_path):
    db = Database(Settings(knowra_data_dir=tmp_path, _env_file=None))
    try:
        auth = Auth(db)
        def attempt(_):
            try:
                auth.limit("same-key", maximum=3)
                return 200
            except HTTPException as error:
                return error.status_code
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(attempt, range(8)))
        assert results.count(200) == 3
        assert results.count(429) == 5
        with db.connect() as connection:
            connection.execute("UPDATE auth_limits SET resets_at=0")
        assert attempt(0) == 200
    finally:
        db.close()


def test_sqlite_import_preserves_data_refuses_overwrite_and_rolls_back(tmp_path):
    spec = importlib.util.spec_from_file_location("legacy_import", Path(__file__).parents[2] / "scripts/migrate-sqlite-to-postgres.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    source = tmp_path / "legacy.sqlite3"
    ddl = (Path(__file__).parents[1] / "app/migrations/0001_initial.sql").read_text(encoding="utf-8")
    with sqlite3.connect(source) as old:
        old.executescript(ddl)
        old.execute("INSERT INTO workspaces VALUES ('preserved',7,?, 'stamp')", (json.dumps({"name": "原有课程", "notes": {"lecture": "重点"}}),))
        old.execute("INSERT INTO users VALUES ('user','fixture@example.test','Name','password-hash','preserved','stamp',1)")
        old.execute("INSERT INTO sessions VALUES ('session-hash','user',4000000000)")
    unchanged = source.read_bytes()
    target = Database(Settings(knowra_data_dir=tmp_path, _env_file=None))
    try:
        counts = module.migrate(source, target)
        assert counts["workspaces"] == counts["users"] == counts["sessions"] == 1
        assert target.get("preserved")["revision"] == 7
        assert target.get("preserved")["state"]["name"] == "原有课程"
        with target.connect() as connection:
            assert connection.execute("SELECT expires_at FROM sessions").fetchone()["expires_at"] == 4000000000
        with pytest.raises(ValueError, match="已有业务数据"):
            module.migrate(source, target)
        assert source.read_bytes() == unchanged
        with target.connect() as connection:
            for table in module.TABLES:
                connection.execute(module.sql.SQL("DELETE FROM {}").format(module.sql.Identifier(table)))
        # Failure in a later table must roll back earlier imported workspaces.
        with sqlite3.connect(source) as old:
            old.execute("ALTER TABLE users ADD COLUMN unexpected TEXT")
        with pytest.raises(Exception):
            module.migrate(source, target)
        with target.connect() as connection:
            assert connection.execute("SELECT count(*) AS n FROM workspaces").fetchone()["n"] == 0
    finally:
        target.close()
