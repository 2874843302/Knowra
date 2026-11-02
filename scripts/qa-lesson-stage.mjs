import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, catalog, lessonsOf } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import { captionFrame, narrationCaption } from "../src/lib/lesson-captions.js";

assert.equal(narrationCaption("A👨‍👩‍👧‍👦中", 1 / 3), "A");
assert.equal(narrationCaption("A👨‍👩‍👧‍👦中", 2 / 3), "A👨‍👩‍👧‍👦");
assert.equal(narrationCaption("A👨‍👩‍👧‍👦中", 1), "A👨‍👩‍👧‍👦中");
const passage = "前".repeat(24) + "。" + "后".repeat(24) + "。";
assert.equal(narrationCaption(passage, 0.5), "前".repeat(24) + "。");
assert.equal(narrationCaption(passage, 0.52), "后");
assert.equal(captionFrame(passage, 0.52).full, "后".repeat(24) + "。");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
const lesson = lessonsOf(catalog.find((c) => c.id === "python"))[0];
const sequence = lessonSequence(lesson.content, lesson);
const check = sequence.steps.find((s) => s.kind === "checkpoint");
await mkdir("screenshots/lesson-stage", { recursive: true });
try {
  for (const width of [1440, 1920, 1024]) {
    const seed = initialState();
    seed.lessonPlayback = {
      "python/py-values": {
        signature: sequence.signature,
        step: 0,
        revealedStep: 0,
        elapsed: 0,
        rate: 0.75,
        answers: {},
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
    const menu = async (name) => {
      await page.getByRole("button", { name: "白板设置", exact: true }).click();
      await page.getByRole("button", { name, exact: true }).click();
    };
    await page.goto("http://127.0.0.1:5173/learn/python/py-values");
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "讲解字幕", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".lesson-player, .lesson-player-track"),
    ).toHaveCount(0);
    const caption = page.locator(".lesson-subtitle-text");
    assert.equal(await caption.innerText(), "");
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect
      .poll(async () => (await caption.innerText()).length, {
        timeout: 18000,
        intervals: [50, 100],
      })
      .toBeGreaterThanOrEqual(5);
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    const frozen = await caption.innerText();
    assert(sequence.steps[0].narration.includes(frozen));
    assert(
      frozen.length < captionFrame(sequence.steps[0].narration, 0).full.length,
    );
    await page.waitForTimeout(300);
    assert.equal(await caption.innerText(), frozen);
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect.poll(() => caption.innerText()).not.toBe(frozen);
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    const resumed = await caption.innerText();
    const frozenOffset = sequence.steps[0].narration.indexOf(frozen);
    const resumedOffset = sequence.steps[0].narration.indexOf(resumed);
    assert(
      resumed.length > 0 &&
        (resumedOffset > frozenOffset || resumed.startsWith(frozen)),
      "resume restarted the caption instead of advancing within or beyond its clause",
    );
    await page.screenshot({
      path: `screenshots/lesson-stage/subtitle-${width}.png`,
    });
    for (let i = 0; i < check.index; i++) await menu("下一步讲解");
    const stage = page.getByRole("region", { name: "课堂提问", exact: true });
    await expect(stage.getByRole("heading")).toHaveText(check.quiz.question);
    await expect(
      page.locator(".board-surface .teaching-checkpoint"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "检查答案", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "开始讲解", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "白板设置", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "下一步讲解", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    const geometry = await stage.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const tutor = document
        .querySelector(".class-tutor")
        .getBoundingClientRect();
      const bottom = document
        .querySelector(".class-bottom")
        .getBoundingClientRect();
      return {
        stage: r.toJSON(),
        tutor: tutor.toJSON(),
        bottom: bottom.toJSON(),
        scroll: el.scrollWidth,
        client: el.clientWidth,
        font: getComputedStyle(el.querySelector("h3")).fontSize,
      };
    });
    assert(geometry.stage.right <= geometry.tutor.left - 8);
    assert(geometry.stage.bottom < geometry.bottom.top);
    assert(geometry.scroll <= geometry.client);
    await page.getByRole("button", { name: "在下方作答", exact: true }).click();
    await expect(stage.locator(".lesson-stage-option").first()).toBeFocused();
    await page.screenshot({
      path: `screenshots/lesson-stage/question-${width}.png`,
    });
    const selected =
      width === 1024
        ? (check.quiz.answer + 1) % check.quiz.options.length
        : check.quiz.answer;
    await stage.locator(".lesson-stage-option").nth(selected).focus();
    await page.keyboard.press("Enter");
    await expect(stage.locator(".lesson-stage-feedback")).toContainText(
      check.quiz.explanation,
    );
    await expect(
      stage.locator(".lesson-stage-option").nth(selected),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(stage.locator(".lesson-stage-option").first()).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const response = await fetch("/api/workspace", {
            headers: {
              "X-Workspace-Id": localStorage.getItem("knowra-workspace-id"),
            },
          });
          return (await response.json()).state.lessonPlayback[
            "python/py-values"
          ].answers;
        }),
      )
      .toMatchObject({ [check.index]: { selected } });
    await page.reload();
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    await expect(stage.locator(".lesson-stage-feedback")).toContainText(
      check.quiz.explanation,
    );
    await stage.getByRole("button", { name: "继续讲解", exact: true }).click();
    await expect(page.locator(".lesson-subtitle")).toBeVisible();
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await page
      .getByRole("button", { name: "收起对话面板", exact: true })
      .click();
    await expect
      .poll(async () => (await page.locator(".lesson-stage").boundingBox()).x)
      .toBeGreaterThan(geometry.stage.x);
    // The subtitle is portaled outside the zoomed/pannable board.
    assert.equal(await page.locator(".board-surface .lesson-stage").count(), 0);
    await page.getByRole("button", { name: "白板设置", exact: true }).click();
    await page.getByRole("tab", { name: "连续讲义", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "白板设置", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".lesson-stage")).toHaveCount(0);
    await page.getByRole("button", { name: "白板设置", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "白板设置", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "连续白板", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".lesson-subtitle")).toBeVisible();
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      reducedMotion: width === 1920,
      geometry,
      selected,
      errors,
    });
    await context.close();
    console.log(
      `PASS ${width}: sentence captions, pause, inline keyboard answer/feedback, persistence, resume, overlay clearance, tutor collapse, reading switch`,
    );
  }
  await writeFile(
    "screenshots/lesson-stage/verification.json",
    JSON.stringify(
      {
        reference:
          "User-provided Hyperknow subtitle/question screenshot; layout adaptation, not pixel parity",
        evidence,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
