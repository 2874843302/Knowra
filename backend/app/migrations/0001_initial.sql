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
    expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_limits (
    key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS mcp_tokens (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL, suffix TEXT NOT NULL, scopes TEXT NOT NULL,
    created_at TEXT NOT NULL, expires_at BIGINT NOT NULL,
    last_used_at TEXT, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS course_jobs (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, request_id TEXT,
    status TEXT NOT NULL, payload TEXT NOT NULL, checkpoint TEXT NOT NULL,
    error TEXT NOT NULL, course_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(user_id, request_id)
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS mcp_tokens_user ON mcp_tokens(user_id);
CREATE INDEX IF NOT EXISTS course_jobs_user_status ON course_jobs(user_id, status);
