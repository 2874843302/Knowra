import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { initialState } from "../src/data.js";
import { newCourseDraft } from "../src/lib/course-generation.js";
import { directedTeaching } from "./fixtures/teaching-direction.mjs";

const plan = {
  title: "并行生成与安全续写",
  description: "保持蓝图顺序与已完成讲次。",
  units: [
    {
      title: "输入到输出",
      summary: "检验数据流",
      lessons: ["理解输入", "明确转换", "检查输出"].map((title) => ({
        title,
        summary: "用例子检验输入输出关系",
        points: ["数据含义", "边界验证"],
      })),
    },
  ],
};
const seed = initialState();
const draft = newCourseDraft({ topic: plan.title });
Object.assign(draft, {
  plan,
  phase: "generating",
  confirmed: true,
  interrupted: true,
});
seed.courseDrafts = { [draft.id]: draft };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
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
    r.fulfill({
      json: {
        configured: true,
        model: "fixture",
        baseUrl: "https://api.example.com/v1",
      },
    }),
  );
  const calls = [];
  let active = 0,
    maximum = 0;
  await context.route("**/api/ai", async (route) => {
    const payload = route.request().postDataJSON();
    assert.equal(payload.kind, "course_unit");
    const j =
      Number(payload.messages[0].content.match(/第 1 个单元的第 (\d+) 讲/)[1]) -
      1;
    const first = j === 0 && !calls.includes(0);
    calls.push(j);
    active++;
    maximum = Math.max(active, maximum);
    await new Promise((r) => setTimeout(r, first ? 100 : 300));
    active--;
    if (first)
      return route.fulfill({
        status: 503,
        json: { error: "fixture service unavailable" },
      });
    const lesson = {
      ...plan.units[0].lessons[j],
      content:
        "## 概念\n先明确数据来源。\n\n## 例子\n购物车更新数量。\n\n## 验证\n核对最终结果。",
      teaching: directedTeaching({
        steps: [
          {
            title: "数据流",
            board: "输入 → 更新 → 校验",
            narration:
              "先看看数据从哪里来，再检查数量更新的过程，最后确认不同组件展示的是同一份结果。",
          },
        ],
      }),
      quiz: {
        question: "先确认什么？",
        options: ["数据来源", "按钮颜色"],
        answer: 0,
        explanation: "先确认数据含义，才能检查计算过程。",
      },
    };
    return route.fulfill({
      json: {
        content: JSON.stringify({
          ...plan,
          units: [{ ...plan.units[0], lessons: [lesson] }],
        }),
      },
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const saved = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("knowra-workspace-v1")),
    );
  await page.goto(`http://127.0.0.1:5173/create/${draft.id}`);
  const resume = page.getByRole("button", {
    name: "继续生成课程",
    exact: true,
  });
  await resume.click();
  await expect(
    page.getByText("fixture service unavailable", { exact: true }),
  ).toBeVisible();
  await expect(resume).toBeEnabled();
  await expect
    .poll(
      async () =>
        (await saved()).courseDrafts[draft.id].pendingLectures?.["0:1"]?.id,
    )
    .toBe("lesson-0-1");
  assert.deepEqual(calls, [0, 1]);
  assert.equal(maximum, 2);
  await page.reload();
  await resume.click();
  await expect
    .poll(async () => (await saved()).courseDrafts[draft.id].phase, {
      timeout: 15000,
    })
    .toBe("ready");
  const state = await saved();
  const generated = state.customCourses.find(
    (c) => c.id === `generated-${draft.id}`,
  );
  assert.deepEqual(
    generated.units[0].lessons.map((l) => l.title),
    plan.units[0].lessons.map((l) => l.title),
  );
  assert.equal(
    calls.filter((j) => j === 1).length,
    1,
    "validated out-of-order lecture was generated again after reload",
  );
  assert.deepEqual(state.courseDrafts[draft.id].pendingLectures, {});
  assert.deepEqual(errors, []);
  console.log(
    "PASS remote API: 2 requests overlap, failure retains later lecture, reload resumes only missing lectures, final blueprint order preserved",
  );
  await context.close();
} finally {
  await browser.close();
}
