import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, catalog } from "../src/data.js";
const course = catalog.find((c) => c.id === "python");
const lastUnit = course.units.at(-1),
  lesson = lastUnit.lessons.at(-1);
await mkdir("screenshots/course-assistant", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const width of [1440, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      reducedMotion: "reduce",
    });
    let state = initialState(),
      revision = 0,
      fail = false;
    const calls = [],
      errors = [];
    await context.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          user: {
            id: `scope-qa-${width}`,
            name: "学习者",
            workspaceId: `scope-${width}`,
          },
        },
      }),
    );
    await context.route("**/api/workspace", (r) => {
      if (r.request().method() === "PATCH") {
        for (const op of r.request().postDataJSON().operations) {
          let target = state;
          for (const part of op.path.slice(0, -1)) target = target[part];
          if (op.op === "remove") delete target[op.path.at(-1)];
          else target[op.path.at(-1)] = op.value;
        }
        revision++;
      }
      return r.fulfill({
        json: { state, revision, updatedAt: new Date().toISOString() },
      });
    });
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: true, model: "fixture" } }),
    );
    await context.route("**/api/ai", (r) => {
      calls.push(r.request().postDataJSON());
      return r.fulfill(
        fail
          ? { status: 503, json: { error: "答疑暂时不可用，请重试" } }
          : { json: { content: "这里结合所选课程讲义来解释。" } },
      );
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:5173/course/${course.id}`);
    await page.getByRole("button", { name: "AI 协助", exact: true }).click();
    await expect(page).toHaveURL(/\/assistant\/[\w-]+$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const chip = page.locator(".assistant-course-context");
    await expect(chip).toContainText(course.title);
    await expect(chip.getByRole("combobox")).toContainText("整门课程");
    assert.equal(
      calls.length,
      0,
      "Opening context never generates automatically",
    );
    const input = page.getByRole("textbox", { name: "输入问题" });
    await page.screenshot({
      path: `screenshots/course-assistant/context-${width}.png`,
    });
    await input.fill("这门课的重点是什么？");
    await input.press("Enter");
    await expect(page.locator(".chat-message.assistant")).toHaveCount(1);
    const material = (call) =>
      JSON.parse(
        call.messages
          .find((m) => m.content.startsWith("当前课程参考资料"))
          .content.split("\n")
          .slice(1)
          .join("\n"),
      );
    assert.equal(material(calls[0]).title, course.title);
    assert.equal(material(calls[0]).scope, "course");
    assert(material(calls[0]).material.some((m) => m.content.length));
    await chip.getByRole("combobox").click();
    const options = page.getByRole("option");
    await expect(options).toHaveCount(
      1 + course.units.reduce((n, u) => n + u.lessons.length, 0),
    );
    await page
      .getByRole("option", {
        name: `第 ${course.units.length} 单元 · 第 ${lastUnit.lessons.length} 讲：${lesson.title}`,
        exact: true,
      })
      .click();
    await input.fill("解释这一讲");
    await input.press("Enter");
    await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
    const selected = material(calls[1]);
    assert.equal(selected.currentLesson, lesson.id);
    assert.equal(selected.scope, "lesson");
    assert.equal(selected.material.length, 1);
    assert.equal(selected.material[0].title, lesson.title);
    assert(calls[1].messages.some((m) => m.content.includes("当时的课程范围")));
    await page.waitForTimeout(700);
    const url = page.url();
    await page.reload();
    await expect(chip.getByRole("combobox")).toContainText(lesson.title);
    await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
    await page.screenshot({
      path: `screenshots/course-assistant/lesson-${width}.png`,
    });
    fail = true;
    await input.fill("再解释一遍");
    await input.press("Enter");
    await expect(page.getByRole("alert")).toContainText("答疑暂时不可用");
    await expect(input).toHaveValue("再解释一遍");
    assert.equal(
      await page.locator(".chat-message.user").count(),
      2,
      "Failed turn rolls back",
    );
    fail = false;
    await input.press("Enter");
    await expect(page.locator(".chat-message.assistant")).toHaveCount(3);
    await page.getByRole("button", { name: "移除课程上下文" }).click();
    await expect(chip).toHaveCount(0);
    await input.fill("普通提问");
    await input.press("Enter");
    await expect(page.locator(".chat-message.assistant")).toHaveCount(4);
    assert(
      !calls
        .at(-1)
        .messages.some((m) => m.content.startsWith("当前课程参考资料")),
    );
    assert.deepEqual(
      state.courseEdits,
      initialState().courseEdits,
      "Answering does not edit courses",
    );
    assert.deepEqual(errors, []);
    await page.goto("http://127.0.0.1:5173/assistant");
    await expect(chip).toHaveCount(0);
    results.push({
      width,
      courseNavigation: true,
      allLessonsSelectable: true,
      realMaterialContext: true,
      persistentScope: true,
      retry: true,
      removal: true,
      errors,
    });
    await context.close();
  }
  await writeFile(
    "screenshots/course-assistant/verification.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
