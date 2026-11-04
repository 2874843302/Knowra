import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { appearanceThemes } from "../src/lib/appearance-themes.js";
import { initialState } from "../src/data.js";

const folder = ".test/report/appearance-themes";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
let activePage;
try {
  for (const width of [1440, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
    });
    const accounts = { first: initialState(), second: initialState() };
    accounts.first.appearance.boardFont = "serif";
    accounts.first.appearance.sidebarCollapsed = width === 1024;
    delete accounts.second.appearance.theme; // Older accounts have no theme field.
    let account = "first",
      revision = 0,
      failSync = false;
    const errors = [];
    await context.route("**/api/auth/me", (r) =>
      r.fulfill(
        account
          ? {
              json: {
                user: {
                  id: `theme-${account}-${width}`,
                  name: "风格测试",
                  workspaceId: `theme-${account}-${width}`,
                },
              },
            }
          : { status: 401, json: { error: "请先登录" } },
      ),
    );
    await context.route("**/api/workspace", (r) => {
      const state = accounts[account];
      if (r.request().method() === "PATCH") {
        if (failSync)
          return r.fulfill({ status: 503, json: { error: "测试保存失败" } });
        for (const op of r.request().postDataJSON().operations) {
          let target = state;
          for (const key of op.path.slice(0, -1)) target = target[key] ??= {};
          if (op.op === "remove") delete target[op.path.at(-1)];
          else target[op.path.at(-1)] = op.value;
        }
        revision++;
      }
      return r.fulfill({ json: { state, revision } });
    });
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: true, model: "fixture", profiles: [] } }),
    );
    await context.route("**/api/tts/status", (r) =>
      r.fulfill({ json: { ready: false, voices: [] } }),
    );
    await context.route("**/api/auth/tokens", (r) =>
      r.fulfill({ json: { tokens: [] } }),
    );
    await context.route("**/api/course-jobs", (r) =>
      r.fulfill({ json: { jobs: [] } }),
    );
    await context.route("**/api/ai", (r) => r.abort());
    const page = await context.newPage();
    activePage = page;
    page.on("pageerror", (e) => errors.push(e.message));
    const root = page.locator("html");
    const ready = async (route) => {
      await page.goto(`http://127.0.0.1:5173${route}`);
      await page.evaluate(() => document.fonts.ready);
    };
    const checkNoOverflow = async () => {
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "No page horizontal overflow",
      );
    };
    const choose = async (theme) => {
      await page.getByText(theme.name, { exact: true }).click();
      await expect(
        page.getByRole("radio", { name: theme.name, exact: true }),
      ).toBeChecked();
      await expect(root).toHaveAttribute("data-ui-theme", theme.id);
      await expect.poll(() => accounts.first.appearance.theme).toBe(theme.id);
    };
    await ready("/settings#appearance");
    await expect(
      page.getByRole("tab", { name: "外观风格", exact: true }),
    ).toHaveAttribute("data-state", "active");
    await expect(page.getByRole("radio")).toHaveCount(5);
    const samples = [];
    for (const theme of appearanceThemes) {
      await choose(theme);
      await checkNoOverflow();
      await expect(root).toHaveCSS("color-scheme", theme.mode);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `${folder}/${theme.id}-settings-${width}.png`,
        fullPage: true,
      });
      const colors = await page
        .locator(".appearance-settings")
        .evaluate((el) => ({
          background: getComputedStyle(el).backgroundColor,
          radius: getComputedStyle(el).borderRadius,
          ink: getComputedStyle(el).color,
        }));
      samples.push({ id: theme.id, ...colors });
      await ready("/");
      await expect(root).toHaveAttribute("data-ui-theme", theme.id);
      await expect(
        page.getByRole("textbox", { name: "学习主题" }),
      ).toBeVisible();
      await page.screenshot({
        path: `${folder}/${theme.id}-home-${width}.png`,
      });
      await ready("/courses");
      await expect(root).toHaveAttribute("data-ui-theme", theme.id);
      await expect(page.locator(".learning-ticket").first()).toBeVisible();
      await checkNoOverflow();
      await page.screenshot({
        path: `${folder}/${theme.id}-courses-${width}.png`,
      });
      await ready("/course/linear-algebra");
      await expect(root).toHaveAttribute("data-ui-theme", theme.id);
      await expect(
        page.getByRole("button", { name: "AI 协助", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `${folder}/${theme.id}-detail-${width}.png`,
      });
      await ready("/learn/linear-algebra/vectors");
      await expect(root).toHaveAttribute("data-ui-theme", theme.id);
      const boardFont = await page
        .locator(".guided-board")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--font-board"),
        );
      assert.ok(
        boardFont.includes("Song"),
        "Theme does not replace the learner's board font",
      );
      await page.getByRole("button", { name: "展开导师", exact: true }).click();
      await expect(page.locator(".class-tutor")).toHaveCSS("opacity", "1");
      await page.screenshot({
        path: `${folder}/${theme.id}-classroom-${width}.png`,
      });
      await ready("/settings#appearance");
    }
    assert.equal(new Set(samples.map((s) => s.background)).size, 5);
    assert.ok(new Set(samples.map((s) => s.radius)).size >= 4);
    const minimal = appearanceThemes.find((t) => t.id === "minimal");
    await choose(minimal);
    await page.getByRole("radio", { name: minimal.name, exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-ui-theme", "paper");
    await expect(
      page.getByRole("radio", { name: "书卷时光", exact: true }),
    ).toBeFocused();
    await expect.poll(() => accounts.first.appearance.theme).toBe("paper");
    assert.equal(accounts.first.appearance.boardFont, "serif");
    assert.equal(accounts.first.appearance.sidebarCollapsed, width === 1024);

    failSync = true;
    await page.getByText("静夜专注", { exact: true }).click();
    await expect(root).toHaveAttribute("data-ui-theme", "night");
    await expect(page.getByText("暂存本机，等待同步")).toBeVisible();
    assert.equal(accounts.first.appearance.theme, "paper");
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              `knowra-workspace-v1:theme-first-${innerWidth}`,
            ),
          ).appearance.theme,
      ),
      "night",
    );
    failSync = false;
    await page.getByRole("button", { name: "重试保存", exact: true }).click();
    await expect.poll(() => accounts.first.appearance.theme).toBe("night");
    await page.reload();
    await expect(root).toHaveAttribute("data-ui-theme", "night");
    account = null;
    await ready("/login");
    await expect(
      page.getByRole("textbox", { name: "邮箱", exact: true }),
    ).toBeVisible();
    await expect(root).toHaveAttribute("data-ui-theme", "night");
    await page.screenshot({ path: `${folder}/night-login-${width}.png` });
    account = "first";
    await ready("/settings#appearance");
    // Server restore works after removing the account cache.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith("knowra-")) localStorage.removeItem(key);
    });
    await page.reload();
    await expect(root).toHaveAttribute("data-ui-theme", "night");
    await expect(
      page.getByRole("radio", { name: "静夜专注", exact: true }),
    ).toBeChecked();

    await ready("/assistant");
    await expect(
      page.getByRole("button", { name: "语音输入", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "输入问题", exact: true })
      .fill("深色下继续提问");
    await page.screenshot({ path: `${folder}/night-assistant-${width}.png` });
    await ready("/courses");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: `${folder}/night-search-${width}.png` });
    await page.keyboard.press("Escape");

    account = "second";
    await ready("/settings#appearance");
    await expect(root).toHaveAttribute("data-ui-theme", "watercolor");
    await expect(
      page.getByRole("radio", { name: "水彩漫游", exact: true }),
    ).toBeChecked();
    account = "first";
    await page.reload();
    await expect(root).toHaveAttribute("data-ui-theme", "night");
    await page.getByRole("button", { name: "恢复水彩", exact: true }).click();
    await expect(root).toHaveAttribute("data-ui-theme", "watercolor");
    await expect.poll(() => accounts.first.appearance.theme).toBe("watercolor");
    await expect(
      page.getByRole("button", { name: "恢复水彩", exact: true }),
    ).toBeDisabled();
    assert.equal(errors.length, 0, errors.join("\n"));
    results.push({
      width,
      samples,
      keyboard: true,
      syncRetry: true,
      serverRestore: true,
      accountIsolation: true,
      boardFontPreserved: true,
      errors,
    });
    await context.close();
  }
  await writeFile(`${folder}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  await activePage
    ?.screenshot({ path: `${folder}/failure.png`, fullPage: true })
    .catch(() => {});
  console.error(
    await activePage
      ?.locator("body")
      .innerText()
      .then((t) => t.slice(-1000))
      .catch(() => ""),
  );
  throw error;
} finally {
  await browser.close();
}
