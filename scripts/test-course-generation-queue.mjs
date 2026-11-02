import test from "node:test";
import assert from "node:assert/strict";
import {
  courseGenerationConcurrency,
  generateCourseCurriculum,
} from "../src/lib/course-generation-queue.js";

const plan = {
  units: [0, 1].map((i) => ({
    title: `单元${i}`,
    lessons: [0, 1].map((j) => ({ title: `讲次${i}-${j}` })),
  })),
};
const lesson = (i, j) => ({
  title: plan.units[i].lessons[j].title,
  content: "经过校验的完整教材",
});
const gate = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("ordinary APIs use two workers; local/native/unknown providers remain serial", () => {
  assert.equal(
    courseGenerationConcurrency({
      baseUrl: "https://api.example.com/v1",
      model: "model",
    }),
    2,
  );
  for (const baseUrl of [
    "http://127.0.0.1:8001/v1",
    "http://localhost/v1",
    "http://[::1]/v1",
    undefined,
  ])
    assert.equal(courseGenerationConcurrency({ baseUrl }), 1);
  assert.equal(
    courseGenerationConcurrency({
      baseUrl: "https://adapter.example.com/v1",
      model: "deepseek-web",
    }),
    1,
  );
});

test("bounded parallel completion preserves blueprint order and every success", async () => {
  const gates = Array.from({ length: 4 }, gate);
  const calls = [];
  const snapshots = [];
  const done = generateCourseCurriculum({
    plan,
    concurrency: 20,
    generate: async (i, j) => {
      calls.push(`${i}:${j}`);
      await gates[i * 2 + j].promise;
      return lesson(i, j);
    },
    onProgress: (value) => snapshots.push(value),
  });
  assert.deepEqual(calls, ["0:0", "0:1"]);
  gates[1].resolve();
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["0:0", "0:1", "1:0"]);
  assert.equal(snapshots[0].pendingLectures["0:1"].id, "lesson-0-1");
  gates[0].resolve();
  await new Promise(setImmediate);
  gates[3].resolve();
  gates[2].resolve();
  const units = await done;
  assert.deepEqual(
    units.map((u) => u.lessons.map((l) => l.title)),
    plan.units.map((u) => u.lessons.map((l) => l.title)),
  );
  assert.deepEqual(snapshots.at(-1).pendingLectures, {});
});

test("failure stops scheduling but retains out-of-order success for resume", async () => {
  let progress;
  const first = gate();
  const calls = [];
  const done = generateCourseCurriculum({
    plan,
    concurrency: 2,
    generate: async (i, j) => {
      calls.push(`${i}:${j}`);
      if (!j) {
        await first.promise;
        return lesson(i, j);
      }
      throw new Error("rate limited");
    },
    onProgress: (p) => {
      progress = p;
    },
  });
  first.resolve();
  await assert.rejects(done, /rate limited/);
  assert.deepEqual(calls, ["0:0", "0:1"]);
  const resumed = [];
  const units = await generateCourseCurriculum({
    plan,
    ...progress,
    pendingLectures: { "0:1": lesson(0, 1), "1:1": lesson(1, 1) },
    generate: async (i, j) => {
      resumed.push(`${i}:${j}`);
      return lesson(i, j);
    },
  });
  assert.deepEqual(resumed, ["1:0"]);
  assert.equal(units.length, 2);
});

test("cancel discards late results and never starts another lecture", async () => {
  const controller = new AbortController();
  const hold = gate();
  let saved = 0,
    calls = 0;
  const done = generateCourseCurriculum({
    plan,
    signal: controller.signal,
    generate: async () => {
      calls++;
      await hold.promise;
      return lesson(0, 0);
    },
    onProgress: () => saved++,
  });
  controller.abort();
  hold.resolve();
  await assert.rejects(done, { name: "AbortError" });
  assert.equal(saved, 0);
  assert.equal(calls, 1);
});
