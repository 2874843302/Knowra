import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState, lessonsOf } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const comparison = {
  type: "comparison",
  title: "幻觉与循环：内容层错误 vs 过程层错误",
  items: [
    {
      label: "幻觉",
      expression: "输出内容不可信",
      result: "编造事实、来源或参数",
      detail: "问题在“说得对不对”，例如凭空给出不存在的会议时间。",
    },
    {
      label: "循环",
      expression: "行动过程不收敛",
      result: "反复调用、迟迟不停止",
      detail: "问题在“为什么还继续”，例如搜索十次仍不总结、不判断完成。",
    },
  ],
};
const visuals = [
  comparison,
  {
    type: "bindings",
    title: "名称与值的对应关系",
    items: [{ name: "total", value: "42", type: "累计金额" }],
  },
  {
    type: "trace",
    title: "按步骤观察变化",
    rows: [
      { name: "第一次", value: "12" },
      { name: "第二次", value: "42" },
    ],
    output: "42",
  },
];
const content =
  "## 两种不同的问题\n\n循环的补丁：**最大步数 + 停止条件 + 结果压缩**";
const base = catalog.find((c) => c.id === "python");
const lesson = {
  ...lessonsOf(base)[0],
  id: "visual-cards",
  content,
  teaching: {
    mode: "script",
    source: content,
    steps: visuals.map((visual, i) => ({
      title: `概念 ${i + 1}`,
      board:
        i === 0
          ? "循环的补丁：**最大步数 + 停止条件 + 结果压缩**"
          : "观察过程，再检查结果。",
      narration: "先区分内容是否正确，再判断行动是否能够停止。",
      visual,
    })),
  },
};
const course = {
  ...base,
  id: "qa-visual-cards",
  units: [{ title: "概念对比", lessons: [lesson] }],
};
const sequence = lessonSequence(content, lesson);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/visual-cards", { recursive: true });
try {
  for (const width of [1440, 1024])
    for (const font of ["hand", "sans", "serif"]) {
      const seed = initialState();
      seed.customCourses = [course];
      seed.appearance.boardFont = font;
      seed.lessonPlayback["qa-visual-cards/visual-cards"] = {
        signature: sequence.signature,
        step: 0,
        revealedStep: sequence.steps.length - 1,
        elapsed: sequence.steps[0].duration,
        revealedProgress: 1,
        revealedNarrationProgress: 1,
        answers: {},
      };
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
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
      await context.route("**/api/provider", (r) =>
        r.fulfill({ json: { configured: false } }),
      );
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(
        "http://127.0.0.1:5173/learn/qa-visual-cards/visual-cards",
      );
      await expect(page.locator(".visual-comparison")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page
        .getByRole("button", { name: "回到当前讲解", exact: true })
        .click();
      await page.waitForTimeout(300);
      const cards = await page.locator(".teaching-visual").evaluateAll((els) =>
        els.map((e) => {
          const box = e.getBoundingClientRect();
          return {
            type: e.className,
            overflow: e.scrollWidth > e.clientWidth,
            captionInset:
              e.querySelector("figcaption").getBoundingClientRect().left -
              box.left,
            content: [
              ...e.querySelectorAll("figcaption,code,strong,small"),
            ].map((c) => {
              const r = c.getBoundingClientRect();
              return {
                left: r.left - box.left,
                right: box.right - r.right,
                top: r.top - box.top,
                bottom: box.bottom - r.bottom,
              };
            }),
          };
        }),
      );
      assert.equal(cards.length, 3);
      for (const card of cards) {
        assert.equal(card.overflow, false);
        assert(card.captionInset >= 16);
        assert(
          card.content.every(
            (c) => c.left >= 8 && c.right >= 8 && c.top >= 8 && c.bottom >= 8,
          ),
          JSON.stringify(card),
        );
      }
      await expect(page.locator(".comparison-row")).toHaveCount(2);
      await page.screenshot({
        path: `screenshots/visual-cards/comparison-${width}-${font}.png`,
      });
      assert.deepEqual(errors, []);
      evidence.push({ width, font, cards, errors });
      await context.close();
    }
  await writeFile(
    "screenshots/visual-cards/verification.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    "PASS comparison/bindings/trace: contained text, readable card spacing, all 3 board fonts at 1440/1024",
  );
} finally {
  await browser.close();
}
