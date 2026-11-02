import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const lesson = {
  id: "follow",
  title: "保持讲解，短暂浏览",
  points: [],
  content:
    "## 当前概念\n\n向量表示方向和长度。\n\n## 继续推理\n\n两个位移接在一起。",
  teaching: {
    steps: [
      {
        title: "当前概念",
        board: "**向量表示方向和长度**",
        narration: "从一支箭头开始理解向量。",
      },
      {
        title: "继续推理",
        board: "**向量相加：连接两次移动**\n\nu + v = (4, 3)",
        narration:
          "我们继续观察两次位移如何相接。先沿第一支箭头移动，再接上第二支箭头，终点就代表相加的结果。".repeat(
            14,
          ),
      },
      {
        title: "检验理解",
        board: "**分量分别相加**\n\n(1, 2) + (3, 1) = (4, 3)",
        narration: "现在用坐标检验同一个结论，每个方向的分量分别相加。".repeat(
          16,
        ),
      },
    ],
  },
};
lesson.teaching.source = lesson.content;
lesson.teaching.mode = "script";
const sequence = lessonSequence(lesson.content, lesson);
assert.equal(sequence.steps.length, 3);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/canvas-follow", { recursive: true });
try {
  for (const width of [1440, 1024]) {
    const seed = initialState();
    seed.customCourses = [
      {
        ...catalog[0],
        id: "follow-qa",
        units: [{ title: "跟随检查", lessons: [lesson] }],
      },
    ];
    seed.lessonPlayback = {
      "follow-qa/follow": {
        signature: sequence.signature,
        step: 0,
        revealedStep: 0,
        elapsed: sequence.steps[0].duration - 800,
        revealedProgress: 1,
        revealedNarrationProgress: 1,
        answers: {},
        rate: 1,
      },
    };
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
    });
    await context.addInitScript(
      ({ seed, id }) => {
        if (!localStorage.getItem("knowra-workspace-id")) {
          localStorage.setItem("knowra-workspace-id", id);
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
        }
      },
      { seed, id: crypto.randomUUID() },
    );
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: false } }),
    );
    await context.route("**/api/ai", (r) => r.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/learn/follow-qa/follow");
    await page.evaluate(() => document.fonts.ready);
    const surface = page.locator(".board-surface");
    const viewport = page.locator(".board-scroll");
    const transform = () => surface.evaluate((e) => e.style.transform);
    const playing = () =>
      expect(
        page.getByRole("button", { name: "暂停讲解", exact: true }),
      ).toBeVisible();
    const settled = () =>
      expect
        .poll(() =>
          surface.evaluate((e) =>
            e.getAnimations().every((a) => a.playState === "finished"),
          ),
        )
        .toBe(true);
    const returned = async (previous) => {
      await expect
        .poll(transform, { timeout: 3500, intervals: [50] })
        .not.toBe(previous);
      await settled();
      const block = page.locator(".teaching-block.is-current");
      await expect(block).toBeInViewport();
      const box = await block.boundingBox();
      assert(box.x >= 0 && box.x < width);
      const text = await block.locator("strong").first().boundingBox();
      assert(text.x >= 0 && text.x + text.width <= width);
    };
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await page.mouse.move(width - 130, 550);
    await page.mouse.down();
    await page.mouse.move(width - 830, 700, { steps: 8 });
    const held = await transform();
    await page.waitForTimeout(2400);
    assert.equal(
      await transform(),
      held,
      "idle timer recentered while pointer was held",
    );
    await expect(page.locator(".teaching-block.is-current")).toHaveAttribute(
      "data-step",
      "1",
    );
    await playing();
    await page.mouse.up();
    await page.waitForTimeout(1100);
    assert.equal(await transform(), held, "returned before two seconds");
    await returned(held);
    await playing();
    console.log(
      `PASS ${width}: dragging across step transition keeps teaching/position; held pointer blocks return; released pointer returns after idle`,
    );

    await page.mouse.move(width - 80, 550);
    await page.mouse.wheel(180, 90);
    await page.waitForTimeout(1350);
    await page.mouse.wheel(100, 80);
    const repeated = await transform();
    await page.waitForTimeout(900);
    assert.equal(
      await transform(),
      repeated,
      "new wheel did not restart idle interval",
    );
    await returned(repeated);
    await playing();

    await page.mouse.move(width - 80, 550);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect
      .poll(() =>
        page
          .locator(".board-document")
          .evaluate((e) => Number(getComputedStyle(e).zoom)),
      )
      .toBe(1.1);
    const zoomed = await transform();
    await returned(zoomed);
    await playing();
    assert.equal(
      await page
        .locator(".board-document")
        .evaluate((e) => Number(getComputedStyle(e).zoom)),
      1.1,
    );
    await viewport.focus();
    await page.keyboard.press("ArrowLeft");
    const keyed = await transform();
    await returned(keyed);
    await playing();

    await page.getByRole("button", { name: "选择文字", exact: true }).click();
    const text = page
      .locator(".teaching-block.is-current .teaching-writing p")
      .first();
    const textBox = await text.boundingBox();
    await page.mouse.move(textBox.x + 4, textBox.y + textBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(textBox.x + 100, textBox.y + textBox.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    await playing();
    await page.getByRole("button", { name: "拖动画布", exact: true }).click();

    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await page.mouse.move(width - 80, 550);
    await page.mouse.wheel(240, 120);
    await page.waitForTimeout(100);
    const paused = await transform();
    await page.waitForTimeout(2500);
    assert.equal(
      await transform(),
      paused,
      "paused canvas must not auto-focus",
    );
    await expect(
      page.getByRole("button", { name: "开始讲解", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await returned(paused);
    await page.mouse.wheel(240, 120);
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    const cancelled = await transform();
    await page.waitForTimeout(2500);
    assert.equal(
      await transform(),
      cancelled,
      "pausing cancels pending auto-focus",
    );
    await page.screenshot({
      path: `screenshots/canvas-follow/follow-${width}.png`,
    });
    await page.mouse.wheel(120, 80);
    await page.goto("http://127.0.0.1:5173/courses");
    await page.waitForTimeout(2300);
    await expect(viewport).toHaveCount(0);
    assert.deepEqual(errors, []);
    evidence.push({ width, held, repeated, zoomed, keyed, errors });
    console.log(
      `PASS ${width}: repeated wheel postpones return, zoom retained, paused position retained, resume follows again, pause cancels pending return, unmount cleanup`,
    );
    await context.close();
  }
  await writeFile(
    "screenshots/canvas-follow/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
