import { directedTeaching } from "./fixtures/teaching-direction.mjs";
import { mockCourseResearch } from "./fixtures/course-research.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";
import { validateCoursePlan } from "../src/lib/course-generation.js";

const plan = {
  title: "Vue 与 Spring 全栈实战",
  description: "从共享状态到服务接口，完成一个小型购物车。",
  units: [
    {
      title: "前端响应与状态管理",
      summary: "建立购物车状态流转",
      lessons: [
        {
          title: "认识 Pinia Store",
          summary: "区分状态、派生计算和操作",
          points: ["State", "Getters", "Actions"],
        },
      ],
    },
    {
      title: "服务接口与联调",
      summary: "连接前后端",
      lessons: [
        {
          title: "请求与响应",
          summary: "封装一个可复用的商品请求",
          points: ["请求封装", "错误处理"],
        },
      ],
    },
  ],
};
assert.throws(
  () => validateCoursePlan({ title: "broken", units: [] }),
  /蓝图不完整/,
);
assert.throws(
  () =>
    validateCoursePlan({ ...plan, units: [{ title: "bad", lessons: [{}] }] }),
  /讲次目标/,
);
const unitResponse = (i) => ({
  title: plan.title,
  units: [
    {
      ...plan.units[i],
      lessons: plan.units[i].lessons.map((lesson) => ({
        ...lesson,
        content: `## ${lesson.title}\n\n先理解核心概念，再结合具体例子练习。\n\n完整教材保留详细解释。\n\n最后检查自己的理解。`,
        teaching: directedTeaching({
          steps: [
            {
              title: lesson.title,
              board: "**数据 → 计算 → 操作**",
              narration:
                "可以把这一过程理解成一条流水线。先明确数据从哪里来，再考虑需要得出什么结果，最后把用户的操作变成可复用的业务逻辑。",
            },
          ],
        }),
        quiz: {
          question: "首先明确什么？",
          options: ["数据", "颜色"],
          answer: 0,
          explanation: "先了解数据，再组织操作。",
        },
      })),
    },
  ],
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1680, height: 1100 },
  reducedMotion: "reduce",
});
await context.addInitScript(
  ({ id, seed }) => {
    if (!localStorage.getItem("knowra-workspace-id")) {
      localStorage.setItem("knowra-workspace-id", id);
      localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
    }
  },
  { id: crypto.randomUUID(), seed: initialState() },
);
let configured = true,
  mode = "hold",
  release;
const requests = [];
await context.route("**/api/provider", (r) =>
  r.fulfill({ json: { configured, model: "fixture-model" } }),
);
await context.route("**/api/ai", async (route) => {
  const body = route.request().postDataJSON();
  requests.push(body);
  const currentMode = mode;
  if (currentMode === "hold")
    await new Promise((resolve) => {
      release = resolve;
    });
  try {
    if (
      currentMode === "error" ||
      (currentMode === "unit-failure" &&
        body.kind === "course_unit" &&
        body.messages[0].content.includes("本次只生成第 2"))
    )
      return await route.fulfill({
        status: 502,
        json: { error: "测试：模型暂时不可用" },
      });
    if (currentMode === "invalid")
      return await route.fulfill({
        json: { content: '{"title":"broken","units":[]}' },
      });
    const i = body.messages[0].content.includes("本次只生成第 2") ? 1 : 0;
    await route.fulfill({
      json: {
        content:
          body.kind === "course_plan"
            ? `这是为你规划的课程蓝图：\n\`\`\`JSON\n${JSON.stringify(plan)}\n\`\`\`\n请确认后继续。`
            : JSON.stringify(unitResponse(i)),
      },
    });
  } catch {
    /* Canceled requests intentionally discard their late responses. */
  }
});
const researchCalls = [];
await mockCourseResearch(context, (kind) => researchCalls.push(kind));
const page = await context.newPage(),
  errors = [],
  geometry = [];
page.on("pageerror", (e) => errors.push(e.message));
const input = () =>
  page.getByRole("textbox", { name: "课程生成对话", exact: true });
const startPlan = () =>
  page.getByRole("button", { name: "确认方向，生成蓝图", exact: true });
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
await mkdir("screenshots/course-creation-chat", { recursive: true });
try {
  await page.goto("http://127.0.0.1:5173/");
  await page
    .getByRole("textbox", { name: "学习主题", exact: true })
    .fill("学习前端 Vue 和 Spring");
  await page
    .locator(".composer-toolbar")
    .getByRole("button", { name: "创建课程", exact: true })
    .click();
  await expect(page).toHaveURL(/\/create\//);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".generation-user-message")).toHaveText(
    "学习前端 Vue 和 Spring",
  );
  await expect(startPlan()).toBeDisabled();
  const foundation = page.getByRole("radiogroup", {
    name: "你的 JavaScript 与 Java 基础如何？",
  });
  await foundation.getByRole("radio", { name: /^刚刚开始/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    foundation.getByRole("radio", { name: /^接触过一些/ }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: /^全栈联调/ }).click();
  await page.getByRole("radio", { name: /^购物车项目/ }).click();
  await input().fill("目标：完成一个购物车项目");
  await input().press("Enter");
  await expect(page.locator(".generation-user-message").last()).toContainText(
    "购物车项目",
  );
  assert.equal(
    requests.length,
    0,
    "Course planning waits for research and learner answers",
  );
  assert.deepEqual(researchCalls, ["course_search", "web", "course_questions"]);
  await input().fill("中文输入候选");
  await input().dispatchEvent("keydown", {
    key: "Enter",
    isComposing: true,
    bubbles: true,
  });
  assert.equal(await input().inputValue(), "中文输入候选");
  await input().fill("");
  await page.locator('input[type="file"]').setInputFiles({
    name: "project-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("商品列表与购物车使用同一份状态。"),
  });
  await expect(page.locator(".generation-files")).toContainText(
    "project-notes.txt",
  );
  for (const width of [320, 390, 768, 1440, 1680]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1100 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    const rect = await page.locator(".generation-composer").boundingBox();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    assert(
      overflow <= 1 && rect.x >= 0 && rect.x + rect.width <= width + 1,
      JSON.stringify({ width, rect, overflow }),
    );
    await input().fill("这一行测试换行");
    await input().press("Shift+Enter");
    assert((await input().inputValue()).includes("\n"));
    await input().fill("");
    geometry.push({ width, rect, overflow });
    if ([390, 1680].includes(width)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `screenshots/course-creation-chat/questions-${width}.png`,
        fullPage: true,
      });
    }
  }
  const draftURL = page.url(),
    draftId = draftURL.split("/").at(-1);
  await startPlan().click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  assert.equal(requests[0].kind, "course_plan");
  for (const text of [
    "接触过一些",
    "全栈联调",
    "商品列表",
    "https://vuejs.org/guide/introduction.html",
    "购物车项目",
    "同一份状态",
  ])
    assert(requests[0].messages[0].content.includes(text));
  await page.getByRole("button", { name: "停止生成", exact: true }).click();
  release();
  await expect(page.locator(".generation-blueprint")).toHaveCount(0);
  mode = "invalid";
  await startPlan().click();
  await expect(page.getByRole("alert")).toContainText("蓝图不完整");
  mode = "success";
  await startPlan().click();
  await expect(page.locator(".generation-blueprint")).toContainText(plan.title);
  assert(
    requests.every((r) => r.kind === "course_plan"),
    "No lesson generation until blueprint confirmation",
  );
  await page.getByRole("button", { name: /课程蓝图，等你确认/ }).click();
  await expect(page.locator(".blueprint-panel")).toContainText(
    "认识 Pinia Store",
  );
  await page.screenshot({
    path: "screenshots/course-creation-chat/blueprint-1680.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "关闭课程蓝图", exact: true }).click();
  mode = "error";
  await input().fill("增加购物车数量同步的例子");
  await input().press("Enter");
  await expect(page.getByRole("alert")).toContainText("模型暂时不可用");
  await expect(page.locator(".generation-blueprint")).toContainText(plan.title);
  assert(requests.at(-1).messages[0].content.includes("增加购物车数量同步"));
  mode = "success";
  await page.getByRole("button", { name: "重新规划蓝图", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "确认蓝图，生成课程", exact: true }),
  ).toBeEnabled();
  mode = "unit-failure";
  await page
    .getByRole("button", { name: "确认蓝图，生成课程", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("模型暂时不可用");
  await expect(
    page.locator(".generation-unit-progress .is-complete"),
  ).toHaveCount(1);
  await expect
    .poll(
      async () => (await remote()).courseDrafts[draftId].completedUnits.length,
    )
    .toBe(1);
  await page.getByRole("button", { name: /课程蓝图已确认/ }).click();
  await expect(
    page.locator('.blueprint-node-unit[data-complete="true"]'),
  ).toHaveCount(1);
  await page
    .locator(".blueprint-panel")
    .getByRole("tab", { name: "课程", exact: true })
    .click();
  await expect(page.locator(".blueprint-preview-lesson").first()).toContainText(
    "已生成",
  );
  await expect(page.locator(".blueprint-preview-lesson").last()).toContainText(
    "待生成",
  );
  await page.getByRole("button", { name: "关闭课程蓝图", exact: true }).click();
  await page.reload();
  await expect(
    page.locator(".generation-unit-progress .is-complete"),
  ).toHaveCount(1);
  mode = "hold";
  await page.getByRole("button", { name: "继续生成课程", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "停止生成", exact: true }).click();
  release();
  await expect(
    page.locator(".generation-unit-progress .is-complete"),
  ).toHaveCount(1);
  mode = "hold";
  await page.getByRole("button", { name: "继续生成课程", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await remote()).courseDrafts[draftId].phase)
    .toBe("generating");
  await page.reload();
  release();
  await expect(page.locator(".generation-interrupted")).toContainText(
    "已有 1 个单元",
  );
  await expect(page.locator(".generation-delivery")).toHaveCount(0);
  const callsBeforeResume = requests.length;
  mode = "success";
  await page.getByRole("button", { name: "继续生成课程", exact: true }).click();
  await expect(page.locator(".generation-delivery")).toContainText(
    "课程已就绪",
  );
  assert.equal(requests.length, callsBeforeResume + 1);
  assert(requests.at(-1).messages[0].content.includes("本次只生成第 2"));
  await expect
    .poll(
      async () =>
        (await remote()).customCourses.filter(
          (c) => c.id === `generated-${draftId}`,
        ).length,
    )
    .toBe(1);
  let saved = await remote();
  const course = saved.customCourses.find(
    (c) => c.id === `generated-${draftId}`,
  );
  assert.equal(course.units[0].lessons[0].teaching.mode, "script");
  assert.notEqual(course.units[0].lessons[0].id, course.units[1].lessons[0].id);
  assert.equal(saved.materials[course.id][0].name, "project-notes.txt");
  await page.getByRole("button", { name: /课程蓝图已确认/ }).click();
  await page
    .locator(".blueprint-panel")
    .getByRole("tab", { name: "课程", exact: true })
    .click();
  await expect(page.locator(".blueprint-preview-lesson")).toHaveCount(2);
  await expect(page.locator(".blueprint-preview-quiz")).toHaveCount(2);
  await expect(
    page
      .locator(".blueprint-course-intro")
      .getByRole("link", { name: /前往课程/ }),
  ).toHaveAttribute("href", `/course/generated-${draftId}`);
  await page.getByRole("button", { name: "关闭课程蓝图", exact: true }).click();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await page.screenshot({
    path: "screenshots/course-creation-chat/ready-1680.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".generation-delivery").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "screenshots/course-creation-chat/ready-390.png",
  });
  await page.setViewportSize({ width: 1680, height: 1100 });
  await page.reload();
  await expect(page.locator(".generation-delivery")).toBeVisible();
  assert.equal(requests.length, callsBeforeResume + 1);
  await page.getByRole("link", { name: "开始学习", exact: true }).click();
  await expect(page.locator(".lesson-player")).toBeVisible();
  await page.goto(draftURL);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创建课程", exact: true })
    .click();
  await expect(page.locator(".generation-welcome")).toBeVisible();
  await page.getByRole("button", { name: "自己编排课程", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "课程名称", exact: true })
    .fill("自主创建回归");
  await dialog.getByRole("button", { name: "创建课程", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "自主创建回归", exact: true }),
  ).toBeVisible();
  configured = false;
  await page.goto(draftURL);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创建课程", exact: true })
    .click();
  await input().fill("离线时记录想法");
  await input().press("Enter");
  await expect(page.locator(".generation-provider-notice")).toContainText(
    "连接 AI 模型",
  );
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创建课程", exact: true })
    .click();
  await page
    .getByRole("button", { name: "从课程模板开始", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "课程名称", exact: true })
    .fill("模板创建回归");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "创建课程", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "模板创建回归", exact: true }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  await writeFile(
    "screenshots/course-creation-chat/verification.json",
    JSON.stringify(
      { geometry, calls: requests.map((r) => r.kind), fixture: true, errors },
      null,
      2,
    ),
  );
  console.log(
    "PASS Conversation entry, radio keyboard, free-text requirements/materials, five widths, cancellation and invalid retry",
  );
  console.log(
    "PASS Blueprint confirmation gate, revision failure retention, per-unit generation, persisted partial retry without duplicates, classroom handoff and template/manual fallback",
  );
} catch (error) {
  console.log(
    "Creation QA failure state",
    await page.locator(".generation-error").allTextContents(),
    errors,
    requests.map((r) => r.kind),
  );
  await page.screenshot({
    path: "screenshots/course-creation-chat/failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
