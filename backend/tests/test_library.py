import secrets


def course_payload(title="课程库测试课程"):
    return {
        "id": "library-course-1",
        "title": title,
        "description": "用于验证发布、加入、更新和下架的课程。",
        "category": "Agent 课程",
        "level": "自定",
        "minutes": 40,
        "cover": "earth",
        "source": "我的 Agent",
        "curated": False,
        "units": [
            {
                "title": "第一单元",
                "lessons": [
                    {
                        "id": "library-lesson-1",
                        "title": "第一讲",
                        "summary": "理解课程库。",
                        "content": "课程内容。",
                        "points": ["要点"],
                    }
                ],
            }
        ],
    }


def signup(client, email):
    credentials = {"email": email, "password": secrets.token_urlsafe(20)}
    response = client.post(
        "/api/auth/register",
        json={**credentials, "name": email.split("@")[0]},
    )
    assert response.status_code == 201
    return credentials


def login(client, credentials):
    assert client.post("/api/auth/login", json=credentials).status_code == 200


def test_publish_join_update_and_unpublish_keep_joined_access(client):
    author = client.test_credentials
    course = course_payload()
    assert client.post(
        "/api/workspace",
        json={"state": {"version": 1, "joined": [], "customCourses": [course]}},
    ).status_code == 200

    # Private until explicitly published.
    reader = signup(client, "reader@example.test")
    assert client.get("/api/library/courses").json()["courses"] == []
    assert client.get("/api/library/courses/library-course-1").status_code == 404

    login(client, author)
    published = client.post("/api/library/courses/library-course-1/publish")
    assert published.status_code == 200
    assert published.json()["version"] == 1
    assert client.get("/api/library/mine").json()["courses"][0]["status"] == "published"

    login(client, reader)
    catalog = client.get("/api/library/courses").json()["courses"]
    assert [(item["id"], item["mine"]) for item in catalog] == [("library-course-1", False)]
    full = client.get("/api/library/courses/library-course-1")
    assert full.status_code == 200
    assert full.json()["library"]["authorName"] == "Fixture"
    assert client.post("/api/library/courses/library-course-1/unpublish").status_code == 403

    assert client.post(
        "/api/workspace", json={"state": {"version": 1, "joined": []}}
    ).status_code == 200
    assert client.patch(
        "/api/workspace",
        json={
            "revision": 0,
            "operations": [
                {"op": "set", "path": ["joined"], "value": ["library-course-1"]}
            ],
        },
    ).status_code == 200
    joined = client.get("/api/library/joined").json()["courses"]
    assert joined[0]["title"] == "课程库测试课程"
    assert joined[0]["library"]["hidden"] is False

    # Author updates the published snapshot; joined readers see the latest title.
    login(client, author)
    updated = course_payload("课程库测试课程（更新版）")
    assert client.patch(
        "/api/workspace",
        json={
            "revision": 0,
            "operations": [
                {"op": "set", "path": ["customCourses"], "value": [updated]}
            ],
        },
    ).status_code == 200
    assert client.post("/api/library/courses/library-course-1/publish").json()["version"] == 2

    login(client, reader)
    assert client.get("/api/library/joined").json()["courses"][0]["title"] == "课程库测试课程（更新版）"

    # Unpublishing hides it from the catalog but keeps access for joined readers.
    login(client, author)
    assert client.post("/api/library/courses/library-course-1/unpublish").status_code == 200
    login(client, reader)
    assert client.get("/api/library/courses").json()["courses"] == []
    hidden = client.get("/api/library/joined").json()["courses"][0]
    assert hidden["library"]["hidden"] is True
    assert client.get("/api/library/courses/library-course-1").status_code == 200

    signup(client, "outsider@example.test")
    assert client.get("/api/library/courses/library-course-1").status_code == 404
    assert client.get("/api/library/courses").json()["courses"] == []