import test from "node:test";
import assert from "node:assert/strict";
import {
  narrationTiming,
  narrationFrame,
  narrationActiveTime,
  narrationElapsedAtActive,
} from "../src/lib/narration-timing.js";
import { captionFrame } from "../src/lib/lesson-captions.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import {
  writingProgress,
  deliveryStart,
} from "../src/lib/teaching-direction.js";

test("each sentence holds its full caption and board before the next sentence", () => {
  const text = "先看第一句话。再看第二句话。最后一起总结。";
  const timing = narrationTiming(text),
    first = timing.phases[0];
  assert.equal(timing.phases.length, 3);
  assert.equal(first.pauseEnd - first.speechEnd, 800);
  const step = { narration: text, writeStart: 0, writeDuration: 3000 };
  const frame = narrationFrame(text, first.speechEnd);
  assert.equal(captionFrame(text, frame.progress).text, "先看第一句话。");
  for (const offset of [1, 400, 799]) {
    const held = narrationFrame(text, first.speechEnd + offset);
    assert.equal(held.paused, true);
    assert.equal(held.progress, frame.progress);
    assert.equal(
      writingProgress(step, first.speechEnd + offset),
      writingProgress(step, first.speechEnd),
    );
  }
  const next = narrationFrame(text, first.pauseEnd + timing.unitDuration * 2);
  assert.equal(next.paused, false);
  assert.equal(captionFrame(text, next.progress).text, "再看");
});

test("paragraph whitespace supplies one longer pause without an empty sentence", () => {
  const text = "第一段。\n\n第二段。  ",
    timing = narrationTiming(text);
  assert.equal(timing.phases.length, 2);
  assert.equal(timing.phases[0].pauseEnd - timing.phases[0].speechEnd, 1200);
  assert.equal(narrationFrame(text, timing.duration).progress, 1);
  assert.equal(captionFrame(text, 1).text, "第二段。");
});

test("sentence boundaries preserve closing quotes, decimals, code dots and graphemes", () => {
  const text = "他说：“先停一下。”版本是 3.14。Run foo.bar(). Next sentence!";
  const { phases, units } = narrationTiming(text);
  assert.deepEqual(
    phases.map((p) => units.slice(p.start, p.end).join("").trim()),
    ["他说：“先停一下。”", "版本是 3.14。", "Run foo.bar().", "Next sentence!"],
  );
  assert.equal(captionFrame("A👨‍👩‍👧‍👦中", 2 / 3).text, "A👨‍👩‍👧‍👦");
  assert.deepEqual(captionFrame("\n ", 0.5), { full: "", text: "" });
});

test("cue anchors and restored active time include previous sentence pauses", () => {
  const text = "先看第一句话。再看第二句话。最后一起总结。",
    timing = narrationTiming(text);
  for (const active of [0, 150, 700, 1300, timing.contentDuration + 300]) {
    const elapsed = narrationElapsedAtActive(text, active);
    assert(Math.abs(narrationActiveTime(text, elapsed) - active) < 1e-6);
  }
  const step = { narration: text, delivery: { write: "再看第二句话" } };
  assert.equal(deliveryStart(step, "write"), timing.phases[1].startTime);
  assert.equal(
    writingProgress({ narration: "", writeDuration: 700 }, 350),
    0.5,
  );
});

test("step completion leaves enough time for writing and the final sentence hold", () => {
  const lesson = {
    teaching: {
      steps: [
        {
          title: "理解",
          board: "板书".repeat(70),
          narration: "先看概念。\n\n再看应用。",
          delivery: { write: "再看应用" },
        },
      ],
    },
  };
  const step = lessonSequence("## 理解\n\n学习概念。", lesson).steps[0];
  assert.equal(writingProgress(step, step.duration), 1);
  assert(step.duration >= narrationTiming(step.narration).duration + 750);
  assert.equal(narrationFrame(step.narration, step.duration).progress, 1);
});
