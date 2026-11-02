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
  title: "Vue 与 Spring 全栈开发：从原理到交付",
  description:
    "结合已有基础，展开共享状态、接口设计、数据流转和联调验证，用十二讲完成购物车实践。",
  units: [
    "开发环境与项目全景",
    "界面状态与交互",
    "服务接口与数据存储",
    "联调验证与成果交付",
  ].map((title, i) => ({
    title,
    summary: "理解原理，完成实践并检查掌握情况。",
    lessons: Array.from({ length: 3 }, (_, j) => ({
      title: `单元${i + 1} · 学习目标${j + 1}`,
      summary: "通过具体例子解释当前知识点，并完成一个可检查的任务。",
      points: ["概念与原理", "常见误区", "实践验证"],
    })),
  })),
};
function lecture(i, j) {
  return {
    title: plan.title,
    units: [
      {
        title: plan.units[i].title,
        lessons: [
          {
            ...plan.units[i].lessons[j],
            content:
              "## 概念\n先明确输入和输出。\n\n## 原理\n解释数据如何流动。\n\n## 实践\n完成具体任务并检查边界。",
            teaching: directedTeaching({
              steps: ["直觉", "原理", "实践", "边界"].map((title, index) => ({
                title,
                board: `${title}：输入 → 处理 → 输出`,
                narration: `现在从${title}出发，用一个具体的购物车操作说明为什么要这样组织数据，再检查这个结论适用于哪些情况。`,
                ...(index === 0
                  ? {
                      checkpoint: {
                        question: "首先明确什么？",
                        options: ["输入与目标", "页面颜色"],
                        answer: 0,
                        explanation: "先明确输入和目标，再组织处理过程。",
                      },
                    }
                  : {}),
              })),
            }),
            quiz: {
              question: "首先应该明确什么？",
              options: ["输入与目标", "页面颜色"],
              answer: 0,
              explanation: "先明确目标，再选择实现方式。",
            },
          },
        ],
      },
    ],
  };
}
await mkdir("screenshots/course-depth", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const seed = initialState(),
  draft = newCourseDraft({ topic: "学习 Vue 和 Spring" });
Object.assign(draft, {
  phase: "questions",
  research: researchFixture,
  ...interviewFixture,
  answers: { foundation: "familiar", direction: "fullstack", outcome: "cart" },
});
seed.courseDrafts = { [draft.id]: draft };
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
let failPlan = false,
  failLecture = true;
const requests = [],
  success = [];
await context.route("**/api/ai", async (route) => {
  const request = route.request().postDataJSON();
  requests.push(request);
  if (request.kind === "course_plan")
    return route.fulfill(
      failPlan
        ? { status: 502, json: { error: "测试：蓝图暂不可用" } }
        : { json: { content: JSON.stringify(plan) } },
    );
  const match = request.messages[0].content.match(
    /本次只生成第 (\d+) 个单元的第 (\d+) 讲/,
  );
  assert(match, "Each request must target one lecture");
  const i = +match[1] - 1,
    j = +match[2] - 1;
  if (i === 0 && j === 1 && failLecture)
    return route.fulfill({
      status: 502,
      json: { error: "测试：当前讲次失败" },
    });
  success.push([i, j]);
  return route.fulfill({ json: { content: JSON.stringify(lecture(i, j)) } });
});
const page = await context.newPage(),
  errors = [];
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
const depth = page.getByRole("radiogroup", {
  name: "你希望这门课讲到多详细？",
});
try {
  await page.goto(`http://127.0.0.1:5173/create/${draft.id}`);
  await expect(
    depth.getByRole("radio", { name: /^按目标推荐/ }),
  ).toHaveAttribute("aria-checked", "true");
  await depth.getByRole("radio", { name: /^深入掌握/ }).click();
  await page
    .getByRole("textbox", { name: "期望规模或时间安排", exact: true })
    .fill("至少 12 讲，每周 3 小时，讲清楚原理与边界");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    await page
      .locator(".generation-learning-preferences")
      .scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `screenshots/course-depth/preferences-${width}.png`,
    });
  }
  await page
    .getByRole("button", { name: "确认方向，生成蓝图", exact: true })
    .click();
  await expect(page.locator(".generation-blueprint")).toContainText(
    "4 个单元 · 12 讲",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.match(requests[0].messages[0].content, /深入掌握/);
  assert.match(requests[0].messages[0].content, /至少 12 讲，每周 3 小时/);
  await depth.getByRole("radio", { name: /^快速概览/ }).click();
  await expect(
    page.getByRole("button", { name: "确认蓝图，生成课程", exact: true }),
  ).toBeDisabled();
  failPlan = true;
  await page
    .getByRole("button", { name: "按新偏好更新蓝图", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("蓝图暂不可用");
  await expect(page.locator(".generation-blueprint")).toContainText(
    "4 个单元 · 12 讲",
  );
  await depth.getByRole("radio", { name: /^深入掌握/ }).click();
  failPlan = false;
  await page
    .getByRole("button", { name: "按新偏好更新蓝图", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "确认蓝图，生成课程", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "确认蓝图，生成课程", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("当前讲次失败");
  await expect
    .poll(
      async () =>
        (await remote()).courseDrafts[draft.id].partialUnit?.unit.lessons
          .length,
    )
    .toBe(1);
  assert.equal(
    (await remote()).courseDrafts[draft.id].completedUnits.length,
    0,
  );
  await page.reload();
  await expect(depth.getByRole("radio", { name: /^深入掌握/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    page.getByRole("textbox", { name: "期望规模或时间安排", exact: true }),
  ).toHaveValue("至少 12 讲，每周 3 小时，讲清楚原理与边界");
  await page.getByRole("button", { name: /课程蓝图已确认/ }).click();
  await expect(
    page.locator('.blueprint-node-lesson[data-complete="true"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.blueprint-node-unit[data-complete="true"]'),
  ).toHaveCount(0);
  await page.screenshot({ path: "screenshots/course-depth/partial-map.png" });
  await page
    .locator(".blueprint-panel")
    .getByRole("tab", { name: "课程", exact: true })
    .click();
  await expect(page.locator(".blueprint-preview-lesson").first()).toContainText(
    "已生成",
  );
  await expect(page.locator(".blueprint-preview-lesson").nth(1)).toContainText(
    "待生成",
  );
  await page.screenshot({
    path: "screenshots/course-depth/partial-course.png",
  });
  await page.getByRole("button", { name: "关闭课程蓝图", exact: true }).click();
  failLecture = false;
  await page.getByRole("button", { name: "继续生成课程", exact: true }).click();
  await expect(page.locator(".generation-delivery")).toContainText(
    "课程已就绪",
  );
  await expect
    .poll(
      async () =>
        (await remote()).customCourses.find(
          (c) => c.id === `generated-${draft.id}`,
        )?.units.length,
    )
    .toBe(4);
  const course = (await remote()).customCourses.find(
    (c) => c.id === `generated-${draft.id}`,
  );
  assert(course.units.every((unit) => unit.lessons.length === 3));
  assert(
    course.units.every((unit) =>
      unit.lessons.every((lesson) => lesson.teaching.steps.length === 4),
    ),
  );
  assert.equal(success.length, 12);
  assert.equal(
    new Set(success.map((pair) => pair.join("/"))).size,
    12,
    "Completed lectures must never be regenerated after reload",
  );
  assert(
    requests
      .filter((r) => r.kind === "course_unit")
      .every((r) => /深入掌握/.test(r.messages[0].content)),
  );
  await page.getByRole("button", { name: /课程蓝图已确认/ }).click();
  await expect(page.locator(".blueprint-preview-lesson")).toHaveCount(12);
  await page.screenshot({
    path: "screenshots/course-depth/completed-course.png",
  });
  await writeFile(
    "screenshots/course-depth/verification.json",
    JSON.stringify(
      {
        scope: "Fixture model responses; actual isolated SQLite persistence",
        units: 4,
        lecturesPerUnit: 3,
        totalLectures: 12,
        generatedLectureRequests: 13,
        succeededOnce: success,
        errors,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Learner depth and scope persist; 4 units x 3 lectures accepted; changed preferences require blueprint review; failed replan retains prior content; partial lecture survives reload; only unfinished lectures resume; 12 unique lectures delivered",
  );
} finally {
  await browser.close();
}
