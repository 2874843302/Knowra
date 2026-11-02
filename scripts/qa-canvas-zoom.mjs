import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, lessonsOf, initialState } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
await mkdir("screenshots/canvas-zoom", { recursive: true });
try {
  for (const width of [1440, 1024]) {
    const seed = initialState();
    const lesson = lessonsOf(catalog.find((item) => item.id === "python"))[0];
    const sequence = lessonSequence(lesson.content, lesson);
    seed.lessonPlayback = {
      "python/py-values": {
        signature: sequence.signature,
        step: 1,
        revealedStep: 1,
        elapsed: sequence.steps[1].duration / 2,
        revealedProgress: 1,
        revealedNarrationProgress: 1,
        answers: {},
        rate: 1,
      },
    };
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    await context.addInitScript(
      ({ seed, id }) => {
        localStorage.setItem("knowra-workspace-id", id);
        localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
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
    await page.goto("http://127.0.0.1:5173/learn/python/py-values");
    await page.evaluate(() => document.fonts.ready);
    const document = page.locator(".board-document");
    const probe = page.locator(".board-frame h2").first();
    const zoom = () =>
      document.evaluate((el) => Number(getComputedStyle(el).zoom));
    const bounds = () =>
      probe.evaluate((element) => {
        const range = window.document.createRange();
        range.selectNodeContents(element);
        const box = range.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      });
    // Put the existing heading under the pointer, away from floating controls.
    await page.mouse.move(width - 100, 600);
    await page.mouse.down();
    await page.mouse.move(width - 20, 770, { steps: 5 });
    await page.mouse.up();
    let anchor = await bounds();
    const controls = await page.locator(".board-modebar").boundingBox();
    const initial = await page.evaluate(() => ({
      width: innerWidth,
      dpr: devicePixelRatio,
      scale: visualViewport.scale,
    }));
    await page.evaluate(() => {
      window.zoomEvents = [];
      document.addEventListener("wheel", (event) => {
        if (event.ctrlKey)
          window.zoomEvents.push({
            prevented: event.defaultPrevented,
            trusted: event.isTrusted,
          });
      });
    });
    const wheel = async (delta, expected) => {
      await page.mouse.move(anchor.x, anchor.y);
      await page.keyboard.down("Control");
      try {
        await page.mouse.wheel(0, delta);
      } finally {
        await page.keyboard.up("Control");
      }
      await expect.poll(zoom).toBe(expected / 100);
      const after = await bounds();
      assert(
        Math.abs(after.x - anchor.x) < 2 && Math.abs(after.y - anchor.y) < 2,
        `pointer anchor drift: ${JSON.stringify({ anchor, after })}`,
      );
    };
    await wheel(-100, 110);
    await wheel(100, 100);
    await page.getByRole("button", { name: "选择文字", exact: true }).click();
    await wheel(-100, 110);
    await page.getByRole("button", { name: "拖动画布", exact: true }).click();
    await wheel(-100, 121);
    await wheel(-100, 133);
    await wheel(-100, 140);
    await wheel(-100, 140);
    for (const value of [127, 116, 105, 96, 87, 79, 72, 70, 70])
      await wheel(100, value);
    assert.deepEqual(
      await page.locator(".board-modebar").boundingBox(),
      controls,
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        width: innerWidth,
        dpr: devicePixelRatio,
        scale: visualViewport.scale,
      })),
      initial,
    );
    const events = await page.evaluate(() => window.zoomEvents);
    assert(
      events.length >= 16 &&
        events.every((item) => item.prevented && item.trusted),
    );
    await page.getByRole("button", { name: "白板设置", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "重置缩放", exact: true }),
    ).toHaveText("70%");
    await page.getByRole("button", { name: "重置缩放", exact: true }).click();
    await expect.poll(zoom).toBe(1);
    await page.keyboard.press("Escape");
    anchor = await bounds();
    await probe.evaluate((element, point) => {
      // High resolution wheels can emit deltas too small to change an integer
      // percentage individually; the gesture should still accumulate.
      for (let i = 0; i < 100; i++)
        element.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            deltaY: -1,
            clientX: point.x,
            clientY: point.y,
          }),
        );
    }, anchor);
    await expect.poll(zoom).toBe(1.1);
    const accumulated = await bounds();
    assert(
      Math.abs(accumulated.x - anchor.x) < 2 &&
        Math.abs(accumulated.y - anchor.y) < 2,
    );
    await wheel(-100, 121);
    await wheel(-100, 133);
    await page.getByRole("button", { name: "白板设置", exact: true }).click();
    await page.getByRole("button", { name: "放大白板", exact: true }).click();
    await expect.poll(zoom).toBe(1.4);
    await expect(
      page.getByRole("button", { name: "放大白板", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "重置缩放", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.mouse.move(width - 100, 650);
    const beforePan = await page.locator(".board-surface").boundingBox();
    await page.mouse.wheel(25, 60);
    await expect
      .poll(async () =>
        Math.round(
          (await page.locator(".board-surface").boundingBox()).x - beforePan.x,
        ),
      )
      .toBe(-25);
    await expect
      .poll(async () =>
        Math.round(
          (await page.locator(".board-surface").boundingBox()).y - beforePan.y,
        ),
      )
      .toBe(-60);
    await expect.poll(zoom).toBe(1);
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "暂停讲解", exact: true }),
    ).toBeVisible();
    await page.mouse.move(width - 100, 650);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect.poll(zoom).toBe(1.1);
    await expect(
      page.getByRole("button", { name: "暂停讲解", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `screenshots/canvas-zoom/zoom-${width}.png`,
    });
    assert.deepEqual(errors, []);
    results.push({ width, events, initial, errors });
    console.log(
      `PASS ${width}: Ctrl-wheel zoom, pointer anchor after pan, select mode, limits, browser zoom blocked, fixed tools, settings sync, normal pan and uninterrupted teaching`,
    );
    await context.close();
  }
  await writeFile(
    "screenshots/canvas-zoom/verification.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}
