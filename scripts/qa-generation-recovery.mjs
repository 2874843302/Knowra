import { directedTeaching } from "./fixtures/teaching-direction.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";
import { newCourseDraft } from "../src/lib/course-generation.js";
import {
  interviewFixture,
  researchFixture,
} from "./fixtures/course-research.mjs";

const plan = {
  title: "购物车数据流",
  description: "讲清共享状态、接口与验证。",
  units: [
    {
      title: "从状态到接口",
      summary: "完成购物车实践",
      lessons: ["共享状态", "请求契约", "边界验证"].map((title) => ({
        title,
        summary: "理解原理并完成实践",
        points: ["原理", "验证"],
      })),
    },
  ],
};
const lecture = (j) => ({
  ...plan.units[0].lessons[j],
  id: `lesson-0-${j}`,
  content:
    "## 原理\n理解输入与输出。\n\n## 例子\n购物车数量同步。\n\n## 验证\n检查边界；代码字符串里的 ,} 应原样保留。",
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
    question: "首先明确什么？",
    options: ["数据来源", "按钮颜色"],
    answer: 0,
    explanation: "先明确数据再组织操作。",
  },
});
const seed = initialState(),
  draft = newCourseDraft({ topic: plan.title });
Object.assign(draft, {
  plan,
  phase: "generating",
  confirmed: true,
  interrupted: true,
  research: researchFixture,
  ...interviewFixture,
  answers: { foundation: "familiar", direction: "fullstack", outcome: "cart" },
  partialUnit: { index: 0, unit: { ...plan.units[0], lessons: [lecture(0)] } },
});
seed.courseDrafts = { [draft.id]: draft };
await mkdir("screenshots/generation-recovery", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
await context.addInitScript(
  ({ id, seed }) => {
    if (!localStorage.getItem("knowra-workspace-id")) {
      localStorage.setItem("knowra-workspace-id", id);
      localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
    }
  },
  { id: crypto.randomUUID(), seed },
);
await context.route("**/api/provider", (r) =>
  r.fulfill({ json: { configured: true, model: "fixture-only" } }),
);
let mode = "hold",
  release;
const requests = [];
const transientAttempts = new Map();
await context.route("**/api/ai", async (route) => {
  const body = route.request().postDataJSON();
  requests.push(body);
  if (body.kind === "course_plan") {
    const current = mode;
    if (current === "hold") await new Promise((resolve) => (release = resolve));
    try {
      return await route.fulfill(
        current === "error"
          ? { status: 502, json: { error: "测试：重新规划失败" } }
          : { json: { content: JSON.stringify(plan) } },
      );
    } catch {
      return;
    }
  }
  const j = +body.messages[0].content.match(/第 1 个单元的第 (\d+) 讲/)[1] - 1;
  const lesson = lecture(j);
  if (mode === "no-quiz") delete lesson.quiz;
  if (mode === "transient") {
    const attempt = (transientAttempts.get(j) || 0) + 1;
    transientAttempts.set(j, attempt);
    if (j === 0 && attempt === 1)
      return route.fulfill({ json: { content: '{"title":"未完成' } });
    if (j === 0 && attempt === 2) lesson.title = "偏离蓝图的讲次";
    if (j === 1 && attempt === 1) delete lesson.teaching;
    if (j === 2 && attempt === 1) delete lesson.quiz;
  }
  const text = JSON.stringify({
    title: plan.title,
    units: [{ ...plan.units[0], lessons: [lesson] }],
  });
  await route.fulfill({ json: { content: text.slice(0, -1) + ",}" } });
});
const page = await context.newPage(),
  errors = [],
  geometry = [];
page.on("pageerror", (e) => errors.push(e.message));
const remote = () =>
  page.evaluate(
    async () =>
      (
        await (
          await fetch("/api/workspace", {
            headers: {
              "X-Workspace-Id": localStorage.getItem("knowra-workspace-id"),
            },
          })
        ).json()
      ).state,
  );
const retained = async () =>
  expect
    .poll(
      async () =>
        (await remote()).courseDrafts[draft.id].partialUnit?.unit.lessons
          .length,
    )
    .toBe(1);
const resume = () =>
  page.getByRole("button", { name: "继续生成课程", exact: true });
try {
  await page.goto(`http://127.0.0.1:5173/create/${draft.id}`);
  await expect(resume()).toBeEnabled();
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    await page.locator(".generation-recovery-actions").scrollIntoViewIfNeeded();
    const [a, b] = await page
      .locator(".generation-recovery-actions button")
      .all();
    const first = await a.boundingBox(),
      second = await b.boundingBox();
    assert(
      Math.abs(first.y - second.y) < 1
        ? second.x - first.x - first.width >= 11.9
        : second.y - first.y - first.height >= 11.9,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert(
      await b.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
    );
    geometry.push({ width, first, second });
    await page.screenshot({
      path: `screenshots/generation-recovery/paused-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: /课程蓝图已确认/ }).click();
  await page
    .locator(".blueprint-panel")
    .getByRole("tab", { name: "课程", exact: true })
    .click();
  await expect(page.locator(".blueprint-preview-lesson").nth(1)).toContainText(
    "已暂停",
  );
  await expect(
    page.locator(".blueprint-preview-lesson").nth(1),
  ).not.toContainText("编写中");
  await page.getByRole("button", { name: "关闭课程蓝图", exact: true }).click();
  const input = page.getByRole("textbox", {
    name: "课程生成对话",
    exact: true,
  });
  await input.fill("把目标改为完整订单流程，请重新调整课程。");
  await input.press("Enter");
  await expect.poll(() => typeof release).toBe("function");
  await page.getByRole("button", { name: "停止生成", exact: true }).click();
  release();
  await expect(resume()).toBeDisabled();
  await retained();
  mode = "error";
  await page.getByRole("button", { name: "重新规划蓝图", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("重新规划失败");
  await expect(resume()).toBeDisabled();
  await retained();
  await page
    .getByRole("radiogroup", { name: interviewFixture.questions[0].title })
    .getByRole("radio", { name: /^刚刚开始/ })
    .click();
  await retained();
  await expect(resume()).toBeDisabled();
  mode = "success";
  await page
    .getByRole("button", { name: "按新偏好更新蓝图", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "确认蓝图，生成课程", exact: true }),
  ).toBeEnabled();
  mode = "no-quiz";
  await page
    .getByRole("button", { name: "确认蓝图，生成课程", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("已完成的讲次已保留");
  assert.equal(requests.filter((r) => r.kind === "course_unit").length, 3);
  await expect
    .poll(
      async () => (await remote()).courseDrafts[draft.id].completedUnits.length,
    )
    .toBe(0);
  mode = "transient";
  await resume().click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => {
    window.__lectureErrorFlashes = [];
    window.__lectureErrorObserver = new MutationObserver(() => {
      const error = document.querySelector(".generation-error");
      if (error) window.__lectureErrorFlashes.push(error.textContent);
    });
    window.__lectureErrorObserver.observe(
      document.querySelector(".generation-chat"),
      { subtree: true, childList: true, characterData: true },
    );
  });
  await expect(page.locator(".generation-delivery")).toContainText(
    "课程已就绪",
  );
  await expect
    .poll(
      async () =>
        (await remote()).customCourses.find(
          (c) => c.id === `generated-${draft.id}`,
        )?.units[0].lessons.length,
    )
    .toBe(3);
  const course = (await remote()).customCourses.find(
    (c) => c.id === `generated-${draft.id}`,
  );
  assert(course.units[0].lessons.every((l) => l.content.includes(",}")));
  assert.deepEqual(
    [...transientAttempts],
    [
      [0, 3],
      [1, 2],
      [2, 2],
    ],
  );
  assert.deepEqual(
    await page.evaluate(() => {
      window.__lectureErrorObserver.disconnect();
      return window.__lectureErrorFlashes;
    }),
    [],
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "screenshots/generation-recovery/verification.json",
    JSON.stringify(
      {
        scope: "Fixture responses, real isolated SQLite persistence",
        geometry,
        requests: requests.map((r) => r.kind),
        pausedPreview: true,
        staleBlueprintBlocked: true,
        retainedBeforeValidPlan: true,
        missingQuizRejected: true,
        automaticContentRecovery: true,
        transientAttempts: [...transientAttempts],
        intermediateErrorsHidden: true,
        trailingCommaAccepted: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS Recovery actions keep spacing at 2 desktop widths; paused preview stops; canceled/failed revisions and changed answers retain content and block old-blueprint generation; invalid lessons rejected; complete trailing commas tolerated; course delivered",
  );
} finally {
  await browser.close();
}
