import { chromium, request, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { initialState, validateOutline } from "../src/data.js";

const root = process.cwd();
const output = path.join(root, ".test/report/tts");
await mkdir(output, { recursive: true });
await mkdir(".test/runtime", { recursive: true });
await mkdir(".test/auth", { recursive: true });
const directory = await mkdtemp(path.join(root, ".test/runtime/tts-"));
const base = "http://127.0.0.1:8123";
const python = path.join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
// All accounts and cached speech belong to an isolated test database.
const child = spawn(
  python,
  [
    "-c",
    "import os,sys;sys.path.insert(0,'backend');from pathlib import Path;import uvicorn;from app.main import create_app;from app.core.config import Settings;uvicorn.run(create_app(Settings(knowra_data_dir=Path(os.environ['KNOWRA_DATA_DIR']),knowra_tts_model_dir=Path('.local/tts/models/kokoro-int8-multi-lang-v1_1').resolve(),_env_file=None)),host='127.0.0.1',port=8123,log_level='error')",
  ],
  {
    cwd: root,
    env: { ...process.env, KNOWRA_DATA_DIR: directory, PYTHONUTF8: "1" },
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let serviceErrors = "";
child.stderr.on("data", (data) => {
  serviceErrors += data;
});
let browser, api, context, page;
const results = [];
try {
  api = await request.newContext({ baseURL: base });
  await expect
    .poll(
      async () => (await api.get("/api/health").catch(() => null))?.status(),
      { timeout: 20000 },
    )
    .toBe(200);
  const credentials = {
    email: `tts-${randomBytes(6).toString("hex")}@example.test`,
    password: randomBytes(24).toString("base64url"),
    name: "语音验证",
  };
  assert.equal(
    (await api.post("/api/auth/register", { data: credentials })).status(),
    201,
  );
  const me = await api.get("/api/auth/me");
  assert.equal(me.status(), 200);
  const { user } = await me.json();
  const fingerprint = createHash("sha256")
    .update((await api.storageState()).cookies[0].value)
    .digest("hex")
    .slice(0, 12);
  await writeFile(
    ".test/auth/tts-context.md",
    `Fixture cookie session; ${base}; verified ${new Date().toISOString()}; SHA256 prefix ${fingerprint}. No live user data.\n`,
  );
  const status = await (await api.get("/api/tts/status")).json();
  assert.equal(status.ready, true);
  const primaryVoice = status.defaultVoice;
  assert.equal(primaryVoice, "zf_006");
  assert.ok(status.voices.some((v) => v.id === "friendly-female"));
  assert.ok(status.voices.some((v) => v.id === primaryVoice));
  results.push({ case: "local-model-ready", pass: true, model: status.model });
  const anonymous = await request.newContext({ baseURL: base });
  assert.equal(
    (
      await anonymous.post("/api/tts/speech", { data: { text: "测试。" } })
    ).status(),
    401,
  );
  await anonymous.dispose();
  assert.equal(
    (
      await api.post("/api/tts/speech", {
        data: { text: "测试。", voice: "../invalid" },
      })
    ).status(),
    422,
  );
  results.push({
    case: "unauthenticated-and-invalid-voice",
    pass: true,
    statuses: [401, 422],
  });

  const narration =
    "变量就像贴好标签的盒子。接着把数字放进盒子里。然后看看盒子上的名字。用这个名字就能找到数据。还可以替换盒子里的内容。最后取出盒子中的数据。";
  const text = "变量就像贴好标签的盒子。";
  for (const [voice, expected] of [
    [primaryVoice, "miss"],
    [primaryVoice, "hit"],
    ["zm_009", "miss"],
  ]) {
    const start = performance.now();
    const generation = api.post("/api/tts/speech", {
      data: { text, voice },
      timeout: 90000,
    });
    if (voice === primaryVoice && expected === "miss") {
      const healthStarted = performance.now();
      const health = await api.get("/api/health", { timeout: 5000 });
      assert.equal(health.status(), 200);
      results.push({
        case: "http-responsive-during-voice-preparation",
        milliseconds: Math.round(performance.now() - healthStarted),
        pass: true,
      });
    }
    const response = await generation;
    assert.equal(response.status(), 200, await response.text());
    const body = await response.body();
    assert.equal(body.subarray(0, 4).toString(), "RIFF");
    assert.equal(response.headers()["x-speech-cache"], expected);
    assert.equal(response.headers()["x-speech-voice"], voice);
    assert.equal(response.headers()["x-speech-fallback"], "false");
    assert.ok(Number(response.headers()["x-audio-duration"]) > 1);
    const measurement = {
      case: "real-synthesis",
      voice,
      actualVoice: response.headers()["x-speech-voice"],
      cache: expected,
      milliseconds: Math.round(performance.now() - start),
      seconds: Number(response.headers()["x-audio-duration"]),
      bytes: body.length,
      pass: true,
    };
    results.push(measurement);
    console.log(measurement);
    if (expected === "miss")
      await writeFile(path.join(output, `${voice}.wav`), body);
  }

  const course = {
    id: "qa-local-tts",
    title: "本地语音课堂",
    units: validateOutline({
      title: "本地语音课堂",
      units: [
        {
          title: "理解变量",
          lessons: [
            {
              title: "贴标签的盒子",
              content: "## 理解变量\n\n变量保存数据。",
              teaching: {
                steps: [
                  {
                    title: "理解变量",
                    board:
                      "变量就像贴好标签的盒子。\n\n可以往里面存数据，也可以取出数据。",
                    narration,
                  },
                ],
              },
              quiz: {
                type: "true_false",
                question: "变量可以保存数据吗？",
                answer: true,
                explanation: "变量用来保存数据。",
              },
            },
          ],
        },
      ],
    }),
  };
  const lesson = course.units[0].lessons[0];
  let state = initialState(),
    revision = 0;
  state.customCourses = [course];
  state.appearance.narrationVoice = true;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: "reduce",
  });
  const speechRequests = [];
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/tts/")) {
      const start = performance.now();
      const response = await api.fetch(url.pathname, {
        method: route.request().method(),
        data: route.request().postDataJSON() || undefined,
        timeout: 90000,
      });
      if (url.pathname.endsWith("/speech"))
        speechRequests.push({
          ...route.request().postDataJSON(),
          at: start,
          done: performance.now(),
          status: response.status(),
          cache: response.headers()["x-speech-cache"],
        });
      return route.fulfill({ response });
    }
    if (url.pathname === "/api/auth/me")
      return route.fulfill({ json: { user } });
    if (url.pathname === "/api/provider")
      return route.fulfill({ json: { configured: false } });
    if (url.pathname === "/api/workspace") {
      if (route.request().method() === "PATCH") {
        for (const op of route.request().postDataJSON().operations) {
          let target = state;
          for (const part of op.path.slice(0, -1)) target = target[part];
          if (op.op === "remove") delete target[op.path.at(-1)];
          else target[op.path.at(-1)] = op.value;
        }
        revision++;
      }
      return route.fulfill({
        json: { state, revision, updatedAt: new Date().toISOString() },
      });
    }
    if (url.pathname === "/api/course-jobs")
      return route.fulfill({ json: { jobs: [] } });
    return route.abort();
  });
  await context.addInitScript(() => {
    window.__audios = [];
    window.__created = [];
    window.__mediaEvents = [];
    const NativeAudio = window.Audio;
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      window.__created.push(audio);
      for (const name of [
        "loadedmetadata",
        "play",
        "pause",
        "error",
        "ended",
        "emptied",
      ])
        audio.addEventListener(name, () =>
          window.__mediaEvents.push({
            name,
            time: performance.now(),
            error: audio.error?.message,
            audio: window.__created.indexOf(audio),
          }),
        );
      return audio;
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!window.__audios.includes(this)) window.__audios.push(this);
      return play.call(this);
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak() {
          throw new Error("Native TTS must never be called");
        },
        cancel() {},
      },
    });
  });
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error("Browser", message.text());
  });
  await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${lesson.id}`);
  await expect
    .poll(() => speechRequests.filter((r) => r.voice === primaryVoice).length, {
      timeout: 30000,
    })
    .toBeGreaterThanOrEqual(2);
  assert.equal(await page.evaluate(() => window.__created.length), 0);
  results.push({
    case: "speech-prepares-before-play-without-autoplay",
    pass: true,
  });
  const playStarted = performance.now();
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__audios.at(-1)?.currentTime || 0), {
      timeout: 30000,
    })
    .toBeGreaterThan(0.3);
  assert.equal(
    await page.evaluate(() => window.__audios.at(-1).playbackRate),
    1.25,
  );
  results.push({
    case: "fluent-female-and-faster-default-rate",
    pass: true,
    voice: primaryVoice,
    startupMilliseconds: Math.round(performance.now() - playStarted),
  });
  const caption = page.locator(".lesson-subtitle-text");
  await expect.poll(() => caption.textContent()).not.toBe("");
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  const paused = await page.evaluate(() => ({
    time: window.__audios.at(-1).currentTime,
    paused: window.__audios.at(-1).paused,
    text: document.querySelector(".lesson-subtitle-text").textContent,
  }));
  assert.equal(paused.paused, true);
  await page.waitForTimeout(800);
  assert.equal(await caption.textContent(), paused.text);
  assert.ok(
    Math.abs(
      (await page.evaluate(() => window.__audios.at(-1).currentTime)) -
        paused.time,
    ) < 0.03,
  );
  results.push({ case: "audio-and-subtitle-pause-together", pass: true });
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__audios.at(-1).currentTime))
    .toBeGreaterThan(paused.time + 0.15);
  await page.getByRole("button", { name: "白板设置", exact: true }).click();
  await page.getByRole("combobox", { name: "讲解速度", exact: true }).click();
  await page.getByRole("option", { name: "2×", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__audios.at(-1).playbackRate))
    .toBe(2);
  await page.getByRole("button", { name: "关闭白板设置", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__audios.length), { timeout: 30000 })
    .toBeGreaterThan(1);
  assert.equal(
    speechRequests.filter((r) => r.text === text && r.voice === primaryVoice)
      .length,
    1,
  );
  results.push({ case: "resume-and-speed-without-regeneration", pass: true });
  await expect
    .poll(() => page.evaluate(() => window.__audios.length), { timeout: 30000 })
    .toBeGreaterThanOrEqual(4);
  const gaps = await page.evaluate(() =>
    [0, 1, 2].map((audio) => {
      const end = window.__mediaEvents.find(
        (e) => e.name === "ended" && e.audio === audio,
      );
      const next = window.__mediaEvents.find(
        (e) => e.name === "play" && e.audio === audio + 1,
      );
      return Math.round(next.time - end.time);
    }),
  );
  for (const gap of gaps)
    assert.ok(gap >= 330 && gap < 1400, `2x sentence gap was ${gap} ms`);
  results.push({
    case: "continuous-real-model-speech-keeps-deliberate-pause-without-generation-stalls",
    milliseconds: gaps,
    pass: true,
  });
  assert.ok(speechRequests.some((r) => r.text === "接着把数字放进盒子里。"));
  results.push({ case: "following-sentences-prefetched", pass: true });
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  await page.getByRole("button", { name: "白板设置", exact: true }).click();
  await page.getByRole("combobox", { name: "讲解音色", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "亲切女声 · 高品质", exact: true }),
  ).toBeVisible();
  results.push({ case: "quality-female-remains-selectable", pass: true });
  await page
    .getByRole("option", { name: "中文男声 · 01", exact: true })
    .click();
  await page.getByRole("button", { name: "关闭白板设置", exact: true }).click();
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await expect
    .poll(() => speechRequests.some((r) => r.voice === "zm_009"), {
      timeout: 30000,
    })
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__audios.at(-1)?.paused))
    .toBe(false);
  results.push({ case: "voice-selection-applied", pass: true });
  await page.screenshot({ path: path.join(output, "classroom.png") });
  const question = page.getByRole("region", { name: "课堂提问", exact: true });
  await expect(question).toBeVisible({ timeout: 30000 });
  await question.getByRole("button", { name: /正确/ }).click();
  await question.getByRole("button", { name: "完成本讲", exact: true }).click();
  await expect(question).toContainText("本讲讲解已完成");
  const plays = await page.evaluate(
    () => window.__mediaEvents.filter((e) => e.name === "play").length,
  );
  await page.waitForTimeout(1000);
  assert.equal(
    await page.evaluate(
      () => window.__mediaEvents.filter((e) => e.name === "play").length,
    ),
    plays,
  );
  results.push({
    case: "terminal-answer-completes-without-restarting-audio",
    pass: true,
  });
  await page.goto("http://127.0.0.1:5173/courses");
  assert.equal(
    await page.evaluate(() => window.__audios.every((audio) => audio.paused)),
    true,
  );
  assert.deepEqual(errors, []);
  results.push({
    case: "no-native-voice-no-late-audio-no-browser-errors",
    pass: true,
  });
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      { date: new Date().toISOString(), results, speechRequests },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(output, "verification.md"),
    `# Local model TTS verification\n\n${new Date().toISOString()} Windows, Chrome desktop 1440×960. Isolated FastAPI/SQLite fixture ${base}; real ${status.model} model, default ${primaryVoice}, cookie authentication, account SHA256 prefix ${fingerprint}.\n\nContract: backend/app/api/tts_routes.py, services/tts.py. GET /api/tts/status and POST /api/tts/speech ({text,voice}); WAV output. Test account creation authorized as part of implementation verification; no real account data used. Isolated database: ${directory}.\n\n${results.map((r) => `- PASS ${JSON.stringify(r)}`).join("\n")}\n\nExact speech inputs and response metadata: results.json. Sample WAVs included.\n`,
  );
  console.log(`PASS ${results.length} checks. ${output}`);
} catch (error) {
  if (page) {
    console.error(
      await page.evaluate(() => ({
        text: document.body.innerText.slice(-3500),
        audio: window.__audios.map((a) => ({
          paused: a.paused,
          duration: a.duration,
          currentTime: a.currentTime,
          src: a.src,
          error: a.error?.message,
        })),
        created: window.__created.map((a) => ({
          readyState: a.readyState,
          src: a.src,
          error: a.error?.message,
        })),
        events: window.__mediaEvents,
      })),
    );
    await page.screenshot({ path: path.join(output, "failure.png") });
  }
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  await api?.dispose();
  if (process.platform === "win32")
    await new Promise((resolve) => {
      const stop = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      stop.on("exit", resolve);
    });
  else child.kill();
  if (serviceErrors.includes("Traceback")) console.error(serviceErrors);
}
