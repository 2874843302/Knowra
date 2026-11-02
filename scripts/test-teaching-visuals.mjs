import { directedStep } from "./fixtures/teaching-direction.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { catalog, lessonsOf, validateOutline } from "../src/data.js";
import { normalizeTeachingVisual } from "../src/lib/teaching-visuals.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import {
  composeClassroomSequence,
  validateClassroomAdaptation,
  requestClassroomAdaptation,
} from "../src/lib/adaptive-classroom.js";

const visual = {
  type: "diagram",
  layout: "venn",
  title: "概念关系",
  nodes: [
    { label: "传记", detail: "个人经历" },
    { label: "历史", detail: "时代背景" },
  ],
  intersection: "社会学想象力",
};
const step = directedStep({
  title: "从个人看社会",
  board: "**个人经历与时代背景交织**",
  narration: "观察两个圆圈重叠的位置，这里表达个人经历与时代背景之间的联系。",
  visual,
});
const patch = {
  reply: "先用图解解释两者的关系。",
  action: "insert",
  plan: [{ title: step.title, reason: "区分两个概念及其联系" }],
  steps: [step],
};

test("diagram survives course normalization, playback and adaptive insertion", () => {
  const lesson = validateOutline({
    title: "测试课程",
    units: [
      {
        title: "单元",
        lessons: [
          {
            title: "讲次",
            content: "## 个人与社会\n\n社会背景。",
            teaching: { steps: [step] },
          },
        ],
      },
    ],
  })[0].lessons[0];
  assert.deepEqual(
    lesson.teaching.steps[0].visual,
    normalizeTeachingVisual(visual),
  );
  const base = lessonSequence(lesson.content, lesson);
  assert.equal(base.steps[0].visual.intersection, "社会学想象力");
  const normalized = validateClassroomAdaptation(JSON.stringify(patch));
  const original = composeClassroomSequence(base);
  const next = composeClassroomSequence(base, [
    {
      ...normalized,
      id: "diagram-followup",
      baseSignature: base.signature,
      afterStepId: original.steps[0].id,
    },
  ]);
  assert.equal(next.steps[1].visual.layout, "venn");
  assert.equal(next.steps[0].id, original.steps[0].id);
});
test("unsafe and malformed visual descriptions are rejected and retried", async () => {
  for (const invalid of [
    { ...visual, type: "html", html: "<script>" },
    { ...visual, layout: "unknown" },
    { ...visual, nodes: [visual.nodes[0]] },
    { ...visual, nodes: [...visual.nodes, visual.nodes[0]] },
    { ...visual, intersection: "" },
    { ...visual, nodes: [{ label: "x".repeat(29) }, visual.nodes[1]] },
    {
      type: "vector-transform",
      title: "无穷",
      mode: "axes",
      vector: [Infinity, 1],
      factors: [1, 1],
    },
  ])
    assert.throws(() => normalizeTeachingVisual(invalid));
  let calls = 0;
  const result = await requestClassroomAdaptation(
    async () =>
      JSON.stringify(
        calls++
          ? patch
          : {
              ...patch,
              steps: [{ ...step, visual: { ...visual, layout: "unknown" } }],
            },
      ),
    [],
    new AbortController().signal,
  );
  assert.equal(calls, 2);
  assert.equal(result.steps[0].visual.layout, "venn");
  const normalized = normalizeTeachingVisual({
    ...visual,
    html: "unsafe",
    nodes: visual.nodes.map((n) => ({ ...n, onclick: "unsafe" })),
  });
  assert(!("html" in normalized));
  assert(!("onclick" in normalized.nodes[0]));
});
test("existing visual formats and text-only lessons remain available", () => {
  assert.equal(normalizeTeachingVisual(null), undefined);
  for (const type of ["bindings", "trace", "comparison"]) {
    const item =
      type === "comparison"
        ? { label: "数字", expression: "3+2", result: "5", detail: "数字相加" }
        : { name: "price", value: "19.9", type: "float" };
    const v = normalizeTeachingVisual({
      type,
      title: "推演",
      [type === "trace" ? "rows" : "items"]: [item],
    });
    assert.equal(v.type, type);
  }
  for (const course of catalog)
    for (const lesson of lessonsOf(course)) {
      const sequence = lessonSequence(lesson.content, lesson);
      assert(sequence.steps.length > 0);
      for (const s of sequence.steps)
        if (s.visual)
          assert.doesNotThrow(() => normalizeTeachingVisual(s.visual));
    }
});
test("attention is a progressive lesson with explanations distinct from board notes and mid-lesson checks", () => {
  const course = catalog.find((c) => c.id === "study-science");
  const lesson = lessonsOf(course).find((l) => l.id === "attention");
  const sequence = lessonSequence(lesson.content, lesson);
  const checks = sequence.steps.filter((s) => s.kind === "checkpoint");
  assert(checks.filter((s) => s.index < sequence.steps.length - 1).length >= 2);
  assert(
    sequence.steps.filter((s) => s.visual?.type === "diagram").length >= 2,
  );
  assert(
    sequence.steps
      .filter((s) => s.kind !== "checkpoint")
      .every((s) => s.narration !== s.text),
  );
});
