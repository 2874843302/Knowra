import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const port = Number(process.env.KNOWRA_QA_PORT || 8031);
const base = `http://127.0.0.1:${port}`;
const python =
  process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python";
const today = new Date().toLocaleDateString("sv-SE", {
  timeZone: "Asia/Shanghai",
});
const server = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "qa_auth_server:app",
    "--app-dir",
    "scripts",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--no-access-log",
  ],
  { stdio: "ignore", windowsHide: true, env: { ...process.env, KNOWRA_QA_PORT: String(port) } },
);
let browser;
const results = [];
const record = (name, extra = {}) => {
  results.push({ case: name, pass: true, ...extra });
  console.log(`PASS ${name}`);
};
try {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null) throw new Error("Isolated QA server exited");
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    if (i > 80) throw new Error("QA server did not start");
    await new Promise((r) => setTimeout(r, 150));
  }
  await mkdir("screenshots/study-time", { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const password = randomBytes(24).toString("base64url");
  await page.goto(`${base}/learn/python/py-values`);
  await page.getByRole("link", { name: "免费注册" }).click();
  await page.getByLabel("怎么称呼你？").fill("计时验证");
  await page.locator("#auth-email").fill(`timing-${randomBytes(5).toString("hex")}@example.test`);
  await page.locator("#auth-password").fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/python\/py-values/);
  await page.getByRole("button", { name: "我已保存" }).click();
  await expect(page.getByRole("button", { name: "开始讲解" }).first()).toBeVisible();
  const user = (await (await context.request.get(`${base}/api/auth/me`)).json()).user;
  const fingerprint = createHash("sha256").update(user.id).digest("hex").slice(0, 12);

  const workspace = async () =>
    (await (await context.request.get(`${base}/api/workspace`)).json());
  const setStudyLog = async (seconds) => {
    const { revision } = await workspace();
    const response = await context.request.patch(`${base}/api/workspace`, {
      data: {
        revision,
        operations: [{ op: "set", path: ["studyLog", today], value: seconds }],
      },
    });
    assert.equal(response.status(), 200, await response.text());
  };

  await page.getByRole("button", { name: "开始讲解" }).first().click();
  await expect
    .poll(() => page.getByRole("button", { name: "暂停讲解" }).first().isVisible())
    .toBe(true);
  await page.waitForTimeout(34000);
  const logged = (await workspace()).state.studyLog?.[today] || 0;
  assert.ok(logged >= 30, `expected >=30s of study time, got ${logged}`);
  await page.screenshot({ path: "screenshots/study-time/classroom-playing.png" });
  record("classroom-playback-persists-seconds", { seconds: logged, account: fingerprint });

  await page.goto(`${base}/`);
  await setStudyLog(13 * 60);
  await page.reload();
  const goal = page.locator(".today-goal strong");
  await expect(goal).toHaveText("13 / 30 分钟");
  await expect(page.locator(".today-goal-hint")).toHaveCount(0);
  await expect(page.locator(".today-goal [role=progressbar]")).toHaveAttribute(
    "aria-valuenow",
    "43",
  );
  await page.screenshot({ path: "screenshots/study-time/goal-13-minutes.png" });
  record("home-goal-reports-elapsed-minutes", { text: await goal.textContent() });

  await setStudyLog(0);
  await page.reload();
  await expect(page.locator(".today-goal strong")).toHaveText("0 / 30 分钟");
  await expect(page.locator(".today-goal-hint")).toHaveText("进入课堂后自动累计学习时长");
  await page.screenshot({ path: "screenshots/study-time/goal-empty-hint.png" });
  record("empty-goal-explains-source", {});

  await setStudyLog(7 * 60);
  await page.reload();
  await expect(page.locator(".today-goal strong")).toHaveText("7 / 30 分钟");
  record("reload-keeps-server-study-log", {});

  assert.deepEqual(errors, [], `page errors: ${errors.join("; ")}`);
} finally {
  await browser?.close();
  server.kill();
  await writeFile(
    "qa-study-time-results.json",
    JSON.stringify({ verifiedAt: new Date().toISOString(), today, results }, null, 2),
  );
}
