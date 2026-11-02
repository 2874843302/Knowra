import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { catalog, initialState } from "../src/data.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
const checks = [];
context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
page.on("pageerror", (e) => errors.push(e.message));
const goto = (route) => page.goto(`http://127.0.0.1:5173${route}`);
const remote = () =>
  page.evaluate(async () => {
    const response = await fetch("/api/workspace", {
      headers: {
        "X-Workspace-Id": localStorage.getItem("knowra-workspace-id"),
      },
    });
    return (await response.json()).state;
  });
async function step(name, test) {
  await test();
  checks.push(name);
  console.log("PASS", name);
}

try {
  await step(
    "Legacy browser data migrates to SQLite and survives removal of cached state",
    async () => {
      const legacy = {
        ...initialState(),
        name: "迁移学习者",
        notes: { "python/py-values": "Legacy notes preserved" },
      };
      await context.addInitScript((value) => {
        if (location.origin !== "http://127.0.0.1:5173") return;
        if (!localStorage.getItem("migration-seeded")) {
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(value));
          localStorage.setItem("migration-seeded", "1");
        }
      }, legacy);
      await goto("/course/python");
      await page.getByRole("button", { name: "面板", exact: true }).click();
      await expect(page.locator(".course-dashboard")).toBeVisible();
      assert.equal(
        (await remote()).notes["python/py-values"],
        "Legacy notes preserved",
      );
      await page.evaluate(() => {
        localStorage.removeItem("knowra-workspace-v1");
        localStorage.removeItem("knowra-server-base-v2");
      });
      await page.reload();
      await page.getByRole("button", { name: "面板", exact: true }).click();
      await expect(page.locator(".course-dashboard")).toBeVisible();
      await goto("/learn/python/py-values");
      await page.getByRole("tab", { name: "我的笔记", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "我的课堂笔记" }),
      ).toHaveValue("Legacy notes preserved");
    },
  );

  await step(
    "Detailed course path, mastery, project submission, edit and unit assessment",
    async () => {
      await goto("/course/python");
      await page.getByRole("tab", { name: "单元", exact: true }).click();
      await expect(page.locator(".learning-path > a")).toHaveCount(2);
      await page.locator(".mastery-select button").first().click();
      await page.getByRole("option", { name: "熟练" }).click();
      await expect(page.locator(".learning-path > a").first()).toHaveClass(
        "proficient",
      );
      await page
        .getByRole("button", { name: "打开单元项目", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "阶段项目记录" })
        .fill(
          "我用购物清单解释变量、类型和列表：先保存数据，再比较不同的数据类型。",
        );
      for (const item of await page
        .locator(".project-rubric [role=checkbox]")
        .all())
        await item.click();
      await page.getByRole("button", { name: "提交项目", exact: true }).click();
      await expect(page.locator(".unit-deliverables")).toContainText("已提交");
      await page
        .getByRole("button", { name: "开始单元测验", exact: true })
        .click();
      const lessons = catalog.find((c) => c.id === "python").units[0].lessons;
      for (const [index, lesson] of lessons.entries()) {
        await page
          .locator(".quiz-options > button")
          .nth(lesson.quiz.answer)
          .click();
        await page
          .getByRole("button", { name: "检查答案", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: index === lessons.length - 1 ? "查看结果" : "下一题",
            exact: true,
          })
          .click();
      }
      await expect(page.locator(".assessment-result h2")).toHaveText("2 / 2");
      await page.getByRole("button", { name: "关闭", exact: true }).click();
      await page.getByRole("button", { name: "编辑课程", exact: true }).click();
      await page.getByRole("button", { name: "手动编辑", exact: true }).click();
      await page
        .getByRole("textbox", { name: "课程名称", exact: true })
        .fill("Python：我的学习路线");
      await page.getByRole("button", { name: "保存修改", exact: true }).click();
      await expect(page.locator(".course-identity h1")).toHaveText(
        "Python：我的学习路线",
      );
      await expect
        .poll(
          async () =>
            Object.values((await remote()).projects).filter((p) => p.submitted)
              .length,
        )
        .toBe(1);
      await page.getByRole("button", { name: "编辑课程", exact: true }).click();
      await page.getByRole("button", { name: "手动编辑", exact: true }).click();
      await page.getByRole("tab", { name: "单元与讲义", exact: true }).click();
      await page.locator(".lesson-edit summary").first().click();
      await page
        .getByRole("textbox", { name: "Markdown 讲义", exact: true })
        .first()
        .fill("## 自定义 Python 板书\n\n用自己的例子理解变量。");
      await page.getByRole("button", { name: "保存修改", exact: true }).click();
      await goto("/learn/python/py-values");
      await expect(page.locator(".board-frame > h2")).toHaveText(
        "自定义 Python 板书",
      );
    },
  );

  await step(
    "Cumulative board, excerpts, notes and persisted tutor conversation",
    async () => {
      await goto("/learn/linear-algebra/matrices");
      await page
        .getByRole("button", { name: "下一步讲解", exact: true })
        .click();
      await expect(
        page.locator(".board-frame.is-active-section > h2"),
      ).toHaveText("一个具体例子");
      await expect
        .poll(
          async () => (await remote()).boardPages["linear-algebra/matrices"],
        )
        .toBe(1);
      await page.reload();
      await expect(
        page.locator(".board-frame.is-active-section > h2"),
      ).toHaveText("一个具体例子");
      const excerpt = await page
        .locator('.board-surface [data-section="1"] .markdown p')
        .first()
        .evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          return selection.toString();
        });
      assert(excerpt.includes("A = [[2, 0], [0, 1]]"));
      await page.getByRole("button", { name: "保存摘录", exact: true }).click();
      await expect(page.locator(".board-clips blockquote")).toHaveCount(1);
      await page
        .getByRole("button", { name: "摘录加入笔记", exact: true })
        .click();
      await page.getByRole("tab", { name: "我的笔记", exact: true }).click();
      assert.ok(
        (
          await page.getByRole("textbox", { name: "我的课堂笔记" }).inputValue()
        ).includes(excerpt),
      );
      await page.getByRole("tab", { name: "课堂板书", exact: true }).click();
      await page.getByRole("tab", { name: "连续讲义", exact: true }).click();
      await expect(page.locator(".board-frame")).toHaveCount(3);
      await page.route("**/api/provider", (route) =>
        route.fulfill({ json: { configured: true, model: "fixture-model" } }),
      );
      await page.route("**/api/ai", (route) =>
        route.fulfill({
          json: {
            content: "Fixture tutor: a matrix transforms basis vectors.",
          },
        }),
      );
      await page.reload();
      await page
        .getByRole("textbox", { name: "向导师提问" })
        .fill("用一个例子解释矩阵");
      await page.locator(".tutor-compose .send-button").click();
      await expect(page.locator(".tutor-message.assistant")).toContainText(
        "Fixture tutor",
      );
      await expect
        .poll(
          async () =>
            (await remote()).lessonChats["linear-algebra/matrices"]?.length,
        )
        .toBe(2);
      await page.reload();
      await expect(page.locator(".tutor-message.assistant")).toContainText(
        "Fixture tutor",
      );
      await page.unroute("**/api/provider");
      await page.unroute("**/api/ai");
    },
  );

  await step(
    "Original document upload, content search and byte-exact download",
    async () => {
      await goto("/course/python");
      await page.getByRole("tab", { name: "资料", exact: true }).click();
      const buffer = Buffer.from("Python document: functions and variables.");
      await page.locator("input[type=file]").setInputFiles({
        name: "original-notes.txt",
        mimeType: "text/plain",
        buffer,
      });
      await expect(page.locator(".material-row")).toHaveCount(1);
      await page
        .getByRole("textbox", { name: "搜索课程资料" })
        .fill("functions");
      await expect(page.locator(".material-row")).toHaveCount(1);
      await page
        .getByRole("textbox", { name: "搜索课程资料" })
        .fill("missing text");
      await expect(page.locator(".material-row")).toHaveCount(0);
      await page.getByRole("textbox", { name: "搜索课程资料" }).fill("");
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", {
          name: "下载original-notes.txt原文件",
          exact: true,
        })
        .click();
      const file = await download;
      assert.equal(file.suggestedFilename(), "original-notes.txt");
      assert.deepEqual(await readFile(await file.path()), buffer);
    },
  );

  await step(
    "Interrupted saves remain cached and recover after reload and retry",
    async () => {
      await goto("/learn/python/py-function");
      await page.getByRole("tab", { name: "我的笔记", exact: true }).click();
      await page.route("**/api/workspace", (route) =>
        route.request().method() === "PATCH"
          ? route.abort("connectionfailed")
          : route.continue(),
      );
      await page
        .getByRole("textbox", { name: "我的课堂笔记" })
        .fill("Offline pending note");
      await expect(page.locator(".class-sync-warning")).toBeVisible();
      await page.reload();
      await page.getByRole("tab", { name: "我的笔记", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "我的课堂笔记" }),
      ).toHaveValue("Offline pending note");
      await expect(page.locator(".class-sync-warning")).toBeVisible();
      await page.unroute("**/api/workspace");
      await page.getByRole("button", { name: "重新保存", exact: true }).click();
      await expect
        .poll(async () => (await remote()).notes["python/py-function"])
        .toBe("Offline pending note");
      await expect(page.locator(".class-sync-warning")).not.toBeVisible();
    },
  );

  await step(
    "Concurrent tabs merge distinct edits without overwriting notes",
    async () => {
      await goto("/learn/python/py-values");
      await page.getByRole("tab", { name: "我的笔记", exact: true }).click();
      const other = await context.newPage();
      await other.goto("http://127.0.0.1:5173/learn/python/py-list");
      await other.getByRole("tab", { name: "我的笔记", exact: true }).click();
      await Promise.all([
        page
          .getByRole("textbox", { name: "我的课堂笔记" })
          .fill("Concurrent variables note"),
        other
          .getByRole("textbox", { name: "我的课堂笔记" })
          .fill("Concurrent conditions note"),
      ]);
      await expect
        .poll(async () => {
          const state = await remote();
          return [
            state.notes["python/py-values"],
            state.notes["python/py-list"],
          ];
        })
        .toEqual(["Concurrent variables note", "Concurrent conditions note"]);
      await other.close();
    },
  );

  await step(
    "Detailed tabs and editor fit mobile and tablet viewports",
    async () => {
      for (const width of [360, 390, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await goto("/course/python");
        for (const tab of ["单元", "资料", "练习"]) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            ),
            false,
            `${width} ${tab} overflow`,
          );
        }
        await page
          .getByRole("button", { name: "编辑课程", exact: true })
          .click();
        await page
          .getByRole("button", { name: "手动编辑", exact: true })
          .click();
        await page
          .getByRole("tab", { name: "单元与讲义", exact: true })
          .click();
        await page.locator(".lesson-edit summary").first().click();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
          `${width} editor overflow`,
        );
        await page.getByRole("button", { name: "关闭", exact: true }).click();
      }
    },
  );

  assert.deepEqual(errors, []);
  await writeFile(
    "qa-v2-results.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        uncaughtErrors: errors,
        liveAIProviderTested: false,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`All ${checks.length} detailed workflow checks passed.`);
} finally {
  await browser.close();
}
