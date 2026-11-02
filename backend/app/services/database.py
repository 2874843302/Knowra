import copy
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas import WorkspaceState


def now():
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, directory):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / "knowra.sqlite3"
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS workspaces (
                    id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
                    state TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS materials (
                    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
                    name TEXT NOT NULL, size INTEGER NOT NULL,
                    text TEXT NOT NULL, date TEXT NOT NULL, extension TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS materials_workspace ON materials(workspace_id);
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
                    password_hash TEXT NOT NULL, workspace_id TEXT UNIQUE NOT NULL,
                    created_at TEXT NOT NULL, is_owner INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS auth_limits (
                    key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS mcp_tokens (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
                    token_hash TEXT UNIQUE NOT NULL, suffix TEXT NOT NULL, scopes TEXT NOT NULL,
                    created_at TEXT NOT NULL, expires_at INTEGER NOT NULL,
                    last_used_at TEXT, revoked_at TEXT
                );
                CREATE TABLE IF NOT EXISTS course_jobs (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, request_id TEXT,
                    status TEXT NOT NULL, payload TEXT NOT NULL, checkpoint TEXT NOT NULL,
                    error TEXT NOT NULL, course_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    UNIQUE(user_id, request_id)
                );
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def envelope(row):
        return {"state": json.loads(row["state"]), "revision": row["revision"], "updatedAt": row["updated_at"]}

    def get(self, workspace_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "学习空间尚未初始化。")
        return self.envelope(row)

    def initialize(self, workspace_id, state):
        serialized = self.serialize(state)
        with self.connect() as db:
            db.execute("INSERT OR IGNORE INTO workspaces VALUES (?, 0, ?, ?)", (workspace_id, serialized, now()))
            row = db.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        return self.envelope(row)

    @staticmethod
    def serialize(state):
        try:
            validated = WorkspaceState.model_validate(state).model_dump()
        except ValidationError:
            raise HTTPException(422, "学习数据格式不正确。")
        serialized = json.dumps(validated, ensure_ascii=False)
        if len(serialized.encode("utf-8")) > 25 * 1024 * 1024:
            raise HTTPException(413, "学习空间超过 25 MB，请先导出并精简资料。")
        return serialized

    def update(self, workspace_id, revision, operations):
        # The revision check and write share one transaction to protect concurrent tabs.
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
            if row is None:
                raise HTTPException(404, "学习空间尚未初始化。")
            if row["revision"] != revision:
                raise HTTPException(409, detail=self.envelope(row))
            state = copy.deepcopy(json.loads(row["state"]))
            for operation in operations:
                target = state
                for key in operation.path[:-1]:
                    if not isinstance(target.get(key), dict):
                        target[key] = {}
                    target = target[key]
                if operation.op == "remove":
                    target.pop(operation.path[-1], None)
                else:
                    target[operation.path[-1]] = operation.value
            serialized = self.serialize(state)
            timestamp = now()
            db.execute("UPDATE workspaces SET state = ?, revision = ?, updated_at = ? WHERE id = ?",
                       (serialized, revision + 1, timestamp, workspace_id))
        return {"state": json.loads(serialized), "revision": revision + 1, "updatedAt": timestamp}
