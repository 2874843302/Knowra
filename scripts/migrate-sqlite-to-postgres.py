"""Read-only SQLite import into an empty PostgreSQL schema, in one transaction."""
import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

from psycopg import sql

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.core.config import Settings
from app.services.database import Database

TABLES = ("workspaces", "materials", "users", "sessions", "auth_limits", "mcp_tokens", "course_jobs")


def fingerprint(rows):
    digest = hashlib.sha256()
    for row in rows:
        digest.update(json.dumps(list(row), ensure_ascii=False, separators=(",", ":")).encode())
        digest.update(b"\n")
    return digest.digest()


def migrate(source: Path, target: Database):
    if not source.is_file():
        raise ValueError("SQLite 源文件不存在。")
    counts = {}
    # URI read-only mode and a single snapshot preserve the source, including WAL data.
    with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as old:
        old.execute("BEGIN")
        available = {r[0] for r in old.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not set(TABLES) <= available:
            raise ValueError("源数据库缺少表，请使用完整的 Knowra 数据库。")
        with target.connect() as db:
            tables = sql.SQL(",").join(map(sql.Identifier, TABLES))
            db.execute(sql.SQL("LOCK TABLE {} IN ACCESS EXCLUSIVE MODE").format(tables))
            for table in TABLES:
                if db.execute(sql.SQL("SELECT 1 FROM {} LIMIT 1").format(sql.Identifier(table))).fetchone():
                    raise ValueError("目标数据库已有业务数据，导入已取消，不会覆盖。")
            for table in TABLES:
                cursor = old.execute(f'SELECT * FROM "{table}"')
                columns = [c[0] for c in cursor.description]
                statement = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                    sql.Identifier(table), sql.SQL(",").join(map(sql.Identifier, columns)),
                    sql.SQL(",").join(sql.Placeholder() for _ in columns),
                )
                count = 0
                with db.cursor() as destination:
                    while rows := cursor.fetchmany(100):
                        destination.executemany(statement, rows)
                        count += len(rows)
                actual = db.execute(sql.SQL("SELECT count(*) AS n FROM {}").format(sql.Identifier(table))).fetchone()["n"]
                if actual != count:
                    raise ValueError("迁移行数校验失败，已回滚。")
                key = {"sessions": "token_hash", "auth_limits": "key"}.get(table, "id")
                source_rows = old.execute(f'SELECT * FROM "{table}" ORDER BY "{key}" COLLATE BINARY')
                query = sql.SQL('SELECT {} FROM {} ORDER BY {} COLLATE "C"').format(
                    sql.SQL(",").join(map(sql.Identifier, columns)), sql.Identifier(table), sql.Identifier(key),
                )
                # Hashes verify values (including JSON and auth hashes), not only row counts.
                with db.cursor() as verification:
                    verification.execute(query)
                    target_rows = ([row[c] for c in columns] for row in verification)
                    if fingerprint(source_rows) != fingerprint(target_rows):
                        raise ValueError("迁移内容校验失败，已回滚。")
                counts[table] = count
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    target = Database(Settings())
    try:
        print(json.dumps({"migratedRows": migrate(args.source, target)}, ensure_ascii=False))
    finally:
        target.close()


if __name__ == "__main__":
    main()
