import { directedStep } from "./fixtures/teaching-direction.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkpointFallback,
  requestCheckpointExplanation,
  preparedCheckpointExplanation,
} from "../src/lib/checkpoint-explanation.js";
import { normalizeCheckpoint } from "../src/lib/teaching-checkpoints.js";
import {
  composeClassroomSequence,
  rebaseClassroomCursor,
} from "../src/lib/adaptive-classroom.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const q = {
  type: "true_false",
  question: "向量起点平移后方向和长度不变，还是同一个自由向量吗？",
  answer: true,
  explanation: "自由向量由方向和长度决定。",
};
const content = "## 位移\n\n方向和长度决定自由向量。";
const lesson = {
  title: "向量",
  content,
  quiz: q,
};
const sequence = composeClassroomSequence(lessonSequence(content, lesson));
const index = sequence.steps.length - 1;
const context = { course: { title: "几何" }, lesson, sequence, index };
const response = {
  reply: "起点可以搬动，位移并没有改变。",
  action: "insert",
  plan: [{ title: "比较平移前后", reason: "区分起点与方向长度" }],
  steps: [
    directedStep({
      title: "箭头搬家，位移不变",
      board: "**起点改变 ≠ 位移改变**",
      narration:
        "把箭头搬到另一条街，朝向和长度都不变，所以表示的位移并没有改变。",
    }),
  ],
};

test("AI-prepared feedback preserves distinct selected branches without a new request", () => {
  const feedback = [true, false].map((selected) => ({
    selected,
    title: selected ? "区分起点与位移" : "保持方向和长度",
    board: selected ? "**起点 ≠ 位移**" : "**方向和长度不变 → 位移不变**",
    narration: selected
      ? "你选择了改变。把箭头从家门口搬到学校，方向和长度没变，位移也没变。"
      : "你选择了不改变，这是对的。起点只是放置箭头的位置，方向和长度才决定自由向量。",
  }));
  const question = normalizeCheckpoint({ ...q, feedback });
  const right = preparedCheckpointExplanation(question, false);
  const wrong = preparedCheckpointExplanation(question, true);
  assert.notEqual(right.steps[0].narration, wrong.steps[0].narration);
  assert.equal(right.steps.length, 1);
  assert.equal(right.action, "insert");
  assert.equal(preparedCheckpointExplanation(q, false), null);
  assert.throws(
    () => normalizeCheckpoint({ ...q, feedback: [feedback[0], feedback[0]] }),
    /feedback/,
  );
});
test("selected false and true produce distinct, complete teaching context", async () => {
  const messages = [];
  for (const selected of [false, true]) {
    await requestCheckpointExplanation(
      async (m, kind) => {
        assert.equal(kind, "classroom_adapt");
        messages.push(JSON.parse(m[0].content.split("\n").at(-1)));
        return JSON.stringify(response);
      },
      { ...context, selected },
    );
  }
  assert.equal(messages[0].selected, "错误");
  assert.equal(messages[0].correct, false);
  assert.equal(messages[1].selected, "正确");
  assert.equal(messages[1].correct, true);
  assert.equal(messages[0].expected, "正确");
  assert(messages[0].taught.length);
  assert.notEqual(checkpointFallback(q, false), checkpointFallback(q, true));
});
test("internally repairs replanning or repeated questioning in an answer explanation", async () => {
  let calls = 0;
  const result = await requestCheckpointExplanation(
    async () => {
      calls++;
      return JSON.stringify(
        calls === 1
          ? { ...response, action: "replan" }
          : calls === 2
            ? { ...response, steps: [{ ...response.steps[0], checkpoint: q }] }
            : response,
      );
    },
    { ...context, selected: false },
  );
  assert.equal(calls, 3);
  assert.equal(result.action, "insert");
  assert(result.steps.every((s) => !s.checkpoint));
});
test("a terminal answer leads into fresh teaching while preserving the answer and original board", async () => {
  const result = await requestCheckpointExplanation(
    async () => JSON.stringify(response),
    { ...context, selected: false },
  );
  const next = composeClassroomSequence(lessonSequence(content, lesson), [
    {
      ...result,
      id: "feedback",
      baseSignature: sequence.baseSignature,
      afterStepId: sequence.steps[index].id,
    },
  ]);
  const cursor = rebaseClassroomCursor(
    {
      index,
      revealedStep: index,
      elapsed: 0,
      answers: { [index]: { selected: false, correct: false } },
      finished: false,
    },
    sequence,
    next,
  );
  assert.equal(cursor.index, index + 1);
  assert.equal(next.steps[cursor.index].title, response.steps[0].title);
  assert.equal(cursor.answers[index].selected, false);
  assert.equal(cursor.finished, false);
  assert.deepEqual(
    next.steps.slice(0, index + 1).map((s) => s.id),
    sequence.steps.map((s) => s.id),
  );
});
test("cancelled late explanation is discarded", async () => {
  const controller = new AbortController();
  await assert.rejects(
    requestCheckpointExplanation(
      async () => {
        controller.abort();
        return JSON.stringify(response);
      },
      { ...context, selected: true },
      controller.signal,
    ),
    { name: "AbortError" },
  );
});
