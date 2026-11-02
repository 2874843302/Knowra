import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState } from "../src/data.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/course-scroll", { recursive: true });
try {
  for (const [width, height] of [
    [1920, 1000],
    [1440, 900],
    [1440, 768],
    [1024, 844],
  ]) {
    const seed = initialState();
    const original = catalog.find((course) => course.id === "how-ai-works");
    seed.customCourses = [
      {
        ...original,
        id: "many-units-scroll",
        units: Array.from({ length: 20 }, (_, index) => ({
          ...original.units[index % original.units.length],
          title: `单元 ${index + 1}：理解与实践`,
        })),
      },
    ];
    const context = await browser.newContext({
      viewport: { width, height },
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
    await page.goto("http://127.0.0.1:5173/course/how-ai-works");
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((image) => image.decode().catch(() => {})),
      );
    });
    await page.waitForTimeout(280);
    const content = page.locator(".course-reference-content");
    const geometry = () =>
      page.evaluate(() => {
        const box = (selector) =>
          document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          sidebar: box(".course-reference-sidebar"),
          cover: box(".course-identity-cover"),
          header: box(".app-header"),
          title: box(".course-identity h1"),
          tabs: box(".course-viewbar"),
          progress: box(".unit-progress"),
          content: box(".course-reference-content"),
          scrollY,
          leftScroll: document.querySelector(".course-reference-sidebar")
            .scrollTop,
          pageHeight: document.documentElement.scrollHeight,
        };
      });
    const before = await geometry();
    assert(before.progress.bottom <= height - 16, JSON.stringify(before));
    assert(
      before.sidebar.y >= before.header.bottom && before.pageHeight <= height,
      JSON.stringify(before),
    );
    const right = await content.boundingBox();
    await page.mouse.move(right.x + right.width / 2, right.y + 180);
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => content.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const after = await geometry();
    assert.deepEqual(
      after,
      before,
      "right scroll moved the course sidebar or page",
    );
    const scrolled = await content.evaluate((el) => el.scrollTop);
    await page.mouse.move(before.cover.x + 50, before.cover.y + 50);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(80);
    assert.equal(await content.evaluate((el) => el.scrollTop), scrolled);
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.screenshot({
      path: `screenshots/course-scroll/scrolled-${width}-${height}.png`,
    });
    await page.locator(".unit-navigation > button").nth(1).click();
    await expect(page.locator(".unit-heading h2")).toContainText(
      "理解能力与边界",
    );
    await expect(page.locator(".unit-heading h2")).toBeFocused();
    await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBe(0);
    assert.deepEqual(await geometry(), before);
    for (const tab of ["资料", "练习", "面板", "单元"]) {
      await page
        .getByRole(tab === "面板" ? "button" : "tab", {
          name: tab,
          exact: true,
        })
        .click();
      await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBe(0);
      const current = await geometry();
      for (const key of [
        "cover",
        "title",
        "tabs",
        "header",
        "sidebar",
        "content",
      ])
        assert.deepEqual(current[key], before[key], `${tab} moved ${key}`);
      assert(current.progress.bottom <= height - 16 && current.scrollY === 0);
    }
    await page.getByRole("button", { name: "安排学习", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("http://127.0.0.1:5173/course/many-units-scroll");
    const navigation = page.getByRole("navigation", {
      name: "课程单元",
      exact: true,
    });
    await expect(navigation.getByRole("button")).toHaveCount(20);
    await expect
      .poll(() =>
        page
          .locator(".course-reference-sidebar")
          .evaluate((el) => el.scrollHeight > el.clientHeight),
      )
      .toBe(true);
    const left = page.locator(".course-reference-sidebar");
    const rightBeforeLeftScroll = await content.evaluate((el) => el.scrollTop);
    const leftBox = await left.boundingBox();
    await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + 180);
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => left.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    assert.equal(
      await content.evaluate((el) => el.scrollTop),
      rightBeforeLeftScroll,
    );
    const leftScrollBeforeRight = await left.evaluate((el) => el.scrollTop);
    await page.mouse.move(right.x + right.width / 2, right.y + 180);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => content.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(rightBeforeLeftScroll);
    assert.equal(
      await left.evaluate((el) => el.scrollTop),
      leftScrollBeforeRight,
    );
    await page.screenshot({
      path: `screenshots/course-scroll/independent-${width}-${height}.png`,
    });
    await navigation.getByRole("button").last().click();
    await expect(page.locator(".unit-heading h2")).toContainText("单元 20");
    const many = await geometry();
    assert(many.scrollY === 0 && many.leftScroll > 0);
    await page.getByRole("link", { name: "退出课程", exact: true }).click();
    await expect(page).toHaveURL(/\/marketplace$/);
    await expect(page.locator(".course-card").first()).toBeVisible();
    await page.waitForTimeout(280);
    await page.mouse.move(width - 80, height - 150);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    assert.deepEqual(errors, []);
    evidence.push({ width, height, before, after, many, errors });
    await context.close();
    console.log(
      `PASS ${width}x${height}: independent left/right scrolling, fixed header/page, unit focus/reset, stable tabs, dialogs, long directory and route cleanup`,
    );
  }
  await writeFile(
    "screenshots/course-scroll/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
