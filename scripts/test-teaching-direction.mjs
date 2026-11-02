import test from "node:test";
import assert from "node:assert/strict";
import { validateOutline } from "../src/data.js";
import { generateCourseLecture } from "../src/lib/course-generation.js";
import { requestClassroomAdaptation } from "../src/lib/adaptive-classroom.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import {
  writingProgress,
  visualProgress,
  emphasisReady,
} from "../src/lib/teaching-direction.js";

const narration =
  "想象水杯倒满了还在接水，会发生什么？先看流入和流出的关系。流入多于流出，水位上升。这就是存量变化。";
const step = () => ({
  title: "水位为什么会上升",
  role: "example",
  board: "流入 > 流出 → **存量增加**",
  narration,
  delivery: {
    write: "先看流入",
    visual: "流入多于流出",
    emphasis: "这就是存量变化",
  },
  annotations: [{ kind: "highlight", snippet: "存量增加" }],
  visual: {
    type: "diagram",
    layout: "flow",
    title: "水量如何改变",
    nodes: [
      { label: "流入与流出", detail: "比较两者大小" },
      { label: "水位变化", detail: "流入更多，存量增加" },
    ],
  },
});
const design = {
  problem: "水杯还在接水，水位为什么改变？",
  approach: "比较流入流出，再归纳存量变化。",
  representations: ["diagram"],
  rationale: "用路径连接流量差与存量变化。",
};
const course = () => ({
  title: "系统思维",
  units: [
    {
      title: "存量",
      lessons: [
        {
          title: "理解存量变化",
          content:
            "## 水杯\n比较流入与流出。\n\n## 存量\n水位反映存量。\n\n## 变化\n流入大于流出时上升。",
          teaching: { design, steps: [step()] },
          quiz: {
            type: "true_false",
            question: "流入大于流出时水位会上升？",
            answer: true,
            explanation: "净流入为正。",
          },
        },
      ],
    },
  ],
});
const expectedUnit = { title: "存量" },
  expectedLesson = { title: "理解存量变化" };

test("new courses silently repair missing teaching design and fabricated representation claims", async () => {
  const calls = [];
  const lesson = await generateCourseLecture({
    expectedUnit,
    expectedLesson,
    messages: [{ role: "user", content: "用水杯解释存量变化" }],
    request: async (messages) => {
      calls.push(messages);
      const value = course();
      if (calls.length === 1) delete value.units[0].lessons[0].teaching.design;
      if (calls.length === 2)
        value.units[0].lessons[0].teaching.design = {
          ...design,
          representations: ["code"],
        };
      return JSON.stringify(value);
    },
  });
  assert.equal(calls.length, 3);
  assert.match(calls[1].at(-1).content, /缺少 teaching.design/);
  assert.match(calls[2].at(-1).content, /code.*没有相应内容/);
  assert.equal(lesson.teaching.steps[0].delivery.visual, "流入多于流出");
  assert.deepEqual(lesson.teaching.design, design);
});

test("narration cues delay writing, diagram and emphasis independently, including restored progress", () => {
  const lesson = validateOutline(course())[0].lessons[0];
  const s = lessonSequence(lesson.content, lesson).steps[0];
  assert(s.writeStart > 0);
  assert.equal(writingProgress(s, s.writeStart - 1), 0);
  assert(writingProgress(s, s.writeStart + s.writeDuration / 2) > 0.49);
  assert.equal(
    visualProgress(s, 0.2, 1),
    0,
    "finishing a short board must not reveal the diagram early",
  );
  assert.equal(emphasisReady(s, 0.4, 1), false);
  assert.equal(emphasisReady(s, 1, 1), true);
  assert.equal(emphasisReady(s, 1, 0.8), false);
  assert.equal(visualProgress(s, 1, 1), 1);
  assert.equal(writingProgress(s, s.duration), 1);
  // Saved narration/board ratios reconstruct the same presentation after reload.
  const saved = {
    narration: 0.8,
    board: writingProgress(s, s.narrationDuration * 0.8),
  };
  assert(visualProgress(s, saved.narration, saved.board) > 0);
  assert(s.duration >= s.writeStart + s.writeDuration + 1000);
});

test("invalid or invented cue anchors are repaired in live follow-up teaching", async () => {
  let count = 0;
  const response = {
    reply: "先用水杯说明。",
    action: "insert",
    plan: [{ title: "水杯类比", reason: "澄清流量与存量的区别" }],
    steps: [step()],
  };
  const result = await requestClassroomAdaptation(
    async (messages) => {
      count++;
      const value = structuredClone(response);
      if (count === 1) value.steps[0].delivery.visual = "这段原文并不存在";
      else assert.match(messages.at(-1).content, /delivery.visual/);
      return JSON.stringify(value);
    },
    [{ role: "user", content: "还是分不清流量与存量" }],
  );
  assert.equal(count, 2);
  assert.equal(result.steps[0].role, "example");
  assert.equal(result.steps[0].delivery.visual, "流入多于流出");
});

test("legacy courses stay playable without invented teaching metadata", () => {
  const value = course(),
    teaching = value.units[0].lessons[0].teaching;
  delete teaching.design;
  delete teaching.steps[0].delivery;
  delete teaching.steps[0].role;
  const lesson = validateOutline(value)[0].lessons[0];
  const s = lessonSequence(lesson.content, lesson).steps[0];
  assert.equal(lesson.teaching.design, undefined);
  assert.equal(s.writeStart, 0);
  assert.equal(writingProgress(s, s.writeDuration / 2), 0.5);
  assert.equal(visualProgress(s, 0.5, 1), 0.5);
});
