import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const output = "screenshots/auth-validation";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const width of [1440, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
    });
    await context.route("**/api/auth/me", (r) =>
      r.fulfill({ status: 401, json: { error: "fixture" } }),
    );
    let requests = 0;
    await context.route(/\/api\/auth\/(login|register)$/, (r) => {
      requests++;
      return r.fulfill({ status: 401, json: { error: "邮箱或密码不正确。" } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.nativeInvalidEvents = 0;
      document.addEventListener(
        "invalid",
        () => window.nativeInvalidEvents++,
        true,
      );
    });
    await page.goto("http://127.0.0.1:5173/login");
    await expect(page.locator("form")).toHaveAttribute("novalidate", "");
    await page.locator("#auth-email").fill("learner@example.test");
    await page.locator("#auth-password").fill("1234567");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.locator("#auth-password-error")).toHaveText(
      "密码至少需要 8 个字符。",
    );
    await expect(page.locator("#auth-password")).toBeFocused();
    await expect(page.locator("#auth-password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.locator("#auth-password")).toHaveAttribute(
      "aria-describedby",
      "auth-password-error",
    );
    assert.equal(requests, 0, "Invalid input never reaches the API");
    assert.equal(
      await page.evaluate(() => window.nativeInvalidEvents),
      0,
      "Browser validation UI never runs",
    );
    await page.screenshot({
      path: `${output}/short-password-${width}.png`,
      fullPage: true,
    });
    await page.locator("#auth-password").fill("12345678");
    await expect(page.locator("#auth-password-error")).toHaveCount(0);
    await page.locator("#auth-password").press("Enter");
    await expect(page.getByRole("alert")).toHaveText("邮箱或密码不正确。");
    assert.equal(
      requests,
      1,
      "Valid keyboard submission still reaches the API",
    );
    await page.getByRole("link", { name: "免费注册" }).click();
    await expect(page.locator("#auth-name")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.waitForTimeout(500);
    await page.locator("#auth-name").focus();
    async function focusIsUnclipped(field) {
      await page.locator(`#auth-${field}`).focus();
      const value = await page.locator(`#auth-${field}`).evaluate((e) => {
        const input = e.getBoundingClientRect();
        const css = getComputedStyle(e);
        const extra =
          parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset);
        const reveal = e.closest(".account-reveal");
        return {
          outline: css.outlineStyle,
          extra,
          overflow: getComputedStyle(reveal).overflow,
          clipped: [
            ...(function* () {
              for (let p = e.parentElement; p; p = p.parentElement) yield p;
            })(),
          ].some((p) => {
            const c = getComputedStyle(p),
              r = p.getBoundingClientRect();
            return (
              (["hidden", "clip", "auto", "scroll"].includes(c.overflowX) &&
                (input.left - extra < r.left - 0.5 ||
                  input.right + extra > r.right + 0.5)) ||
              (["hidden", "clip", "auto", "scroll"].includes(c.overflowY) &&
                (input.top - extra < r.top - 0.5 ||
                  input.bottom + extra > r.bottom + 0.5))
            );
          }),
        };
      });
      assert.notEqual(value.outline, "none", "Keep visible focus");
      assert(value.extra >= 4);
      assert.equal(
        value.overflow,
        "visible",
        "Expanded fields allow their full focus glow",
      );
      assert.equal(
        value.clipped,
        false,
        "No ancestor clips the focus boundary",
      );
    }
    await focusIsUnclipped("name");
    await page.screenshot({
      path: `${output}/name-focus-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "创建账号", exact: true }).click();
    await expect(page.locator("#auth-name-error")).toHaveText(
      "请输入你的名字。",
    );
    await expect(page.locator("#auth-confirm-error")).toHaveText(
      "请再次输入密码。",
    );
    await expect(page.locator("#auth-name")).toBeFocused();
    assert.equal(requests, 1);
    await page.locator("#auth-name").fill("   ");
    await page.locator("#auth-name").press("Tab");
    await expect(page.locator("#auth-name-error")).toHaveText(
      "请输入你的名字。",
    );
    await page.locator("#auth-name").fill("探索者");
    await expect(page.locator("#auth-name-error")).toHaveCount(0);
    await page.locator("#auth-email").fill("bad-email");
    await page.locator("#auth-email").press("Tab");
    await expect(page.locator("#auth-email-error")).toContainText(
      "请输入完整的邮箱地址",
    );
    await page.locator("#auth-email").fill("learner@example.test");
    await expect(page.locator("#auth-email-error")).toHaveCount(0);
    await page.locator("#auth-password").fill("12345678");
    await page.locator("#auth-confirm").fill("12345679");
    await page.getByRole("button", { name: "创建账号", exact: true }).click();
    await expect(page.locator("#auth-confirm-error")).toHaveText(
      "两次输入的密码不一致。",
    );
    assert.equal(requests, 1);
    await page.locator("#auth-confirm").fill("12345678");
    await expect(page.locator("#auth-confirm-error")).toHaveCount(0);
    await page.locator("#auth-password").fill("123456789");
    await expect(page.locator("#auth-confirm-error")).toHaveText(
      "两次输入的密码不一致。",
    );
    await page.locator("#auth-confirm").fill("123456789");
    await expect(page.locator("#auth-confirm-error")).toHaveCount(0);
    await focusIsUnclipped("confirm");
    await page.screenshot({
      path: `${output}/confirm-focus-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "去登录" }).click();
    await expect(page.locator("#auth-confirm")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.nativeInvalidEvents), 0);
    assert.deepEqual(errors, []);
    // Also verify a direct signup load, which skips the entry animation.
    await page.goto("http://127.0.0.1:5173/signup");
    await expect(page.locator("#auth-name")).toBeVisible();
    await focusIsUnclipped("name");
    results.push({
      width,
      customValidation: true,
      invalidRequestsBlocked: true,
      keyboardSubmit: true,
      errorRecovery: true,
      fullFocusBoundary: true,
      directSignupFocus: true,
      errors,
    });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
