import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const port = Number(process.env.KNOWRA_QA_PORT || 8021);
const base = `http://127.0.0.1:${port}`;
const python =
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python";
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
  {
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, KNOWRA_QA_PORT: String(port) },
  },
);
let browser;
const results = [];
try {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null) throw new Error("Isolated QA server exited");
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    if (i > 80) throw new Error("QA server did not start");
    await new Promise((r) => setTimeout(r, 150));
  }
  await mkdir("screenshots/auth-mcp", { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const password = randomBytes(24).toString("base64url");
    const email = `learner-${width}@example.test`;
    await page.goto(`${base}/learn/python/py-values`);
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await page.getByRole("link", { name: "免费注册" }).click();
    await page.getByLabel("怎么称呼你？").fill("探索者");
    await page.locator("#auth-email").fill(email);
    await page.locator("#auth-password").fill(password);
    await page.getByLabel("确认密码").fill(password + "x");
    await page.getByRole("button", { name: "创建账号", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("两次输入的密码不一致");
    await page.getByLabel("确认密码").fill(password);
    await page.screenshot({
      path: `screenshots/auth-mcp/signup-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "创建账号", exact: true }).click();
    await expect(page).toHaveURL(`${base}/learn/python/py-values`);
    await expect(page.locator(".account-page")).toHaveCount(0);
    const user = (
      await (await context.request.get(`${base}/api/auth/me`)).json()
    ).user;
    await page.goto(`${base}/settings`);
    await expect(
      page.getByRole("heading", { name: "连接我的 Agent" }),
    ).toBeVisible();
    await page.getByLabel("为 Agent 创建连接凭证").fill(`代码助手 ${width}`);
    await page.getByRole("button", { name: "创建连接", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const token = await page
      .getByLabel("访问凭证", { exact: true })
      .inputValue();
    assert(token.startsWith("knr_"));
    const persisted = await page.evaluate(() =>
      Object.values(localStorage).join("\n"),
    );
    assert(
      !persisted.includes(token),
      "PAT never persisted in browser storage",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".mcp-token-list")).toContainText(
      `代码助手 ${width}`,
    );
    await expect(page.locator("body")).not.toContainText(token);
    await page.locator("#mcp").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `screenshots/auth-mcp/settings-${width}.png`,
      fullPage: true,
    });
    // Use the real MCP HTTP endpoint, retaining credentials only in memory.
    const rpc = async (name, args) => {
      const response = await fetch(`${base}/api/mcp/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      assert.equal(response.status, 200);
      const result = (await response.json()).result;
      assert(!result.isError, "MCP tool succeeded");
      return result.structuredContent;
    };
    // First account has an isolated deterministic provider; the second receives its own.
    if (width === 1440) {
      const job = await rpc("create_course", {
        topic: "从提交学习共享状态",
        source_type: "commit",
        context: "diff --git a/store.js b/store.js",
        depth: "systematic",
      });
      await page.goto(job.jobUrl);
      await expect(
        page.getByRole("heading", { name: "共享状态课程", exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("button", { name: "开始学习", exact: true })
          .or(page.getByRole("link", { name: "开始学习", exact: true })),
      ).toBeVisible({ timeout: 20000 });
      await page.screenshot({
        path: "screenshots/auth-mcp/course-ready.png",
        fullPage: true,
      });
      const done = await rpc("get_course_generation", { job_id: job.id });
      assert.equal(done.status, "completed");
      assert(done.learningUrl.startsWith(base));
      await page.getByRole("link", { name: "查看课程", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "AI 编辑", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "AI 协助", exact: true }),
      ).toBeVisible();
      await page.goto(done.learningUrl);
      await expect(page).toHaveURL(done.learningUrl);
      await expect(page.locator("body")).not.toContainText("没有找到这个课程");
    }
    await page.goto(`${base}/settings`);
    await page
      .getByRole("button", { name: `撤销 代码助手 ${width}`, exact: true })
      .click();
    await expect(page.locator(".mcp-token-list")).toContainText("已撤销");
    const denied = await fetch(`${base}/api/mcp/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(denied.status, 401);
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole("link", { name: "免费注册" }).click();
    await page.getByLabel("怎么称呼你？").fill("另一个学习者");
    await page.locator("#auth-email").fill(`other-${width}@example.test`);
    await page.locator("#auth-password").fill(password);
    await page.getByLabel("确认密码").fill(password);
    await page.getByRole("button", { name: "创建账号", exact: true }).click();
    await expect(page).toHaveURL(`${base}/settings`);
    await expect(page.locator(".mcp-token-list")).not.toContainText(
      `代码助手 ${width}`,
    );
    const other = (
      await (await context.request.get(`${base}/api/workspace`)).json()
    ).state;
    assert.equal(other.customCourses.length, 0);
    const leakedWrite = await context.request.patch(`${base}/api/workspace`, {
      headers: { "X-Account-Id": user.id },
      data: {
        revision: 0,
        operations: [{ op: "set", path: ["name"], value: "stale account" }],
      },
    });
    assert.equal(leakedWrite.status(), 401);
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await page.locator("#auth-email").fill(email);
    await page.locator("#auth-password").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(`${base}/settings`);
    await expect(page.locator(".account-identity")).toContainText(email);
    // Exercise the actual login handoff, without a reload, including a slow workspace.
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await page.goto(`${base}/login`);
    let releaseWorkspace;
    const workspaceGate = new Promise((resolve) => {
      releaseWorkspace = resolve;
    });
    await page.route("**/api/workspace", async (route) => {
      if (route.request().method() === "POST") await workspaceGate;
      await route.continue();
    });
    const documentStart = await page.evaluate(() => performance.timeOrigin);
    await page.locator("#auth-email").fill(email);
    await page.locator("#auth-password").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(`${base}/`);
    await expect(page.locator(".workspace-loading")).toContainText(
      "正在打开学习空间",
    );
    releaseWorkspace();
    await expect(page.locator(".home-create")).toBeVisible();
    assert.equal(
      await page.evaluate(() => performance.timeOrigin),
      documentStart,
      "Login opens home without a document refresh",
    );
    await page.unroute("**/api/workspace");
    await page.screenshot({
      path: `screenshots/auth-mcp/login-home-${width}.png`,
    });
    // An authenticated visit to an auth URL also returns to the requested page.
    await page.goto(`${base}/login?returnTo=%2Fcourses`);
    await expect(page).toHaveURL(`${base}/courses`);
    await expect(page.locator(".reference-courses")).toBeVisible();
    assert.deepEqual(errors, []);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    results.push({
      width,
      reducedMotion: width === 1024,
      auth: "passed",
      loginHandoffWithoutRefresh: "passed, including slow workspace",
      isolatedAccounts: "passed",
      tokenRevocation: "passed",
      mcpCourseLink:
        width === 1440 ? "passed with deterministic model" : "covered at 1440",
    });
    await context.close();
  }
  await writeFile(
    "screenshots/auth-mcp/results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  server.kill();
}
