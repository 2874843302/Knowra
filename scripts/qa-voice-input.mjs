import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { initialState, catalog } from "../src/data.js";
import { pcmWave } from "../src/lib/voice-input.js";
import { directedStep } from "./fixtures/teaching-direction.mjs";

const folder = ".test/report/voice-input";
await mkdir(folder, { recursive: true });
// A deterministic tone exercises real Chromium microphone capture and AudioWorklet,
// without opening the user's physical microphone. Real speech decoding is qa-asr.py.
const audio = path.resolve(folder, "microphone.wav");
await writeFile(
  audio,
  Buffer.from(
    await pcmWave(
      [
        Float32Array.from(
          { length: 32000 },
          (_, i) => 0.2 * Math.sin((i / 16000) * 2 * Math.PI * 440),
        ),
      ],
      16000,
    ).arrayBuffer(),
  ),
);
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${audio}`,
  ],
});
const results = [];
let activePage;
try {
  for (const width of [1440, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      permissions: ["microphone"],
    });
    let state = initialState(),
      revision = 0,
      mode = "success",
      release;
    const errors = [],
      calls = [],
      recordings = [];
    state.appearance.narrationVoice = false;
    await context.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          user: {
            id: `voice-${width}`,
            name: "语音测试",
            workspaceId: `voice-${width}`,
          },
        },
      }),
    );
    await context.route("**/api/workspace", (r) => {
      if (r.request().method() === "PATCH") {
        for (const op of r.request().postDataJSON().operations) {
          let target = state;
          for (const key of op.path.slice(0, -1)) target = target[key] ??= {};
          if (op.op === "remove") delete target[op.path.at(-1)];
          else target[op.path.at(-1)] = op.value;
        }
        revision++;
      }
      return r.fulfill({ json: { state, revision } });
    });
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: true, model: "fixture", profiles: [] } }),
    );
    await context.route("**/api/tts/status", (r) =>
      r.fulfill({ json: { ready: false, voices: [] } }),
    );
    await context.route("**/api/asr/status", (r) =>
      r.fulfill({
        json: {
          ready: mode !== "missing",
          message: "识别模型尚未准备好，可以打字提问。",
        },
      }),
    );
    await context.route("**/api/asr/transcribe", async (r) => {
      const body = r.request().postDataBuffer(),
        offset = body.indexOf(Buffer.from("RIFF"));
      assert.ok(offset >= 0, "Multipart includes a WAV recording");
      const frames = body.readUInt32LE(offset + 40) / 2,
        rate = body.readUInt32LE(offset + 24);
      assert.equal(body.readUInt16LE(offset + 22), 1);
      assert.ok(frames / rate > 0.15 && frames / rate <= 60);
      assert.ok(
        body
          .subarray(offset + 44, offset + 44 + frames * 2)
          .some((x) => x !== 0),
        "Microphone worklet captured non-silent audio",
      );
      recordings.push({ seconds: frames / rate, rate });
      await new Promise((resolve) => {
        release = resolve;
      });
      await r
        .fulfill(
          mode === "failure"
            ? { status: 503, json: { error: "识别暂时失败，请重新录音。" } }
            : {
                json: {
                  text: "老师，为什么向量相加要首尾相接？",
                  duration: frames / rate,
                },
              },
        )
        .catch(() => {});
    });
    await context.route("**/api/ai", (r) => {
      const request = r.request().postDataJSON();
      calls.push(request);
      return r.fulfill({
        json: {
          content:
            request.kind === "classroom_adapt"
              ? JSON.stringify({
                  reply: "可以，把两段送货路线接起来，就能找到总位移。",
                  action: "insert",
                  plan: [{ title: "接起两段路线", reason: "解释语音问题" }],
                  steps: [
                    directedStep({
                      title: "接起两段路线",
                      board: "两段位移首尾相接 → 总位移",
                      narration:
                        "先沿第一段路线走到中转站，再接着走第二段，终点相对起点的变化就是总位移。",
                    }),
                  ],
                })
              : "首尾相接可以表示连续发生的两段位移。",
        },
      });
    });
    await context.addInitScript(() => {
      window.__micTracks = [];
      const original = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (...args) => {
        if (window.__denyMic)
          throw new DOMException("denied", "NotAllowedError");
        const stream = await original(...args);
        window.__micTracks.push(...stream.getTracks());
        return stream;
      };
    });
    const page = await context.newPage();
    activePage = page;
    page.on("pageerror", (e) => errors.push(e.message));
    const voice = () => page.locator(".voice-input");
    const mic = () =>
      page.getByRole("button", { name: "语音输入", exact: true });
    const allStopped = async () =>
      expect
        .poll(() =>
          page.evaluate(() =>
            window.__micTracks.every((t) => t.readyState === "ended"),
          ),
        )
        .toBe(true);
    const record = async () => {
      await mic().click();
      await expect(voice()).toHaveAttribute("data-voice-state", "recording");
      await page.waitForTimeout(600);
    };
    await page.goto("http://127.0.0.1:5173/assistant");
    const input = page.getByRole("textbox", { name: "输入问题", exact: true });
    await input.fill("原来的草稿：");
    await record();
    await input.fill("录音时补充的草稿：");
    const inputBounds = await input.boundingBox(),
      feedbackBounds = await page
        .locator(".voice-input-feedback")
        .boundingBox();
    assert.ok(
      feedbackBounds.y + feedbackBounds.height <= inputBounds.y,
      "Voice feedback must not cover the draft",
    );
    await page.screenshot({
      path: `${folder}/assistant-recording-${width}.png`,
    });
    await page.getByRole("button", { name: "结束录音并转文字" }).click();
    await expect(voice()).toHaveAttribute("data-voice-state", "transcribing");
    await expect(
      page.getByRole("button", { name: "发送问题", exact: true }),
    ).toBeDisabled();
    await expect.poll(() => typeof release).toBe("function");
    release();
    await expect(input).toHaveValue(
      "录音时补充的草稿： 老师，为什么向量相加要首尾相接？",
    );
    assert.equal(
      calls.length,
      0,
      "Transcription is editable and is not silently sent",
    );
    await allStopped();
    await page.getByRole("button", { name: "联网搜索", exact: true }).click();
    await page.getByRole("button", { name: "发送问题", exact: true }).click();
    await expect.poll(() => calls.length).toBe(1);
    assert.match(calls[0].messages.at(-1).content, /录音时补充的草稿/);
    await expect(mic()).toBeEnabled();

    await input.fill("保留这个草稿");
    const before = recordings.length;
    await record();
    await page.getByRole("button", { name: "取消语音输入" }).click();
    await allStopped();
    assert.equal(recordings.length, before);
    await expect(input).toHaveValue("保留这个草稿");

    release = null;
    await record();
    await page.getByRole("button", { name: "结束录音并转文字" }).click();
    await expect.poll(() => typeof release).toBe("function");
    await page.getByRole("button", { name: "取消语音输入" }).click();
    release();
    await page.waitForTimeout(150);
    await expect(input).toHaveValue("保留这个草稿");
    await allStopped();

    mode = "failure";
    release = null;
    await record();
    await page.getByRole("button", { name: "结束录音并转文字" }).click();
    await expect.poll(() => typeof release).toBe("function");
    release();
    await expect(
      page.getByRole("alert").filter({ hasText: "识别暂时失败" }),
    ).toBeVisible();
    await expect(input).toHaveValue("保留这个草稿");
    await allStopped();

    mode = "missing";
    const trackCount = await page.evaluate(() => window.__micTracks.length);
    await mic().click();
    await expect(
      page.getByRole("alert").filter({ hasText: "模型尚未准备好" }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(() => window.__micTracks.length),
      trackCount,
    );
    mode = "success";
    await page.evaluate(() => (window.__denyMic = true));
    await mic().click();
    await expect(
      page.getByRole("alert").filter({ hasText: "麦克风权限未开启" }),
    ).toBeVisible();
    await page.evaluate(() => (window.__denyMic = false));

    // Switching conversations must close the mic, including reuse of AssistantPage.
    await record();
    await page.getByRole("link", { name: "新对话", exact: true }).click();
    await expect(voice()).toHaveAttribute("data-voice-state", "idle");
    await allStopped();

    const course = catalog.find((c) => c.id === "linear-algebra"),
      lesson = course.units[0].lessons[0];
    await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${lesson.id}`);
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    await record();
    await page.getByRole("button", { name: "收起导师", exact: true }).click();
    await allStopped();
    await expect(voice()).toHaveAttribute("data-voice-state", "idle");
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    const play = page.getByRole("button", { name: "开始讲解", exact: true });
    if (await play.isVisible()) await play.click();
    await expect(
      page.getByRole("button", { name: "暂停讲解", exact: true }),
    ).toBeVisible();
    await record();
    await expect(
      page.getByRole("button", { name: "暂停讲解", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `${folder}/classroom-recording-${width}.png`,
    });
    release = null;
    await page.getByRole("button", { name: "结束录音并转文字" }).click();
    await expect.poll(() => typeof release).toBe("function");
    release();
    const tutorInput = page.getByRole("textbox", {
      name: "向导师提问",
      exact: true,
    });
    await expect(tutorInput).toHaveValue("老师，为什么向量相加要首尾相接？");
    await allStopped();
    await page.getByRole("button", { name: "向导师发送", exact: true }).click();
    await expect(page.locator(".tutor-message.assistant")).toContainText(
      "两段送货路线",
    );
    assert.ok(
      calls.some(
        (c) =>
          c.kind === "classroom_adapt" &&
          c.messages.some((m) => m.content.includes("为什么向量相加")),
      ),
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    results.push({
      width,
      recordings,
      editableDraft: true,
      cancelReleasesMic: true,
      lateTranscriptIgnored: true,
      errorsRecoverable: true,
      routeChangeCancels: true,
      closeTutorCancels: true,
      classroomPauses: true,
      teacherReceivesQuestion: true,
    });
    await context.close();
  }
  await writeFile(`${folder}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  await activePage
    ?.screenshot({ path: `${folder}/failure.png` })
    .catch(() => {});
  console.error(
    await activePage
      ?.locator("body")
      .innerText()
      .then((t) => t.slice(-1600))
      .catch(() => ""),
  );
  throw error;
} finally {
  await browser.close();
}
