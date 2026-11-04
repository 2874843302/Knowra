import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";

const folder = ".test/report/model-profiles";
await mkdir(folder, { recursive: true });
const secret = () => randomBytes(24).toString("hex");
let profiles = [
  {
    id: "default",
    name: "日常讲解",
    model: "fast-model",
    baseUrl: "https://fast.example.test/v1",
    apiKey: secret(),
  },
  {
    id: "reasoning",
    name: "深度思考",
    model: "reason-model",
    baseUrl: "https://reason.example.test/v1",
    apiKey: secret(),
  },
];
const secrets = profiles.map((p) => p.apiKey);
let activeId = "default";
const publicConfig = () => {
  const list = profiles.map(({ apiKey, ...p }) => ({
    ...p,
    configured: Boolean(apiKey),
  }));
  return {
    configured: false,
    baseUrl: "",
    model: "",
    ...list.find((p) => p.id === activeId),
    activeId,
    profiles: list,
  };
};
const cid = randomUUID();
let state = initialState(),
  revision = 0;
state.conversations = [
  {
    id: cid,
    title: "变量学习",
    providerId: "default",
    date: new Date().toISOString(),
    messages: [
      { role: "user", content: "什么是变量？" },
      { role: "assistant", content: "变量保存可以再次使用的数据。" },
    ],
  },
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const errors = [],
  requests = [],
  selections = [];
await context.route("**/api/auth/me", (r) =>
  r.fulfill({
    json: {
      user: { id: "models-qa", name: "学习者", workspaceId: "models-qa" },
    },
  }),
);
await context.route("**/api/auth/tokens", (r) =>
  r.fulfill({ json: { tokens: [] } }),
);
await context.route("**/api/course-jobs", (r) =>
  r.fulfill({ json: { jobs: [] } }),
);
await context.route("**/api/workspace", (r) => {
  if (r.request().method() === "PATCH") {
    for (const op of r.request().postDataJSON().operations) {
      let target = state;
      for (const part of op.path.slice(0, -1)) target = target[part] ??= {};
      if (op.op === "remove") delete target[op.path.at(-1)];
      else target[op.path.at(-1)] = op.value;
    }
    revision++;
  }
  return r.fulfill({
    json: { state, revision, updatedAt: new Date().toISOString() },
  });
});
await context.route("**/api/provider{,/**}", (r) => {
  const req = r.request(),
    method = req.method(),
    path = new URL(req.url()).pathname;
  if (method === "GET") return r.fulfill({ json: publicConfig() });
  if (path.endsWith("/active")) {
    activeId = req.postDataJSON().id;
    selections.push(activeId);
  } else if (method === "DELETE") {
    const id = path.split("/").at(-1);
    profiles = profiles.filter((p) => p.id !== id);
    if (activeId === id) activeId = profiles[0]?.id || null;
  } else {
    const input = req.postDataJSON();
    const previous = profiles.find((p) => p.id === input.id);
    const updated = {
      ...input,
      id: previous?.id || randomUUID(),
      apiKey: input.apiKey || previous?.apiKey,
    };
    if (previous)
      profiles = profiles.map((p) => (p.id === previous.id ? updated : p));
    else profiles.push(updated);
  }
  return r.fulfill({
    status: method === "POST" ? 201 : 200,
    json: publicConfig(),
  });
});
let releaseAnswer;
await context.route("**/api/ai", async (r) => {
  const payload = r.request().postDataJSON();
  requests.push(payload);
  await new Promise((resolve) => {
    releaseAnswer = resolve;
  });
  await r.fulfill({ json: { content: `回答 ${requests.length}：示例说明。` } });
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5173/settings#ai");
  await expect(page.locator(".model-settings-item")).toHaveCount(2);
  await page.getByRole("button", { name: "添加模型", exact: true }).click();
  await page.getByLabel("显示名称", { exact: true }).fill("代码伙伴");
  await page.locator("#ai-base-url").fill("https://code.example.test/v1");
  await page.getByLabel("模型名称", { exact: true }).fill("code-model");
  const extraKey = secret();
  secrets.push(extraKey);
  await page.getByLabel("API 密钥", { exact: true }).fill(extraKey);
  await page.getByRole("button", { name: "保存模型", exact: true }).click();
  await expect(page.locator(".model-settings-item")).toHaveCount(3);
  await expect(page.locator(".model-settings-form")).toHaveCount(0);
  await page.getByRole("button", { name: "编辑深度思考", exact: true }).click();
  await expect(page.getByLabel("API 密钥", { exact: true })).toHaveValue("");
  await page.getByLabel("显示名称", { exact: true }).fill("深入推理");
  await page.getByRole("button", { name: "保存模型", exact: true }).click();
  const reasoning = page
    .locator(".model-settings-item")
    .filter({ hasText: "深入推理" });
  await reasoning
    .getByRole("button", { name: "设为默认", exact: true })
    .click();
  await expect(
    reasoning.getByRole("button", { name: "默认模型", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "删除代码伙伴", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await expect(page.locator(".model-settings-item")).toHaveCount(3);
  await page.screenshot({ path: `${folder}/settings.png` });
  await page.goto("http://127.0.0.1:5173/");
  await expect(
    page.getByRole("button", { name: "切换模型，当前：深入推理", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "切换模型，当前：深入推理", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /日常讲解/ }).click();
  await expect(
    page.getByRole("button", { name: "切换模型，当前：日常讲解", exact: true }),
  ).toBeVisible();

  await page.goto(`http://127.0.0.1:5173/assistant/${cid}`);
  const input = page.getByRole("textbox", {
    name: "输入你的问题",
    exact: true,
  });
  // Match the existing composer label if its copy changes independently.
  const composer = (await input.count())
    ? input
    : page.locator(".assistant-compose textarea");
  await composer.fill("换个例子讲讲");
  const beforeSelection = selections.length;
  await page
    .getByRole("button", { name: "切换模型，当前：日常讲解", exact: true })
    .click();
  await page.screenshot({
    path: `${folder}/switcher.png`,
    animations: "disabled",
  });
  await page.getByRole("menuitem", { name: /深入推理/ }).click();
  await expect(composer).toHaveValue("换个例子讲讲");
  await expect(
    page.getByText("变量保存可以再次使用的数据。", { exact: true }),
  ).toBeVisible();
  assert.equal(
    selections.length,
    beforeSelection,
    "Conversation switch does not change the workspace default",
  );
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "切换模型，当前：深入推理", exact: true }),
  ).toBeDisabled();
  assert.equal(requests[0].provider_id, "reasoning");
  assert(
    requests[0].messages.some((m) =>
      m.content.includes("变量保存可以再次使用的数据。"),
    ),
  );
  releaseAnswer();
  await expect(
    page.getByText("回答 1：示例说明。", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => state.conversations[0].providerId).toBe("reasoning");
  await expect.poll(() => state.conversations[0].messages.length).toBe(4);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "切换模型，当前：深入推理", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("回答 1：示例说明。", { exact: true }),
  ).toBeVisible();
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 960 });
    await page
      .getByRole("button", { name: "切换模型，当前：深入推理", exact: true })
      .focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu")).toBeVisible();
    assert((await page.getByRole("menu").boundingBox()).x >= 0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.goto("http://127.0.0.1:5173/settings#ai");
  await page.getByRole("button", { name: "删除深入推理", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "删除模型", exact: true })
    .click();
  await expect(page.locator(".model-settings-item")).toHaveCount(2);
  await page.goto(`http://127.0.0.1:5173/assistant/${cid}`);
  await expect(
    page.getByRole("button", { name: "切换模型，当前：日常讲解", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("回答 1：示例说明。", { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    Object.values(localStorage).join("\n"),
  );
  for (const key of secrets) assert(!stored.includes(key));
  assert.deepEqual(errors, []);
  const result = {
    addEditDelete: true,
    defaultAndHomepageSwitch: true,
    conversationSwitchPreservesHistoryAndDraft: true,
    explicitModelRequest: true,
    disabledWhileGenerating: true,
    persistsAfterReload: true,
    deletedModelFallback: true,
    noKeysInBrowserStorage: true,
    desktop1440And1024: true,
    errors,
  };
  await writeFile(`${folder}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: `${folder}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
