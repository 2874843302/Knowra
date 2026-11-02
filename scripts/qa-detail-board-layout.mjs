import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState, lessonsOf } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const before = process.argv.includes("--before");
const phase = before ? "before" : "after";
const output = "screenshots/detail-board-layout";
await mkdir(output, { recursive: true });
const base = catalog.find((c) => c.id === "how-ai-works");
const longCourse = {
  ...base,
  id: "layout-long-course",
  source: "AI 生成",
  title:
    "从 LLM API 到可评估的个人任务助手：LangChain/LlamaIndex AI Agent 深入实践",
  description:
    "面向已会 Python、调用过 LLM API 的学习者，目标是深入掌握 AI Agent 开发，并围绕 RAG 与记忆、工具调用、可观测性和评估构建个人任务助手。通过具体情境、实践与误区分析，逐步建立完整的开发方法。".repeat(
      4,
    ),
  units: Array.from({ length: 12 }, (_, u) => ({
    title: `第 ${u + 1} 单元：从问题建模到工具调用与评估`,
    lessons: Array.from({ length: 4 }, (_, i) => ({
      ...lessonsOf(base)[i % 4],
      id: `u${u}-l${i}`,
      title: `讲解 ${i + 1}：开发环境、边界与任务建模`,
    })),
  })),
  minutes: 960,
};
const blocks = Array.from({ length: 8 }, (_, i) => ({
  title: `知识点 ${i + 1}：先观察，再推理`,
  board: `- **明确对象**：先确定讨论的量与参照。\n- 观察条件：输入变化时，记录输出发生的变化。\n- 检验关系：用一个反例区分直觉与结论。`,
  narration:
    "观察条件如何影响结果，再比较相邻的例子，检验结论在哪些情况下成立。",
}));
const content = blocks.map((s) => `## ${s.title}\n\n${s.board}`).join("\n\n");
const lesson = {
  id: "packing",
  title: "知识点连续排版",
  points: [],
  summary: "先沿纵向写够内容，再向右换列。",
  content,
  teaching: { mode: "script", source: content, steps: blocks },
};
const boardCourse = {
  ...base,
  id: "layout-board",
  units: [{ title: "纵向排版", lessons: [lesson] }],
};
const sequence = lessonSequence(content, lesson);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
try {
  for (const [width, height] of [
    [1920, 911],
    [1440, 900],
    [1440, 768],
  ]) {
    const seed = initialState();
    seed.customCourses = [longCourse, boardCourse];
    seed.joined.push(longCourse.id);
    seed.lessonPlayback[`${boardCourse.id}/${lesson.id}`] = {
      signature: sequence.signature,
      step: sequence.steps.length - 1,
      revealedStep: sequence.steps.length - 1,
      elapsed: sequence.steps.at(-1).duration,
      revealedProgress: 1,
      revealedNarrationProgress: 1,
      finished: true,
      answers: {},
    };
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
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
    await context.route("**/api/provider", (route) =>
      route.fulfill({ json: { configured: false } }),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:5173/course/${longCourse.id}`);
    await page.locator(".course-reference-sidebar").waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((i) => i.decode().catch(() => {})),
      );
    });
    await page.waitForTimeout(300);
    const geometry = () =>
      page.evaluate(() => {
        const rect = (s) =>
          document.querySelector(s)?.getBoundingClientRect().toJSON() || null;
        const nav = document.querySelector(".unit-navigation"),
          desc = document.querySelector(".course-description");
        return {
          sidebar: rect(".course-reference-sidebar"),
          cover: rect(".course-identity-cover"),
          heading: rect(".course-identity h1"),
          nav: rect(".unit-navigation"),
          progress: rect(".unit-progress"),
          tabs: rect(".course-viewbar"),
          desc: {
            height: desc.clientHeight,
            overflow: getComputedStyle(desc).overflowY,
          },
          pageHeight: document.documentElement.scrollHeight,
          navScrollHeight: nav?.scrollHeight || 0,
          navHeight: nav?.clientHeight || 0,
          sidebarScroll: document.querySelector(".course-reference-sidebar")
            .scrollTop,
          sidebarScrollHeight: document.querySelector(
            ".course-reference-sidebar",
          ).scrollHeight,
          scrollY,
        };
      });
    const detail = await geometry();
    await page.screenshot({
      path: `${output}/${phase}-detail-${width}-${height}.png`,
    });
    if (!before) {
      assert(detail.navHeight >= 150, JSON.stringify(detail));
      assert(
        detail.sidebarScrollHeight > detail.sidebar.height,
        JSON.stringify(detail),
      );
      assert.equal(detail.desc.overflow, "hidden");
      const right = page.locator(".course-reference-content");
      await right.evaluate((e) => (e.scrollTop = e.scrollHeight));
      assert.deepEqual(
        await geometry(),
        detail,
        "right content moved left layout",
      );
      const nav = page.getByRole("navigation", { name: "课程单元" });
      await nav.locator("button").last().click();
      await expect(page.locator(".unit-heading h2")).toContainText("单元 12");
      await page.screenshot({
        path: `${output}/after-last-unit-${width}-${height}.png`,
      });
      const left = page.locator(".course-reference-sidebar");
      assert(
        await left.evaluate((e) => e.scrollTop > 0),
        "last unit should be reachable through left scrolling",
      );
      await left.evaluate((e) => (e.scrollTop = 0));
      await page.getByRole("button", { name: "显示更多", exact: true }).click();
      await expect(
        page.getByRole("dialog", { name: "课程简介" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      for (const tab of ["资料", "练习", "面板", "单元"]) {
        await page
          .getByRole(tab === "面板" ? "button" : "tab", {
            name: tab,
            exact: true,
          })
          .click();
        assert.deepEqual(
          (await geometry()).tabs,
          detail.tabs,
          `${tab} changed navigation geometry`,
        );
      }
    }
    await page.goto(
      `http://127.0.0.1:5173/learn/${boardCourse.id}/${lesson.id}`,
    );
    await page.locator(".board-surface").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page
      .getByRole("button", { name: "回到当前讲解", exact: true })
      .click();
    await page.waitForTimeout(350);
    const board = await page.locator(".board-surface").evaluate((e) => {
      const origin = e.getBoundingClientRect();
      return {
        height: e.clientHeight,
        columnWidth: getComputedStyle(e).columnWidth,
        blocks: [...e.querySelectorAll(".board-frame")].map((s) => {
          const r = s.getBoundingClientRect();
          return {
            x: Math.round(r.left - origin.left),
            y: r.top - origin.top,
            height: r.height,
          };
        }),
      };
    });
    await page.screenshot({
      path: `${output}/${phase}-board-${width}-${height}.png`,
    });
    if (!before) {
      const firstColumn = board.blocks.filter((s) => s.x === board.blocks[0].x);
      assert(firstColumn.length >= 3, JSON.stringify(board));
      assert(firstColumn.at(-1).y >= 500, JSON.stringify(board));
      assert(
        new Set(board.blocks.map((s) => s.x)).size > 1,
        "long content should still continue in another column",
      );
    }
    assert.deepEqual(errors, []);
    evidence.push({ width, height, detail, board, errors });
    await context.close();
  }
  await writeFile(`${output}/${phase}.json`, JSON.stringify(evidence, null, 2));
  console.log(
    `${phase} desktop layout checks passed`,
    JSON.stringify(
      evidence.map((e) => ({
        width: e.width,
        height: e.height,
        navHeight: e.detail.navHeight,
        boardHeight: e.board.height,
        columns: new Set(e.board.blocks.map((s) => s.x)).size,
      })),
    ),
  );
} finally {
  await browser.close();
}
