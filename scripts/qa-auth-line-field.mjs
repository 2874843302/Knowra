import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const output = "screenshots/auth-line-field";
await mkdir(output, { recursive: true });
const results = [];
try {
  for (const width of [1440, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      window.markSamplingReads = 0;
      const original = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        window.markSamplingReads++;
        return original.apply(this, args);
      };
    });
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "fixture" } }),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/login");
    const canvas = page.locator(".identity-line-field canvas");
    await expect(canvas).toHaveAttribute("data-frames", /\d+/);
    await expect(page.locator(".auth-showcase")).toHaveAttribute(
      "data-intro",
      "complete",
    );
    assert.equal(
      await page.evaluate(() => window.markSamplingReads),
      1,
      "Strict Mode still samples only once",
    );
    const toggle = page.getByRole("button", { name: "线条动效", exact: true });
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      width === 1440 ? "true" : "false",
    );
    if (width === 1440) {
      const before = await canvas.getAttribute("data-frames"),
        imageBefore = await canvas.evaluate((c) => c.toDataURL());
      await page.waitForTimeout(300);
      assert(
        Number(await canvas.getAttribute("data-frames")) > Number(before),
        "The idle field flows",
      );
      assert.notEqual(
        await canvas.evaluate((c) => c.toDataURL()),
        imageBefore,
        "Idle line weights change",
      );
    } else {
      const before = await canvas.getAttribute("data-frames");
      await page.waitForTimeout(200);
      assert.equal(
        await canvas.getAttribute("data-frames"),
        before,
        "Reduced motion has no continuous RAF",
      );
    }
    await page.getByRole("button", { name: "展开课程体验卡片" }).focus();
    await page.waitForTimeout(320);
    await expect(canvas).toHaveAttribute("data-targets", /\[\[/);
    await page.screenshot({ path: `${output}/focused-${width}.png` });
    if (width === 1440) {
      const box = await canvas.boundingBox();
      await page.mouse.move(
        box.x + box.width * 0.45,
        box.y + box.height * 0.35,
      );
      await expect
        .poll(async () =>
          Number(await canvas.getAttribute("data-displacement")),
        )
        .toBeGreaterThan(0.2);
      await page.screenshot({ path: `${output}/pointer-${width}.png` });
      const detected = new Set([await canvas.getAttribute("data-targets")]);
      for (const fraction of [0.32, 0.52, 0.67]) {
        await page.mouse.move(
          box.x + box.width * fraction,
          box.y + box.height * 0.6,
        );
        await page.waitForTimeout(160);
        detected.add(await canvas.getAttribute("data-targets"));
      }
      assert(detected.size > 1, "Detection follows the changing numeric field");
      await page.waitForTimeout(2000);
      assert(
        Number(await canvas.getAttribute("data-displacement")) < 0.08,
        "A stationary pointer allows the spring to settle",
      );
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(100);
    const paused = await canvas.getAttribute("data-frames");
    await page.waitForTimeout(220);
    assert.equal(
      await canvas.getAttribute("data-frames"),
      paused,
      "Paused motion stops scheduling frames",
    );
    const oldSize = await canvas.evaluate((c) => ({
      width: c.width,
      height: c.height,
      cssWidth: c.clientWidth,
      cssHeight: c.clientHeight,
    }));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await expect
      .poll(() => canvas.evaluate((c) => c.width))
      .toBe(oldSize.width * 2);
    const highDpi = await canvas.evaluate((c) => ({
      width: c.width,
      height: c.height,
      cssWidth: c.clientWidth,
      cssHeight: c.clientHeight,
    }));
    assert.equal(highDpi.height, oldSize.height * 2);
    assert.equal(highDpi.cssWidth, oldSize.cssWidth);
    assert.equal(highDpi.cssHeight, oldSize.cssHeight);
    assert.equal(
      await page.evaluate(() => window.markSamplingReads),
      1,
      "DPR does not resample",
    );
    await toggle.click();
    await expect(canvas).toHaveAttribute("data-running", "true");
    await page.getByRole("button", { name: "查看线条" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").locator("code")).toContainText(
      "M12 4.7",
    );
    const modalFrames = await canvas.getAttribute("data-frames");
    await page.waitForTimeout(220);
    assert.equal(
      await canvas.getAttribute("data-frames"),
      modalFrames,
      "Source dialog suspends the canvas",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-frames")))
      .toBeGreaterThan(Number(modalFrames));
    await page.evaluate(() => {
      document.querySelector(".auth-showcase").style.display = "none";
    });
    await page.waitForTimeout(100);
    const hiddenFrames = await canvas.getAttribute("data-frames");
    await page.waitForTimeout(200);
    assert.equal(
      await canvas.getAttribute("data-frames"),
      hiddenFrames,
      "Offscreen preview stops painting",
    );
    await page.evaluate(() => {
      document.querySelector(".auth-showcase").style.display = "";
    });
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-frames")))
      .toBeGreaterThan(Number(hiddenFrames));
    await toggle.click();
    await page.evaluate(() => {
      window.markCanvas = document.querySelector(".identity-line-field canvas");
    });
    await page.getByRole("link", { name: "免费注册" }).click();
    await expect(page.locator("#auth-name")).toBeVisible();
    assert(
      await page.evaluate(
        () =>
          window.markCanvas ===
          document.querySelector(".identity-line-field canvas"),
      ),
      "Mode switch preserves canvas",
    );
    assert.equal(await page.evaluate(() => window.markSamplingReads), 1);
    await page.screenshot({ path: `${output}/signup-${width}.png` });
    assert.deepEqual(errors, []);
    results.push({
      width,
      oneSourceRead: true,
      idleMotionOrReducedMotion: true,
      pointerSettles: width === 1440,
      pausedDprChange: true,
      modalSuspension: true,
      modePreserved: true,
      errors,
    });
    await context.close();
  }
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.Path2D = undefined;
  });
  await context.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  const page = await context.newPage(),
    unsupportedErrors = [];
  page.on("pageerror", (e) => unsupportedErrors.push(e.message));
  await page.goto("http://127.0.0.1:5173/login");
  await expect(page.locator(".identity-line-fallback")).toBeVisible();
  assert.deepEqual(unsupportedErrors, []);
  await context.close();
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ results, unsupportedFallback: true }));
} finally {
  await browser.close();
}
