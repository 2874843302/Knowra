import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, catalog } from "../src/data.js";

const folder = ".test/report/easyui-chat";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
let activePage;
try {
  for (const width of [1910, 1440, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      permissions: ["clipboard-read", "clipboard-write"],
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
    });
    let state = initialState(),
      revision = 0,
      release,
      mode = "hold";
    const calls = [],
      errors = [];
    const course = catalog.find((item) => item.id === "python");
    const lesson = course.units[0].lessons[0];
    const answer =
      "## 从一个例子开始\n\n`str` 保存文字，`int` 保存整数。\n\n```python\nprice = 12\nprint(price * 0.9)\n```\n\n| 类型 | 例子 |\n| --- | --- |\n| 文本 | `hello` |\n| 整数 | `12` |\n\n[Python 官方文档](https://docs.python.org/3/library/stdtypes.html)";
    state.appearance.narrationVoice = false;
    state.conversations = [
      {
        id: "chat-seeded",
        title: "我想了解一下 DeepSeek 这个公司，以及开源模型的研发与发展",
        date: new Date().toISOString(),
        webSearch: false,
        messages: [
          { id: "question-1", role: "user", content: "能用代码和表格解释吗？" },
          {
            id: "answer-1",
            role: "assistant",
            content: answer,
            modelName: "学习模型",
            sources: [
              {
                id: "doc",
                title: "Python 官方文档",
                url: "https://docs.python.org/3/library/stdtypes.html",
                snippet: "内置类型的官方说明。",
              },
            ],
          },
        ],
      },
      {
        id: "chat-history",
        title: "上一段学习",
        date: new Date().toISOString(),
        webSearch: false,
        messages: Array.from({ length: 14 }, (_, i) => ({
          id: `history-${i}`,
          role: i % 2 ? "assistant" : "user",
          content: `历史消息 ${i + 1}：${"这是之前学习的内容，用来检查独立滚动。".repeat(5)}`,
        })),
      },
    ];
    state.lessonChats[`${course.id}/${lesson.id}`] = [
      { role: "user", content: "请解释这个例子" },
      {
        role: "assistant",
        content: answer,
        plan: [{ title: "再看一个例子", reason: "把文字和整数区分开" }],
        action: "insert",
      },
    ];
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({
        json: {
          user: {
            id: `chat-qa-${width}`,
            name: "学习者",
            workspaceId: `chat-${width}`,
          },
        },
      }),
    );
    await context.route("**/api/workspace", (route) => {
      if (route.request().method() === "PATCH") {
        for (const op of route.request().postDataJSON().operations) {
          let target = state;
          for (const part of op.path.slice(0, -1)) target = target[part] ??= {};
          if (op.op === "remove") delete target[op.path.at(-1)];
          else target[op.path.at(-1)] = op.value;
        }
        revision++;
      }
      return route.fulfill({ json: { state, revision } });
    });
    await context.route("**/api/provider", (route) =>
      route.fulfill({
        json: {
          configured: true,
          activeId: "model-1",
          id: "model-1",
          name: "学习模型",
          model: "fixture",
          profiles: [
            {
              id: "model-1",
              name: "学习模型",
              model: "fixture",
              configured: true,
            },
          ],
        },
      }),
    );
    await context.route("**/api/tts/status", (route) =>
      route.fulfill({ json: { ready: false, voices: [] } }),
    );
    await context.route("**/api/asr/status", (route) =>
      route.fulfill({ json: { ready: false } }),
    );
    await context.route("**/api/auth/tokens", (route) =>
      route.fulfill({ json: { tokens: [] } }),
    );
    await context.route("**/api/course-jobs", (route) =>
      route.fulfill({ json: { jobs: [] } }),
    );
    await context.route("**/api/ai", async (route) => {
      calls.push(route.request().postDataJSON());
      if (mode === "hold")
        await new Promise((resolve) => {
          release = resolve;
        });
      await route
        .fulfill(
          mode === "failure"
            ? { status: 503, json: { error: "模型暂时不可用，请稍后重试。" } }
            : { json: { content: answer } },
        )
        .catch(() => {});
    });
    const page = await context.newPage();
    activePage = page;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/assistant/chat-seeded");
    await expect(page.locator("[data-slot=chat]")).toBeVisible();
    const response = page.locator(".chat-message.assistant");
    await expect(response).toHaveCount(1);
    await expect(page.locator(".easy-chat-user")).toHaveCSS("opacity", "1");
    const layout = await page.evaluate(() => {
      const rect = (selector) =>
        document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        viewport: rect(".easy-chat-messages"),
        avatar: rect(".easy-chat-user .message-avatar"),
        bubble: rect(".easy-chat-user .user-message-text"),
        header: rect(".easy-chat-header"),
        appHeader: rect(".app-header"),
        history: rect(".easy-chat-history"),
        historyOverflow:
          document.querySelector(".easy-chat-history").scrollWidth -
          document.querySelector(".easy-chat-history").clientWidth,
      };
    });
    assert.ok(
      layout.viewport.right - layout.avatar.right < 20,
      "User avatar stays at the right edge",
    );
    assert.ok(
      layout.bubble.right <= layout.avatar.left - 8,
      "Bubble precedes the avatar without overlap",
    );
    assert.ok(
      layout.bubble.left > layout.viewport.x + layout.viewport.width / 2,
      "Short user messages align right",
    );
    assert.ok(
      layout.history.right <= layout.header.right,
      "History stays within the header",
    );
    assert.ok(
      layout.header.y >= layout.appHeader.bottom,
      "Chat header clears the floating global controls",
    );
    assert.ok(
      layout.historyOverflow < 2,
      "Long conversation title cannot overflow the history control",
    );
    await expect(response.locator("table")).toBeVisible();
    await expect(response.locator(".ai-response-code")).toContainText(
      "print(price * 0.9)",
    );
    await response
      .getByRole("button", { name: "复制代码", exact: true })
      .click();
    assert.equal(
      (await page.evaluate(() => navigator.clipboard.readText())).replace(
        /\r\n/g,
        "\n",
      ),
      "price = 12\nprint(price * 0.9)",
    );
    await response
      .getByRole("button", { name: "复制回答", exact: true })
      .click();
    assert.equal(
      (await page.evaluate(() => navigator.clipboard.readText())).replace(
        /\r\n/g,
        "\n",
      ),
      answer,
    );
    const downloadEvent = page.waitForEvent("download");
    await response
      .getByRole("button", { name: "导出笔记", exact: true })
      .click();
    assert.match((await downloadEvent).suggestedFilename(), /学习笔记.*\.md$/);
    await response.getByRole("button", { name: "参考来源" }).click();
    await expect(response.locator(".ai-response-sources a")).toHaveAttribute(
      "href",
      "https://docs.python.org/3/library/stdtypes.html",
    );
    await response.getByRole("button", { name: "这个回答有帮助" }).click();
    await expect
      .poll(() => state.conversations[0].messages[1].feedback)
      .toBe("like");
    await page.reload();
    await expect(
      response.getByRole("button", { name: "这个回答有帮助" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${folder}/reply-${width}.png` });

    const input = page.getByRole("textbox", { name: "输入问题", exact: true });
    await input.fill("第一行");
    await input.press("Shift+Enter");
    await input.type("第二行");
    assert.equal(calls.length, 0);
    await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
    assert.equal(calls.length, 0, "IME confirmation cannot send");
    await input.press("Enter");
    await expect(
      page.locator(".ai-response[data-status=generating]"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "停止生成", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `${folder}/generating-${width}.png` });
    release();
    await expect(response).toHaveCount(2);
    assert.equal(calls[0].provider_id, "model-1");
    assert.equal(calls[0].messages.at(-1).content, "第一行\n第二行");

    await input.fill("停止这次回答");
    await input.press("Enter");
    await expect(
      page.locator(".ai-response[data-status=generating]"),
    ).toBeVisible();
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    release();
    await expect(
      page.locator(".ai-response[data-status=generating]"),
    ).toHaveCount(0);
    assert.equal(await response.count(), 2);
    mode = "failure";
    await input.fill("保留这次问题");
    await input.press("Enter");
    await expect(page.getByRole("alert")).toContainText("模型暂时不可用");
    await expect(input).toHaveValue("保留这次问题");
    await expect(page.getByRole("link", { name: "检查模型" })).toHaveAttribute(
      "href",
      "/settings#ai",
    );
    await page.screenshot({ path: `${folder}/error-${width}.png` });

    await page.getByRole("combobox", { name: "历史对话", exact: true }).click();
    await page.getByRole("option", { name: "上一段学习", exact: true }).click();
    await expect(page).toHaveURL(/assistant\/chat-history$/);
    const viewport = page.getByRole("region", {
      name: "对话记录",
      exact: true,
    });
    await expect(page.locator(".chat-message")).toHaveCount(14);
    await expect
      .poll(() =>
        viewport.evaluate(
          (node) => node.scrollHeight - node.scrollTop - node.clientHeight,
        ),
      )
      .toBeLessThan(2);
    await input.fill("输入区展开后仍应保持在最新消息\n第二行\n第三行\n第四行");
    await expect
      .poll(() =>
        viewport.evaluate(
          (node) => node.scrollHeight - node.scrollTop - node.clientHeight,
        ),
      )
      .toBeLessThan(2);
    await input.fill("");
    await viewport.hover();
    await page.mouse.wheel(0, -10000);
    await expect(
      page.getByRole("button", { name: "回到最新", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => viewport.evaluate((node) => node.scrollTop))
      .toBeLessThan(2);
    const top = await viewport.evaluate((node) => node.scrollTop);
    await page
      .locator(".ai-response-feedback")
      .first()
      .getByRole("button", { name: "这个回答有帮助" })
      .click({ force: true });
    assert.equal(
      await viewport.evaluate((node) => node.scrollTop),
      top,
      "Feedback rerender preserves a reader's scroll position",
    );
    await page.getByRole("button", { name: "回到最新", exact: true }).click();
    await expect
      .poll(() =>
        viewport.evaluate(
          (node) => node.scrollHeight - node.scrollTop - node.clientHeight,
        ),
      )
      .toBeLessThan(2);

    await page.goto("http://127.0.0.1:5173/settings#appearance");
    await page.getByText("静夜专注", { exact: true }).click();
    await expect.poll(() => state.appearance.theme).toBe("night");
    await page.goto("http://127.0.0.1:5173/assistant/chat-seeded");
    await expect(page.locator("html")).toHaveAttribute(
      "data-ui-theme",
      "night",
    );
    await expect(response.first()).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await page.screenshot({ path: `${folder}/night-${width}.png` });
    await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${lesson.id}`);
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    await expect(page.locator(".class-tutor")).toHaveCSS("opacity", "1");
    const teacher = page.locator(
      ".tutor-message.assistant[data-slot=ai-response]",
    );
    await expect(teacher).toContainText("再看一个例子");
    await expect(teacher.locator("table")).toBeAttached();
    await teacher.scrollIntoViewIfNeeded();
    await teacher.getByRole("button", { name: "这个回答有帮助" }).click();
    await expect
      .poll(() => state.lessonChats[`${course.id}/${lesson.id}`][1].feedback)
      .toBe("like");
    await expect(
      page.getByRole("button", { name: "语音输入", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `${folder}/classroom-${width}.png` });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      copy: true,
      export: true,
      sources: true,
      feedbackPersistence: true,
      composerIME: true,
      generationStates: true,
      stopAndError: true,
      history: true,
      independentScroll: true,
      userAlignment: true,
      longTitleContainment: true,
      composerResizeFollow: true,
      night: true,
      classroom: true,
      errors,
    });
    await context.close();
  }
  await writeFile(`${folder}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  await activePage?.screenshot({ path: `${folder}/failure.png` });
  console.log(
    await activePage?.evaluate(() => ({
      url: location.href,
      text: document.body.innerText.slice(-1800),
    })),
  );
  throw error;
} finally {
  await browser.close();
}
