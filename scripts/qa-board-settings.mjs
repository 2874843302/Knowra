import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/board-settings", { recursive: true });
try {
  for (const width of [1440, 1920, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1920 ? "reduce" : "no-preference",
    });
    await context.addInitScript(
      ({ workspace, seed }) => {
        if (!localStorage.getItem("knowra-workspace-id")) {
          localStorage.setItem("knowra-workspace-id", workspace);
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
        }
      },
      { workspace: crypto.randomUUID(), seed: initialState() },
    );
    await context.route("**/api/provider", (route) =>
      route.fulfill({ json: { configured: false } }),
    );
    await context.route("**/api/ai", (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/learn/python/py-values");
    await page.evaluate(() => document.fonts.ready);
    const gear = page.getByRole("button", { name: "白板设置", exact: true });
    const panel = page.getByRole("dialog", { name: "白板设置", exact: true });
    const open = async () => {
      await gear.click();
      await expect(panel).toBeVisible();
      await expect(panel).toHaveCSS("transform", "none");
    };
    await expect(gear).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "白板字体", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".board-modebar button")).toHaveCount(4);
    await page.screenshot({
      path: `screenshots/board-settings/clean-${width}.png`,
    });
    await open();
    const rect = await panel.boundingBox();
    assert(
      rect.x >= 0 &&
        rect.x + rect.width <= width &&
        rect.y + rect.height <= 1000,
    );
    await page.getByRole("combobox", { name: "白板字体", exact: true }).click();
    await page.getByRole("option", { name: /清晰黑体/ }).click();
    await expect(panel).toBeVisible();
    await expect(page.locator(".guided-board")).toHaveAttribute(
      "data-board-font",
      "sans",
    );
    await page.getByRole("button", { name: "放大白板", exact: true }).click();
    await expect(page.locator(".board-document")).toHaveCSS("zoom", "1.1");
    assert.equal(
      (await panel.boundingBox()).width,
      rect.width,
      "settings scaled with canvas",
    );
    await page.getByRole("button", { name: "重置缩放", exact: true }).click();
    await expect(page.locator(".board-document")).toHaveCSS("zoom", "1");
    await page.getByRole("combobox", { name: "讲解速度", exact: true }).click();
    await page.getByRole("option", { name: "1.5×", exact: true }).click();
    const voice = page.getByRole("switch", { name: "讲解朗读", exact: true });
    await voice.focus();
    await page.keyboard.press("Space");
    await expect(voice).toHaveAttribute("aria-checked", "true");
    await voice.click();
    await expect(voice).toHaveAttribute("aria-checked", "false");
    await page.screenshot({
      path: `screenshots/board-settings/panel-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(gear).toBeFocused();
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect
      .poll(async () =>
        Number(
          await page
            .locator(".teaching-writing")
            .first()
            .getAttribute("data-write-progress"),
        ),
      )
      .toBeGreaterThan(0.1);
    await open();
    await page.getByRole("combobox", { name: "白板字体", exact: true }).click();
    await page.getByRole("option", { name: /书卷宋体/ }).click();
    await expect(
      page.getByRole("button", { name: "暂停讲解", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await open();
    await page.getByRole("tab", { name: "连续讲义", exact: true }).click();
    await expect(page.locator(".lesson-stage")).toHaveCount(0);
    await page.getByRole("tab", { name: "连续白板", exact: true }).click();
    await expect(page.locator(".lesson-stage")).toBeVisible();
    await page.getByRole("button", { name: "下一步讲解", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".tutor-teaching")).toHaveAttribute(
      "data-teaching-step",
      "1",
    );
    await open();
    await page.getByRole("button", { name: /查看摘录/ }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".board-clips")).toBeVisible();
    await open();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "下载本节讲义", exact: true })
      .click();
    assert((await download).suggestedFilename().endsWith(".md"));
    await expect(panel).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".guided-board")).toHaveAttribute(
      "data-board-font",
      "serif",
    );
    await open();
    await expect(
      page.getByRole("combobox", { name: "讲解速度", exact: true }),
    ).toContainText("1.5×");
    await page
      .getByRole("button", { name: "关闭白板设置", exact: true })
      .click();
    await expect(gear).toBeFocused();
    await open();
    await page
      .locator(".class-toolbar > div")
      .first()
      .click({ position: { x: 200, y: 20 } });
    await expect(panel).toHaveCount(0);
    assert.deepEqual(errors, []);
    evidence.push({ width, rect, errors });
    await context.close();
    console.log(
      `PASS ${width}: clean toolbar, settings keyboard/focus, nested selectors, font/rate persistence, zoom isolation, playback continuity, views, excerpts and download`,
    );
  }
  await writeFile(
    "screenshots/board-settings/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
