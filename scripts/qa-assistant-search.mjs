import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, catalog } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const folder = ".test/report/assistant-search";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
let activePage;
try {
  for (const width of [1440, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
    });
    let state = initialState(),
      revision = 0,
      searchMode = "success",
      releaseSearch;
    const calls = [],
      searches = [],
      errors = [];
    const sources = [
      {
        id: "source-1",
        title: "Python 官方文档 · 文本序列",
        url: "https://docs.python.org/3/library/stdtypes.html",
        snippet: "str 表示 Unicode 文本序列，+ 可以连接两个字符串。",
      },
    ];
    const visual = {
      type: "comparison",
      title: "同一个 +，两种含义",
      items: [
        {
          label: "数字相加",
          expression: "3 + 2",
          result: "5",
          detail: "int → int",
        },
        {
          label: "文本拼接",
          expression: '"3" + "2"',
          result: '"32"',
          detail: "str → str",
        },
      ],
    };
    const teaching = {
      title: "看看加号的两种含义",
      board: "相同符号，取决于操作对象。",
      narration:
        "先看数字相加，三个和两个加起来得到五个。再看文本拼接，把左边文字接到右边文字之前，结果仍然是文本。注意，符号相同并不意味着它们在做相同的事情。",
      visual,
    };
    const content = `## ${teaching.title}\n\n${teaching.board}`;
    const lesson = {
      id: "ink",
      title: "逐步推演",
      content,
      points: [],
      teaching: { mode: "script", source: content, steps: [teaching] },
    };
    const course = {
      ...structuredClone(catalog[0]),
      id: "search-ink-qa",
      units: [{ title: "演示", lessons: [lesson] }],
    };
    state.customCourses = [course];
    state.appearance = {
      ...state.appearance,
      narrationVoice: false,
      narrationRate: 1,
    };
    const sequence = lessonSequence(content, lesson);
    const stepIndex = sequence.steps.findIndex((s) => s.visual);
    state.lessonPlayback[`${course.id}/${lesson.id}`] = {
      signature: sequence.signature,
      pacingVersion: 1,
      step: stepIndex,
      revealedStep: stepIndex,
      elapsed: 400,
      revealedProgress: 0,
      revealedNarrationProgress: 0,
      answers: {},
      rate: 1,
    };
    await context.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          user: {
            id: `search-qa-${width}`,
            name: "学习者",
            workspaceId: `search-${width}`,
          },
        },
      }),
    );
    await context.route("**/api/workspace", (r) => {
      if (r.request().method() === "PATCH") {
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
      r.fulfill({
        json: {
          configured: true,
          id: "chosen",
          activeId: "chosen",
          model: "fixture",
          profiles: [
            {
              id: "chosen",
              name: "学习模型",
              model: "fixture",
              configured: true,
            },
          ],
        },
      }),
    );
    await context.route("**/api/tts/status", (r) =>
      r.fulfill({ json: { ready: false, voices: [] } }),
    );
    await context.route("**/api/ai", (r) => {
      const payload = r.request().postDataJSON();
      calls.push(payload);
      const observed = payload.messages
        .at(-1)
        .content.startsWith("工具返回的检索摘要");
      const content =
        payload.kind === "chat"
          ? "不联网时直接解释概念。"
          : JSON.stringify(
              observed
                ? {
                    action: "answer",
                    content:
                      searchMode === "failure"
                        ? "搜索暂时失败，无法核实最新信息。"
                        : "`str` 表示文本序列。[Python 官方文档](https://docs.python.org/3/library/stdtypes.html)",
                  }
                : { action: "search", queries: ["Python 官方文档 str 字符串"] },
            );
      return r.fulfill({ json: { content } });
    });
    await context.route("**/api/web-search", async (r) => {
      searches.push(r.request().postDataJSON());
      if (searchMode === "success" || searchMode === "cancel")
        await new Promise((resolve) => {
          releaseSearch = resolve;
        });
      await r.fulfill(
        searchMode === "failure"
          ? { status: 502, json: { error: "检索服务暂时不可用" } }
          : {
              json: {
                sources,
                queries: searches.at(-1).queries,
                scope: "search_snippets",
                retrievedAt: new Date().toISOString(),
                engine: "Bing",
                failedQueries: [],
              },
            },
      );
    });
    const page = await context.newPage();
    activePage = page;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/assistant");
    const input = page.getByRole("textbox", { name: "输入问题" });
    await input.fill("请联网查一下 Python 官方字符串文档");
    await input.press("Enter");
    await expect(page.locator(".assistant-tool-call.is-running")).toBeVisible();
    await expect(page.locator(".tool-query-list")).toContainText(
      "Python 官方文档",
    );
    assert.equal(calls[0].provider_id, "chosen");
    await page.screenshot({ path: `${folder}/searching-${width}.png` });
    releaseSearch();
    await expect(page.locator(".chat-message.assistant")).toHaveCount(1);
    assert.equal(calls.length, 2);
    assert.equal(searches.length, 1);
    assert(calls[1].messages.at(-1).content.includes(sources[0].snippet));
    await page.locator(".assistant-tool-call summary").click();
    await expect(page.locator(".assistant-tool-detail a")).toHaveAttribute(
      "href",
      sources[0].url,
    );
    await page.screenshot({
      path: `${folder}/sources-${width}.png`,
      animations: "disabled",
    });
    await expect
      .poll(() => state.conversations[0]?.messages[0]?.toolCalls?.[0]?.status)
      .toBe("completed");
    await page.reload();
    await expect(page.locator(".assistant-tool-call summary")).toContainText(
      "1 个来源",
    );
    await page.getByRole("button", { name: "联网搜索", exact: true }).click();
    await input.fill("解释概念即可");
    await input.press("Enter");
    await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
    assert.equal(calls.at(-1).kind, "chat");
    assert.equal(searches.length, 1);
    await page.getByRole("button", { name: "联网搜索", exact: true }).click();
    searchMode = "failure";
    await input.fill("再查一次");
    await input.press("Enter");
    await expect(page.locator(".assistant-tool-call.is-failed")).toHaveCount(1);
    await expect(page.locator(".chat-message.assistant")).toHaveCount(3);
    await page.locator(".assistant-tool-call.is-failed summary").click();
    await expect(page.locator(".tool-error")).toContainText(
      "检索服务暂时不可用",
    );
    searchMode = "cancel";
    await input.fill("再查，随后停止");
    await input.press("Enter");
    await expect(page.locator(".assistant-tool-call.is-running")).toBeVisible();
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect(page.locator(".assistant-tool-call.is-cancelled")).toHaveCount(
      1,
    );
    releaseSearch();
    await expect(
      page.getByRole("button", { name: "发送问题", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.locator(".chat-message.assistant").count(),
      3,
      "stopped search cannot publish a late answer",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );

    await page.clock.install();
    await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${lesson.id}`);
    await expect(page.locator(".visual-comparison")).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    const card = page.locator(".visual-comparison");
    const snapshot = () =>
      card.evaluate((e) => ({
        width: e.offsetWidth,
        height: e.offsetHeight,
        shown: [...e.querySelectorAll(".visual-ink-written")].map(
          (n) => n.textContent,
        ),
      }));
    const initial = await snapshot();
    assert(!initial.shown.includes('"32"'));
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await page.clock.runFor(1800);
    const middle = await snapshot();
    assert(middle.shown.join("").length > initial.shown.join("").length);
    assert(!middle.shown.includes('"32"'));
    assert.equal(
      middle.height,
      initial.height,
      "writing doesn't grow or reflow the card",
    );
    await page.screenshot({ path: `${folder}/card-writing-${width}.png` });
    await page.clock.runFor(sequence.steps[stepIndex].duration + 2000);
    const final = await snapshot();
    assert(final.shown.includes('"32"'));
    assert.equal(final.height, initial.height);
    assert.equal(final.width, initial.width);
    await page.screenshot({ path: `${folder}/card-finished-${width}.png` });
    assert.deepEqual(errors, []);
    results.push({
      width,
      searchProgress: true,
      sourceLinks: true,
      persistence: true,
      searchToggle: true,
      selectedModel: true,
      failuresVisible: true,
      cancellation: true,
      progressiveInk: true,
      stableCardSize: true,
      errors,
    });
    await context.close();
  }
  await writeFile(`${folder}/result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  await activePage?.screenshot({ path: `${folder}/failure.png` });
  console.log(
    await activePage?.evaluate(() => ({
      url: location.href,
      text: document.body.innerText.slice(-2500),
    })),
  );
  throw error;
} finally {
  await browser.close();
}
