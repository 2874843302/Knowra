import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendVoiceText,
  pcmWave,
  transcribeVoice,
  voiceError,
} from "../src/lib/voice-input.js";

test("PCM encoding has a valid mono WAV header and clipped signed samples", async () => {
  const blob = pcmWave([new Float32Array([-2, -0.5, 0, 0.5, 2])], 16000);
  const view = new DataView(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(view.byteLength, 54);
  assert.equal(
    new TextDecoder().decode(new Uint8Array(view.buffer, 0, 4)),
    "RIFF",
  );
  assert.equal(view.getUint32(4, true), 46);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(52, true), 32767);
});

test("recording timer overshoot is trimmed to the accepted duration", async () => {
  const blob = pcmWave([new Float32Array(16000 * 61)], 16000, 60);
  assert.equal(blob.size, 44 + 16000 * 60 * 2);
});

test("transcript appends without losing a typed draft or its whitespace", () => {
  assert.equal(
    appendVoiceText("我想问：", " 变量是什么？ "),
    "我想问： 变量是什么？",
  );
  assert.equal(appendVoiceText("补充\n", "为什么？"), "补充\n为什么？");
  assert.equal(appendVoiceText("草稿", " "), "草稿");
});

test("microphone failures have actionable messages", () => {
  assert.match(voiceError({ name: "NotAllowedError" }), /地址栏/);
  assert.match(voiceError({ name: "NotFoundError" }), /连接设备/);
  assert.match(voiceError({ name: "NotReadableError" }), /占用/);
});

test("transcription passes audio and cancellation signal and exposes server errors", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/asr/transcribe");
      assert.equal(options.signal, controller.signal);
      assert.equal(options.body.get("file").name, "question.wav");
      return Response.json({ text: "  老师请解释一下。 " });
    };
    assert.equal(
      await transcribeVoice(new Blob(["wave"]), controller.signal),
      "老师请解释一下。",
    );
    globalThis.fetch = async () =>
      Response.json({ error: "模型暂未准备好" }, { status: 503 });
    await assert.rejects(transcribeVoice(new Blob([])), /模型暂未准备好/);
  } finally {
    globalThis.fetch = original;
  }
});
