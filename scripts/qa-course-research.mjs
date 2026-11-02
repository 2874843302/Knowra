import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";
import {
  validateCourseQuestions,
  validateSearchQueries,
} from "../src/lib/course-generation.js";
import {
  interviewFixture,
  researchFixture,
} from "./fixtures/course-research.mjs";

assert.throws(() => validateSearchQueries({ queries: [] }), /检索方向/);
assert.throws(
  () =>
    validateCourseQuestions(
      {
        ...interviewFixture,
        questions: interviewFixture.questions.map((q) => ({
          ...q,
          key: "duplicate",
        })),
      },
      researchFixture,
    ),
  /格式|来源/,
);
assert.throws(
  () =>
    validateCourseQuestions(
      {
        ...interviewFixture,
        questions: interviewFixture.questions.map((q) => ({
          ...q,
          sourceIds: ["invented"],
        })),
      },
      researchFixture,
    ),
  /来源/,
);
assert.throws(
  () =>
    validateCourseQuestions(
      {
        ...interviewFixture,
        questions: interviewFixture.questions.map((q) => ({
          ...q,
          key: q.key === "outcome" ? "depth" : q.key,
        })),
      },
      researchFixture,
    ),
  /最终成果/,
);

const photoResearch = {
  ...researchFixture,
  queries: ["portrait photography basics"],
  sources: [
    {
      id: "source-1",
      title: "Photography basics",
      url: "https://www.nikonusa.com/learn-and-explore",
      snippet: "Learn exposure, lighting and portrait composition.",
      query: "portrait photography basics",
    },
  ],
};
const photoInterview = {
  summary: "人像摄影需要结合曝光、用光与构图，先明确拍摄设备和想完成的作品。",
  questions: [
    {
      key: "foundation",
      title: "你目前使用什么设备拍摄？",
      sourceIds: ["source-1"],
      options: [
        ["phone", "手机拍摄", "用手机理解曝光与构图"],
        ["camera", "相机拍摄", "认识光圈、快门与感光度"],
        ["unsure", "还没决定", "先了解设备与学习门槛"],
      ],
    },
    {
      key: "direction",
      title: "你更想练习哪种人像风格？",
      sourceIds: ["source-1"],
      options: [
        ["natural", "自然光人像", "户外光线与人物构图"],
        ["studio", "棚拍人像", "布光与人物塑造"],
        ["unsure", "希望推荐", "先试拍再选择风格"],
      ],
    },
    {
      key: "outcome",
      title: "你希望最后交出怎样的作品？",
      sourceIds: [],
      options: [
        ["series", "一组人像作品", "完成拍摄、选片与基础后期"],
        ["daily", "日常人物记录", "稳定拍好朋友和家人"],
        ["unsure", "还没想好", "先完成一次小型拍摄练习"],
      ],
    },
  ],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
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
await context.route("**/api/provider", (r) =>
  r.fulfill({ json: { configured: true, model: "fixture-model" } }),
);
let mode = "hold-search",
  release,
  photo = false;
const calls = [];
await context.route("**/api/course-research", async (route) => {
  calls.push({ kind: "web", body: route.request().postDataJSON() });
  const current = mode,
    result = photo ? photoResearch : researchFixture;
  if (current === "hold-search")
    await new Promise((resolve) => {
      release = resolve;
    });
  try {
    await route.fulfill(
      current === "fail-search"
        ? { status: 502, json: { error: "测试：联网检索不可用" } }
        : { json: result },
    );
  } catch {
    /* Late response after abort. */
  }
});
await context.route("**/api/ai", async (route) => {
  const body = route.request().postDataJSON();
  calls.push({ kind: body.kind, body });
  if (body.kind === "course_search")
    return route.fulfill({
      json: {
        content: JSON.stringify({
          queries: (photo ? photoResearch : researchFixture).queries,
        }),
      },
    });
  assert.equal(
    body.kind,
    "course_questions",
    "No course planning before requirements are confirmed",
  );
  const current = mode,
    result = photo ? photoInterview : interviewFixture;
  if (current === "hold-questions")
    await new Promise((resolve) => {
      release = resolve;
    });
  try {
    await route.fulfill({
      json: {
        content: JSON.stringify(
          current === "invalid-questions"
            ? { ...result, questions: [] }
            : result,
        ),
      },
    });
  } catch {
    /* Late response after refresh. */
  }
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
const input = () =>
  page.getByRole("textbox", { name: "课程生成对话", exact: true });
await mkdir("screenshots/course-research", { recursive: true });
try {
  await page.goto("http://127.0.0.1:5173/");
  await page
    .getByRole("textbox", { name: "学习主题", exact: true })
    .fill("学习 Vue 和 Spring，做一个小项目");
  await page
    .locator(".composer-toolbar")
    .getByRole("button", { name: "创建课程", exact: true })
    .click();
  await expect(page.locator(".generation-research-status")).toContainText(
    "正在拆解主题并联网检索资料",
  );
  await expect
    .poll(() => calls.map((c) => c.kind))
    .toEqual(["course_search", "web"]);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.getByRole("button", { name: "停止生成", exact: true }).click();
  release();
  await expect(page.locator(".generation-interrupted")).toBeVisible();
  await expect(page.locator(".generation-research")).toHaveCount(0);
  mode = "fail-search";
  await page.getByRole("button", { name: "重新调研主题", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("联网检索不可用");
  assert.equal(calls.filter((c) => c.kind === "course_questions").length, 0);
  mode = "invalid-questions";
  await page.getByRole("button", { name: "重新调研主题", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("需求问题不完整");
  await expect(page.getByRole("radio")).toHaveCount(0);
  const webCount = calls.filter((c) => c.kind === "web").length;
  await page.getByRole("button", { name: /已检索 2 份资料/ }).click();
  await expect(page.locator(".generation-source-list a")).toHaveCount(2);
  await expect(
    page.locator(".generation-source-list a").first(),
  ).toHaveAttribute("href", researchFixture.sources[0].url);
  await expect(page.locator(".generation-source-list")).toContainText(
    "检索摘要",
  );
  mode = "success";
  await page
    .getByRole("button", { name: "继续整理需求问题", exact: true })
    .click();
  await expect(
    page.getByRole("radiogroup", { name: interviewFixture.questions[0].title }),
  ).toBeVisible();
  assert.equal(
    calls.filter((c) => c.kind === "web").length,
    webCount,
    "Retry questions reuses saved research",
  );
  assert(
    calls
      .at(-1)
      .body.messages[0].content.includes(researchFixture.sources[0].snippet),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "screenshots/course-research/vue-1440.png",
    fullPage: true,
  });
  const beforeReload = calls.length;
  await expect
    .poll(
      async () =>
        Object.values((await remote()).courseDrafts).find(
          (d) => d.questions?.length,
        )?.questions.length,
    )
    .toBe(3);
  await page.reload();
  await expect(
    page.locator(".generation-question-list").getByRole("radio"),
  ).toHaveCount(11);
  await expect(
    page.getByRole("radiogroup", { name: "你希望这门课讲到多详细？" }),
  ).toBeVisible();
  assert.equal(
    calls.length,
    beforeReload,
    "Restored questions do not rerun research",
  );

  photo = true;
  mode = "hold-questions";
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创建课程", exact: true })
    .click();
  await expect(page.locator(".generation-welcome")).toBeVisible();
  await input().fill("入门摄影，想拍好人像");
  await input().press("Enter");
  await expect(page.locator(".generation-research-status")).toContainText(
    "正在结合资料整理适合你的选择题",
  );
  const photoId = page.url().split("/").at(-1);
  await expect
    .poll(async () => (await remote()).courseDrafts[photoId]?.phase)
    .toBe("interviewing");
  const beforeInterrupt = calls.length;
  await page.reload();
  release();
  await expect(page.locator(".generation-interrupted")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  assert.equal(calls.length, beforeInterrupt);
  mode = "success";
  await page
    .getByRole("button", { name: "继续整理需求问题", exact: true })
    .click();
  await expect(
    page.getByRole("radiogroup", { name: "你目前使用什么设备拍摄？" }),
  ).toBeVisible();
  assert.equal(calls.length, beforeInterrupt + 1);
  assert(
    calls.at(-1).body.messages[0].content.includes("portrait photography"),
  );
  assert.equal(
    await page
      .getByRole("radiogroup", { name: interviewFixture.questions[0].title })
      .count(),
    0,
  );
  await page.getByRole("radio", { name: /^手机拍摄/ }).click();
  await page.getByRole("radio", { name: /^自然光人像/ }).click();
  await page.getByRole("radio", { name: /^一组人像作品/ }).click();
  await expect(
    page.getByRole("button", { name: "确认方向，生成蓝图", exact: true }),
  ).toBeEnabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1050 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    );
    if (width === 390 || width === 1440) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `screenshots/course-research/photo-${width}.png`,
        fullPage: true,
      });
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "screenshots/course-research/verification.json",
    JSON.stringify(
      { fixture: true, calls: calls.map((c) => c.kind), errors },
      null,
      2,
    ),
  );
  console.log(
    "PASS Automatic research before questions; abort ignores late results; failed search never fabricates questions; question retry uses retained sources",
  );
  console.log(
    "PASS Topic-specific Vue and photography questions; source links; interrupted refresh resumes questions only; explicit planning gate; four widths",
  );
} catch (e) {
  await page.screenshot({
    path: "screenshots/course-research/failure.png",
    fullPage: true,
  });
  console.log(
    "Research failure",
    calls.map((c) => c.kind),
    errors,
  );
  throw e;
} finally {
  await browser.close();
}
