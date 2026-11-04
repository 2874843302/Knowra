import assert from "node:assert/strict";
import test from "node:test";
import { catalog, initialState } from "../src/data.js";
import {
  coursePractices,
  validatePractice,
  requestCoursePractice,
} from "../src/lib/course-practice.js";

const course = catalog.find((c) => c.id === "python");
const item = {
  title: "库存记录合并",
  type: "code",
  prompt: "把同名商品的库存字典相加，返回新字典，不修改输入。",
  referenceAnswer: "遍历两份字典，累加到新字典，再验证原字典未被修改。",
  criteria: ["合并同名键", "保留输入"],
  minutes: 12,
};
const response = (items = [item]) => JSON.stringify({ items });

test("catalog exercise banks are independent of lecture quizzes and cover every unit", () => {
  for (const c of catalog) {
    const bank = coursePractices(c, initialState());
    for (let i = 0; i < c.units.length; i++)
      assert(
        bank.some((p) => p.unitIndex === i),
        `${c.id}/${i}`,
      );
    const questions = c.units.flatMap((u) =>
      u.lessons.map((l) => l.quiz?.question),
    );
    assert(bank.every((p) => !questions.includes(p.prompt)));
    assert.equal(new Set(bank.map((p) => p.id)).size, bank.length);
  }
  assert.deepEqual(
    coursePractices({ ...course, id: "custom" }, initialState()),
    [],
  );
  assert.deepEqual(
    coursePractices(
      { ...course, units: [...course.units].reverse() },
      initialState(),
    ),
    [],
  );
});

test("practice contract rejects missing answers, invalid choices and repeated lecture/exercise questions", () => {
  assert.throws(() => validatePractice("{}", course, 0));
  assert.throws(() =>
    validatePractice(response([{ ...item, referenceAnswer: "" }]), course, 0),
  );
  assert.throws(() =>
    validatePractice(
      response([{ ...item, type: "choice", options: ["A", "B"], answer: 2 }]),
      course,
      0,
    ),
  );
  assert.throws(
    () =>
      validatePractice(
        response([
          { ...item, prompt: course.units[0].lessons[0].quiz.question },
        ]),
        course,
        0,
      ),
    /重复/,
  );
  assert.throws(
    () => validatePractice(response([item, item]), course, 0),
    /重复/,
  );
  assert.throws(() => validatePractice(response(), course, 0, [item]), /重复/);
  const [valid] = validatePractice(response(), course, 1);
  assert.equal(valid.unitIndex, 1);
  assert.equal(valid.unitTitle, course.units[1].title);
  assert(valid.id);
});

test("invalid model response repairs internally, and provider receives a dedicated kind", async () => {
  const calls = [];
  const result = await requestCoursePractice(
    async (messages, kind) => {
      calls.push({ messages, kind });
      return calls.length === 1 ? "{}" : response();
    },
    course,
    1,
    [],
    new AbortController().signal,
  );
  assert.equal(result.length, 1);
  assert.equal(calls.length, 2);
  assert(calls.every((c) => c.kind === "course_practice"));
  assert.match(calls[1].messages.at(-1).content, /校验失败/);
  assert.match(calls[1].messages.at(-1).content, /patches/);
  assert.equal(calls[1].messages.at(-2).role, "assistant");
});

test("aborted late response is discarded without retry", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    requestCoursePractice(
      async () => {
        calls++;
        controller.abort();
        return response();
      },
      course,
      0,
      [],
      controller.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});

test("final generation failure preserves caller's existing bank and stops after three attempts", async () => {
  const existing = coursePractices(course, initialState());
  const snapshot = JSON.stringify(existing);
  let calls = 0;
  await assert.rejects(
    requestCoursePractice(
      async () => {
        calls++;
        return "{}";
      },
      course,
      0,
      existing,
    ),
    /已保留/,
  );
  assert.equal(calls, 3);
  assert.equal(JSON.stringify(existing), snapshot);
});
