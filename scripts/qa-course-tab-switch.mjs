import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/course-tab-motion", { recursive: true });
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({ reducedMotion });
    await context.addInitScript(
      ({ id, seed }) => {
        localStorage.setItem("knowra-workspace-id", id);
        localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
      },
      { id: crypto.randomUUID(), seed: initialState() },
    );
    await context.route("**/api/provider", (route) =>
      route.fulfill({ json: { configured: false } }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of process.argv.includes("--desktop")
      ? [1024, 1440, 1920]
      : [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("http://127.0.0.1:5173/course/how-ai-works");
      await expect(page.locator(".unit-heading")).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((image) => image.decode().catch(() => {})),
        );
      });
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        if (innerWidth > 760)
          document.querySelector(".course-reference-content").scrollTo(0, 250);
        else window.scrollTo(0, 250);
      });
      for (const [switchIndex, name] of [
        "资料",
        "单元",
        "资料",
        "单元",
      ].entries()) {
        const trigger = page
          .getByRole("tablist", { name: "课程视图", exact: true })
          .getByRole("tab", { name, exact: true });
        await trigger.scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          window.courseSwitchFrames = [];
          const end = performance.now() + 420;
          const sample = () => {
            const rect = (selector) => {
              const { x, y, width, height } = document
                .querySelector(selector)
                .getBoundingClientRect();
              return { x, y, width, height };
            };
            const panel = document.querySelector(".course-view-panel");
            window.courseSwitchFrames.push({
              scrollY,
              contentScrollTop: document.querySelector(
                ".course-reference-content",
              ).scrollTop,
              documentWidth: document.documentElement.clientWidth,
              documentHeight: document.documentElement.scrollHeight,
              tabs: rect(".course-detail-tabs"),
              sidebar: rect(".course-reference-sidebar"),
              content: rect(".course-reference-content"),
              opacity: Number(getComputedStyle(panel).opacity),
              transform: getComputedStyle(panel).transform,
              childTransform: getComputedStyle(panel.firstElementChild)
                .transform,
            });
            if (performance.now() < end) requestAnimationFrame(sample);
          };
          sample();
        });
        await trigger.click();
        await page.waitForTimeout(470);
        const frames = await page.evaluate(() => window.courseSwitchFrames);
        const before = frames[0];
        if (width <= 760 || switchIndex === 0)
          assert(
            (width > 760 ? before.contentScrollTop : before.scrollY) > 0,
            "regression must start from scrolled content",
          );
        for (const frame of frames) {
          assert.equal(
            frame.scrollY,
            before.scrollY,
            `${width} ${name}: scroll position changed`,
          );
          assert.equal(
            frame.documentWidth,
            before.documentWidth,
            "scrollbar must not change page width",
          );
          assert.equal(
            frame.documentHeight,
            before.documentHeight,
            "tab change must not collapse the document",
          );
          assert(
            Math.abs(frame.tabs.x - before.tabs.x) < 0.5 &&
              Math.abs(frame.tabs.y - before.tabs.y) < 0.5,
            "tabs moved",
          );
          assert(
            Math.abs(frame.content.width - before.content.width) < 0.5,
            "content width changed",
          );
          assert.equal(
            frame.transform,
            "none",
            "content must not translate while fading",
          );
          assert.equal(
            frame.childTransform,
            "none",
            "legacy content animation must not translate the view",
          );
        }
        if (reducedMotion === "no-preference") {
          assert(
            frames.some((frame) => frame.opacity > 0 && frame.opacity < 0.99),
            "fade transition should remain visible",
          );
        }
        assert.equal(frames.at(-1).opacity, 1);
        if (width > 760)
          assert.equal(
            frames.at(-1).contentScrollTop,
            0,
            "new view should start at the top of the right scroller",
          );
        if (name === "资料") {
          await expect(page.locator(".materials-section h2")).toBeInViewport();
          await page
            .getByRole("button", { name: "上传学习资料", exact: true })
            .click({ trial: true });
        }
        evidence.push({ width, reducedMotion, to: name, frames });
      }
      if (reducedMotion === "no-preference" && [390, 1440].includes(width)) {
        await page.screenshot({
          path: `screenshots/course-tab-motion/stable-${width}.png`,
        });
      }
      console.log(
        `PASS ${width}px ${reducedMotion}: scrolled outline/material switches retain document height, scroll position and tab geometry`,
      );
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    "screenshots/course-tab-motion/stability.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
