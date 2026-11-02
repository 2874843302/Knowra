import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, validateOutline } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const quiz = (question) => ({
  question,
  options: ["共享同一个 Store", "每个页面复制一份"],
  answer: 0,
  explanation: "共同的数据来源才能保持组件之间同步，重复复制会产生不同版本。",
});
const units = validateOutline({
  title: "共享状态理解检查",
  units: [
    {
      title: "从概念到实践",
      lessons: [
        {
          title: "边理解，边验证",
          points: [],
          content:
            "## 理解共享状态\n\n不同组件通过同一个 Store 读取数据。\n\n## 更新状态\n\n使用操作更新数据，再检查界面是否同步。",
          teaching: {
            steps: [
              {
                title: "先明确共同来源",
                board: "**Store 保存共享状态**\n\n商品页 → Store ← 购物车",
                narration:
                  "多个页面需要看到同一份商品数据，先让它们从一个共同来源读取。",
                checkpoint: quiz("多个页面怎样保持数据一致？"),
              },
              {
                title: "再检查更新过程",
                board:
                  "**统一操作，更新共享数据**\n\n加入商品 → Store 更新 → 界面同步",
                narration:
                  "现在点击加入商品，更新的是共享容器里的数据，而不是页面的副本。",
                checkpoint: quiz("加入商品后，其他页面应该从哪里读取？"),
              },
              {
                title: "最后自己实践",
                board: "修改商品数量 → 观察总价\n\n**检验结果，解释数据流**",
                narration:
                  "试着改变一次数量，再检查商品页和购物车，解释为什么它们能保持同步。",
              },
            ],
          },
          quiz: quiz("课后回顾：共享状态应该如何组织？"),
        },
      ],
    },
  ],
});
const lesson = units[0].lessons[0],
  sequence = lessonSequence(lesson.content, lesson);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/classroom-canvas", { recursive: true });
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: width < 700,
      reducedMotion: "reduce",
    });
    const seed = initialState();
    seed.customCourses.push({
      id: "canvas-qa",
      title: "共享状态理解检查",
      units,
    });
    await context.addInitScript(
      ({ id, seed }) => {
        if (!localStorage.getItem("knowra-workspace-id")) {
          localStorage.setItem("knowra-workspace-id", id);
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
        }
      },
      { id: crypto.randomUUID(), seed },
    );
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: false } }),
    );
    await context.route("**/api/ai", (r) => r.abort());
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const key = `canvas-qa/${lesson.id}`;
    const remote = () =>
      page.evaluate(
        async () =>
          (
            await (
              await fetch("/api/workspace", {
                headers: {
                  "X-Workspace-Id": localStorage.getItem("knowra-workspace-id"),
                },
              })
            ).json()
          ).state,
      );
    await page.goto(`http://127.0.0.1:5173/learn/${key}`);
    await page.evaluate(() => document.fonts.ready);
    await page.clock.install();
    const board = page.locator(".board-surface"),
      viewport = page.locator(".board-scroll");
    const transform = () =>
      board.evaluate((node) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        return { x: Math.round(matrix.m41), y: Math.round(matrix.m42) };
      });
    const next = page.getByRole("button", { name: "下一步讲解", exact: true });
    await expect(page.locator(".teaching-checkpoint")).toHaveCount(0);
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await page.clock.runFor(sequence.steps[0].duration + 150);
    const first = page.locator(".teaching-checkpoint").first();
    await expect(first).toBeVisible();
    await expect(first).toContainText("多个页面怎样保持数据一致？");
    await expect(page.locator(".lesson-player-caption")).toContainText(
      "等你回答，再继续",
    );
    await page.clock.runFor(10000);
    await expect(page.locator('.teaching-block[data-step="2"]')).toHaveCount(0);
    if (await next.isEnabled()) await next.click();
    await expect(page.locator('.teaching-block[data-step="2"]')).toHaveCount(0);
    await first.getByRole("button", { name: /每个页面复制/ }).click();
    await first.getByRole("button", { name: "检查答案", exact: true }).click();
    await expect(first.getByRole("status")).toContainText("再看一下这个关键点");
    await first.getByRole("button", { name: "继续讲解", exact: true }).click();
    await page.clock.runFor(sequence.steps[2].duration + 150);
    await expect(page.locator(".teaching-checkpoint")).toHaveCount(2);
    const second = page.locator(".teaching-checkpoint").nth(1);
    await expect(second).toContainText("加入商品后，其他页面应该从哪里读取？");
    await second.getByRole("button", { name: /共享同一个/ }).click();
    await second.getByRole("button", { name: "检查答案", exact: true }).click();
    await expect(second.getByRole("status")).toContainText("理解得很准确");
    await expect
      .poll(
        async () =>
          Object.keys((await remote()).lessonPlayback?.[key]?.answers || {})
            .length,
      )
      .toBe(2);
    assert.equal(
      (await remote()).progress[key]?.quizCorrect,
      undefined,
      "Interim checks must not overwrite the separate final quiz score",
    );
    await page.reload();
    await expect(page.locator(".quiz-feedback")).toHaveCount(2);
    await page
      .locator(".teaching-checkpoint")
      .nth(1)
      .getByRole("button", { name: "继续讲解", exact: true })
      .click();
    await page.clock.runFor(600);
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await expect(page.locator('.teaching-block[data-step="4"]')).toBeVisible();
    await page.screenshot({
      path: `screenshots/classroom-canvas/checks-${width}.png`,
    });

    await page
      .getByRole("button", { name: "回到当前讲解", exact: true })
      .click();
    const bounds = await viewport.boundingBox();
    const x = bounds.x + 110,
      y = bounds.y + 170;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 110, y + 75, { steps: 8 });
    await page.mouse.up();
    await expect.poll(transform).toEqual({ x: 110, y: 75 });
    await expect(viewport).not.toHaveAttribute("data-dragging", "true");
    await page.mouse.wheel(45, 65);
    await expect.poll(transform).toEqual({ x: 65, y: 10 });
    await viewport.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(transform).toEqual({ x: 113, y: 10 });
    await page
      .getByRole("button", { name: "回到当前讲解", exact: true })
      .click();
    await expect.poll(transform).toEqual({ x: 0, y: 0 });
    await page.getByRole("button", { name: "放大白板", exact: true }).click();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 110, y + 55, { steps: 8 });
    await page.mouse.up();
    await expect.poll(transform).toEqual({ x: 100, y: 50 });
    await page
      .getByRole("button", { name: "回到当前讲解", exact: true })
      .click();
    await page.getByRole("button", { name: "110%", exact: true }).click();
    if (width < 700) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + 60, y: y + 80 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect.poll(transform).toEqual({ x: 60, y: 80 });
      await cdp.detach();
      await page
        .getByRole("button", { name: "回到当前讲解", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "选择文字", exact: true }).click();
    await expect(viewport).toHaveAttribute("data-canvas-mode", "select");
    const line = page
      .locator('.teaching-block[data-step="4"] .teaching-writing p')
      .first();
    await line.scrollIntoViewIfNeeded();
    const textBounds = await line.boundingBox();
    await page.mouse.move(textBounds.x + 1, textBounds.y + 10);
    await page.mouse.down();
    await page.mouse.move(
      textBounds.x + Math.min(120, textBounds.width - 1),
      textBounds.y + 10,
      { steps: 8 },
    );
    await page.mouse.up();
    assert((await page.evaluate(() => getSelection().toString())).length > 0);
    await expect.poll(transform).toEqual({ x: 0, y: 0 });
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.getByRole("button", { name: "拖动画布", exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `screenshots/classroom-canvas/canvas-${width}.png`,
    });
    await page.getByRole("button", { name: "重新讲解", exact: true }).click();
    await expect(page.locator(".teaching-checkpoint")).toHaveCount(0);
    await expect.poll(transform).toEqual({ x: 0, y: 0 });
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await page.clock.runFor(500);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 40, y + 30, { steps: 5 });
    await page.mouse.up();
    await expect(
      page.getByRole("button", { name: "开始讲解", exact: true }),
    ).toBeVisible();
    await page.clock.runFor(5000);
    await expect.poll(transform).toEqual({ x: -40, y: 30 });
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect.poll(transform).toEqual({ x: 0, y: 0 });
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await page.getByRole("tab", { name: "连续讲义", exact: true }).click();
    await expect(viewport).not.toHaveAttribute("data-canvas-mode");
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      checks: 2,
      wrongAndCorrectFeedback: true,
      savedAnswers: true,
      mouseWheelKeyboardZoomTouchSelection: true,
      errors,
    });
    await context.close();
  }
  await writeFile(
    "screenshots/classroom-canvas/verification.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    "PASS Two in-lecture checks, answer gating, feedback, independent persistence; canvas drag/wheel/keyboard/touch, zoom, text selection, recenter, replay and reading mode",
  );
} finally {
  await browser.close();
}
