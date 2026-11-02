import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5173/");
  await expect(page.locator(".welcome-copy")).toBeVisible();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("knowra-workspace-v1"));
    state.joined = [];
    localStorage.setItem("knowra-workspace-v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "找到你的第一门课" }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:5173/learn/linear-algebra/matrices");
  await page.getByRole("slider", { name: /横向缩放/ }).focus();
  await page.keyboard.press("Home");
  await page.getByRole("slider", { name: /纵向缩放/ }).focus();
  await page.keyboard.press("Home");
  await expect(page.locator(".lab-result")).toContainText("4.00 倍");
  const endpoint = await page
    .locator('line[marker-end="url(#vector-blue)"]')
    .evaluate((el) => Number(el.getAttribute("y2")));
  assert.ok(
    endpoint > 0 && endpoint < 310,
    "Transformed vector remains inside the drawing",
  );
  await page.route("**/api/provider", (route) =>
    route.fulfill({ json: { configured: true, model: "fixture-model" } }),
  );
  await page.route("**/api/ai", (route) =>
    route.fulfill({ status: 502, json: { error: "Fixture failure" } }),
  );
  await page.goto("http://127.0.0.1:5173/assistant");
  await page.getByRole("textbox", { name: "输入问题" }).fill("保留这个问题");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(page).toHaveURL(/assistant\//);
  await expect(page.getByRole("textbox", { name: "输入问题" })).toHaveValue(
    "保留这个问题",
  );
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("knowra-workspace-v1")).conversations[0]
          .messages.length,
    ),
    0,
  );
  await page.unroute("**/api/ai");
  await page.route("**/api/ai", (route) =>
    route.fulfill({ json: { content: "测试回复" } }),
  );
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(page.locator(".chat-message.assistant")).toContainText(
    "测试回复",
  );
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("knowra-workspace-v1")).conversations[0]
          .messages.length,
    ),
    2,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS production smoke: empty enrollment, vector bounds, failed question retained, retry without duplicate messages",
  );
} finally {
  await browser.close();
}
