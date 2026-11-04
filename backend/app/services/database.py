import copy
import json
import hashlib
from pathlib import Path

from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from contextlib import contextmanager
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas import WorkspaceState


def now():
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, settings):
        self.directory = settings.knowra_data_dir
        self.directory.mkdir(parents=True, exist_ok=True)
        url = settings.knowra_database_url.get_secret_value()
        if not url:
            raise RuntimeError("请配置 KNOWRA_DATABASE_URL，运行需要 PostgreSQL；参考 docs/DATABASE.md。")
        if not url.startswith(("postgresql://", "postgres://")):
            raise ValueError("KNOWRA_DATABASE_URL 必须是 PostgreSQL 连接地址。")
        self.schema = settings.knowra_database_schema
        self.pool = ConnectionPool(
            url, min_size=1, max_size=settings.knowra_database_pool_size,
            timeout=10, open=True,
            kwargs={"row_factory": dict_row, "connect_timeout": 5,
                    "options": f"-c search_path={self.schema} -c statement_timeout=30000 -c lock_timeout=10000"},
        )
        try:
            self.pool.wait(timeout=10)
            self.migrate()
        except Exception:
            self.pool.close()
            raise RuntimeError("PostgreSQL 初始化失败，请检查连接、数据库权限和迁移文件。") from None

    def migrate(self):
        with self.connect() as db:
            db.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (f"knowra:migrate:{self.schema}",))
            db.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(self.schema)))
            db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())")
            for path in sorted((Path(__file__).parents[1] / "migrations").glob("*.sql")):
                script = path.read_text(encoding="utf-8")
                checksum = hashlib.sha256(script.encode()).hexdigest()
                applied = db.execute("SELECT checksum FROM schema_migrations WHERE version=%s", (path.name,)).fetchone()
                if applied:
                    if applied["checksum"] != checksum:
                        raise RuntimeError("已应用的数据库迁移文件被修改。")
                    continue
                db.execute(script, prepare=False)
                db.execute("INSERT INTO schema_migrations (version, checksum) VALUES (%s,%s)", (path.name, checksum))

    @contextmanager
    def connect(self):
        with self.pool.connection() as db:
            yield db

    def close(self):
        self.pool.close()

    @staticmethod
    def envelope(row):
        return {"state": json.loads(row["state"]), "revision": row["revision"], "updatedAt": row["updated_at"]}

    def get(self, workspace_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "学习空间尚未初始化。")
        return self.envelope(row)

    def initialize(self, workspace_id, state):
        serialized = self.serialize(state)
        with self.connect() as db:
            db.execute("INSERT INTO workspaces VALUES (%s, 0, %s, %s) ON CONFLICT (id) DO NOTHING", (workspace_id, serialized, now()))
            row = db.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,)).fetchone()
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
            row = db.execute("SELECT * FROM workspaces WHERE id = %s FOR UPDATE", (workspace_id,)).fetchone()
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
            db.execute("UPDATE workspaces SET state = %s, revision = %s, updated_at = %s WHERE id = %s",
                       (serialized, revision + 1, timestamp, workspace_id))
        return {"state": json.loads(serialized), "revision": revision + 1, "updatedAt": timestamp}
