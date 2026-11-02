import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, lessonsOf, initialState } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
const lesson = lessonsOf(catalog.find((course) => course.id === "python"))[0];
const base = lessonSequence(lesson.content, lesson);
await mkdir("screenshots/full-canvas", { recursive: true });
try {
  for (const width of [1440, 1920, 1024]) {
    const seed = initialState();
    seed.lessonPlayback = {
      "python/py-values": {
        signature: base.signature,
        step: 1,
        revealedStep: 1,
        elapsed: base.steps[1].duration,
        revealedProgress: 1,
        revealedNarrationProgress: 1,
        answers: {},
        rate: 1,
      },
    };
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1920 ? "reduce" : "no-preference",
    });
    await context.addInitScript(
      ({ seed, workspace }) => {
        if (!localStorage.getItem("knowra-workspace-id")) {
          localStorage.setItem("knowra-workspace-id", workspace);
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
        }
      },
      { seed, workspace: crypto.randomUUID() },
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
    const viewport = page.locator(".board-scroll");
    await expect(viewport).toHaveAttribute("data-canvas-mode", "pan");
    await expect(
      page.getByRole("button", { name: "展开导师", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".class-tutor")).toBeHidden();
    await page
      .locator(".board-surface")
      .evaluate((el) => (window.originalCanvas = el));
    const geometry = () =>
      page.evaluate(() => {
        const rect = (selector) =>
          document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          viewport: rect(".board-scroll"),
          document: rect(".board-document"),
          surface: rect(".board-surface"),
          columns: getComputedStyle(document.querySelector(".board-surface"))
            .gridTemplateColumns,
          padding: getComputedStyle(document.querySelector(".board-scroll"))
            .paddingRight,
          tools: rect(".board-modebar"),
        };
      });
    const before = await geometry();
    assert.deepEqual(
      [
        before.viewport.x,
        before.viewport.y,
        before.viewport.width,
        before.viewport.height,
      ],
      [0, 0, width, 1000],
    );
    assert.equal(before.document.width, width);
    assert.equal(before.padding, "0px");
    assert.equal(
      await page.locator(".board-document .board-modebar").count(),
      0,
    );
    assert(
      await page.evaluate(
        () =>
          !!document
            .elementFromPoint(innerWidth / 2, 30)
            ?.closest(".board-scroll"),
      ),
      "transparent toolbar gap blocked the canvas",
    );
    await page.mouse.move(width - 60, 650);
    await page.mouse.down();
    await page.mouse.move(width - 220, 570, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.locator(".board-surface").evaluate((el) => el.style.transform),
      )
      .toContain("-160px");
    assert.equal(
      (await geometry()).tools.y,
      before.tools.y,
      "canvas drag moved floating tools",
    );
    await page
      .getByRole("button", { name: "回到当前讲解", exact: true })
      .click();
    await page.screenshot({
      path: `screenshots/full-canvas/canvas-${width}.png`,
    });
    const settled = await geometry();
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    await expect(page.locator(".class-tutor")).toBeVisible();
    const opened = await geometry();
    assert.equal(opened.document.width, settled.document.width);
    assert.equal(opened.surface.width, settled.surface.width);
    assert.equal(
      opened.columns,
      settled.columns,
      "assistant changed board column layout",
    );
    assert.equal(opened.padding, "0px");
    await page.getByRole("button", { name: "展开大纲", exact: true }).click();
    await expect(page.locator(".class-outline")).toBeVisible();
    assert.equal((await geometry()).surface.width, settled.surface.width);
    await page.getByRole("button", { name: "收起大纲", exact: true }).click();
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "暂停讲解", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "我的笔记", exact: true }).click();
    const notes = page.getByRole("dialog", {
      name: "我的课堂笔记",
      exact: true,
    });
    await expect(notes).toBeVisible();
    await expect(
      page.getByRole("button", { name: "开始讲解", exact: true }),
    ).toBeVisible();
    assert(
      await page
        .locator(".board-surface")
        .evaluate((el) => el === window.originalCanvas),
      "opening notes remounted the board",
    );
    await page
      .getByRole("textbox", { name: "我的课堂笔记", exact: true })
      .fill("我把类型理解成数据能做哪些运算。");
    await page.screenshot({
      path: `screenshots/full-canvas/overlays-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(notes).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "课堂板书", exact: true }),
    ).toBeFocused();
    await page.getByRole("tab", { name: "我的笔记", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "我的课堂笔记", exact: true }),
    ).toHaveValue("我把类型理解成数据能做哪些运算。");
    await page
      .getByRole("button", { name: "关闭课堂面板", exact: true })
      .click();
    await page.getByRole("tab", { name: "独立练习", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "独立练习", exact: true }),
    ).toBeVisible();
    assert(
      await page
        .locator(".board-surface")
        .evaluate((el) => el === window.originalCanvas),
    );
    await page
      .getByRole("button", { name: "关闭课堂面板", exact: true })
      .click();
    await page
      .getByRole("button", { name: "收起对话面板", exact: true })
      .click();
    await expect(page.locator(".class-tutor")).toBeHidden();
    assert.equal((await geometry()).surface.width, settled.surface.width);
    await page.getByRole("button", { name: "白板设置", exact: true }).click();
    await page.getByRole("button", { name: "放大白板", exact: true }).click();
    assert.equal((await geometry()).viewport.width, width);
    assert.equal((await geometry()).tools.y, before.tools.y);
    await page.keyboard.press("Escape");
    await page.goto("http://127.0.0.1:5173/courses");
    await expect(page.locator(".board-scroll")).toHaveCount(0);
    assert.equal(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).scrollbarGutter,
      ),
      "stable",
    );
    assert.deepEqual(errors, []);
    evidence.push({ width, before, opened, errors });
    await context.close();
    console.log(
      `PASS ${width}: viewport canvas, transparent gaps, independent tools, free pan, assistant/outline without reflow, persistent notes/quiz overlays, zoom isolation`,
    );
  }
  await writeFile(
    "screenshots/full-canvas/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
