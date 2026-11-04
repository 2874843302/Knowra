import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.KNOWRA_QA_BASE || "http://127.0.0.1:5173";
const output = "screenshots/auth-motion";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const sameGeometry = (a, b) =>
  ["x", "y", "width", "height"].every((key) => Math.abs(a[key] - b[key]) < 1.5);
try {
  for (const width of [1440, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
    });
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "fixture" } }),
    );
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.authIntroSamples = [];
      const sample = () => {
        const layers = [...document.querySelectorAll(".auth-preview-layer")];
        if (layers.length === 3) {
          window.authIntroSamples.push({
            time: performance.now(),
            opacity: layers.map((layer) =>
              Number(getComputedStyle(layer).opacity),
            ),
          });
          if (window.authIntroSamples.length > 150) return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/login?returnTo=%2Fcourses`);
    const stack = page.getByRole("button", { name: "展开课程体验卡片" });
    const showcase = page.locator(".auth-showcase");
    const board = page.locator(".auth-preview-board");
    await expect(stack).toHaveAttribute("aria-expanded", "false");
    await expect(showcase).toHaveAttribute("data-intro", "complete");
    const samples = await page.evaluate(() => window.authIntroSamples);
    if (width === 1440) {
      const firstVisible = [0, 1, 2].map(
        (index) => samples.find((sample) => sample.opacity[index] > 0.1)?.time,
      );
      assert(firstVisible.every(Number.isFinite), "All cards enter");
      assert(
        // A busy browser can paint two adjacent entrances in the same frame.
        firstVisible[0] <= firstVisible[1] &&
          firstVisible[1] <= firstVisible[2],
        `Course, whiteboard, then success enter in order: ${JSON.stringify(firstVisible)}`,
      );
      assert(
        firstVisible[2] - firstVisible[0] > 200,
        "Entrance is visibly progressive",
      );
    } else {
      assert(
        samples.every((sample) => sample.opacity.every((value) => value === 1)),
        "Reduced motion shows cards immediately",
      );
    }
    const content = await page.locator(".auth-content").boundingBox();
    const viewportWidth = await page.evaluate(
      () => document.documentElement.getBoundingClientRect().width,
    );
    assert(
      Math.abs(content.x + content.width / 2 - viewportWidth / 2) < 2,
      "Composition centered horizontally",
    );
    assert(
      Math.abs(content.y + content.height / 2 - 500) < 2,
      "Composition centered vertically",
    );
    assert(content.width <= 1360, "Composition fits its desktop container");
    assert.equal(
      await stack.locator("canvas").count(),
      0,
      "Journey cards contain workflow content",
    );
    const field = page.locator(".identity-line-field");
    const fieldBox = await field.boundingBox();
    const stackBox = await stack.boundingBox();
    assert(
      fieldBox.width >= 260 && fieldBox.height >= 260,
      "Independent animation is larger than the former 140px preview",
    );
    assert(
      fieldBox.x >= stackBox.x + stackBox.width,
      "Animation sits to the right of the workflow",
    );
    const collapsed = await board.boundingBox();
    await page.waitForTimeout(600);
    assert(
      sameGeometry(collapsed, await board.boundingBox()),
      "Cards stay still after their first entrance",
    );
    await page.screenshot({ path: `${output}/stack-${width}.png` });
    const form = await page.locator(".auth-form").boundingBox();
    await stack.hover();
    await expect(stack).toHaveAttribute("aria-expanded", "true");
    await page.waitForTimeout(320);
    const expanded = await board.boundingBox();
    assert(
      sameGeometry(fieldBox, await field.boundingBox()),
      "Unfolding cards never moves the animation",
    );
    assert(
      expanded.x + expanded.width < fieldBox.x,
      "Expanded workflow does not overlap the animation",
    );
    assert(expanded.y > collapsed.y + 40, "Hover quickly unfolds the stack");
    assert(
      sameGeometry(form, await page.locator(".auth-form").boundingBox()),
      "Preview never shifts the form",
    );
    const courseText = await page.locator(".auth-preview-units").boundingBox();
    const successText = await page
      .locator(".auth-preview-success h3")
      .boundingBox();
    assert(
      courseText.y + courseText.height < expanded.y,
      "Expanded course text is not covered",
    );
    assert(
      successText.y > expanded.y + expanded.height,
      "Success text is not covered",
    );
    await page.screenshot({ path: `${output}/expanded-${width}.png` });
    await page.locator(".auth-brand").hover();
    await expect(stack).toHaveAttribute("aria-expanded", "false");
    await page.waitForTimeout(320);
    assert(
      sameGeometry(collapsed, await board.boundingBox()),
      "Leaving restores the stack",
    );
    await stack.focus();
    await expect(stack).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(stack).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(stack).toHaveAttribute("aria-expanded", "true");
    await page.locator("#auth-email").fill("learner@example.test");
    await expect(stack).toHaveAttribute("aria-expanded", "false");
    await page.evaluate(() => {
      window.previewNode = document.querySelector(".auth-showcase");
    });
    await page.getByRole("link", { name: "免费注册" }).click();
    await expect(page.locator("#auth-name")).toBeVisible();
    await expect(showcase).toHaveAttribute("data-intro", "complete");
    await page.waitForTimeout(300);
    await expect(page.locator("#auth-email")).toHaveValue(
      "learner@example.test",
    );
    assert(
      await page.evaluate(
        () => window.previewNode === document.querySelector(".auth-showcase"),
      ),
      "Switching modes preserves preview",
    );
    const signup = await page.locator(".auth-content").boundingBox();
    assert(
      Math.abs(signup.y + signup.height / 2 - 500) < 2,
      "Signup centered too",
    );
    await page.screenshot({ path: `${output}/signup-${width}.png` });
    await page.getByRole("link", { name: "去登录", exact: true }).click();
    await expect(page.locator("#auth-name")).toHaveCount(0);
    // The preview must respond even if the user reaches it during its entrance.
    await page.reload({ waitUntil: "domcontentloaded" });
    await stack.focus();
    await expect(stack).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(
        () =>
          page
            .locator(".auth-preview-layer")
            .evaluateAll((layers) =>
              layers.every(
                (layer) => Number(getComputedStyle(layer).opacity) > 0.99,
              ),
            ),
        { timeout: 400 },
      )
      .toBe(true);
    assert.deepEqual(errors, []);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "No horizontal overflow",
    );
    results.push({
      width,
      reducedMotion: width === 1024,
      centered: true,
      compactStack: true,
      progressiveEntrance: width === 1440,
      interruptibleEntrance: true,
      hoverAndKeyboard: true,
      quickModeSwitch: true,
      pageErrors: errors,
    });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
