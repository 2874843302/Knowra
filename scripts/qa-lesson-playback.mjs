import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState } from "../src/data.js";
import {
  lessonSequence,
  visibleSteps,
  streamMarkdown,
  streamText,
} from "../src/lib/lesson-sequence.js";

const markdown =
  "## Concept\n\nA **bold** [reference][r].\n\n3. First\n4. Second\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n## Review\n\nDone.\n\n[r]: https://example.com";
const sequence = lessonSequence(markdown);
assert.equal(sequence.pages.length, 2);
assert.equal(sequence.steps.length, 7);
assert.match(sequence.steps[0].content, /\[r\]: https:\/\/example.com/);
assert.match(sequence.steps[2].content, /4\. Second/);
assert(!sequence.steps[3].content.includes("console.log"));
assert.equal(
  visibleSteps(sequence, 4).filter((step) => step.kind === "code").length,
  1,
);
assert.match(sequence.steps[5].content, /\| A/);
assert.equal(visibleSteps(sequence, 6).length, 6);
assert(visibleSteps(sequence, 6).some((step) => step.page === 0));
assert(visibleSteps(sequence, 6).some((step) => step.page === 1));
assert.equal(lessonSequence("").steps.length, 0);
assert.notEqual(
  sequence.signature,
  lessonSequence(markdown + "changed").signature,
);
const valuesLesson = catalog.find((course) => course.id === "python").units[0]
  .lessons[0];
const editedSequence = lessonSequence(
  "## Changed\n\nNew content.",
  valuesLesson,
);
assert(editedSequence.steps.every((step) => !step.visual));
assert.equal(editedSequence.steps.at(-1).kind, "checkpoint");
console.log(
  "PASS Structured Markdown sequencing preserves lists, references, tables and code",
);
assert.equal(streamText("A👨‍👩‍👧‍👦中", 2 / 3), "A👨‍👩‍👧‍👦");
for (const fraction of [0, 0.1, 0.35, 0.7, 1]) {
  const partial = streamMarkdown(sequence.steps[0], fraction);
  const tree = lessonSequence(partial);
  assert(!partial.includes("undefined"));
  if (fraction > 0) assert(tree.steps.length);
}
assert.match(streamMarkdown(sequence.steps[4], 0.4), /const a = 1;/);
assert(!streamMarkdown(sequence.steps[4], 0.4).includes("console.log(a);"));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const workspace = crypto.randomUUID();
await context.addInitScript(
  ({ workspace, seed }) => {
    if (!localStorage.getItem("knowra-workspace-id")) {
      localStorage.setItem("knowra-workspace-id", workspace);
      localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
    }
  },
  { workspace, seed: initialState() },
);
let aiCalls = 0;
await context.route("**/api/provider", (route) =>
  route.fulfill({ json: { configured: false } }),
);
await context.route("**/api/ai", (route) => {
  aiCalls++;
  return route.fulfill({
    status: 503,
    json: { error: "No live AI in playback QA" },
  });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
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
const desktopOnly = process.argv.includes("--desktop");
const command = async (target, name) => {
  await target.getByRole("button", { name: "白板设置", exact: true }).click();
  await target.getByRole("button", { name, exact: true }).click();
  if (target === page) await page.clock.runFor(240);
};
const stepIndex = () =>
  page.locator(".tutor-teaching").getAttribute("data-teaching-step");
await mkdir("screenshots/playback", { recursive: true });
try {
  await page.goto("http://127.0.0.1:5173/learn/python/py-values");
  await page.getByRole("button", { name: "展开导师", exact: true }).click();
  await expect(page.getByRole("region", { name: "讲解字幕" })).toBeVisible();
  await expect(page.locator(".board-frame")).toHaveCount(1);
  await expect(page.locator(".board-frame h2")).toHaveText("给数据一个名字");
  assert(
    !(await page.locator(".board-surface").innerText()).includes(
      "类型决定能做什么",
    ),
  );
  await page.clock.install();
  await page.locator('.board-frame[data-section="0"]').evaluate((element) => {
    window.originalBoardSection = element;
  });
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await page.clock.runFor(900);
  const writing = page.locator(".teaching-writing").first();
  const partialText = await writing.innerText();
  assert(partialText.length > 0 && partialText.length < 75);
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  const pausedText = await writing.innerText();
  await page.clock.runFor(20000);
  assert.equal(await writing.innerText(), pausedText);
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await page.clock.runFor(6400);
  await expect(page.locator(".board-frame")).toHaveCount(2);
  await expect(page.locator(".board-frame.is-active-section h2")).toHaveText(
    "类型决定能做什么",
  );
  assert.equal(await stepIndex(), "1");
  assert(
    await page
      .locator('.board-frame[data-section="0"]')
      .evaluate((element) => element === window.originalBoardSection),
  );
  await expect(
    page.locator(".board-pagination, .board-section-nav"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  const paused = await stepIndex();
  await page.clock.runFor(20000);
  assert.equal(await stepIndex(), paused);
  console.log(
    "PASS Concepts progress continuously on the same board; previous DOM stays mounted and pause freezes progression",
  );

  await command(page, "下一步讲解");
  await expect(page.locator(".lesson-stage")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "开始讲解", exact: true }),
  ).toBeDisabled();
  await page.clock.runFor(30000);
  assert.equal(await stepIndex(), "2");
  const checkpoint = page.locator(".lesson-stage");
  await checkpoint.getByRole("button", { name: "A 5", exact: true }).click();
  await expect(checkpoint.getByRole("status")).toContainText(
    "再看一下这个关键点",
  );
  await expect(checkpoint.getByRole("status")).toContainText("拼接");
  await checkpoint
    .getByRole("button", { name: "继续讲解", exact: true })
    .click();
  await page.clock.runFor(900);
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  await expect(page.locator(".board-frame")).toHaveCount(3);
  await expect(page.locator(".board-frame pre")).toContainText("price = 19.9");
  assert(
    !(await page.locator(".board-frame pre").innerText()).includes("quantity"),
  );
  await page
    .locator(".visual-trace .trace-row")
    .first()
    .evaluate((el) => {
      window.previousTraceRow = el;
    });
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await page.clock.runFor(3840);
  assert.equal(await stepIndex(), "4");
  assert(
    await page
      .locator(".visual-trace .trace-row")
      .first()
      .evaluate((el) => el === window.previousTraceRow),
  );
  await expect(page.locator(".visual-trace .trace-row").first()).toContainText(
    "price",
  );
  await page.clock.runFor(800);
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  await expect(page.locator(".board-frame pre")).toContainText("quantity = 3");
  await command(page, "上一步讲解");
  await expect(page.locator(".board-frame pre")).toContainText("quantity = 3");
  await expect(page.locator(".board-frame")).toHaveCount(3);
  await command(page, "下一步讲解");
  await page.getByRole("button", { name: "白板设置", exact: true }).click();
  await page.getByRole("combobox", { name: "讲解速度", exact: true }).click();
  await page.getByRole("option", { name: "2×", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.clock.runFor(240);
  const savedIndex = await stepIndex();
  await page.clock.runFor(1000);
  await expect
    .poll(
      async () => (await remote()).lessonPlayback?.["python/py-values"]?.step,
    )
    .toBe(Number(savedIndex));
  await page.reload();
  await page.getByRole("button", { name: "展开导师", exact: true }).click();
  await expect(page.locator(".tutor-teaching")).toHaveAttribute(
    "data-teaching-step",
    savedIndex,
  );
  await page.getByRole("button", { name: "白板设置", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "讲解速度", exact: true }),
  ).toContainText("2×");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "开始讲解", exact: true }),
  ).toBeVisible();
  console.log(
    "PASS Code reveals by line and step/speed survive server persistence and reload",
  );

  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await page.getByRole("textbox", { name: "向导师提问" }).focus();
  await expect(
    page.getByRole("button", { name: "开始讲解", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await page.getByRole("button", { name: "白板设置", exact: true }).click();
  await page.getByRole("tab", { name: "连续讲义", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".board-frame")).toHaveCount(3);
  await expect(page.locator(".lesson-stage")).toHaveCount(0);
  await page.getByRole("button", { name: "白板设置", exact: true }).click();
  await page.getByRole("tab", { name: "连续白板", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "开始讲解", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await page.clock.runFor(30000);
  await expect(page.locator(".lesson-subtitle-resume")).toContainText(
    "再听一遍",
  );
  assert(!(await remote()).progress["python/py-values"]?.completed);
  assert.equal(aiCalls, 0);
  await command(page, "上一步讲解");
  await page.clock.runFor(1000);
  await expect
    .poll(
      async () =>
        (await remote()).lessonPlayback?.["python/py-values"]?.revealedStep,
    )
    .toBe(7);
  await page.reload();
  await page.getByRole("button", { name: "展开导师", exact: true }).click();
  await expect(page.locator(".tutor-teaching")).toHaveAttribute(
    "data-teaching-step",
    "6",
  );
  await expect(page.locator(".board-frame")).toHaveCount(3);
  await expect(page.locator(".board-surface")).toContainText(
    "浮点数：精度限制",
  );
  await expect(page.locator(".tutor-teaching-entry")).toHaveCount(8);
  await expect(page.locator(".tutor-teaching-entry").first()).toContainText(
    "先看 price",
  );
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.locator(".teaching-writing").last()).toHaveAttribute(
    "data-write-progress",
    "1.000",
  );
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  console.log(
    "PASS Asking and reading pause playback; finishing never marks course complete or calls AI",
  );

  if (!desktopOnly) {
    await command(page, "重新讲解");
    await page.clock.runFor(1000);
    await page.evaluate(() => document.fonts.ready);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.runFor(500);
    const player = await page.locator(".lesson-stage").boundingBox();
    const footer = await page.locator(".class-bottom").boundingBox();
    assert(player.x >= 0 && player.x + player.width <= 391);
    assert(player.y + player.height < footer.y);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await page.getByRole("tab", { name: "导师", exact: true }).click();
    await expect(page.locator(".lesson-stage")).toBeHidden();
    await page.getByRole("tab", { name: "课堂", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "开始讲解", exact: true }),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(
      "PASS Desktop/mobile controls, reduced motion and view switching",
    );
  }
  const visualContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await visualContext.route("**/api/provider", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await visualContext.route("**/api/ai", (route) => route.abort());
  const visual = await visualContext.newPage();
  await visual.goto("http://127.0.0.1:5173/learn/python/py-values");
  await visual.getByRole("button", { name: "展开导师", exact: true }).click();
  await visual.evaluate(() => document.fonts.ready);
  await expect(visual.locator(".teaching-block")).toHaveCSS("opacity", "1");
  await visual.screenshot({
    path: "screenshots/playback/continuous-start.png",
  });
  await visual.getByRole("button", { name: "开始讲解", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        await visual
          .locator(".teaching-writing")
          .first()
          .getAttribute("data-write-progress"),
      ),
    )
    .toBeGreaterThan(0.15);
  await visual.getByRole("button", { name: "暂停讲解", exact: true }).click();
  const pausedWriting = await visual
    .locator(".teaching-writing")
    .first()
    .innerText();
  await expect
    .poll(() =>
      visual.evaluate(
        () =>
          JSON.parse(localStorage.getItem("knowra-workspace-v1"))
            .lessonPlayback["python/py-values"].elapsed,
      ),
    )
    .toBeGreaterThan(0);
  const pausedElapsed = await visual.evaluate(
    () =>
      JSON.parse(localStorage.getItem("knowra-workspace-v1")).lessonPlayback[
        "python/py-values"
      ].elapsed,
  );
  await visual.screenshot({
    path: "screenshots/playback/streaming-paused.png",
  });
  await expect
    .poll(() =>
      visual.evaluate(async () => {
        const r = await fetch("/api/workspace", {
          headers: {
            "X-Workspace-Id": localStorage.getItem("knowra-workspace-id"),
          },
        });
        return (await r.json()).state.lessonPlayback["python/py-values"]
          .elapsed;
      }),
    )
    .toBe(pausedElapsed);
  await visual.reload();
  await visual.getByRole("button", { name: "展开导师", exact: true }).click();
  await expect(visual.locator(".teaching-writing").first()).toHaveText(
    pausedWriting,
  );
  console.log(
    "PASS Real-clock partial writing survives pause, SQLite save and reload",
  );
  for (let i = 0; i < 2; i++) await command(visual, "下一步讲解");
  await expect(visual.locator(".visual-bindings .binding-row")).toHaveCount(2);
  await expect(
    visual.locator(".visual-comparison .comparison-row"),
  ).toHaveCount(2);
  await expect(
    visual.locator('mark[data-annotation="circle"]').first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      visual
        .locator(".teaching-block")
        .evaluateAll((elements) =>
          elements.every((el) => getComputedStyle(el).opacity === "1"),
        ),
    )
    .toBe(true);
  await expect
    .poll(async () => {
      const button = await visual
        .locator(".lesson-stage .lesson-stage-option")
        .last()
        .boundingBox();
      const controls = await visual.locator(".lesson-stage").boundingBox();
      return (
        button.y >= controls.y &&
        button.y + button.height <= controls.y + controls.height
      );
    })
    .toBe(true);
  await visual.screenshot({
    path: "screenshots/playback/checkpoint-desktop.png",
  });
  if (!desktopOnly) {
    await visual.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => {
        const button = await visual
          .locator(".lesson-stage .lesson-stage-option")
          .last()
          .boundingBox();
        const controls = await visual.locator(".lesson-stage").boundingBox();
        return (
          button.y >= controls.y &&
          button.y + button.height <= controls.y + controls.height
        );
      })
      .toBe(true);
    await visual.screenshot({
      path: "screenshots/playback/checkpoint-mobile.png",
    });
    await visual.getByRole("tab", { name: "导师", exact: true }).click();
    await visual
      .getByRole("button", { name: "在下方作答", exact: true })
      .click();
    await expect(visual.locator(".lesson-stage")).toBeVisible();
  }
  await visual
    .locator(".lesson-stage")
    .getByRole("button", { name: 'B "32"', exact: true })
    .click();
  await visual.reload();
  await visual.getByRole("button", { name: "展开导师", exact: true }).click();
  await expect(
    visual.locator(".lesson-stage .lesson-stage-feedback"),
  ).toContainText("理解得很准确");
  await expect(
    visual.getByRole("button", { name: "开始讲解", exact: true }),
  ).toBeEnabled();
  await visual.setViewportSize({ width: 1440, height: 1000 });
  for (let i = 0; i < 5; i++) await command(visual, "下一步讲解");
  await expect(visual.locator(".board-frame")).toHaveCount(3);
  await expect(visual.locator(".trace-output")).toContainText("59.70");
  const measured = await visual
    .locator(".tutor-teaching-entry > p")
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        font: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        color: style.color,
      };
    });
  await expect(visual.locator(".teaching-block").last()).toHaveCSS(
    "opacity",
    "1",
  );
  await visual.screenshot({ path: "screenshots/playback/desktop.png" });
  if (!desktopOnly) {
    await visual.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => {
        const block = await visual
          .locator(".teaching-block.is-current")
          .boundingBox();
        const controls = await visual.locator(".lesson-stage").boundingBox();
        return block.y > 100 && block.y + block.height < controls.y;
      })
      .toBe(true);
    await visual.screenshot({ path: "screenshots/playback/mobile.png" });
  }
  const geometry = [];
  for (const width of desktopOnly
    ? [1024, 1440, 1920]
    : [320, 390, 768, 1440]) {
    await visual.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await expect
      .poll(() =>
        visual.evaluate(() => {
          const player = document
            .querySelector(".lesson-stage")
            .getBoundingClientRect();
          return [
            ...document.querySelectorAll(
              ".lesson-stage button, .lesson-stage [role=combobox]",
            ),
          ].every((el) => {
            const r = el.getBoundingClientRect();
            return r.left >= player.left && r.right <= player.right;
          });
        }),
      )
      .toBe(true);
    geometry.push(
      await visual.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        player: document
          .querySelector(".lesson-stage")
          .getBoundingClientRect()
          .toJSON(),
        boardColumns: getComputedStyle(document.querySelector(".board-surface"))
          .gridTemplateColumns,
      })),
    );
  }
  await writeFile(
    "screenshots/playback/verification.json",
    JSON.stringify(
      {
        scope: "Local teaching playback; no external AI calls",
        narration: measured,
        geometry,
        checks: [
          "valid partial Markdown and emoji",
          "pause and SQLite resume",
          "checkpoint waits for answer",
          "incorrect-answer explanation",
          "mobile return and correct-answer persistence",
          "trace retains previous variables",
          "review retains later writing",
        ],
      },
      null,
      2,
    ),
  );
  if (!desktopOnly) await visual.setViewportSize({ width: 390, height: 844 });
  await visual.getByRole("button", { name: "开始讲解", exact: true }).click();
  await visual.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    visual.getByRole("button", { name: "开始讲解", exact: true }),
  ).toBeVisible();
  await visualContext.close();
  console.log(
    "PASS Real-clock board is visible in screenshots; backgrounding pauses narration",
  );
} finally {
  await browser.close();
}
