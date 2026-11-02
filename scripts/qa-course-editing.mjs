import { directedTeaching } from "./fixtures/teaching-direction.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, validateOutline } from "../src/data.js";

const course = {
  id: "qa-ai-editing",
  title: "生活里的数学",
  description: "用例子理解知识",
  color: "sage",
  icon: "network",
  source: "学习室",
  units: validateOutline({
    title: "生活里的数学",
    units: [
      {
        title: "比例",
        lessons: [
          {
            title: "理解比例",
            summary: "理解等比例关系",
            points: ["比例保持不变"],
            content: "## 原始概念\n\n两份材料按比例组合。",
            teaching: directedTeaching({
              steps: [
                {
                  title: "材料比例",
                  board: "**两份原料 → 同步放大**",
                  narration:
                    "先用两份材料说明比例，保持各部分之间的关系就能得到相同的配方。",
                },
              ],
            }),
            quiz: {
              question: "比例会保持吗？",
              options: ["会", "不会"],
              answer: 0,
              explanation: "同步放大保持比例。",
            },
          },
          {
            title: "不需要修改的讲次",
            summary: "应用比例",
            points: [],
            content: "## 保留的内容\n\n这段讲义应原样保留。",
          },
        ],
      },
    ],
  }),
};
const first = course.units[0].lessons[0],
  key = `${course.id}/${first.id}`;
const plan = {
  reply: "第一讲补充调饮料的生活例子，其余讲次和结构保持不变。",
  title: "生活里的数学 · 更直观",
  description: course.description,
  units: course.units.map((u, sourceIndex) => ({
    title: u.title,
    sourceIndex,
    lessons: u.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      summary: l.summary,
      points: l.points,
      rewrite: l.id === first.id,
      instruction: l.id === first.id ? "补充调饮料的例子" : "",
    })),
  })),
};
const updated = {
  title: plan.title,
  units: [
    {
      title: course.units[0].title,
      lessons: [
        {
          ...first,
          content:
            "## 调饮料的例子\n\n原料按一比二混合，一杯糖浆配两杯水。放大到两杯糖浆，需要四杯水，比例仍保持不变。",
          teaching: directedTeaching({
            steps: [
              {
                title: "把比例放进杯子里",
                board: "**1 杯糖浆 : 2 杯水**\n\n两杯糖浆 → 四杯水",
                narration:
                  "想象给朋友调饮料，一杯糖浆需要配两杯水。人数多了一倍，两种材料都要一起翻倍，味道才能保持一致。",
              },
            ],
          }),
          quiz: {
            question: "两杯糖浆要配几杯水？",
            options: ["四杯", "两杯"],
            answer: 0,
            explanation: "两种材料同时扩大两倍。",
          },
        },
      ],
    },
  ],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("screenshots/course-editing", { recursive: true });
const evidence = [];
try {
  for (const width of [1440, 1024]) {
    const workspace = crypto.randomUUID(),
      seed = initialState();
    seed.customCourses = [course];
    seed.notes[key] = "我的比例笔记";
    seed.progress[key] = { completed: true };
    seed.lessonPlayback[key] = { step: 3 };
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
    });
    await context.addInitScript(
      ({ workspace, seed }) => {
        if (!localStorage.getItem("knowra-workspace-id")) {
          localStorage.setItem("knowra-workspace-id", workspace);
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
        }
      },
      { workspace, seed },
    );
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: true, model: "fixture" } }),
    );
    let mode = "valid",
      calls = [],
      release;
    await context.route("**/api/ai", async (route) => {
      const body = route.request().postDataJSON();
      calls.push(body);
      if (mode === "delayed")
        await new Promise((resolve) => {
          release = resolve;
        });
      if (mode === "failure")
        return route.fulfill({
          status: 503,
          json: { error: "编辑服务暂时不可用" },
        });
      const content =
        body.kind === "course_edit_plan"
          ? JSON.stringify(plan)
          : mode === "repair" &&
              calls.filter((c) => c.kind === "course_edit_lesson").length === 1
            ? "invalid"
            : JSON.stringify(updated);
      await route.fulfill({ json: { content } }).catch(() => {});
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const local = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("knowra-workspace-v1")),
      );
    const remote = async () =>
      (
        await (
          await page.request.get("http://127.0.0.1:5173/api/workspace", {
            headers: { "X-Workspace-Id": workspace },
          })
        ).json()
      ).state;
    await page.goto(`http://127.0.0.1:5173/course/${course.id}`);
    await page.getByRole("button", { name: "AI 编辑", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "编辑课程", exact: true });
    await expect(
      dialog.getByRole("heading", { name: "想让这门课，变得更适合你？" }),
    ).toBeVisible();
    assert.equal(calls.length, 0);
    await dialog
      .getByRole("textbox", { name: "告诉 AI 如何修改课程" })
      .fill("第一讲加入调饮料的例子，保持其余内容不变");
    mode = "repair";
    await dialog.getByRole("button", { name: "生成修改", exact: true }).click();
    const preview = dialog.getByRole("region", { name: "课程修改预览" });
    await expect(preview).toContainText("1 讲内容更新", { timeout: 15000 });
    await expect(
      dialog.getByRole("button", { name: "应用修改", exact: true }),
    ).toBeEnabled();
    assert.deepEqual(
      calls.map((c) => c.kind),
      ["course_edit_plan", "course_edit_lesson", "course_edit_lesson"],
    );
    assert.equal(
      (await local()).courseEdits?.[course.id],
      undefined,
      "preview must not save",
    );
    assert.equal((await remote()).courseEdits?.[course.id], undefined);
    await preview.getByText("理解比例", { exact: true }).click();
    await expect(preview).toContainText("一杯糖浆配两杯水");
    await preview.getByText("白板、讲解与测验 · 1 段", { exact: true }).click();
    await expect(preview).toContainText("把比例放进杯子里");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `screenshots/course-editing/preview-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "继续对话调整", exact: true })
      .click();
    const followup = dialog.getByRole("textbox", {
      name: "告诉 AI 如何修改课程",
    });
    await expect(followup).toBeFocused();
    await followup.fill("保留刚才调饮料的例子，再强调两种材料要一起翻倍");
    mode = "valid";
    await dialog.getByRole("button", { name: "生成修改", exact: true }).click();
    await expect(
      dialog.getByRole("region", { name: "课程编辑对话" }),
    ).toContainText("一起翻倍");
    const refinement = calls.filter((c) => c.kind === "course_edit_plan").at(-1)
      .messages[0].content;
    assert(refinement.includes("第一讲加入调饮料的例子，保持其余内容不变"));
    assert(
      refinement.includes("保留刚才调饮料的例子，再强调两种材料要一起翻倍"),
    );
    assert.equal(
      (await remote()).courseEdits?.[course.id],
      undefined,
      "follow-up must remain a preview",
    );
    await dialog.getByRole("button", { name: "应用修改", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => (await remote()).courseEdits?.[course.id]?.title)
      .toBe(plan.title);
    const saved = await remote();
    assert.equal(saved.courseEdits[course.id].units[0].lessons[0].id, first.id);
    assert.equal(
      saved.courseEdits[course.id].units[0].lessons[1].content,
      course.units[0].lessons[1].content,
    );
    assert.equal(saved.notes[key], "我的比例笔记");
    assert.equal(saved.progress[key].completed, true);
    assert.equal(saved.lessonPlayback[key], undefined);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: plan.title, exact: true }).first(),
    ).toBeVisible();
    // A failed edit leaves the applied course intact and retains the request.
    await page.getByRole("button", { name: "编辑课程", exact: true }).click();
    mode = "failure";
    await dialog
      .getByRole("textbox", { name: "告诉 AI 如何修改课程" })
      .fill("再加一个应用案例");
    await dialog.getByRole("button", { name: "生成修改", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("暂时不可用");
    await expect(
      dialog.getByRole("textbox", { name: "告诉 AI 如何修改课程" }),
    ).toHaveValue("再加一个应用案例");
    assert.deepEqual(
      (await remote()).courseEdits?.[course.id],
      saved.courseEdits[course.id],
    );
    mode = "delayed";
    await dialog.getByRole("button", { name: "生成修改", exact: true }).click();
    await expect.poll(() => typeof release).toBe("function");
    await dialog.getByRole("button", { name: "停止生成", exact: true }).click();
    release();
    await expect(
      dialog.getByRole("button", { name: "生成修改", exact: true }),
    ).toBeEnabled();
    await page.waitForTimeout(300);
    await expect(preview).toHaveCount(0);
    assert.deepEqual(
      (await remote()).courseEdits?.[course.id],
      saved.courseEdits[course.id],
    );
    // Existing manual editing remains reachable without connecting a model.
    await dialog.getByRole("button", { name: "手动编辑", exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: "课程名称" })).toHaveValue(
      plan.title,
    );
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${first.id}`);
    await expect(
      page
        .getByRole("heading", { name: "把比例放进杯子里", exact: true })
        .first(),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}: AI edit, internal repair, full preview, atomic apply, stable links, preserved notes/progress, reload, failure and cancellation`,
    );
    evidence.push({ width, calls: calls.map((c) => c.kind), errors });
    await context.close();
  }
  await writeFile(
    "screenshots/course-editing/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
