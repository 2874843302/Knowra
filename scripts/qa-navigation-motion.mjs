import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/navigation-motion", { recursive: true });
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    for (const width of process.argv.includes("--desktop")
      ? [1440]
      : [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion,
      });
      await context.addInitScript(
        ({ id, seed }) => {
          localStorage.setItem("knowra-workspace-id", id);
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
        },
        { id: crypto.randomUUID(), seed: initialState() },
      );
      await context.route("**/api/provider", (r) =>
        r.fulfill({ json: { configured: false } }),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:5173/");
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const links = [
        ["我的课程", "/courses"],
        ["学习动态", "/feed"],
        ["历史记录", "/history"],
        ["课程集市", "/marketplace"],
        ["设置与偏好", "/settings"],
        ["首页", "/"],
      ];
      for (const [name, path] of links) {
        if (width < 1051) {
          await page
            .getByRole("button", { name: "展开导航", exact: true })
            .click();
          await expect(page.locator(".sidebar")).toBeVisible();
        }
        await page.evaluate((destination) => {
          window.navigationFrames = [];
          window.navigationSampleDone = false;
          const deadline = performance.now() + 2500;
          let routeStarted = null;
          function sample() {
            const wrapper = document.querySelector(".page-transition");
            if (
              wrapper.dataset.navigation === destination &&
              routeStarted === null
            )
              routeStarted = performance.now();
            const shell = document
              .querySelector(".main-shell")
              .getBoundingClientRect();
            const sidebar = document.querySelector(".sidebar");
            const progress = document.querySelector(".navigation-progress");
            window.navigationFrames.push({
              path: wrapper.dataset.navigation,
              opacity: +getComputedStyle(wrapper).opacity,
              transform: getComputedStyle(wrapper).transform,
              x: shell.x,
              width: shell.width,
              sidebarX: sidebar?.getBoundingClientRect().x,
              progressOpacity: progress
                ? +getComputedStyle(progress).opacity
                : null,
              progressTransform: progress
                ? getComputedStyle(progress).transform
                : null,
            });
            if (
              performance.now() < deadline &&
              (routeStarted === null || performance.now() < routeStarted + 460)
            )
              requestAnimationFrame(sample);
            else window.navigationSampleDone = true;
          }
          sample();
        }, path);
        await page
          .locator(".sidebar")
          .getByRole("link", { name, exact: true })
          .click();
        await expect(page.locator(".page-transition")).toHaveAttribute(
          "data-navigation",
          path,
        );
        await expect
          .poll(() => page.evaluate(() => window.navigationSampleDone))
          .toBe(true);
        const frames = await page.evaluate(() => window.navigationFrames);
        const current = frames.filter((frame) => frame.path === path);
        assert(current.length > 0);
        assert(
          frames.every(
            (frame) =>
              frame.x === frames[0].x && frame.width === frames[0].width,
          ),
          "shell must remain anchored",
        );
        assert(
          current.every((frame) => frame.transform === "none"),
          "route animation must not move fixed or sticky descendants",
        );
        if (width > 1050)
          assert(
            frames.every((frame) => frame.sidebarX === frames[0].sidebarX),
            "sidebar must stay stationary",
          );
        if (reducedMotion === "no-preference") {
          assert(
            current.some(
              (frame) => frame.opacity > 0.55 && frame.opacity < 0.99,
            ),
            "page should visibly fade in",
          );
          assert(
            current.some(
              (frame) =>
                frame.progressOpacity > 0 && frame.progressTransform !== "none",
            ),
            "progress line should animate",
          );
          assert.equal(current.at(-1).progressOpacity, 0);
        } else {
          assert(
            current.every(
              (frame) => frame.opacity === 1 && frame.progressOpacity === null,
            ),
            "reduced motion must show content immediately",
          );
        }
        assert.equal(current.at(-1).opacity, 1);
        await expect(page.locator(".page-transition")).toHaveCount(1);
        evidence.push({ width, reducedMotion, path, frames });
      }
      if (width === 1440) {
        for (const name of ["我的课程", "历史记录", "课程集市", "设置与偏好"]) {
          await page
            .locator(".sidebar")
            .getByRole("link", { name, exact: true })
            .click({ force: true });
        }
        await expect(page.locator(".page-transition")).toHaveAttribute(
          "data-navigation",
          "/settings",
        );
        await page.waitForTimeout(400);
        await expect(page.locator(".page-transition .page")).toHaveCount(1);
        await page.goBack();
        await expect(page.locator(".page-transition")).toHaveAttribute(
          "data-navigation",
          "/marketplace",
        );
        await page.waitForTimeout(400);
      }
      await page.screenshot({
        path: `screenshots/navigation-motion/final-${width}-${reducedMotion}.png`,
      });
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}px ${reducedMotion}: six navigation destinations, fade/progress, anchored layout and immediate latest route`,
      );
      await context.close();
    }
  }
  await writeFile(
    "screenshots/navigation-motion/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
