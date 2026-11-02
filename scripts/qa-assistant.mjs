import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";

const answer = `Git 负责记录代码的变化，GitHub 帮助你把代码放到云端，与其他人一起协作。

## 一个直观的理解

把写代码想象成写一本书：**Git 是保存修改历史的时光机**，GitHub 则是大家共同写作的线上书房。

| 工具 | 主要作用 | 使用场景 |
| --- | --- | --- |
| Git | 管理版本，记录每次修改 | 在本地保存、比较与回退代码 |
| GitHub | 托管仓库，进行协作 | 分享项目、讨论问题、审查代码 |

## 从一个小项目开始

~~~bash
git init
git add .
git commit -m "我的第一次提交"
~~~

> 你可以先用 Git 管理本地项目，再把它推送到 GitHub。

想继续了解仓库、提交和分支之间的关系吗？`;
const seed = initialState();
seed.conversations = [
  {
    id: "visual-assistant",
    title: "Git 与 GitHub 有什么区别？",
    date: new Date().toISOString(),
    files: [],
    messages: [
      {
        role: "user",
        content: "Git 与 GitHub 有什么区别？可以用例子解释一下吗？",
      },
      { role: "assistant", content: answer },
    ],
  },
];
seed.conversations.push({
  id: "long-answer",
  title: "长内容排版检查",
  date: new Date().toISOString(),
  files: [],
  messages: [
    {
      role: "assistant",
      content: `## 表格和代码\n\n${"https://example.test/very-long-learning-reference/".repeat(12)}\n\n| 工具 | 功能 | 适用场景 | 优点 | 限制 | 备注 |\n| --- | --- | --- | --- | --- | --- |\n| GitHub | 代码托管 | 团队协作 | 便于审查 | 需要网络 | 版本记录 |\n\n~~~text\n${"long_code_line_".repeat(35)}\n~~~\n\n${"这是一段用于检查长回答滚动和输入区可用性的内容。\n\n".repeat(20)}`,
    },
  ],
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
await context.addInitScript(
  ({ seed, id }) => {
    if (!localStorage.getItem("knowra-workspace-id")) {
      localStorage.setItem("knowra-workspace-id", id);
      localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
    }
  },
  { seed, id: crypto.randomUUID() },
);
let configured = true;
await context.route("**/api/provider", (r) =>
  r.fulfill({ json: { configured, model: "deepseek-flash" } }),
);
let replyMode = "success",
  releaseReply;
await context.route("**/api/ai", async (r) => {
  if (replyMode === "delay")
    await new Promise((resolve) => {
      releaseReply = resolve;
    });
  try {
    await r.fulfill(
      replyMode === "error"
        ? { status: 503, json: { error: "暂时无法回答，请重试。" } }
        : {
            json: {
              content:
                "## 提交与分支\n\n提交保存一个版本，分支让你独立尝试新的思路。",
            },
          },
    );
  } catch {
    /* Stopped requests have already been aborted by the page. */
  }
});
const page = await context.newPage();
const errors = [],
  checks = [],
  measurements = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir("screenshots/assistant", { recursive: true });
async function step(name, run) {
  await run();
  checks.push(name);
  console.log("PASS", name);
}
async function visit(path) {
  await page.goto(`http://127.0.0.1:5173${path}`);
  await expect(page.locator(".assistant-page")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
try {
  await step(
    "Conversation layout and Markdown stay contained at six widths; composer remains available",
    async () => {
      for (const width of [320, 390, 768, 1024, 1440, 2048]) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
        await visit("/assistant/visual-assistant");
        await expect(page.locator(".chat-message.assistant")).toContainText(
          "GitHub",
        );
        await expect(page.locator(".assistant-title")).toHaveCount(0);
        await expect(
          page
            .locator(".assistant-compose")
            .getByRole("link", { name: "新对话", exact: true }),
        ).toBeVisible();
        await expect(page.locator(".assistant-model")).toHaveAttribute(
          "href",
          "/settings",
        );
        await page.waitForTimeout(350);
        await page.locator(".assistant-messages").evaluate((el) => {
          el.scrollTop = 0;
        });
        const layout = await page.evaluate(() => {
          const rect = (s) =>
            document.querySelector(s).getBoundingClientRect().toJSON();
          return {
            width: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            documentHeight: document.documentElement.scrollHeight,
            viewportHeight: innerHeight,
            page: rect(".assistant-page"),
            messages: rect(".assistant-messages"),
            composer: rect(".assistant-compose"),
            input: rect(".assistant-compose textarea"),
            table: rect(".assistant-table-wrap"),
            proseSize: getComputedStyle(
              document.querySelector(".assistant-page .markdown"),
            ).fontSize,
          };
        });
        assert(
          layout.documentWidth <= width,
          "document must not overflow horizontally",
        );
        assert(
          layout.documentHeight <= layout.viewportHeight + 1,
          "only messages should scroll",
        );
        assert(
          layout.composer.bottom <= layout.viewportHeight,
          "composer stays on screen",
        );
        assert(
          layout.composer.height <= 110,
          "empty composer should stay compact",
        );
        assert(
          layout.composer.top >= layout.messages.bottom,
          "composer must not cover answers",
        );
        assert(
          layout.table.right <= layout.messages.right + 1,
          "table stays inside message viewport",
        );
        measurements.push(layout);
        await page.screenshot({
          path: `screenshots/assistant/conversation-${width}.png`,
        });
        await page.locator(".assistant-messages").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await expect(
          page.getByRole("button", { name: "导出笔记", exact: true }),
        ).toBeInViewport();
      }
    },
  );
  await step("Copy and Markdown export preserve the full answer", async () => {
    await page.getByRole("button", { name: "复制回答", exact: true }).click();
    assert.equal(
      (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
        "\r\n",
        "\n",
      ),
      answer,
    );
    await page.locator("[data-sonner-toast] [data-close-button]").click();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出笔记", exact: true }).click();
    const download = await pending;
    assert(download.suggestedFilename().endsWith(".md"));
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString("utf8"), answer);
  });
  await step(
    "Wide tables and code scroll locally; long answers remain usable on a short mobile viewport",
    async () => {
      await page.setViewportSize({ width: 320, height: 640 });
      await visit("/assistant/long-answer");
      const sizes = await page.evaluate(() => {
        const table = document.querySelector(".assistant-table-wrap");
        const code = document.querySelector(".assistant-page pre");
        const messages = document.querySelector(".assistant-messages");
        return {
          width: document.documentElement.scrollWidth,
          viewport: innerWidth,
          tableScroll: table.scrollWidth > table.clientWidth,
          codeScroll: code.scrollWidth > code.clientWidth,
          messagesScroll: messages.scrollHeight > messages.clientHeight,
        };
      });
      // A stable scrollbar gutter can make the root narrower than the viewport.
      assert(
        sizes.width <= sizes.viewport + 1,
        "The page must not overflow horizontally",
      );
      assert(sizes.tableScroll && sizes.codeScroll && sizes.messagesScroll);
      await expect(
        page.getByRole("textbox", { name: "输入问题" }),
      ).toBeInViewport();
      await page.getByRole("textbox", { name: "输入问题" }).fill("继续解释");
      await page
        .getByRole("button", { name: "发送问题", exact: true })
        .click({ trial: true });
      await page.screenshot({
        path: "screenshots/assistant/long-answer-320.png",
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await visit("/assistant/visual-assistant");
    },
  );
  await step(
    "Enter sends, Shift+Enter adds a line, IME Enter does not send, textarea growth is bounded",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const input = page.getByRole("textbox", { name: "输入问题" });
      await input.fill("请解释提交");
      await input.press("Shift+Enter");
      await input.press("End");
      await expect(input).toHaveValue("请解释提交\n");
      await input.evaluate((el) =>
        el.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            isComposing: true,
          }),
        ),
      );
      await expect(page.locator(".chat-message")).toHaveCount(2);
      await input.fill("一行学习笔记\n".repeat(30));
      assert((await input.boundingBox()).height <= 180);
      await input.fill("请解释提交与分支");
      await input.press("Enter");
      await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
      await expect(input).toHaveValue("");
    },
  );
  await step(
    "Failed requests restore the draft; stop generation cancels the pending request",
    async () => {
      const input = page.getByRole("textbox", { name: "输入问题" });
      replyMode = "error";
      await input.fill("失败后保留这个问题");
      await page.getByRole("button", { name: "发送问题", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("暂时无法回答");
      await expect(input).toHaveValue("失败后保留这个问题");
      releaseReply = undefined;
      replyMode = "delay";
      await page.getByRole("button", { name: "发送问题", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "停止生成", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".assistant-page .thinking")).toContainText(
        "正在思考",
      );
      await page.getByRole("button", { name: "停止生成", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "停止生成", exact: true }),
      ).toHaveCount(0);
      releaseReply?.();
      replyMode = "success";
    },
  );
  await step(
    "New chat suggestions focus the input, upload/remove works, and sending creates a conversation",
    async () => {
      await page.getByRole("link", { name: "新对话", exact: true }).click();
      await expect(page.locator(".assistant-empty")).toBeVisible();
      await page.getByRole("button", { name: /理解概念/ }).click();
      const input = page.getByRole("textbox", { name: "输入问题" });
      await expect(input).toBeFocused();
      await expect(input).toHaveValue("用一个例子解释什么是线性变换");
      await page
        .locator('.assistant-compose input[type="file"]')
        .setInputFiles({
          name: "笔记.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Git 保存修改历史"),
        });
      await expect(
        page.locator(".assistant-compose .attachment-list"),
      ).toContainText("笔记.txt");
      await page
        .getByRole("button", { name: "移除笔记.txt", exact: true })
        .click();
      await expect(page.locator(".attachment-list")).toBeEmpty();
      for (const width of [390, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await page.screenshot({
          path: `screenshots/assistant/empty-${width}.png`,
        });
      }
      releaseReply = undefined;
      replyMode = "delay";
      await input.press("Enter");
      await expect(page.locator(".chat-message.user")).toContainText(
        "线性变换",
      );
      await expect(page.locator(".assistant-empty")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "停止生成", exact: true }),
      ).toBeVisible();
      await expect.poll(() => !!releaseReply).toBe(true);
      releaseReply();
      replyMode = "success";
      await expect(page).toHaveURL(/assistant\/.+/);
      await expect(page.locator(".chat-message.assistant")).toHaveCount(1);
    },
  );
  await step(
    "Unconfigured provider gives an actionable error without sending",
    async () => {
      configured = false;
      await visit("/assistant");
      await page
        .getByRole("textbox", { name: "输入问题" })
        .fill("测试未连接模型");
      await page.getByRole("button", { name: "发送问题", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("连接 AI 模型后");
      await expect(
        page.getByRole("alert").getByRole("link", { name: "连接模型" }),
      ).toHaveAttribute("href", "/settings");
      await expect(page.locator(".chat-message")).toHaveCount(0);
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "screenshots/assistant/verification.json",
    JSON.stringify({ checks, measurements, errors }, null, 2),
  );
} finally {
  releaseReply?.();
  await browser.close();
}
