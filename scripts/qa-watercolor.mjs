import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, catalog, lessonsOf } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import { newCourseDraft } from "../src/lib/course-generation.js";

const output = "screenshots/watercolor";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const seed = initialState(),
      draft = newCourseDraft();
    seed.courseDrafts[draft.id] = draft;
    const lesson = lessonsOf(
      catalog.find((c) => c.id === "study-science"),
    ).find((l) => l.id === "attention");
    const sequence = lessonSequence(lesson.content, lesson);
    seed.lessonPlayback["study-science/attention"] = {
      signature: sequence.signature,
      step: sequence.steps.length - 1,
      revealedStep: sequence.steps.length - 1,
      elapsed: sequence.steps.at(-1).duration,
      revealedProgress: 1,
      revealedNarrationProgress: 1,
      finished: true,
      answers: {},
    };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion,
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
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [name, route] of Object.entries({
      home: "/",
      courses: "/courses",
      market: "/marketplace",
      detail: "/course/linear-algebra",
      feed: "/feed",
      history: "/history",
      settings: "/settings",
      assistant: "/assistant",
      create: `/create/${draft.id}`,
      classroom: "/learn/study-science/attention",
      login: "/login",
      signup: "/signup",
    })) {
      await page.goto("http://127.0.0.1:5173" + route);
      await page.locator("#root > *").first().waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((i) => i.decode().catch(() => {})),
        );
      });
      await page.waitForTimeout(650);
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        primary: getComputedStyle(document.documentElement)
          .getPropertyValue("--brand-500")
          .trim(),
        paper: getComputedStyle(document.documentElement)
          .getPropertyValue("--surface-canvas")
          .trim(),
        background: getComputedStyle(
          document.querySelector(".app-shell") ||
            document.querySelector(".classroom") ||
            document.body,
        ).backgroundImage,
        font: getComputedStyle(document.querySelector("h1") || document.body)
          .fontFamily,
      }));
      assert.equal(
        geometry.overflow,
        false,
        `${name} horizontal page overflow`,
      );
      assert.equal(geometry.primary, "#4a6fa5");
      assert.equal(geometry.paper, "#faf8f5");
      assert.notEqual(
        geometry.background,
        "none",
        `${name} missing paper treatment`,
      );
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const e = document.activeElement,
          s = getComputedStyle(e);
        return {
          tag: e.tagName,
          outline: s.outlineStyle,
          width: s.outlineWidth,
        };
      });
      assert.notEqual(focused.tag, "BODY");
      assert.notEqual(
        focused.outline,
        "none",
        `${name} missing keyboard focus`,
      );
      await page.mouse.move(5, 5);
      await page.screenshot({ path: `${output}/${name}-${reducedMotion}.png` });
      if (name === "feed") {
        await page
          .getByRole("button", { name: "添加学习任务", exact: true })
          .click();
        await page.locator("#task-date").click();
        await expect(page.locator('[data-slot="calendar"]')).toBeVisible();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `${output}/calendar-${reducedMotion}.png`,
        });
        await page.keyboard.press("Escape");
        await expect(page.locator("#task-date")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      if (name === "classroom") {
        await page
          .getByRole("button", { name: "白板设置", exact: true })
          .click();
        const font = page.getByRole("combobox", {
          name: "白板字体",
          exact: true,
        });
        await font.click();
        await page.getByRole("option", { name: /书卷宋体/ }).click();
        await expect(page.locator(".guided-board")).toHaveAttribute(
          "data-board-font",
          "serif",
        );
        await page.screenshot({
          path: `${output}/board-settings-${reducedMotion}.png`,
        });
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "展开导师", exact: true })
          .click();
        await expect(page.locator(".class-tutor")).toBeVisible();
        await expect(page.locator(".class-tutor")).toHaveCSS("opacity", "1");
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${output}/tutor-${reducedMotion}.png` });
      }
      evidence.push({ name, reducedMotion, geometry, focused });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    "PASS 12 routes × normal/reduced motion: paper palette, layout, fonts, keyboard focus, no runtime errors",
  );
} finally {
  await browser.close();
}
