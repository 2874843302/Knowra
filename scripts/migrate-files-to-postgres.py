"""Move the remaining on-disk records into PostgreSQL.

Handles two kinds of data that used to live only in ``.local``:

1. uploaded original files (``.local/uploads/<workspace>/<material>``)
   into ``material_blobs``;
2. model provider configurations (``.local/provider.json`` and
   ``.local/users/<user>/provider.json``) into ``provider_profiles`` with
   the API key encrypted.

Every record is verified after it is written. Source files are never
deleted: they are renamed with a ``.pre-pg`` suffix so a bad run stays
reversible. Re-running the script is safe.

Usage: python scripts/migrate-files-to-postgres.py [--data-dir .local]
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.config import Settings
from app.services.database import Database, now
from app.services.secrets import Cipher


def report(label, **counts):
    summary = ", ".join(f"{key}={value}" for key, value in counts.items())
    print(f"{label}: {summary}")


def migrate_uploads(database, data_dir):
    root = data_dir / "uploads"
    moved = skipped = verified = 0
    orphans = []
    if not root.is_dir():
        print("uploads: no directory, nothing to do")
        return True
    with database.connect() as db:
        known = {row["id"]: row["workspace_id"] for row in db.execute("SELECT id, workspace_id FROM materials")}
    for workspace_dir in sorted(root.iterdir()):
        if not workspace_dir.is_dir():
            continue
        for path in sorted(workspace_dir.iterdir()):
            material_id = path.name
            workspace_id = known.get(material_id)
            if workspace_id is None or workspace_id != workspace_dir.name:
                orphans.append(f"{workspace_dir.name}/{material_id}")
                continue
            content = path.read_bytes()
            digest = hashlib.sha256(content).hexdigest()
            with database.connect() as db:
                existing = db.execute("SELECT sha256 FROM material_blobs WHERE material_id = %s", (material_id,)).fetchone()
                if existing:
                    if existing["sha256"] != digest:
                        print(f"  conflict: {material_id} already stored with a different digest")
                        return False
                    skipped += 1
                    continue
                db.execute("INSERT INTO material_blobs VALUES (%s, %s, %s, %s, %s)",
                           (material_id, content, digest, len(content), now()))
                stored = db.execute("SELECT sha256, length(content) AS size FROM material_blobs WHERE material_id = %s", (material_id,)).fetchone()
            if stored["sha256"] != digest or stored["size"] != len(content):
                print(f"  verification failed for {material_id}")
                return False
            moved += 1
            verified += 1
    report("uploads", inserted=moved, already_present=skipped, verified=verified, orphans=len(orphans))
    for item in orphans:
        print(f"  orphan file kept on disk: {item}")
    if not orphans:
        target = data_dir / "uploads.pre-pg"
        if moved or skipped:
            root.rename(target)
            print(f"  originals kept at {target}")
    else:
        print("  orphan files present; leaving the uploads directory untouched")
    return True


def catalog_from_disk(path):
    saved = json.loads(path.read_text(encoding="utf-8"))
    if "profiles" in saved:
        return {"activeId": saved.get("activeId"), "profiles": saved["profiles"]}
    config = {key: saved.get(key, "") for key in ("baseUrl", "model", "apiKey")}
    profiles = [{"id": "default", "name": config["model"], **config}] if any(config.values()) else []
    return {"activeId": "default" if profiles else None, "profiles": profiles}


def migrate_providers(database, cipher, data_dir):
    with database.connect() as db:
        owner = db.execute("SELECT id FROM users WHERE is_owner = 1 ORDER BY created_at LIMIT 1").fetchone()
        known_users = {row["id"] for row in db.execute("SELECT id FROM users")}
    sources = []
    if owner and (data_dir / "provider.json").is_file():
        sources.append((owner["id"], data_dir / "provider.json"))
    accounts = data_dir / "users"
    if accounts.is_dir():
        for directory in sorted(accounts.iterdir()):
            file_path = directory / "provider.json"
            if directory.name in known_users and file_path.is_file():
                sources.append((directory.name, file_path))
    if not sources:
        print("providers: no configuration files to import")
        return True
    imported = kept = 0
    for user_id, path in sources:
        catalog = catalog_from_disk(path)
        stamp = now()
        with database.connect() as db:
            existing = db.execute("SELECT 1 FROM provider_profiles WHERE user_id = %s LIMIT 1", (user_id,)).fetchone()
            if existing:
                kept += 1
                print(f"  {path}: account already has stored profiles, file left as is")
                continue
            for profile in catalog["profiles"]:
                api_key = (profile.get("apiKey") or "").strip()
                if not api_key:
                    print(f"  {path}: profile {profile.get('id')} has no API key, skipped")
                    continue
                db.execute(
                    "INSERT INTO provider_profiles VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (user_id, id) DO NOTHING",
                    (user_id, profile["id"], profile.get("name", ""), profile.get("baseUrl", ""),
                     profile.get("model", ""), cipher.encrypt(api_key), profile.get("createdAt") or stamp, stamp),
                )
            db.execute(
                "INSERT INTO user_settings VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE "
                "SET active_profile_id = EXCLUDED.active_profile_id, updated_at = EXCLUDED.updated_at",
                (user_id, catalog["activeId"], stamp),
            )
            rows = db.execute("SELECT id, api_key FROM provider_profiles WHERE user_id = %s", (user_id,)).fetchall()
        restored = {row["id"]: cipher.decrypt(row["api_key"]) for row in rows}
        expected = {p["id"]: p.get("apiKey", "").strip() for p in catalog["profiles"] if p.get("apiKey")}
        if restored != expected:
            print(f"  {path}: verification failed, file left as is")
            return False
        imported += len(expected)
        path.rename(path.with_name(path.name + ".pre-pg"))
    report("providers", profiles_imported=imported, accounts_already_stored=kept)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default=None, help="Data directory holding uploads/ and provider.json (default: KNOWRA_DATA_DIR)")
    arguments = parser.parse_args()
    settings = Settings()
    data_dir = Path(arguments.data_dir) if arguments.data_dir else settings.knowra_data_dir
    secret = settings.knowra_secret_key.get_secret_value().strip()
    if not secret:
        raise SystemExit("缺少 KNOWRA_SECRET_KEY，无法加密导入模型密钥。请先运行 python scripts/secret-key.py。")
    database = Database(settings)
    cipher = Cipher(secret)
    print(f"data directory: {data_dir}")
    if not migrate_uploads(database, data_dir) or not migrate_providers(database, cipher, data_dir):
        raise SystemExit("迁移未完成，磁盘文件保持原样。")
    print("全部记录已写入 PostgreSQL 并逐条校验。")


if __name__ == "__main__":
    main()
