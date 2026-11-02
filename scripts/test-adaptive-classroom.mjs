import { directedStep } from "./fixtures/teaching-direction.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { catalog, lessonsOf } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import {
  composeClassroomSequence,
  rebaseClassroomCursor,
  requestClassroomAdaptation,
  validateClassroomAdaptation,
} from "../src/lib/adaptive-classroom.js";

const lesson = lessonsOf(catalog[0])[0],
  base = lessonSequence(lesson.content, lesson);
const result = {
  reply: "先用生活中的例子补充方向与长度，再回到向量相加。",
  action: "insert",
  plan: [{ title: "把向量看作送货路线", reason: "先建立直观理解" }],
  steps: [
    directedStep({
      title: "送货路线",
      board: "**向量记录方向与长度**\n\n向东 3 格，再向北 2 格。",
      narration:
        "想象从仓库出发送货，目的地就在向东三格、向北两格的位置。这两项合在一起记录的是一次位移，与仓库建在地图的什么地方无关。",
      checkpoint: {
        question: "仓库整体平移会改变同一条位移的方向和长度吗？",
        options: ["不会", "会"],
        answer: 0,
        explanation: "位移由方向和长度决定。",
      },
    }),
    directedStep({
      title: "回到向量相加",
      board: "**连续两段位移 → 向量相加**",
      narration:
        "理解一条送货路线后，我们再把两段路线首尾相接。这样就能自然过渡到原本要学的向量相加，不必丢掉前面建立的直觉。",
    }),
  ],
};
const revision = (sequence, at, id = "one", action = "insert") => ({
  ...validateClassroomAdaptation(JSON.stringify({ ...result, action })),
  id,
  baseSignature: base.signature,
  afterStepId: sequence.steps[at].id,
});

test("inserts distinct board and narration with a mid-explanation check, preserving all original steps", () => {
  const original = composeClassroomSequence(base),
    patch = revision(original, 0),
    next = composeClassroomSequence(base, [patch]);
  assert.equal(next.steps[0].id, original.steps[0].id);
  assert.equal(next.steps[1].title, "送货路线");
  assert.equal(next.steps[2].kind, "checkpoint");
  assert.equal(next.steps[3].title, "回到向量相加");
  assert.equal(next.steps[4].id, original.steps[1].id);
  assert.deepEqual(
    next.steps.filter((s) => !s.adaptationId).map((s) => s.content),
    original.steps.map((s) => s.content),
  );
  assert(
    next.readingPages.some(
      (p) => p.content.includes("送货路线") || p.title === "送货路线",
    ),
  );
});
test("replans only after the displayed boundary; stable identities preserve earlier answers", () => {
  const original = composeClassroomSequence(base),
    patch = revision(original, 2, "new", "replan"),
    next = composeClassroomSequence(base, [patch]);
  assert.deepEqual(
    next.steps.slice(0, 3).map((s) => s.id),
    original.steps.slice(0, 3).map((s) => s.id),
  );
  assert(!next.steps.some((s) => s.id === original.steps[3].id));
  const cursor = rebaseClassroomCursor(
    {
      index: 1,
      revealedStep: 2,
      elapsed: 200,
      answers: { 1: { selected: 0, correct: true } },
      finished: false,
    },
    original,
    next,
  );
  assert.equal(cursor.index, 3);
  assert.equal(cursor.elapsed, 0);
  assert.equal(cursor.revealedProgress, 0);
  assert.equal(cursor.answers[1].correct, true);
});
test("help during an unanswered check is taught before returning to that question", () => {
  const original = composeClassroomSequence(base),
    next = composeClassroomSequence(base, [revision(original, 0)]);
  const cursor = rebaseClassroomCursor(
    { index: 1, revealedStep: 1, answers: {} },
    original,
    next,
  );
  assert.equal(cursor.index, 1);
  assert.equal(cursor.revealedStep, 1);
  assert.equal(next.steps.at(4).id, original.steps[1].id);
  assert.equal(next.steps.at(4).kind, "checkpoint");
});
test("a second request can target the inserted lesson, while stale revisions do not affect an edited source", () => {
  const original = composeClassroomSequence(base),
    one = revision(original, 0),
    first = composeClassroomSequence(base, [one]);
  const two = revision(first, 1, "two"),
    next = composeClassroomSequence(base, [one, two]);
  assert.equal(next.steps[2].adaptationId, "two");
  const stale = composeClassroomSequence({ ...base, signature: "edited" }, [
    one,
    two,
  ]);
  assert.equal(stale.adaptations.length, 0);
});
test("malformed responses repair internally; failed or cancelled requests never expose a partial board", async () => {
  let calls = 0;
  const repaired = await requestClassroomAdaptation(
    async () => (++calls === 1 ? "broken JSON" : JSON.stringify(result)),
    [],
  );
  assert.equal(calls, 2);
  assert.equal(repaired.steps.length, 2);
  calls = 0;
  await assert.rejects(
    requestClassroomAdaptation(async () => {
      calls++;
      return "{}";
    }, []),
    /原有板书/,
  );
  assert.equal(calls, 3);
  const controller = new AbortController();
  calls = 0;
  await assert.rejects(
    requestClassroomAdaptation(
      async () => {
        calls++;
        controller.abort();
        return JSON.stringify(result);
      },
      [],
      controller.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    requestClassroomAdaptation(async () => {
      calls++;
      throw new Error("network");
    }, []),
    /network/,
  );
  assert.equal(calls, 1);
  for (const changed of [
    { ...result, steps: [] },
    { ...result, plan: [] },
    { ...result, action: "overwrite" },
    {
      ...result,
      steps: [{ ...result.steps[0], narration: result.steps[0].board }],
    },
  ])
    assert.throws(() => validateClassroomAdaptation(JSON.stringify(changed)));
});
