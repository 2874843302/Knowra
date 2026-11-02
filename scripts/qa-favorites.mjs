import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { initialState, catalog } from "../src/data.js";

const official = catalog.find((course) => course.id === "python");
const personal = {
  ...structuredClone(official),
  id: "qa-personal-favorite",
  title: "自建课程：数据与计算",
  curated: false,
  source: "AI 生成",
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("screenshots/favorites", { recursive: true });
const results = [];
try {
  for (const width of [1440, 1024]) {
    const accounts = new Map();
    const errors = [];
    const seed = initialState();
    seed.customCourses = [personal];
    seed.progress[`${official.id}/${official.units[0].lessons[0].id}`] = {
      completed: true,
      date: "2026-10-30T00:00:00Z",
    };
    const originalJoined = structuredClone(seed.joined);
    const originalProgress = structuredClone(seed.progress);
    const open = async (account) => {
      if (!accounts.has(account))
        accounts.set(account, { state: structuredClone(seed), revision: 0 });
      const workspace = accounts.get(account);
      const context = await browser.newContext({
        viewport: { width, height: 960 },
        reducedMotion: width === 1024 ? "reduce" : "no-preference",
      });
      await context.route("**/api/auth/me", (r) =>
        r.fulfill({
          json: {
            user: {
              id: account,
              name: "学习者",
              email: `${account}@example.test`,
              workspaceId: account,
            },
          },
        }),
      );
      await context.route("**/api/workspace", (r) => {
        assert.equal(r.request().headers()["x-account-id"], account);
        if (r.request().method() === "PATCH") {
          for (const op of r.request().postDataJSON().operations) {
            let target = workspace.state;
            for (const part of op.path.slice(0, -1)) target = target[part];
            if (op.op === "remove") delete target[op.path.at(-1)];
            else target[op.path.at(-1)] = op.value;
          }
          workspace.revision++;
        }
        return r.fulfill({
          json: { ...workspace, updatedAt: new Date().toISOString() },
        });
      });
      await context.route("**/api/provider", (r) =>
        r.fulfill({ json: { configured: false } }),
      );
      await context.route("**/api/ai", (r) => r.abort());
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.setDefaultTimeout(8000);
      return { context, page, workspace };
    };
    const first = await open(`favorites-a-${width}`);
    const { page, workspace } = first;
    const savedIds = () => workspace.state.bookmarks;
    await page.goto("http://127.0.0.1:5173/favorites");
    await expect(
      page.getByRole("heading", { name: "还没有收藏课程" }),
    ).toBeVisible();
    if (width === 1024)
      await page.getByRole("button", { name: "展开导航", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "我的收藏", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.goto("http://127.0.0.1:5173/marketplace");
    await page
      .getByRole("textbox", { name: "搜索课程集市" })
      .fill(official.title);
    const card = page.locator(".course-card");
    await expect(card).toHaveCount(1);
    const bookmark = card.getByRole("button", {
      name: "收藏课程",
      exact: true,
    });
    await expect(bookmark).toHaveAttribute("aria-pressed", "false");
    await bookmark.click();
    await expect(
      card.getByRole("button", { name: "取消收藏", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect.poll(savedIds).toEqual([official.id]);
    await page.getByRole("button", { name: "我的收藏", exact: true }).click();
    await expect(page).toHaveURL(/\/favorites$/);
    await expect(page.locator(".course-card")).toHaveCount(1);
    await page.goto(`http://127.0.0.1:5173/course/${personal.id}`);
    await page.getByRole("button", { name: "收藏课程", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "取消收藏", exact: true }),
    ).toContainText("已收藏");
    await expect.poll(savedIds).toEqual([official.id, personal.id]);
    await first.context.close();
    // A fresh browser has no cached workspace: collections restore through the
    // same account-scoped workspace API used by normal learning progress.
    const restored = await open(`favorites-a-${width}`);
    const restoredPage = restored.page;
    await restoredPage.goto("http://127.0.0.1:5173/favorites");
    await expect(restoredPage.locator(".course-card")).toHaveCount(2);
    await expect(restoredPage.locator(".course-card h3").first()).toHaveText(
      personal.title,
    );
    await restoredPage
      .getByRole("textbox", { name: "搜索收藏课程" })
      .fill(" 自建课程 ");
    await expect(restoredPage.locator(".course-card")).toHaveCount(1);
    await restoredPage
      .getByRole("textbox", { name: "搜索收藏课程" })
      .fill("不存在的收藏");
    await expect(
      restoredPage.getByRole("heading", { name: "没有找到相关收藏" }),
    ).toBeVisible();
    await restoredPage
      .getByRole("button", { name: "清除搜索", exact: true })
      .click();
    await expect(restoredPage.locator(".course-card")).toHaveCount(2);
    await restoredPage.screenshot({
      path: `screenshots/favorites/collection-${width}.png`,
    });
    const second = await open(`favorites-b-${width}`);
    await second.page.goto("http://127.0.0.1:5173/favorites");
    await expect(
      second.page.getByRole("heading", { name: "还没有收藏课程" }),
    ).toBeVisible();
    assert.deepEqual(second.workspace.state.bookmarks, []);
    assert.deepEqual(workspace.state.bookmarks, [official.id, personal.id]);
    await second.context.close();
    await restoredPage
      .locator(".course-card")
      .filter({
        has: restoredPage.getByRole("heading", {
          name: personal.title,
          exact: true,
        }),
      })
      .getByRole("button", { name: "取消收藏", exact: true })
      .click();
    await expect(restoredPage.locator(".course-card")).toHaveCount(1);
    await expect.poll(savedIds).toEqual([official.id]);
    await restoredPage.goto(`http://127.0.0.1:5173/course/${personal.id}`);
    await expect(
      restoredPage.getByRole("button", { name: "收藏课程", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await restoredPage.goto("http://127.0.0.1:5173/favorites");
    await restoredPage
      .getByRole("button", { name: "取消收藏", exact: true })
      .click();
    await expect(
      restoredPage.getByRole("heading", { name: "还没有收藏课程" }),
    ).toBeVisible();
    await expect.poll(savedIds).toEqual([]);
    await restoredPage.reload();
    await expect(
      restoredPage.getByRole("heading", { name: "还没有收藏课程" }),
    ).toBeVisible();
    assert.deepEqual(workspace.state.joined, originalJoined);
    assert.deepEqual(workspace.state.progress, originalProgress);
    assert.equal(
      await restoredPage.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await restored.context.close();
    results.push({
      width,
      cardAndDetail: true,
      mixedSources: true,
      search: true,
      freshBrowserRestore: true,
      accountIsolation: true,
      removal: true,
      keepsLearningProgress: true,
    });
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
