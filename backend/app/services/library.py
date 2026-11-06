import json

from fastapi import HTTPException

from app.services.database import now

MAX_COURSE_BYTES = 5 * 1024 * 1024
MAX_CATALOG = 100


def _text(value, maximum=20000):
    return isinstance(value, str) and bool(value.strip()) and len(value) <= maximum


class Library:
    def __init__(self, db):
        self.db = db

    def _state(self, user):
        try:
            return self.db.get(user["workspace_id"])["state"]
        except HTTPException as error:
            if error.status_code == 404:
                return {}
            raise

    def _own_course(self, user, course_id):
        state = self._state(user)
        course = next(
            (item for item in state.get("customCourses", []) if item.get("id") == course_id),
            None,
        )
        if course is None:
            raise HTTPException(404, "只有自己创建的课程可以发布。")
        edit = state.get("courseEdits", {}).get(course_id)
        if isinstance(edit, dict):
            course = {**course, **edit}
        units = course.get("units")
        if (
            not _text(course.get("title"), 200)
            or not isinstance(course.get("description"), str)
            or not isinstance(units, list)
            or not units
            or any(
                not isinstance(unit, dict)
                or not _text(unit.get("title"), 200)
                or not isinstance(unit.get("lessons"), list)
                or not unit["lessons"]
                for unit in units
            )
        ):
            raise HTTPException(422, "课程结构不完整，暂时无法发布。")
        return course

    @staticmethod
    def _summary(course, row):
        lessons = [
            lesson
            for unit in course.get("units", [])
            for lesson in unit.get("lessons", [])
            if isinstance(lesson, dict)
        ]
        minutes = course.get("minutes")
        if not isinstance(minutes, int) or minutes <= 0:
            minutes = max(15, len(lessons) * 20)
        return {
            "id": course["id"],
            "title": course["title"],
            "description": course.get("description", ""),
            "category": course.get("category", "Agent 课程"),
            "level": course.get("level", "自定"),
            "minutes": minutes,
            "cover": course.get("cover", "library"),
            "coverImage": course.get("coverImage"),
            "color": course.get("color"),
            "unitCount": len(course.get("units", [])),
            "lessonCount": len(lessons),
            "firstLessonId": lessons[0].get("id") if lessons else None,
            "authorName": row["author_name"],
            "version": row["version"],
            "status": row["status"],
            "publishedAt": row["published_at"],
            "updatedAt": row["updated_at"],
        }

    def _view(self, row, user):
        summary = json.loads(row["summary"])
        summary["mine"] = row["author_user_id"] == user["id"]
        return summary

    def publish(self, user, course_id):
        course = self._own_course(user, course_id)
        serialized = json.dumps(course, ensure_ascii=False)
        if len(serialized.encode("utf-8")) > MAX_COURSE_BYTES:
            raise HTTPException(413, "课程内容过大，暂时无法发布。")
        stamp = now()
        with self.db.connect() as db:
            row = db.execute(
                "SELECT * FROM published_courses WHERE id=%s FOR UPDATE",
                (course_id,),
            ).fetchone()
            if row is not None and row["author_user_id"] != user["id"]:
                raise HTTPException(403, "只有课程作者可以更新这门课程。")
            version = 1 if row is None else row["version"] + 1
            published_at = stamp if row is None else row["published_at"]
            summary = self._summary(course, {
                "author_name": user["name"],
                "version": version,
                "status": "published",
                "published_at": published_at,
                "updated_at": stamp,
            })
            db.execute(
                "INSERT INTO published_courses "
                "(id,author_user_id,author_name,status,version,title,description,category,summary,course,published_at,updated_at) "
                "VALUES (%s,%s,%s,'published',%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (id) DO UPDATE SET "
                "author_name=EXCLUDED.author_name,status='published',version=EXCLUDED.version,"
                "title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,"
                "summary=EXCLUDED.summary,course=EXCLUDED.course,updated_at=EXCLUDED.updated_at",
                (
                    course_id,
                    user["id"],
                    user["name"],
                    version,
                    summary["title"],
                    summary["description"],
                    summary["category"],
                    json.dumps(summary, ensure_ascii=False),
                    serialized,
                    published_at,
                    stamp,
                ),
            )
            row = db.execute(
                "SELECT * FROM published_courses WHERE id=%s", (course_id,)
            ).fetchone()
        return self._view(row, user)

    def unpublish(self, user, course_id):
        with self.db.connect() as db:
            row = db.execute(
                "SELECT * FROM published_courses WHERE id=%s FOR UPDATE",
                (course_id,),
            ).fetchone()
            if row is None:
                raise HTTPException(404, "没有找到这门已发布课程。")
            if row["author_user_id"] != user["id"]:
                raise HTTPException(403, "只有课程作者可以下架这门课程。")
            stamp = now()
            db.execute(
                "UPDATE published_courses SET status='hidden',updated_at=%s WHERE id=%s",
                (stamp, course_id),
            )
            row = db.execute(
                "SELECT * FROM published_courses WHERE id=%s", (course_id,)
            ).fetchone()
        return self._view(row, user)

    def catalog(self, user, query="", limit=MAX_CATALOG, offset=0):
        query = (query or "").strip()[:200]
        pattern = f"%{query}%"
        with self.db.connect() as db:
            rows = db.execute(
                "SELECT * FROM published_courses WHERE status='published' "
                "AND (%s='' OR title ILIKE %s OR description ILIKE %s OR author_name ILIKE %s) "
                "ORDER BY updated_at DESC LIMIT %s OFFSET %s",
                (query, pattern, pattern, pattern, limit, offset),
            ).fetchall()
        return {"courses": [self._view(row, user) for row in rows]}

    def mine(self, user):
        with self.db.connect() as db:
            rows = db.execute(
                "SELECT * FROM published_courses WHERE author_user_id=%s "
                "ORDER BY updated_at DESC",
                (user["id"],),
            ).fetchall()
        return {"courses": [self._view(row, user) for row in rows]}

    def joined(self, user):
        state = self._state(user)
        ids = [item for item in state.get("joined", []) if isinstance(item, str)]
        if not ids:
            return {"courses": []}
        with self.db.connect() as db:
            rows = db.execute(
                "SELECT * FROM published_courses WHERE id = ANY(%s) "
                "ORDER BY updated_at DESC",
                (ids,),
            ).fetchall()
        courses = []
        for row in rows:
            course = json.loads(row["course"])
            course.update({
                "source": row["author_name"],
                "curated": False,
                "library": {
                    "authorName": row["author_name"],
                    "version": row["version"],
                    "updatedAt": row["updated_at"],
                    "hidden": row["status"] != "published",
                    "mine": row["author_user_id"] == user["id"],
                },
            })
            courses.append(course)
        return {"courses": courses}

    def course(self, user, course_id):
        with self.db.connect() as db:
            row = db.execute(
                "SELECT * FROM published_courses WHERE id=%s", (course_id,)
            ).fetchone()
        if row is None:
            raise HTTPException(404, "没有找到这门课程。")
        if row["status"] != "published" and row["author_user_id"] != user["id"]:
            state = self._state(user)
            if course_id not in state.get("joined", []):
                raise HTTPException(404, "课程已下架。")
        course = json.loads(row["course"])
        course.update({
            "source": row["author_name"],
            "curated": False,
            "library": {
                "authorName": row["author_name"],
                "version": row["version"],
                "updatedAt": row["updated_at"],
                "hidden": row["status"] != "published",
                "mine": row["author_user_id"] == user["id"],
            },
        })
        return course