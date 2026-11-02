import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, validateOutline } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const quizTypes = [
  {
    question: "单价为 2，数量为 3，总价是多少？",
    options: ["6", "5"],
    answer: 0,
    explanation: "总价是单价乘以数量，所以为 6。",
  },
  {
    type: "true_false",
    question: "数值相加和文本拼接总是得到相同结果。判断这个说法。",
    answer: false,
    explanation: "错误：2+3 得到数值 5，文本 '2'+'3' 得到 '23'。",
  },
  {
    type: "fill",
    question: "补全计算：2×3=___；使用的编程语言是 Python，其名称是___。",
    blanks: [
      { label: "计算结果", answers: ["6", "6.0"] },
      { label: "语言名称", answers: ["Python"], caseSensitive: false },
    ],
    explanation: "乘法结果为 6，语言名称为 Python。",
  },
  {
    type: "response",
    question:
      "用自己的话解释：为什么收到文本输入后，需要先考虑类型转换再计算？",
    explanation:
      "文本与数值支持的运算不同。应先确定输入表示什么，再转换为合适的数值类型；还要考虑非法输入。",
  },
];
const content = "## 学习示例\n\n单价与数量相乘得到总价。计算前先确认数据类型。";
const step = {
  title: "先理解再运用",
  board: "**总价 = 单价 × 数量**",
  narration:
    "同一件商品有单价，购买多件就要把单价乘以数量。计算之前也要先确认这些数据能按数值参与运算。",
};
const course = {
  id: "qa-question-types",
  title: "题型与结束状态验证",
  description: "本地交互测试课程",
  units: validateOutline({
    title: "题型与结束状态验证",
    units: [
      {
        title: "应用",
        lessons: [
          ...quizTypes.map((quiz, i) => ({
            title: `题型 ${i + 1}`,
            content,
            points: [],
            quiz,
            teaching: { steps: [step] },
          })),
          {
            title: "中途检查",
            content,
            points: [],
            teaching: {
              steps: [
                { ...step, checkpoint: quizTypes[0] },
                {
                  title: "继续解释",
                  board: "**类型决定运算方式**",
                  narration:
                    "我们已经算出了总价。接着看看不同类型的数据为什么会采用不同的运算方式，再把这些知识联系起来。",
                },
                {
                  title: "总结",
                  board: "先确认类型，再计算",
                  narration: "先理解数据，再选择运算。",
                },
              ],
            },
          },
        ],
      },
    ],
  }),
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("screenshots/question-types", { recursive: true });
const evidence = [];
try {
  for (const width of [1440, 1024]) {
    const seed = initialState();
    seed.customCourses = [course];
    for (const [i, lesson] of course.units[0].lessons.entries()) {
      const seq = lessonSequence(lesson.content, lesson);
      const index =
        i < 4
          ? seq.steps.length - 1
          : seq.steps.findIndex((s) => s.kind === "checkpoint");
      seed.lessonPlayback[`${course.id}/${lesson.id}`] = {
        signature: seq.signature,
        step: index,
        revealedStep: index,
        elapsed: 0,
        rate: 1,
        answers: {},
      };
    }
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
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
    await context.route("**/api/ai", (r) => r.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const saved = (key) =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem("knowra-workspace-v1"))
            .lessonPlayback[key],
        key,
      );
    for (let i = 0; i < 4; i++) {
      const lesson = course.units[0].lessons[i],
        key = `${course.id}/${lesson.id}`;
      const seq = lessonSequence(lesson.content, lesson),
        last = seq.steps.length - 1;
      await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${lesson.id}`);
      const stage = page.locator(".lesson-stage");
      await expect(stage.getByRole("heading")).toHaveText(
        quizTypes[i].question,
      );
      await page.getByRole("button", { name: "展开导师", exact: true }).click();
      if (i < 2)
        await stage
          .locator(".lesson-stage-option")
          .nth(i === 0 ? 0 : 1)
          .click();
      else if (i === 2) {
        await stage
          .getByRole("textbox", { name: "计算结果", exact: true })
          .fill("6.0");
        await expect(
          stage.getByRole("button", { name: "提交答案", exact: true }),
        ).toBeDisabled();
        await stage
          .getByRole("textbox", { name: "语言名称", exact: true })
          .fill("python");
        await page
          .getByRole("button", { name: "在下方作答", exact: true })
          .click();
        await expect(
          stage.getByRole("textbox", { name: "计算结果", exact: true }),
        ).toBeFocused();
        await stage
          .getByRole("textbox", { name: "语言名称", exact: true })
          .press("Enter");
      } else {
        await stage
          .getByRole("textbox", { name: "你的解答", exact: true })
          .fill(
            "文本用于表示输入，数值用于计算。先转换到合适的数值类型，并检查无效输入。",
          );
        await stage
          .getByRole("button", { name: "提交并查看参考思路", exact: true })
          .click();
      }
      await expect(stage.locator(".lesson-stage-feedback")).toContainText(
        quizTypes[i].explanation,
      );
      await expect
        .poll(async () => (await saved(key)).answers[last]?.correct)
        .toBe(i === 3 ? null : true);
      await expect(page.locator(".tutor-checkpoint-feedback")).toContainText(
        i === 1
          ? "错误"
          : i === 2
            ? "6.0；python"
            : i === 3
              ? "文本用于表示输入"
              : "6",
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `screenshots/question-types/${i}-${width}.png`,
      });
      // A rapid duplicate click must complete once and keep the same last step.
      await stage
        .getByRole("button", { name: "完成本讲", exact: true })
        .evaluate((el) => {
          el.click();
          el.click();
        });
      await expect(stage).toContainText("本讲讲解已完成");
      await expect(
        stage.getByRole("button", { name: "继续讲解", exact: true }),
      ).toHaveCount(0);
      await page.waitForTimeout(250);
      assert.equal((await saved(key)).step, last);
      assert.equal((await saved(key)).finished, true);
      await expect
        .poll(async () => {
          const id = await page.evaluate(() =>
            localStorage.getItem("knowra-workspace-id"),
          );
          const r = await page.request.get(
            "http://127.0.0.1:5173/api/workspace",
            { headers: { "X-Workspace-Id": id } },
          );
          return (await r.json()).state.lessonPlayback[key]?.finished;
        })
        .toBe(true);
      await page.reload();
      await expect(stage).toContainText("本讲讲解已完成");
      assert.equal((await saved(key)).step, last);
      await stage
        .getByRole("button", { name: "再听一遍", exact: true })
        .click();
      await expect(page.locator(".lesson-subtitle")).toBeVisible();
      await expect.poll(async () => (await saved(key)).step).toBe(0);
      assert.deepEqual((await saved(key)).answers, {});
      if (i === 3) {
        const state = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("knowra-workspace-v1")),
        );
        assert.equal(
          state.progress[key]?.quizCorrect,
          undefined,
          "open response must not fake a grade",
        );
      }
    }
    const mid = course.units[0].lessons[4],
      key = `${course.id}/${mid.id}`;
    await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${mid.id}`);
    const stage = page.locator(".lesson-stage");
    await stage.locator(".lesson-stage-option").first().click();
    await stage
      .getByRole("button", { name: "继续讲解", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await expect(page.locator(".lesson-subtitle")).toBeVisible();
    assert.equal(
      (await saved(key)).step,
      2,
      "duplicate continue must not skip a teaching step",
    );
    await expect(page.locator(".teaching-block.is-current")).toContainText(
      "类型决定运算方式",
    );
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      types: [
        "legacy choice",
        "true_false=false",
        "fill aliases",
        "response review",
      ],
      terminal: "double continue, persisted completion, explicit replay",
      mid: "double continue advances one step",
      errors,
    });
    await context.close();
    console.log(
      `PASS ${width}: four classroom question types, tutor history, final completion/reload/replay and duplicate mid-lesson continuation`,
    );
  }
  await writeFile(
    "screenshots/question-types/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
