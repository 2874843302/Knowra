import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runValidatedGeneration } from "../src/lib/course-agent.js";
import { applyGenerationPatch } from "../src/lib/generation-repair.js";
import { contentError } from "../src/lib/generation-validation.js";
import { generateCourseLecture } from "../src/lib/course-generation.js";

const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/mcp-course.json", import.meta.url),
    "utf8",
  ),
);
const course = () => ({
  ...structuredClone(fixture),
  units: [
    {
      ...structuredClone(fixture.units[0]),
      lessons: [structuredClone(fixture.units[0].lessons[0])],
    },
  ],
});
const lessonPath = "/units/0/lessons/0";
const messages = [
  { role: "user", content: "严格保留当前蓝图，深入讲清共享状态。" },
];
const options = {
  messages,
  expectedUnit: fixture.units[0],
  expectedLesson: fixture.units[0].lessons[0],
};
const patch = (op, path, value) =>
  JSON.stringify({
    patches: [{ op, path, ...(op !== "remove" ? { value } : {}) }],
  });

test("missing quiz is repaired with one field; the failed output and exact error reach the model", async () => {
  const original = course();
  delete original.units[0].lessons[0].quiz;
  const raw = JSON.stringify(original),
    calls = [];
  const result = await generateCourseLecture({
    ...options,
    request: async (sent) => {
      calls.push(sent);
      if (calls.length === 1) return raw;
      assert.deepEqual(sent[0], messages[0]);
      assert.equal(sent.at(-2).role, "assistant");
      assert.equal(sent.at(-2).content, raw);
      assert.match(sent.at(-1).content, /缺少 quiz/);
      assert.match(sent.at(-1).content, /不要重新生成整份内容/);
      assert.match(sent.at(-1).content, /\/units\/0\/lessons\/0\/quiz/);
      return patch(
        "add",
        lessonPath + "/quiz",
        fixture.units[0].lessons[0].quiz,
      );
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(result.content, original.units[0].lessons[0].content);
  assert.deepEqual(
    result.teaching.steps.map((s) => s.narration),
    original.units[0].lessons[0].teaching.steps.map((s) => s.narration),
  );
  assert.equal(messages.length, 1);
  assert.equal(original.units[0].lessons[0].quiz, undefined);
});

test("subsequent observations repair the current candidate, preserving the first successful patch", async () => {
  const original = course();
  const first = original.units[0].lessons[0].teaching.steps[0];
  const narration = first.narration;
  first.narration = first.board;
  delete original.units[0].lessons[0].quiz;
  let calls = 0;
  const result = await generateCourseLecture({
    ...options,
    request: async (sent) => {
      calls++;
      if (calls === 1) return JSON.stringify(original);
      if (calls === 2)
        return patch(
          "add",
          lessonPath + "/quiz",
          fixture.units[0].lessons[0].quiz,
        );
      const candidate = JSON.parse(sent.at(-2).content);
      assert.deepEqual(
        candidate.units[0].lessons[0].quiz,
        fixture.units[0].lessons[0].quiz,
      );
      assert.match(sent.at(-1).content, /teaching\/steps\/0\/narration/);
      assert.match(sent.at(-1).content, /previousErrors/);
      return patch(
        "replace",
        lessonPath + "/teaching/steps/0/narration",
        narration,
      );
    },
  });
  assert.equal(calls, 3);
  assert.equal(result.teaching.steps[0].narration, narration);
  assert.deepEqual(
    result.quiz.options,
    fixture.units[0].lessons[0].quiz.options,
  );
});

test("invalid or unrelated patches roll back atomically, and the next observation explains why", async () => {
  const original = { stable: "keep", value: {} };
  let calls = 0;
  const result = await runValidatedGeneration({
    messages,
    kind: "fixture",
    request: async (sent) => {
      calls++;
      if (calls === 1) return JSON.stringify(original);
      if (calls === 2)
        return JSON.stringify({
          patches: [
            { op: "add", path: "/value/answer", value: 42 },
            { op: "replace", path: "/stable", value: "must not survive" },
          ],
        });
      const candidate = JSON.parse(
        sent.find((m) => m.role === "assistant").content,
      );
      assert.deepEqual(candidate, original);
      assert.match(sent.at(-1).content, /不要改写其他内容/);
      assert(
        sent.some(
          (m) =>
            m.role === "assistant" && m.content.includes("must not survive"),
        ),
      );
      return patch("add", "/value/answer", 42);
    },
    validate: (text) => {
      const value = JSON.parse(text);
      if (value.value.answer !== 42)
        throw contentError("/value", "answer 需要是 42");
      return value;
    },
  });
  assert.deepEqual(result, { ...original, value: { answer: 42 } });
  assert.equal(calls, 3);
});

test("a legacy full response contributes only its failed subtree; correct content cannot be replaced", async () => {
  const original = course();
  delete original.units[0].lessons[0].quiz;
  let calls = 0;
  const result = await generateCourseLecture({
    ...options,
    request: async () => {
      if (++calls === 1) return JSON.stringify(original);
      const regenerated = course();
      regenerated.units[0].lessons[0].content = "unrelated rewrite";
      regenerated.units[0].lessons[0].title = "unrelated title";
      return JSON.stringify(regenerated);
    },
  });
  assert.equal(result.content, original.units[0].lessons[0].content);
  assert.equal(result.title, options.expectedLesson.title);
});

test("repairing an array item from a full response replaces it without inserting a duplicate", async () => {
  let calls = 0;
  const result = await runValidatedGeneration({
    messages,
    request: async () =>
      JSON.stringify({ items: [++calls === 1 ? "bad" : "good", "unchanged"] }),
    validate: (response) => {
      const value = JSON.parse(response);
      if (value.items[0] !== "good")
        throw contentError("/items/0", "需要 good");
      return value;
    },
  });
  assert.deepEqual(result.items, ["good", "unchanged"]);
});

test("unparseable JSON is sent back for syntax-only correction rather than a new design", async () => {
  let calls = 0;
  const raw = '{"title":"已经写好的标题"';
  const result = await runValidatedGeneration({
    messages,
    request: async (sent) => {
      if (++calls === 1) return raw;
      assert.equal(sent.at(-2).content, raw);
      assert.match(sent.at(-1).content, /仅修复这份输出的语法/);
      return raw + "}";
    },
    validate: JSON.parse,
  });
  assert.equal(result.title, "已经写好的标题");
});

for (const [name, breakValue, path, fixValue] of [
  [
    "null unit",
    (v) => {
      v.units[0] = null;
    },
    "/units/0",
    course().units[0],
  ],
  [
    "null lesson",
    (v) => {
      v.units[0].lessons[0] = null;
    },
    lessonPath,
    course().units[0].lessons[0],
  ],
  [
    "non-object teaching",
    (v) => {
      v.units[0].lessons[0].teaching = true;
    },
    lessonPath + "/teaching",
    course().units[0].lessons[0].teaching,
  ],
])
  test(`malformed structure ${name} is located at a replaceable subtree`, async () => {
    const original = course();
    breakValue(original);
    let calls = 0;
    await generateCourseLecture({
      ...options,
      request: async (sent) => {
        if (++calls === 1) return JSON.stringify(original);
        assert(sent.at(-1).content.includes(`"path":"${path}"`));
        return patch("replace", path, fixValue);
      },
    });
    assert.equal(calls, 2);
  });

test("an invalid root can be corrected without demanding a patch into an unusable array", async () => {
  let calls = 0;
  const result = await runValidatedGeneration({
    messages,
    request: async (sent) => {
      if (++calls === 1) return "[]";
      assert.match(sent.at(-1).content, /根结构/);
      return '{"ready":true}';
    },
    validate: (response) => {
      const value = JSON.parse(response);
      if (Array.isArray(value))
        throw contentError("/ready", "根节点必须是对象");
      return value;
    },
  });
  assert.deepEqual(result, { ready: true });
});

test("large failed outputs are preserved in chunks that satisfy the per-message contract", async () => {
  const raw = JSON.stringify({ title: "x".repeat(145000) });
  let calls = 0;
  await runValidatedGeneration({
    messages,
    request: async (sent) => {
      if (++calls === 1) return raw;
      assert(sent.every((m) => m.content.length <= 70000));
      const reconstructed = sent
        .filter((m) => m.role === "assistant")
        .map((m) =>
          m.content.replace(/^待修复输出（第 \d+ 段，按顺序拼接）：\n/, ""),
        )
        .join("");
      assert.equal(reconstructed, raw);
      return patch("add", "/ready", true);
    },
    validate: (response) => {
      const value = JSON.parse(response);
      if (!value.ready) throw contentError("/ready", "缺少 ready");
      return value;
    },
  });
  assert.equal(calls, 2);
});

test("request adapter does not retry network/auth failures or publish a cancelled repair", async () => {
  const unavailable = new Error("429 cooldown");
  let calls = 0;
  await assert.rejects(
    runValidatedGeneration({
      messages,
      request: async () => {
        calls++;
        throw unavailable;
      },
      validate: JSON.parse,
    }),
    (e) => e === unavailable,
  );
  assert.equal(calls, 1);
  const controller = new AbortController();
  calls = 0;
  await assert.rejects(
    runValidatedGeneration({
      messages,
      signal: controller.signal,
      request: async () => {
        calls++;
        if (calls === 1) return "{";
        controller.abort();
        return "{}";
      },
      validate: JSON.parse,
    }),
    { name: "AbortError" },
  );
  assert.equal(calls, 2);
});

test("patches respect escaped keys and array operations without changing the source", () => {
  const value = { "a/b": { "~key": [1, 2] } };
  assert.deepEqual(
    applyGenerationPatch(value, [
      { op: "add", path: "/a~1b/~0key/-", value: 3 },
      { op: "replace", path: "/a~1b/~0key/0", value: 4 },
      { op: "remove", path: "/a~1b/~0key/1" },
    ]),
    { "a/b": { "~key": [4, 3] } },
  );
  assert.deepEqual(value, { "a/b": { "~key": [1, 2] } });
});

for (const operation of [
  { op: "replace", path: "", value: {} },
  { op: "add", path: "/__proto__/polluted", value: true },
  { op: "replace", path: "/missing", value: 0 },
  { op: "add", path: "/items/4", value: 0 },
  { op: "add", path: "/items/01", value: 0 },
  { op: "add", path: "/items/no~2", value: 0 },
  { op: "replace", path: "/stable" },
])
  test(`reject invalid patch ${JSON.stringify(operation)} without mutating any data`, () => {
    const value = { stable: "keep", items: [1] };
    assert.throws(() =>
      applyGenerationPatch(value, [
        { op: "replace", path: "/stable", value: "changed" },
        operation,
      ]),
    );
    assert.deepEqual(value, { stable: "keep", items: [1] });
    assert.equal({}.polluted, undefined);
  });
