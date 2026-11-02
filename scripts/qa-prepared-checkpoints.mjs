import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { initialState, catalog, validateOutline } from "../src/data.js";
import { directedStep } from "./fixtures/teaching-direction.mjs";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const question = {
  type: "choice",
  question: "把箭头平移但保留方向和长度，位移改变了吗？",
  options: ["改变了", "没有改变"],
  answer: 1,
  explanation: "方向和长度决定自由向量。",
  feedback: [
    {
      selected: 0,
      title: "分清起点与位移",
      board: "**起点改变 ≠ 位移改变**",
      narration:
        "你把起点和位移混在了一起。把箭头从家门口搬到学校，方向和长度都没变，所以表示的位移也没有改变。",
    },
    {
      selected: 1,
      title: "同一个自由向量",
      board: "**方向和长度不变 → 同一个向量**",
      narration:
        "你的理解是对的。起点只是摆放箭头的位置，保持方向和长度，就仍表示同一次位移。",
    },
  ],
};
const course = {
  ...catalog[0],
  id: "qa-prepared-checkpoints",
  units: validateOutline({
    title: "即时补讲",
    units: [
      {
        title: "方向与长度",
        lessons: [
          {
            title: "位移",
            content: "## 位移\n\n方向和长度决定自由向量。",
            teaching: {
              steps: [
                directedStep({
                  title: "自由向量",
                  board: "**方向 + 长度**",
                  narration: "用一支箭头表示位移，先观察它的方向和长度。",
                  checkpoint: question,
                }),
                directedStep({
                  title: "原课下一步",
                  board: "**两段移动首尾相接**",
                  narration:
                    "我们回到原课，接着把两段移动首尾相接，看看终点如何改变。",
                }),
              ],
            },
          },
        ],
      },
    ],
  }),
};
const lesson = course.units[0].lessons[0];
const sequence = lessonSequence(lesson.content, lesson);
const check = sequence.steps.find((s) => s.kind === "checkpoint");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const selected of [0, 1]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const seed = initialState();
    seed.customCourses = [course];
    const key = `${course.id}/${lesson.id}`;
    seed.lessonPlayback[key] = {
      signature: sequence.signature,
      step: check.index,
      revealedStep: check.index,
      elapsed: 0,
      rate: 2,
      answers: {},
    };
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
    let requests = 0;
    await context.route("**/api/ai", (r) => {
      requests++;
      return r.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${lesson.id}`);
    const start = performance.now();
    await page
      .locator(".lesson-stage-option")
      .nth(selected)
      .evaluate((element) => {
        const other = [
          ...element.parentElement.querySelectorAll("button"),
        ].find((button) => button !== element);
        element.click();
        other?.click();
      });
    await expect(
      page
        .getByRole("heading", { name: question.feedback[selected].title })
        .first(),
    ).toBeVisible({ timeout: 1500 });
    await expect(page.locator(".lesson-subtitle")).toBeVisible();
    assert.equal(requests, 0, "prepared feedback must not request a model");
    await expect
      .poll(() =>
        page.evaluate(
          ({ key, index }) => {
            const state = JSON.parse(
              localStorage.getItem("knowra-workspace-v1"),
            );
            return state.lessonPlayback[key]?.answers[index]?.selected;
          },
          { key, index: check.index },
        ),
      )
      .toBe(selected);
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const value = JSON.parse(localStorage.getItem("knowra-workspace-v1"));
          return value.lessonAdaptations[key]?.[0]?.steps[0]?.narration;
        }, key),
      )
      .toBe(question.feedback[selected].narration);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${selected === 1 ? "correct" : "incorrect"}: selected branch plays without AI request, answer preserved (${Math.round(performance.now() - start)}ms fixture interaction)`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
