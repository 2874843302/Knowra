import test from "node:test";
import assert from "node:assert/strict";
import {
  initialNarrationRate,
  initialNarrationVoice,
} from "../src/lib/speech-preferences.js";

test("old defaults migrate to fluent speech while new explicit quality choices persist", () => {
  assert.equal(
    initialNarrationVoice({
      narrationVoiceId: "friendly-female",
      narrationVoiceVersion: 2,
    }),
    "",
  );
  assert.equal(
    initialNarrationVoice({
      narrationVoiceId: "friendly-female",
      narrationVoiceVersion: 3,
    }),
    "friendly-female",
  );
  assert.equal(
    initialNarrationVoice({
      narrationVoiceId: "zm_009",
      narrationVoiceVersion: 2,
    }),
    "zm_009",
  );
});

test("new classrooms and old automatic 1x recordings use the faster default", () => {
  assert.equal(initialNarrationRate(undefined, {}), 1.25);
  assert.equal(initialNarrationRate({ rate: 1 }, {}), 1.25);
});

test("explicit account speeds and old custom speeds are preserved", () => {
  assert.equal(initialNarrationRate({ rate: 2 }, { narrationRate: 1 }), 1);
  assert.equal(initialNarrationRate({ rate: 1.5 }, {}), 1.5);
  assert.equal(initialNarrationRate({ rate: 0.75 }, {}), 0.75);
  assert.equal(initialNarrationRate({ rate: 99 }, { narrationRate: 99 }), 1.25);
});
