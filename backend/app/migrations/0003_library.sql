CREATE TABLE IF NOT EXISTS published_courses (
    id TEXT PRIMARY KEY,
    author_user_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    summary TEXT NOT NULL,
    course TEXT NOT NULL,
    published_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS published_courses_status_updated
    ON published_courses(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS published_courses_author
    ON published_courses(author_user_id);