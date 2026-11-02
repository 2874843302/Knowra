import { directedTeaching } from "./fixtures/teaching-direction.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";
import {
  mockCourseResearch,
  researchFixture,
} from "./fixtures/course-research.mjs";

const plan = {
  title: "Vue 与 Spring 全栈实战",
  description: "从界面状态到服务接口，完成一个小型购物车。",
  units: ["前端响应与状态管理", "服务接口与联调"].map((title, i) => ({
    title,
    summary: "建立清晰的数据流转路径",
    lessons: [
      {
        title: i ? "请求与响应" : "认识 Pinia Store",
        summary: "结合购物车示例理解数据流",
        points: ["数据", "操作"],
      },
    ],
  })),
};
const unit = (i) => ({
  title: plan.title,
  units: [
    {
      ...plan.units[i],
      lessons: plan.units[i].lessons.map((lesson) => ({
        ...lesson,
        content: "先明确数据的来源，再将操作封装成可复用逻辑。",
        teaching: directedTeaching({
          steps: [
            {
              title: lesson.title,
              board: "数据 → 操作 → 结果",
              narration:
                "可以把过程看成流水线，从输入到输出，每个环节都有自己的职责。",
            },
          ],
        }),
        quiz: {
          question: "首先明确什么？",
          options: ["数据来源", "界面颜色"],
          answer: 0,
          explanation: "先明确数据流。",
        },
      })),
    },
  ],
});

await mkdir("screenshots/generation-activity", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion,
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
    await mockCourseResearch(context);
    const pending = [];
    const hold = async (route, kind) => {
      const response = await new Promise((resolve) =>
        pending.push({ kind, resolve }),
      );
      try {
        await route.fulfill(response);
      } catch {
        /* Aborted requests deliberately discard late responses. */
      }
    };
    await context.route("**/api/course-research", (r) => hold(r, "research"));
    await context.route("**/api/ai", (r) => {
      const kind = r.request().postDataJSON().kind;
      return ["course_plan", "course_unit"].includes(kind)
        ? hold(r, kind)
        : r.fallback();
    });
    const release = async (kind, value, error = false) => {
      await expect.poll(() => pending[0]?.kind).toBe(kind);
      pending.shift().resolve(
        error
          ? { status: 502, json: { error: "测试：服务暂时不可用" } }
          : {
              json:
                kind === "research"
                  ? value
                  : { content: JSON.stringify(value) },
            },
      );
    };
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const activity = (kind) =>
      page.locator(`.generation-activity[data-kind="${kind}"]`);
    const checkMotion = async (kind, target, property) => {
      const card = activity(kind);
      await card.scrollIntoViewIfNeeded();
      await expect(card).toHaveAttribute("data-active", "true");
      await expect(card).toHaveAttribute(
        "data-running",
        String(reducedMotion !== "reduce"),
      );
      const sample = () =>
        card
          .locator(target)
          .first()
          .evaluate((el, p) => getComputedStyle(el)[p], property);
      const before = await sample();
      await page.waitForTimeout(180);
      const after = await sample();
      if (reducedMotion === "reduce")
        assert.equal(
          before,
          after,
          "Reduced motion must render a static drawing",
        );
      else
        assert.notEqual(before, after, "Active request must visibly animate");
      evidence.push({ reducedMotion, kind, before, after });
    };
    await page.goto("http://127.0.0.1:5173/");
    await page
      .getByRole("textbox", { name: "学习主题", exact: true })
      .fill("学习 Vue 与 Spring，做一个购物车");
    await page
      .locator(".composer-toolbar")
      .getByRole("button", { name: "创建课程", exact: true })
      .click();
    await checkMotion("research", ".activity-trace", "strokeDashoffset");
    await page.screenshot({
      path: `screenshots/generation-activity/research-${reducedMotion}-1440.png`,
    });
    await release("research", researchFixture);
    await expect(page.getByRole("radiogroup")).toHaveCount(4);
    await expect(activity("research")).toHaveAttribute("data-running", "false");
    await page.getByRole("button", { name: /已检索 2 份资料/ }).click();
    await expect
      .poll(() =>
        page
          .locator(".generation-source-list a")
          .last()
          .evaluate((e) => getComputedStyle(e).opacity),
      )
      .toBe("1");
    await page.getByRole("button", { name: /已检索 2 份资料/ }).click();
    for (const group of await page.getByRole("radiogroup").all())
      await group.getByRole("radio").first().click();
    const planButton = page.getByRole("button", {
      name: "确认方向，生成蓝图",
      exact: true,
    });
    const size = async (button) => {
      const rect = await button.boundingBox();
      return { width: rect.width, height: rect.height };
    };
    const planSize = await size(planButton);
    await page
      .getByRole("button", { name: "确认方向，生成蓝图", exact: true })
      .click();
    await checkMotion("planning", ".activity-trace", "strokeDashoffset");
    await expect(planButton).toHaveAttribute("aria-busy", "true");
    assert.deepEqual(
      await size(planButton),
      planSize,
      "Loading label must not resize the button",
    );
    await page.screenshot({
      path: `screenshots/generation-activity/planning-${reducedMotion}-1440.png`,
    });
    await release("course_plan", null, true);
    await expect(page.getByRole("alert")).toContainText("服务暂时不可用");
    await expect(planButton).toHaveAttribute("data-status", "error");
    assert.deepEqual(
      await size(planButton),
      planSize,
      "Retry label must not resize the button",
    );
    await expect(activity("research")).toHaveAttribute("data-state", "settled");
    await expect(activity("research")).toHaveAttribute("data-running", "false");
    await page
      .getByRole("button", { name: "确认方向，生成蓝图", exact: true })
      .click();
    await release("course_plan", plan);
    await expect(page.locator(".generation-blueprint")).toContainText(
      plan.title,
    );
    await expect(activity("planning")).toHaveAttribute("data-running", "false");
    const confirmButton = page.getByRole("button", {
      name: "确认蓝图，生成课程",
      exact: true,
    });
    const confirmSize = await size(confirmButton);
    await confirmButton.click();
    const confirmedButton = page.getByRole("button", {
      name: "蓝图已确认",
      exact: true,
    });
    await expect(confirmedButton).toHaveAttribute("data-status", "success");
    assert.deepEqual(
      await size(confirmedButton),
      confirmSize,
      "Confirmed action must retain its size",
    );
    await checkMotion("writing", ".activity-pencil", "transform");
    await expect(page.locator(".generation-activity-units")).toHaveAttribute(
      "aria-label",
      "已完成 0 / 2 个单元",
    );
    await release("course_unit", unit(0));
    await expect(page.locator(".generation-activity-units")).toHaveAttribute(
      "aria-label",
      "已完成 1 / 2 个单元",
    );
    await expect.poll(() => pending[0]?.kind).toBe("course_unit");
    const firstEntry = page.locator(".agent-activity-item").first();
    const disclosure = firstEntry.getByRole("button");
    await disclosure.focus();
    await page.keyboard.press("Space");
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await expect(firstEntry.locator(".agent-activity-details")).toContainText(
      plan.units[0].lessons[0].title,
    );
    await expect(firstEntry.locator(".agent-activity-details")).toContainText(
      "已生成的讲次",
    );
    await page.keyboard.press("Space");
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await disclosure.blur();
    await page.waitForTimeout(220);
    await expect(
      page.locator(".generation-activity-units [data-complete=true]"),
    ).toHaveCount(1);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      });
      await activity("writing").scrollIntoViewIfNeeded();
      const rect = await activity("writing").boundingBox();
      assert(rect.x >= 0 && rect.x + rect.width <= width + 1);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `screenshots/generation-activity/writing-${reducedMotion}-${width}.png`,
        });
    }
    await page.evaluate(() => scrollTo(0, 0));
    await expect(activity("writing")).toHaveAttribute("data-running", "false");
    await activity("writing").scrollIntoViewIfNeeded();
    await expect(activity("writing")).toHaveAttribute(
      "data-running",
      String(reducedMotion !== "reduce"),
    );
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect(activity("writing")).toHaveAttribute("data-state", "paused");
    await expect(activity("writing")).toHaveAttribute("data-running", "false");
    await release("course_unit", unit(1));
    await expect(page.locator(".generation-delivery")).toHaveCount(0);
    await page
      .getByRole("button", { name: "继续生成课程", exact: true })
      .click();
    await release("course_unit", null, true);
    await expect(activity("writing")).toHaveAttribute("data-state", "error");
    await expect(activity("writing")).toHaveAttribute("data-running", "false");
    await expect(page.locator(".generation-activity-units")).toHaveAttribute(
      "aria-label",
      "已完成 1 / 2 个单元",
    );
    await page
      .getByRole("button", { name: "继续生成课程", exact: true })
      .click();
    await release("course_unit", unit(1));
    await expect(page.locator(".generation-delivery")).toBeVisible();
    await expect(activity("writing")).toHaveAttribute("data-active", "false");
    await expect(page.locator(".generation-activity-units")).toHaveAttribute(
      "aria-label",
      "已完成 2 / 2 个单元",
    );
    await expect
      .poll(() =>
        page
          .locator(".generation-delivery > span path")
          .getAttribute("pathLength"),
      )
      .toBe("1");
    await page.waitForTimeout(420);
    const loops = await page
      .locator(".generation-activity")
      .evaluateAll(
        (nodes) =>
          nodes
            .flatMap((el) => el.getAnimations({ subtree: true }))
            .filter(
              (a) =>
                a.playState === "running" &&
                a.effect.getTiming().iterations === Infinity,
            ).length,
      );
    assert.equal(loops, 0, "Completed content must not keep looping");
    await page.screenshot({
      path: `screenshots/generation-activity/ready-${reducedMotion}-1440.png`,
    });
    assert.deepEqual(errors, []);
    evidence.push({
      reducedMotion,
      pauseStopsMotion: true,
      offscreenStopsMotion: true,
      errorKeepsCount: true,
      lateResponseIgnored: true,
      completeLoops: loops,
    });
    await context.close();
  }
  await writeFile(
    "screenshots/generation-activity/verification.json",
    JSON.stringify({ fixture: true, evidence }, null, 2),
  );
  console.log(
    "PASS Actual-request drawings animate at each stage; reduced/offscreen/paused/error/completed states stop; counts follow returned units; mobile layouts fit; late responses ignored",
  );
} finally {
  await browser.close();
}
