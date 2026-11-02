from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class WorkspaceState(BaseModel):
    model_config = {"extra": "allow"}

    version: Literal[1] = 1
    name: str = Field(default="学习者", max_length=100)
    joined: list[str] = Field(default_factory=list, max_length=1000)
    customCourses: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    progress: dict[str, Any] = Field(default_factory=dict)
    materials: dict[str, Any] = Field(default_factory=dict)
    notes: dict[str, str] = Field(default_factory=dict)
    conversations: list[dict[str, Any]] = Field(default_factory=list)
    activities: list[dict[str, Any]] = Field(default_factory=list)
    tasks: list[dict[str, Any]] = Field(default_factory=list)


class InitializeWorkspace(BaseModel):
    state: WorkspaceState


class Operation(BaseModel):
    op: Literal["set", "remove"]
    path: list[str] = Field(min_length=1, max_length=8)
    value: Any = None

    @field_validator("path")
    @classmethod
    def safe_path(cls, path):
        if any(p in {"__proto__", "prototype", "constructor"} or len(p) > 300 for p in path):
            raise ValueError("Invalid path")
        return path


class UpdateWorkspace(BaseModel):
    revision: int = Field(ge=0)
    operations: list[Operation] = Field(min_length=1, max_length=500)


class ProviderInput(BaseModel):
    baseUrl: str = Field(max_length=2000)
    model: str = Field(max_length=200)
    apiKey: str = Field(default="", max_length=4000)


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=70000)


class AIRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=40)
    kind: Literal["chat", "outline", "course_plan", "course_unit", "course_search", "course_questions", "classroom_adapt", "course_practice", "course_edit_plan", "course_edit_lesson"] = "chat"
    conversation_id: UUID | None = None


class CourseResearchRequest(BaseModel):
    queries: list[str] = Field(min_length=1, max_length=3)

    @field_validator("queries")
    @classmethod
    def valid_queries(cls, queries):
        cleaned = list(dict.fromkeys(query.strip() for query in queries))
        if any(not query or len(query) > 200 for query in cleaned):
            raise ValueError("Invalid search query")
        return cleaned
