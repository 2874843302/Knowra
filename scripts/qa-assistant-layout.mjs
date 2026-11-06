import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, catalog } from "../src/data.js";

const folder = ".test/report/assistant-layout";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const [width, theme] of [
    [1440, "minimal"],
    [1024, "minimal"],
    [1440, "watercolor"],
    [1440, "night"],
  ]) {
    const context = await browser.newContext({
      viewport: {
        width,
        height: width === 1440 && theme === "minimal" ? 720 : 900,
      },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
    });
    const state = initialState();
    const course = catalog.find((c) => c.id === "python");
    state.appearance.theme = theme;
    state.appearance.narrationVoice = false;
    state.conversations = Array.from({ length: 5 }, (_, i) => ({
      id: `empty-${i}`,
      title: `课程答疑：${course.title}`,
      messages: [],
      courseContext: { courseId: course.id, lessonId: null },
      webSearch: false,
    }));
    state.conversations.push({
      id: "history",
      title: "有内容的对话",
      messages: [
        { role: "user", content: "你好" },
        { role: "assistant", content: "一起学习。" },
      ],
    });
    let revision = 0;
    const calls = [],
      errors = [];
    await context.route("**/api/**", (r) => r.fulfill({ json: {} }));
    await context.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          user: { id: "layout-fixture", name: "学习者", workspaceId: "layout" },
        },
      }),
    );
    await context.route("**/api/workspace", (r) => {
      if (r.request().method() === "PATCH") {
        for (const op of r.request().postDataJSON().operations) {
          let target = state;
          for (const part of op.path.slice(0, -1)) target = target[part] ??= {};
          if (op.op === "remove") delete target[op.path.at(-1)];
          else target[op.path.at(-1)] = op.value;
        }
        revision++;
      }
      return r.fulfill({ json: { state, revision } });
    });
    await context.route("**/api/provider", (r) =>
      r.fulfill({
        json: {
          configured: true,
          activeId: "fixture",
          id: "fixture",
          name: "学习模型",
          model: "fixture",
          profiles: [
            {
              id: "fixture",
              name: "学习模型",
              configured: true,
              model: "fixture",
            },
          ],
        },
      }),
    );
    await context.route("**/api/ai/stream", (r) => {
      calls.push(r.request().postDataJSON());
      return r.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"delta":"先用一个熟悉的例子理解，再回到课程概念。"}\n\ndata: {"done":true}\n\n',
      });
    });
    state.conversations.find((c) => c.id === "history").messages = Array.from(
      { length: 20 },
      (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: `历史消息 ${i}。${"用于检查阅读位置和输入框展开后的底部跟随。".repeat(8)}`,
      }),
    );
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/assistant/empty-0");
    await expect(page.locator("main[data-empty=true]")).toBeVisible();
    await expect(page.locator(".assistant-course-context")).toHaveCount(1);
    await expect(
      page.locator(".assistant-context-chip, .assistant-recent"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "这门课，哪里还没想明白？" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => {
      const rect = (s) =>
        document.querySelector(s).getBoundingClientRect().toJSON();
      const viewport = document.querySelector(".easy-chat-messages");
      return {
        header: rect(".easy-chat-header"),
        heading: rect(".assistant-empty h2"),
        context: rect(".assistant-course-context"),
        composer: rect(".assistant-compose-wrap"),
        viewport: rect(".easy-chat-messages"),
        scrollTop: viewport.scrollTop,
        background: getComputedStyle(document.querySelector(".assistant-empty"))
          .backgroundColor,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(
      layout.scrollTop,
      0,
      "An empty conversation must start at the heading",
    );
    assert.ok(layout.heading.top >= layout.header.bottom);
    assert.ok(layout.composer.bottom <= layout.height);
    assert.ok(
      Math.abs(layout.header.x - layout.composer.x) < 2,
      "Header and input share one axis",
    );
    assert.equal(
      layout.background,
      "rgba(0, 0, 0, 0)",
      "No giant empty-state card",
    );
    assert.equal(layout.overflow, false);
    const geometry = () =>
      page.evaluate(() => {
        const viewport = document.querySelector(".easy-chat-messages");
        const rects = [
          ...document.querySelectorAll(
            ".assistant-suggestions > button, .assistant-compose-wrap",
          ),
        ].map((n) => {
          const r = n.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        });
        return {
          rects,
          scroll: [
            viewport.scrollTop,
            viewport.scrollWidth,
            viewport.scrollHeight,
            viewport.clientWidth,
            viewport.clientHeight,
          ],
        };
      });
    await page.mouse.move(0, 0);
    const beforeHover = await geometry();
    const stableFrames = async () => {
      for (let frame = 0; frame < 8; frame++) {
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const current = await geometry();
        for (let i = 0; i < current.rects.length; i++)
          current.rects[i].forEach((n, j) =>
            assert.ok(
              Math.abs(n - beforeHover.rects[i][j]) < 0.75,
              "Hover/press must not change card or composer geometry",
            ),
          );
        assert.deepEqual(
          current.scroll,
          beforeHover.scroll,
          "Hover/press must not toggle viewport overflow",
        );
      }
    };
    for (const card of await page
      .locator(".assistant-suggestions > button")
      .all()) {
      const bounds = await card.boundingBox();
      await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2);
      await stableFrames();
      await page.mouse.down();
      await stableFrames();
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await stableFrames();
    }
    await page.screenshot({ path: `${folder}/${theme}-${width}.png` });
    await page.getByRole("combobox", { name: "历史对话" }).click();
    await expect(page.getByRole("option")).toHaveCount(2);
    await page.keyboard.press("Escape");
    const input = page.getByRole("textbox", { name: "输入问题", exact: true });
    await page.getByRole("button", { name: /梳理路线/ }).click();
    await expect(input).toHaveValue(new RegExp(course.title));
    assert.equal(calls.length, 0, "Suggestions only prepare the draft");
    await page.getByRole("combobox", { name: "协助范围" }).click();
    await page.getByRole("option").nth(1).click();
    await expect(
      page.getByRole("combobox", { name: "协助范围" }),
    ).toContainText(course.units[0].lessons[0].title);
    await page
      .getByRole("button", { name: "移除课程上下文", exact: true })
      .click();
    await expect(page.locator(".assistant-course-context")).toHaveCount(0);
    await page.getByRole("combobox", { name: "选择课程上下文" }).click();
    await page.getByRole("option", { name: course.title, exact: true }).click();
    await expect(page.locator(".assistant-course-context")).toHaveCount(1);
    await input.fill("解释一下这门课的重点");
    await input.press("Enter");
    await expect(page.locator(".chat-message.assistant")).toContainText(
      "先用一个熟悉的例子理解",
    );
    await expect(page.locator("main[data-empty=false]")).toBeVisible();
    assert.equal(calls.length, 1);
    assert.ok(calls[0].messages.some((m) => m.content.includes(course.title)));
    await page.screenshot({
      path: `${folder}/conversation-${theme}-${width}.png`,
    });
    await page.getByRole("combobox", { name: "历史对话" }).click();
    await page
      .getByRole("option", { name: "有内容的对话", exact: true })
      .click();
    const viewport = page.getByRole("region", { name: "对话记录" });
    const bottomGap = () =>
      viewport.evaluate((n) => n.scrollHeight - n.scrollTop - n.clientHeight);
    await expect.poll(bottomGap).toBeLessThan(2);
    await input.fill("输入框展开\n第二行\n第三行\n第四行");
    await expect.poll(bottomGap).toBeLessThan(2);
    await viewport.hover();
    await page.mouse.wheel(0, -50000);
    await expect
      .poll(() => viewport.evaluate((n) => n.scrollTop))
      .toBeLessThan(2);
    const feedback = page
      .getByRole("button", { name: "这个回答有帮助", exact: true })
      .first();
    await feedback.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const readingTop = await viewport.evaluate((n) => n.scrollTop);
    await feedback.click();
    await expect
      .poll(async () =>
        Math.abs((await viewport.evaluate((n) => n.scrollTop)) - readingTop),
      )
      .toBeLessThan(2);
    assert.deepEqual(errors, []);
    results.push({
      width,
      theme,
      layout,
      hoverAndPressStable: true,
      courseSelection: true,
      draft: true,
      reply: true,
      errors,
    });
    await context.close();
  }
  await writeFile(`${folder}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
