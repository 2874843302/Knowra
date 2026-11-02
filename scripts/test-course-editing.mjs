import { directedTeaching } from "./fixtures/teaching-direction.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/data.js";
import {
  applyCourseEdit,
  courseEditSnapshot,
  draftCourseEdit,
  validateEditPlan,
} from "../src/lib/course-editing.js";

const content = "## 原讲义\n\n原知识点和例子。";
const lesson = (id, title) => ({
  id,
  title,
  content,
  summary: "理解概念",
  points: ["关键点"],
  quiz: {
    question: "理解了吗？",
    options: ["是", "否"],
    answer: 0,
    explanation: "因为关键点。",
  },
});
const course = {
  id: "editing-test",
  title: "原课程",
  description: "简介",
  units: [
    {
      title: "第一单元",
      lessons: [lesson("a", "原讲次"), lesson("b", "保留讲次")],
    },
    { title: "第二单元", lessons: [lesson("c", "移动讲次")] },
  ],
};
const plan = () => ({
  reply: "补充第一讲的生活例子，其他内容保留。",
  title: course.title,
  description: course.description,
  units: course.units.map((u, sourceIndex) => ({
    sourceIndex,
    title: u.title,
    lessons: u.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      summary: l.summary,
      points: l.points,
      rewrite: l.id === "a",
      instruction: l.id === "a" ? "增加生活中的例子" : "",
    })),
  })),
});
const lecture = (unit, l) => ({
  title: course.title,
  units: [
    {
      title: unit.title,
      lessons: [
        {
          ...l,
          content: "## 更新后的教材\n\n保留原知识点，增加生活中的例子。",
          teaching: directedTeaching({
            steps: [
              {
                title: "生活中的例子",
                board: "**结论与生活例子**",
                narration:
                  "把这个知识点放到日常购物的场景，就能看到它为什么成立。",
              },
            ],
          }),
          quiz: {
            question: "生活例子说明什么？",
            options: ["关键点", "无关内容"],
            answer: 0,
            explanation: "这个例子对应原知识点。",
          },
        },
      ],
    },
  ],
});

test("AI edits only rewritten lectures, preserves stable IDs and complete scripts, original stays unchanged", async () => {
  const before = JSON.stringify(course),
    calls = [];
  const result = await draftCourseEdit({
    course,
    instruction: "第一讲增加例子",
    request: async (messages, kind) => {
      calls.push(kind);
      return JSON.stringify(
        kind === "course_edit_plan"
          ? plan()
          : lecture(course.units[0], course.units[0].lessons[0]),
      );
    },
  });
  assert.deepEqual(calls, ["course_edit_plan", "course_edit_lesson"]);
  assert.equal(JSON.stringify(course), before);
  assert.equal(result.units[0].lessons[0].id, "a");
  assert.equal(result.units[0].lessons[1].content, content);
  assert(result.units[0].lessons[0].teaching.source.includes("生活"));
  assert.deepEqual(result.changedIds, ["a"]);
  const state = initialState();
  state.notes[`${course.id}/a`] = "我的笔记";
  state.progress[`${course.id}/a`] = { completed: true };
  state.lessonPlayback = {
    [`${course.id}/a`]: { step: 5 },
    [`${course.id}/b`]: { step: 2 },
  };
  const saved = applyCourseEdit(state, course, result);
  assert.equal(saved.notes[`${course.id}/a`], "我的笔记");
  assert.equal(saved.progress[`${course.id}/a`].completed, true);
  assert.equal(saved.lessonPlayback[`${course.id}/a`], undefined);
  assert.equal(saved.lessonPlayback[`${course.id}/b`].step, 2);
  assert.throws(
    () =>
      applyCourseEdit(state, { ...course, title: "已被其他窗口修改" }, result),
    /变化/,
  );
});
test("edit plans reject unknown/duplicate IDs, incomplete additions and changes outside selected lesson", () => {
  let value = plan();
  value.units[0].lessons[0].id = "unknown";
  assert.throws(() => validateEditPlan(JSON.stringify(value), course));
  value = plan();
  value.units[0].lessons[1].id = "a";
  assert.throws(() => validateEditPlan(JSON.stringify(value), course), /重复/);
  value = plan();
  value.units[0].lessons[1].id = null;
  assert.throws(() => validateEditPlan(JSON.stringify(value), course), /新增/);
  value = plan();
  value.units[1].lessons[0].title = "不该被修改";
  assert.throws(
    () => validateEditPlan(JSON.stringify(value), course, "a"),
    /指定讲次/,
  );
  assert.equal(
    validateEditPlan(JSON.stringify(plan()), course, "a").units[0].lessons[0]
      .id,
    "a",
  );
});
test("reordering, additions and removals retain existing identities, new lectures have fresh IDs", async () => {
  const value = plan();
  value.units.reverse();
  value.units[1].lessons = [
    { ...value.units[1].lessons[0], rewrite: false, instruction: "" },
    {
      id: null,
      title: "新增讲次",
      summary: "实践",
      points: [],
      rewrite: true,
      instruction: "补充实践应用",
    },
  ];
  const result = await draftCourseEdit({
    course,
    instruction: "重排并补充实践",
    request: async (_m, kind) =>
      JSON.stringify(
        kind === "course_edit_plan"
          ? value
          : lecture(value.units[1], value.units[1].lessons[1]),
      ),
  });
  assert.equal(result.units[0].lessons[0].id, "c");
  assert.equal(result.units[1].lessons[0].id, "a");
  assert(!["a", "b", "c"].includes(result.units[1].lessons[1].id));
  assert.deepEqual(
    result.removed.map((l) => l.id),
    ["b"],
  );
  const state = initialState();
  state.coursePractices[course.id] = [
    { id: "task", unitIndex: 1, unitTitle: "第二单元" },
  ];
  state.projects[`${course.id}/1`] = {
    text: "第二单元的项目",
    submitted: true,
  };
  assert.equal(
    applyCourseEdit(state, course, result).projects[`${course.id}/0`].text,
    "第二单元的项目",
  );
  assert.equal(
    applyCourseEdit(state, course, result).coursePractices[course.id][0]
      .unitIndex,
    0,
  );
});
test("invalid plan and missing lecture scripts repair internally without publishing partial edits", async () => {
  let plans = 0,
    lectures = 0;
  const result = await draftCourseEdit({
    course,
    instruction: "补例子",
    request: async (_m, kind) => {
      if (kind === "course_edit_plan")
        return ++plans === 1 ? "bad" : JSON.stringify(plan());
      lectures++;
      const value = lecture(course.units[0], course.units[0].lessons[0]);
      if (lectures === 1) delete value.units[0].lessons[0].teaching;
      return JSON.stringify(value);
    },
  });
  assert.equal(plans, 2);
  assert.equal(lectures, 2);
  assert.equal(result.units[0].lessons[0].id, "a");
});
test("cancelled late response and failed later lecture never mutate the original course", async () => {
  const source = courseEditSnapshot(course),
    controller = new AbortController();
  await assert.rejects(
    draftCourseEdit({
      course,
      instruction: "补例子",
      signal: controller.signal,
      request: async () => {
        controller.abort();
        return JSON.stringify(plan());
      },
    }),
    { name: "AbortError" },
  );
  const value = plan();
  value.units[0].lessons[1].rewrite = true;
  value.units[0].lessons[1].instruction = "补充应用";
  let calls = 0;
  await assert.rejects(
    draftCourseEdit({
      course,
      instruction: "补两讲",
      request: async (_m, kind) => {
        if (kind === "course_edit_plan") return JSON.stringify(value);
        if (++calls > 1) throw new Error("service unavailable");
        return JSON.stringify(
          lecture(course.units[0], course.units[0].lessons[0]),
        );
      },
    }),
    /service unavailable/,
  );
  assert.equal(courseEditSnapshot(course), source);
});
