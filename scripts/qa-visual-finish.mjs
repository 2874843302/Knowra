import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";
import { mockCourseResearch } from "./fixtures/course-research.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/visual-finish", { recursive: true });
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion,
    });
    await context.addInitScript(
      ({ id, seed }) => {
        if (!localStorage.getItem("knowra-workspace-id")) {
          localStorage.setItem("knowra-workspace-id", id);
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
        }
      },
      { id: crypto.randomUUID(), seed: initialState() },
    );
    await context.route("**/api/provider", (route) =>
      route.fulfill({ json: { configured: true, model: "fixture-model" } }),
    );
    await mockCourseResearch(context);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/");
    await expect(page.locator(".learning-sketch")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await page.evaluate(() => document.fonts.ready);
    const composer = page.locator(".composer"),
      before = await composer.boundingBox();
    await expect
      .poll(() =>
        page
          .locator(".learning-sketch path")
          .first()
          .evaluate((e) => +getComputedStyle(e).opacity),
      )
      .toBe(1);
    await page.getByRole("textbox", { name: "学习主题", exact: true }).focus();
    await expect
      .poll(() =>
        page
          .locator(".learning-sketch")
          .evaluate((e) => +getComputedStyle(e).opacity),
      )
      .toBe(1);
    assert.deepEqual(
      await composer.boundingBox(),
      before,
      "Input focus and illustration must not move the form",
    );
    const checkSpotlight = async (selector, name) => {
      const surface = page.locator(selector);
      await surface.scrollIntoViewIfNeeded();
      const rect = await surface.boundingBox();
      const glow = surface.locator('[data-slot="spotlight-glow"]');
      const background = () =>
        glow.evaluate((el) => getComputedStyle(el).backgroundImage);
      await page.mouse.move(rect.x + 30, rect.y + 30);
      await expect
        .poll(() => glow.evaluate((el) => +getComputedStyle(el).opacity))
        .toBe(reducedMotion === "reduce" ? 0 : 1);
      const start = await background();
      await page.mouse.move(rect.x + rect.width - 30, rect.y + 35);
      if (reducedMotion === "reduce") assert.equal(await background(), start);
      else await expect.poll(background).not.toBe(start);
      assert.deepEqual(
        await surface.boundingBox(),
        rect,
        "Spotlight must not change the host layout",
      );
      await page.screenshot({
        path: `screenshots/visual-finish/${name}-spotlight-${reducedMotion}.png`,
      });
      await page.mouse.move(1, 1);
      await expect
        .poll(() => glow.evaluate((el) => +getComputedStyle(el).opacity))
        .toBe(0);
      evidence.push({
        reducedMotion,
        name,
        spotlightTracksPointer: reducedMotion !== "reduce",
        stableBounds: true,
      });
    };
    await checkSpotlight(".composer", "home");
    const card = page.locator(".course-card").first();
    const cardBounds = () =>
      card.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y + scrollY,
          width: rect.width,
          height: rect.height,
        };
      });
    await card.scrollIntoViewIfNeeded();
    await page.mouse.move(1, 1);
    const origin = await cardBounds();
    await card.hover({ position: { x: 50, y: 50 } });
    await expect
      .poll(async () => (await cardBounds()).y - origin.y)
      .toBeCloseTo(reducedMotion === "reduce" ? 0 : -4, 0);
    const lifted = await cardBounds();
    assert(Math.abs(lifted.width - origin.width) < 0.05);
    assert(Math.abs(lifted.height - origin.height) < 0.05);
    await page.mouse.move(1, 1);
    await expect
      .poll(async () => (await cardBounds()).y - origin.y)
      .toBeCloseTo(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `screenshots/visual-finish/home-${reducedMotion}-1440.png`,
    });
    await page
      .getByRole("textbox", { name: "学习主题", exact: true })
      .fill("学习 Vue 与 Spring");
    await page
      .locator(".composer-toolbar")
      .getByRole("button", { name: "创建课程", exact: true })
      .click();
    await expect(page.getByRole("radiogroup")).toHaveCount(4);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
      await page.getByRole("radiogroup").first().scrollIntoViewIfNeeded();
      const positions = () =>
        page
          .getByRole("radiogroup")
          .first()
          .getByRole("radio")
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const r = node.getBoundingClientRect();
              return {
                x: r.x,
                y: r.y + scrollY,
                width: r.width,
                height: r.height,
              };
            }),
          );
      const initial = await positions();
      for (const index of [1, 3, 0, 2]) {
        const radio = page
          .getByRole("radiogroup")
          .first()
          .getByRole("radio")
          .nth(index);
        await radio.focus();
        await page.keyboard.press("Space");
        await expect(radio).toHaveAttribute("aria-checked", "true");
        const current = await positions();
        current.forEach((rect, i) =>
          Object.keys(rect).forEach((key) =>
            assert(
              Math.abs(rect[key] - initial[i][key]) < 0.6,
              `${width}: selection moved option ${i}, ${key}`,
            ),
          ),
        );
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await expect
        .poll(() =>
          page
            .getByRole("radiogroup")
            .first()
            .locator('[aria-checked="true"] .generation-choice-check')
            .evaluate((element) => +getComputedStyle(element).opacity),
        )
        .toBe(1);
      const inactiveChecks = await page
        .getByRole("radiogroup")
        .first()
        .locator('[aria-checked="false"] .generation-choice-check')
        .evaluateAll((nodes) =>
          nodes.map((element) => +getComputedStyle(element).opacity),
        );
      assert(
        inactiveChecks.every((opacity) => opacity === 0),
        "Old selections must not leave ghost checks",
      );
      evidence.push({ reducedMotion, width, stationaryChoices: true });
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `screenshots/visual-finish/choices-${reducedMotion}-${width}.png`,
        });
    }
    await checkSpotlight(".generation-composer", "generation");
    await page.goto("http://127.0.0.1:5173/assistant");
    await expect(page.locator(".assistant-compose textarea")).toBeVisible();
    await checkSpotlight(".assistant-compose", "assistant");
    assert.deepEqual(errors, []);
    await context.close();
  }
  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await touchContext.route("**/api/provider", (r) =>
    r.fulfill({ json: { configured: false } }),
  );
  const touchPage = await touchContext.newPage();
  await touchPage.goto("http://127.0.0.1:5173/");
  await touchPage.getByRole("textbox", { name: "学习主题", exact: true }).tap();
  assert(
    await touchPage.evaluate(() => matchMedia("(pointer: coarse)").matches),
  );
  await expect(
    touchPage.locator('.composer [data-slot="spotlight-glow"]'),
  ).toHaveCSS("opacity", "0");
  await expect(
    touchPage.getByRole("textbox", { name: "学习主题", exact: true }),
  ).toBeFocused();
  await touchPage.screenshot({
    path: "screenshots/visual-finish/touch-composer-390.png",
  });
  evidence.push({ touch: true, staticGlow: true, focusRetained: true });
  await touchContext.close();
  await writeFile(
    "screenshots/visual-finish/verification.json",
    JSON.stringify({ fixture: true, evidence }, null, 2),
  );
  console.log(
    "PASS Ink illustration and focus keep composer stationary; cards lift and return; rapid selection never changes option geometry at four widths; reduced motion renders settled states",
  );
} finally {
  await browser.close();
}
