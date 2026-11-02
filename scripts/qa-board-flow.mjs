import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, lessonsOf, initialState } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/board-flow", { recursive: true });
try {
  for (const width of [1440, 1920, 1024]) {
    const original = lessonsOf(
      catalog.find((course) => course.id === "python"),
    )[0];
    const content =
      "## 连续板书：写满一列再接到右侧\n\n" +
      Array.from({ length: 24 }, (_, index) => {
        const text = `**知识点 ${index + 1}**：把实际问题拆成输入、处理与输出，先确认数据含义，再选择合适的操作。通过具体例子检查边界条件，用自己的话复述推理过程，最后验证结果是否符合预期。`;
        if (index === 7)
          return (
            text +
            "\n\n```python\nprices = [12, 18, 25]\nfor price in prices:\n    discounted = price * 0.9\n    print(discounted)\n```"
          );
        if (index === 15)
          return (
            text +
            "\n\n| 输入 | 操作 | 输出 |\n| --- | --- | --- |\n| 12 | 乘 0.9 | 10.8 |\n| 18 | 乘 0.9 | 16.2 |"
          );
        return text;
      }).join("\n\n");
    const lesson = {
      ...original,
      id: "flow",
      title: "连续板书",
      content,
      teaching: undefined,
      quiz: undefined,
    };
    const course = {
      ...catalog.find((item) => item.id === "python"),
      id: "flow-qa",
      units: [{ title: "布局检查", lessons: [lesson] }],
    };
    const sequence = lessonSequence(content, lesson);
    const first = sequence.steps[0];
    const seed = initialState();
    seed.customCourses = [course];
    seed.lessonPlayback = {
      "flow-qa/flow": {
        signature: sequence.signature,
        step: 0,
        revealedStep: 0,
        elapsed: first.duration,
        revealedProgress: 1,
        revealedNarrationProgress: 1,
        rate: 1,
        answers: {},
      },
    };
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1920 ? "reduce" : "no-preference",
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
    await context.route("**/api/provider", (route) =>
      route.fulfill({ json: { configured: false } }),
    );
    await context.route("**/api/ai", (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/learn/flow-qa/flow");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(260);
    const firstBlock = page.locator('.teaching-block[data-step="0"]');
    await expect(firstBlock).toHaveCSS("transform", "none");
    await firstBlock.evaluate((element) => (window.firstBoardBlock = element));
    const localRect = () =>
      firstBlock.evaluate((el) => {
        const surface = el.closest(".board-surface").getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        return { x: rect.x - surface.x, y: rect.y - surface.y };
      });
    const start = await localRect();
    // Advance the actual player through one long section, including its code.
    for (let index = 1; index < sequence.steps.length; index++) {
      await page.getByRole("button", { name: "白板设置", exact: true }).click();
      await page
        .getByRole("button", { name: "下一步讲解", exact: true })
        .click();
      assert(await firstBlock.evaluate((el) => el === window.firstBoardBlock));
      assert.deepEqual(
        await localRect(),
        start,
        "later writing rebalanced earlier columns",
      );
    }
    const blocks = await page
      .locator(".teaching-block")
      .evaluateAll((elements) => {
        const surface = elements[0]
          .closest(".board-surface")
          .getBoundingClientRect();
        return elements.map((el) => ({
          step: el.dataset.step,
          fragments: el.getClientRects().length,
          x: el.getBoundingClientRect().x - surface.x,
          y: el.getBoundingClientRect().y - surface.y,
          height: el.getBoundingClientRect().height,
        }));
      });
    const geometry = await page.locator(".board-surface").evaluate((el) => ({
      height: el.clientHeight,
      width: el.clientWidth,
      gap: getComputedStyle(el).columnGap,
      count: new Set(
        [...el.querySelectorAll(".teaching-block")].map((block) =>
          Math.round(block.getBoundingClientRect().x),
        ),
      ).size,
    }));
    assert(geometry.count >= 2, JSON.stringify(geometry));
    assert(
      geometry.height >= 1040 &&
        geometry.height <= 1600 &&
        blocks.every(
          (block) =>
            block.y >= -1 && block.y + block.height <= geometry.height + 1,
        ),
      JSON.stringify(blocks),
    );
    assert(
      blocks.every((block) => block.fragments === 1),
      "a short knowledge block was split across columns",
    );
    for (let index = 1; index < blocks.length; index++)
      assert(
        blocks[index].x >= blocks[index - 1].x,
        "column reading order changed",
      );
    assert.equal(
      await page.locator(".board-frame").count(),
      1,
      "one section was turned into separate pages",
    );
    await expect(page.locator(".board-frame pre")).toContainText(
      "print(discounted)",
    );
    await expect(page.locator(".board-frame table")).toContainText("16.2");
    const tableType = await page
      .locator(".board-frame table")
      .evaluate((table) => ({
        font: parseFloat(getComputedStyle(table).fontSize),
        padding: parseFloat(
          getComputedStyle(table.querySelector("td")).paddingTop,
        ),
      }));
    assert(
      tableType.font >= 18 && tableType.padding >= 12,
      "board table uses compact UI typography",
    );
    const layout = await page.locator(".board-surface").evaluate((el) => ({
      width: el.clientWidth,
      height: el.clientHeight,
      columns: getComputedStyle(el).columnWidth,
    }));
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    assert.deepEqual(
      await page.locator(".board-surface").evaluate((el) => ({
        width: el.clientWidth,
        height: el.clientHeight,
        columns: getComputedStyle(el).columnWidth,
      })),
      layout,
    );
    await page
      .getByRole("button", { name: "收起对话面板", exact: true })
      .click();
    await expect(page.locator(".class-tutor")).toBeHidden();
    await page
      .getByRole("button", { name: "回到当前讲解", exact: true })
      .click();
    const last = page.locator(".teaching-block.is-current");
    await expect(last).toBeInViewport();
    await page.mouse.move(12, 800);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/board-flow/flow-${width}.png` });
    const code = page.locator(".board-frame pre");
    await code.locator("code").evaluate((element) => {
      element.textContent = Array.from(
        { length: 100 },
        (_, index) => `print(${index})`,
      ).join("\n");
    });
    assert(
      await code.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
      "very long code should scroll inside its block",
    );
    assert(
      (await code.boundingBox()).height < geometry.height,
      "very long code exceeded the column height",
    );
    await page.getByRole("button", { name: "白板设置", exact: true }).click();
    await page.getByRole("tab", { name: "连续讲义", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".mode-reading")).toBeVisible();
    await expect(page.locator(".board-frame .markdown")).toContainText(
      "知识点 24",
    );
    // A short section must not leave most of its column empty just because
    // the following example contains an indivisible interactive diagram.
    const matrixCourse = catalog.find((item) =>
      lessonsOf(item).some((item) => item.id === "matrices"),
    );
    const matrixLesson = lessonsOf(matrixCourse).find(
      (item) => item.id === "matrices",
    );
    const matrixSequence = lessonSequence(matrixLesson.content, matrixLesson);
    const visualIndex = matrixSequence.steps.findIndex(
      (step) => step.visual?.type === "vector-transform",
    );
    assert(visualIndex >= 0);
    const matrixSeed = initialState();
    matrixSeed.lessonPlayback = {
      [`${matrixCourse.id}/${matrixLesson.id}`]: {
        signature: matrixSequence.signature,
        step: visualIndex,
        revealedStep: visualIndex,
        elapsed: matrixSequence.steps[visualIndex].duration,
        revealedProgress: 1,
        revealedNarrationProgress: 1,
        rate: 1,
        answers: {},
      },
    };
    await page.evaluate(
      ({ seed, id }) => {
        localStorage.setItem("knowra-workspace-id", id);
        localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
      },
      { seed: matrixSeed, id: crypto.randomUUID() },
    );
    await page.goto(
      `http://127.0.0.1:5173/learn/${matrixCourse.id}/${matrixLesson.id}`,
    );
    await page.evaluate(() => document.fonts.ready);
    const heads = page.locator(".board-frame > h2");
    await expect(heads).toHaveCount(2);
    const firstHead = await heads.nth(0).boundingBox();
    const exampleHead = await heads.nth(1).boundingBox();
    assert(Math.abs(firstHead.x - exampleHead.x) < 1);
    assert(exampleHead.y > firstHead.y + firstHead.height);
    const visual = page.locator(".teaching-visual.vector-lab");
    await expect(visual).toBeVisible();
    assert.equal(await visual.evaluate((el) => el.getClientRects().length), 1);
    assert((await visual.boundingBox()).x > exampleHead.x);
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    await page
      .getByRole("button", { name: "回到当前讲解", exact: true })
      .click();
    await expect(visual).toBeInViewport();
    const tutorLeft = (await page.locator(".class-tutor").boundingBox()).x;
    const visualBox = await visual.boundingBox();
    assert(visualBox.x >= 0 && visualBox.x + visualBox.width < tutorLeft);
    await page
      .getByRole("button", { name: "收起对话面板", exact: true })
      .click();
    await expect(page.locator(".class-tutor")).toBeHidden();
    await page.mouse.move(12, 800);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `screenshots/board-flow/matrix-${width}.png`,
    });
    assert.deepEqual(errors, []);
    evidence.push({ width, geometry, blocks, errors });
    await context.close();
    console.log(
      `PASS ${width}: bounded flow, stable writing, whole code/table, short sections share column, diagram stays whole, tutor-safe recenter and reading mode`,
    );
  }
  await writeFile(
    "screenshots/board-flow/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
