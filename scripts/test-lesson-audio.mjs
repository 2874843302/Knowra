import test from "node:test";
import assert from "node:assert/strict";
import { LessonAudio } from "../src/lib/lesson-audio.js";
import { narrationTiming } from "../src/lib/narration-timing.js";
import { speechPreloadPlan } from "../src/lib/speech-preload.js";

test("preload spans teaching passages but stops before a checkpoint", () => {
  const current = { narration: "先看变量。再看赋值。" };
  const plan = speechPreloadPlan(current, 0, [
    { narration: "继续理解数据。" },
    { kind: "checkpoint", narration: "应当停在题目前。" },
    { narration: "回答后才讲。" },
  ]);
  assert.deepEqual(plan, ["先看变量。", "再看赋值。", "继续理解数据。"]);
  assert.deepEqual(speechPreloadPlan(current, 1, [], 1), ["再看赋值。"]);
});

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(fetcher) {
  const audio = {
    duration: 4,
    currentTime: 0,
    paused: true,
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
    load() {
      if (this.src) queueMicrotask(() => this.onloadedmetadata?.());
    },
    removeAttribute() {
      this.src = null;
    },
  };
  let count = 0;
  const revoked = [];
  const player = new LessonAudio("fixture-a", {
    fetcher:
      fetcher ||
      (async (_path, options) => {
        assert.equal(options.headers["X-Account-Id"], "fixture-a");
        count++;
        return new Response(new Blob(["audio"]));
      }),
    audioFactory: () => audio,
    url: {
      createObjectURL: () => "blob:fixture",
      revokeObjectURL: (url) => revoked.push(url),
    },
  });
  const phase = { index: 0, startTime: 0, speechEnd: 2000, pauseEnd: 2800 };
  const config = {
    text: "理解以后再继续。",
    voice: "zf_001",
    phase,
    elapsed: 0,
    playing: true,
    rate: 1,
    onStatus() {},
    onError(error) {
      throw error;
    },
  };
  return { player, audio, config, count: () => count, revoked };
}

test("holds writing during generation, then follows actual audio, including the sentence pause", async () => {
  const { player, config, audio } = fixture();
  player.sync(config);
  assert.equal(player.elapsed(0, 60), 0);
  await flush();
  assert.equal(audio.paused, false);
  audio.currentTime = 2;
  assert.equal(player.elapsed(0, 60), 1000);
  audio.onended();
  assert.equal(player.elapsed(1800, 60), 2000);
  assert.equal(player.elapsed(2200, 60), 2260);
  player.dispose();
});

test("pause/resume, speed changes and replay reuse the same generated audio", async () => {
  const { player, config, audio, count, revoked } = fixture();
  player.sync(config);
  await flush();
  audio.currentTime = 2;
  player.sync({ ...config, elapsed: 1000, playing: false });
  assert.equal(audio.paused, true);
  player.sync({ ...config, elapsed: 1000, rate: 2 });
  assert.equal(audio.currentTime, 2);
  assert.equal(audio.playbackRate, 2);
  player.sync({ ...config, elapsed: 0 });
  assert.equal(audio.currentTime, 0);
  assert.equal(count(), 1);
  player.dispose();
  assert.equal(audio.paused, true);
  assert.equal(revoked.length, 1);
});

test("restoring inside a pause does not deadlock or replay the sentence", () => {
  const { player, config, count } = fixture();
  player.sync({ ...config, elapsed: 2400 });
  assert.equal(player.elapsed(2400, 60), 2460);
  assert.equal(count(), 0);
  player.dispose();
});

test("leaving while a sentence is being generated never starts late audio", async () => {
  let resolve;
  const { player, config, audio } = fixture(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  player.sync({
    ...config,
    onError() {
      assert.fail("disposed player must ignore errors");
    },
  });
  player.dispose();
  resolve(new Response(new Blob(["audio"])));
  await flush();
  assert.equal(audio.paused, true);
  assert.equal(player.cache.size, 0);
});

test("startup buffers following sentences once, then plays cached sentences without another fetch", async () => {
  const requests = [];
  const pending = new Map();
  const { player, config, audio } = fixture((_path, options) => {
    const { text } = JSON.parse(options.body);
    requests.push(text);
    return new Promise((resolve) =>
      pending.set(text, () => resolve(new Response(new Blob(["audio"])))),
    );
  });
  player.sync({ ...config, bufferTexts: ["下一句。", "第三句。"] });
  pending.get(config.text)();
  await flush();
  assert.equal(player.elapsed(0, 20), 0);
  assert.equal(audio.paused, true);
  assert.deepEqual(requests, [config.text, "下一句。", "第三句。"]);
  pending.get("下一句。")();
  pending.get("第三句。")();
  await flush();
  assert.equal(audio.paused, false);
  player.sync({
    ...config,
    text: "下一句。",
    phase: { ...config.phase, index: 1 },
  });
  await flush();
  assert.equal(audio.paused, false);
  assert.equal(requests.length, 3);
  player.dispose();
});

test("long sentences are losslessly divided into bounded audio requests without extra pauses", () => {
  const text = "这是一个非常长的连续讲解内容".repeat(70) + "。";
  const timing = narrationTiming(text);
  assert.equal(
    timing.phases
      .map((p) => timing.units.slice(p.start, p.end).join(""))
      .join(""),
    text,
  );
  assert.ok(timing.phases.every((p) => p.end - p.start <= 220));
  assert.equal(timing.duration, timing.contentDuration + 800);
});
