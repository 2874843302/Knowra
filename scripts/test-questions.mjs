import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuestion,
  answerReady,
  evaluateQuestion,
  formatQuestionAnswer,
} from "../src/lib/questions.js";
import { normalizeCheckpoint } from "../src/lib/teaching-checkpoints.js";
import { validateOutline } from "../src/data.js";
import { validatePractice } from "../src/lib/course-practice.js";

const base = {
  question: "根据刚才的情境作答",
  explanation: "这里是参考推理。",
};
test("legacy choice and boolean false are valid answers, never treated as empty", () => {
  const choice = normalizeQuestion({ ...base, options: ["0", "1"], answer: 0 });
  assert.equal(answerReady(choice, 0), true);
  assert.equal(evaluateQuestion(choice, 0).correct, true);
  const judgment = normalizeCheckpoint({
    ...base,
    type: "true_false",
    answer: false,
  });
  assert.equal(answerReady(judgment, false), true);
  assert.equal(evaluateQuestion(judgment, false).correct, true);
  assert.equal(formatQuestionAnswer(judgment, false), "错误");
  assert.throws(() =>
    normalizeQuestion({ ...base, type: "true_false", answer: 0 }),
  );
});
test("every fill must be answered; aliases and Unicode normalization work without ignoring identifier case", () => {
  const fill = normalizeQuestion({
    ...base,
    type: "fill",
    blanks: [
      { label: "单价", answers: ["12.5", "12.50"] },
      { answers: ["Python"], caseSensitive: false },
      { answers: ["userName"] },
    ],
  });
  assert.equal(answerReady(fill, ["12.5", "python", ""]), false);
  assert.equal(
    evaluateQuestion(fill, ["１２.５０ ", "PYTHON", "userName"]).correct,
    true,
  );
  assert.deepEqual(evaluateQuestion(fill, ["12.5", "python", "username"]), {
    correct: false,
    blanks: [true, true, false],
  });
  assert.throws(() =>
    normalizeQuestion({ ...base, type: "fill", blanks: [{ answers: [] }] }),
  );
});
test("open answers are recorded for review, never automatically marked wrong or correct", () => {
  const q = normalizeQuestion({ ...base, type: "response" });
  assert.equal(answerReady(q, "  "), false);
  assert.deepEqual(evaluateQuestion(q, "这是我的理由"), { correct: null });
  assert.equal(formatQuestionAnswer(q, "这是我的理由"), "这是我的理由");
});
test("course quizzes, teaching checkpoints and independent exercises retain their type-specific contracts", () => {
  for (const q of [
    { ...base, type: "true_false", answer: false },
    { ...base, type: "fill", blanks: [{ answers: ["42"] }] },
    { ...base, type: "response" },
  ]) {
    const course = {
      title: "课程",
      units: [
        {
          title: "单元",
          lessons: [
            {
              title: "讲次",
              content: "## 教材\n\n完整解释。",
              quiz: q,
              teaching: {
                steps: [
                  {
                    title: "概念",
                    board: "**关键概念**",
                    narration: "用一个具体例子解释这个关键概念。",
                    checkpoint: q,
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const lesson = validateOutline(course)[0].lessons[0];
    assert.equal(lesson.quiz.type, q.type);
    assert.equal(lesson.teaching.steps[0].checkpoint.type, q.type);
    const practice = validatePractice(
      JSON.stringify({
        items: [
          {
            ...q,
            title: "新练习",
            prompt: "一个不同的应用情境",
            referenceAnswer: q.explanation,
            criteria: ["能解释原因"],
          },
        ],
      }),
      course,
      0,
    )[0];
    assert.equal(practice.type, q.type);
    if (q.type === "fill") assert.deepEqual(practice.blanks[0].answers, ["42"]);
  }
});
