import hashlib
import hmac
import json
import re
import secrets
from psycopg.errors import UniqueViolation
import time
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator

from app.schemas import WorkspaceState
from app.services.database import now

COOKIE = "knowra_session"
SESSION_DAYS = 14


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    return f"pbkdf2_sha256$600000${salt}${hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 600000).hex()}"


def password_matches(password, stored):
    return hmac.compare_digest(password_hash(password, stored.split("$")[2]), stored)


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Invalid email")
        return value


class Registration(Credentials):
    name: str = Field(min_length=1, max_length=24)
    import_state: WorkspaceState | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        if not value.strip():
            raise ValueError("Name required")
        return value.strip()


class TokenInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    days: int = Field(default=90, ge=1, le=365)
    scopes: list[str] = Field(default=["courses:read", "courses:create"], min_length=1, max_length=2)

    @field_validator("scopes")
    @classmethod
    def valid_scopes(cls, value):
        if not set(value) <= {"courses:read", "courses:create"}:
            raise ValueError("Unsupported scope")
        return sorted(set(value))

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        if not value.strip():
            raise ValueError("Name required")
        return value.strip()


class Auth:
    def __init__(self, db):
        self.db = db
        self.dummy_hash = password_hash(secrets.token_urlsafe(24))
        with self.db.connect() as connection:
            connection.execute("DELETE FROM auth_limits WHERE resets_at<=%s", (int(time.time()),))

    def limit(self, key, maximum=10, seconds=900):
        stamp = int(time.time())
        with self.db.connect() as db:
            row = db.execute(
                "INSERT INTO auth_limits VALUES (%s,1,%s) ON CONFLICT(key) DO UPDATE "
                "SET attempts=CASE WHEN auth_limits.resets_at<=%s THEN 1 ELSE auth_limits.attempts+1 END, "
                "resets_at=CASE WHEN auth_limits.resets_at<=%s THEN EXCLUDED.resets_at ELSE auth_limits.resets_at END "
                "WHERE auth_limits.resets_at<=%s OR auth_limits.attempts<%s RETURNING *",
                (key, stamp + seconds, stamp, stamp, stamp, maximum),
            ).fetchone()
            if row is None:
                current = db.execute("SELECT resets_at FROM auth_limits WHERE key=%s", (key,)).fetchone()
                raise HTTPException(429, "尝试次数较多，请稍后再试。", headers={"Retry-After": str(max(1, current["resets_at"] - stamp))})

    @staticmethod
    def public(user):
        return {"id": user["id"], "email": user["email"], "name": user["name"], "workspaceId": user["workspace_id"]}

    def register(self, payload, ip):
        self.limit(f"signup:{ip}", 10, 3600)
        user_id, workspace_id = str(uuid4()), str(uuid4())
        hashed = password_hash(payload.password)
        with self.db.connect() as db:
            db.execute("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':registration', 0))")
            first = db.execute("SELECT 1 FROM users LIMIT 1").fetchone() is None
            try:
                db.execute("INSERT INTO users VALUES (%s,%s,%s,%s,%s,%s,%s)", (user_id, payload.email, payload.name, hashed, workspace_id, now(), int(first)))
            except UniqueViolation:
                raise HTTPException(409, "这个邮箱已注册，请直接登录。")
            if payload.import_state:
                state = payload.import_state.model_dump()
                state["name"] = payload.name
                # Extracted text is portable; legacy original files are still
                # owned by their old workspace and must never bypass ownership.
                for materials in state.get("materials", {}).values():
                    if isinstance(materials, list):
                        for material in materials:
                            if isinstance(material, dict):
                                material["original"] = False
                db.execute("INSERT INTO workspaces VALUES (%s,0,%s,%s)", (workspace_id, self.db.serialize(state), now()))
            user = db.execute("SELECT * FROM users WHERE id=%s", (user_id,)).fetchone()
        return user

    def login(self, payload, ip):
        self.limit(f"login-ip:{ip}", 60, 900)
        key = f"login:{digest(payload.email)}"
        self.limit(key)
        with self.db.connect() as db:
            user = db.execute("SELECT * FROM users WHERE email=%s", (payload.email,)).fetchone()
        valid = password_matches(payload.password, user["password_hash"] if user else self.dummy_hash)
        if not user or not valid:
            raise HTTPException(401, "邮箱或密码不正确。")
        with self.db.connect() as db:
            db.execute("DELETE FROM auth_limits WHERE key=%s", (key,))
        return user

    def session(self, user, response, secure=False):
        token = secrets.token_urlsafe(32)
        expires = int(time.time()) + SESSION_DAYS * 86400
        with self.db.connect() as db:
            db.execute("DELETE FROM sessions WHERE expires_at <= %s", (int(time.time()),))
            db.execute("INSERT INTO sessions VALUES (%s,%s,%s)", (digest(token), user["id"], expires))
        response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, secure=secure, samesite="lax", path="/")
        return {"user": self.public(user), "expiresAt": expires}

    def user(self, request):
        token = request.cookies.get(COOKIE, "")
        with self.db.connect() as db:
            user = db.execute("SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=%s AND s.expires_at>%s", (digest(token), int(time.time()))).fetchone() if token else None
        if user is None:
            raise HTTPException(401, "请先登录。")
        return user

    def logout(self, request, response):
        with self.db.connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=%s", (digest(request.cookies.get(COOKIE, "")),))
        response.delete_cookie(COOKIE, path="/")

    def create_token(self, user, payload):
        raw = "knr_" + secrets.token_urlsafe(32)
        token_id = str(uuid4())
        with self.db.connect() as db:
            db.execute("SELECT id FROM users WHERE id=%s FOR UPDATE", (user["id"],))
            count = db.execute("SELECT COUNT(*) FROM mcp_tokens WHERE user_id=%s AND revoked_at IS NULL AND expires_at>%s", (user["id"], int(time.time()))).fetchone()["count"]
            if count >= 20:
                raise HTTPException(400, "最多保留 20 个有效连接，请先撤销不再使用的连接。")
            db.execute("INSERT INTO mcp_tokens VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NULL,NULL)", (token_id, user["id"], payload.name, digest(raw), raw[-4:], json.dumps(payload.scopes), now(), int(time.time()) + payload.days * 86400))
        return {"token": raw, "id": token_id}

    def tokens(self, user):
        with self.db.connect() as db:
            rows = db.execute("SELECT id,name,suffix,scopes,created_at,expires_at,last_used_at,revoked_at FROM mcp_tokens WHERE user_id=%s ORDER BY created_at DESC", (user["id"],)).fetchall()
        return [{**dict(row), "scopes": json.loads(row["scopes"])} for row in rows]

    def revoke(self, user, token_id):
        with self.db.connect() as db:
            if db.execute("UPDATE mcp_tokens SET revoked_at=%s WHERE id=%s AND user_id=%s AND revoked_at IS NULL", (now(), token_id, user["id"])).rowcount == 0:
                raise HTTPException(404, "连接不存在或已撤销。")

    def bearer(self, authorization, scope=None):
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.startswith("knr_"):
            raise HTTPException(401, "需要有效的 MCP 访问凭证。", headers={"WWW-Authenticate": "Bearer"})
        with self.db.connect() as db:
            row = db.execute("SELECT t.id token_id,t.scopes,u.* FROM mcp_tokens t JOIN users u ON u.id=t.user_id WHERE token_hash=%s AND revoked_at IS NULL AND expires_at>%s", (digest(token), int(time.time()))).fetchone()
            if not row:
                raise HTTPException(401, "MCP 凭证已失效。", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""})
            if scope and scope not in json.loads(row["scopes"]):
                raise HTTPException(403, "此连接没有执行该操作的权限。")
            db.execute("UPDATE mcp_tokens SET last_used_at=%s WHERE id=%s", (now(), row["token_id"]))
        return row
