import { directedStep } from "./fixtures/teaching-direction.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState, lessonsOf } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const course = catalog.find((c) => c.id === "study-science");
const lesson = lessonsOf(course).find((l) => l.id === "attention");
const sequence = lessonSequence(lesson.content, lesson);
const step = sequence.steps.find((s) => s.visual?.type === "diagram");
const check = sequence.steps.find((s) => s.kind === "checkpoint");
const evidence = [];
await mkdir("screenshots/teaching-diagrams", { recursive: true });
try {
  for (const width of [1440, 1024]) {
    const seed = initialState();
    const key = "study-science/attention";
    seed.lessonPlayback[key] = {
      signature: sequence.signature,
      step: step.index,
      revealedStep: step.index,
      elapsed: step.narrationDuration * 0.08,
      rate: 1,
      answers: { [check.index]: { selected: 1, correct: true } },
    };
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1024 ? "reduce" : "no-preference",
    });
    await context.addInitScript(
      ({ seed, workspace }) => {
        if (!localStorage.getItem("knowra-workspace-id")) {
          localStorage.setItem("knowra-workspace-id", workspace);
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
        }
      },
      { seed, workspace: crypto.randomUUID() },
    );
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: true, model: "fixture" } }),
    );
    const requests = [];
    const adaptation = {
      reply: "可以，先用两个圆把个人经历与环境的联系讲清，再回到注意力分配。",
      action: "insert",
      plan: [
        { title: "个人与环境的联系", reason: "解释为什么不能只归咎于意志力" },
      ],
      steps: [
        directedStep({
          title: "个人与环境的联系",
          board: "**个人努力与环境支持可以一起改变**",
          narration:
            "先看这两个圆。一个是你可以选择的学习目标，另一个是环境提供的条件。两者共同影响注意分配；我们既可以调整目标，也可以减少不必要的通知，不能把一次中断都归咎于意志力。",
          visual: {
            type: "diagram",
            layout: "venn",
            title: "两个因素一起看",
            nodes: [
              { label: "个人选择", detail: "把目标改成可完成的小步骤。" },
              { label: "环境条件", detail: "减少不必要的通知与切换。" },
            ],
            intersection: "共同影响注意分配",
            caption: "帮助理解的概念关系示意，不表示统计比例。",
          },
        }),
      ],
    };
    await context.route("**/api/ai", async (r) => {
      requests.push(r.request().postDataJSON());
      await r.fulfill({ json: { content: JSON.stringify(adaptation) } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/learn/study-science/attention");
    await page.evaluate(() => document.fonts.ready);
    const diagram = page.locator(".teaching-diagram").first();
    await expect(diagram).toBeVisible();
    await expect(diagram).toHaveAttribute("data-revealed", "1");
    const block = page.locator(`.teaching-block[data-step="${step.index}"]`);
    const before = await block.boundingBox();
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect(diagram).toHaveAttribute("data-revealed", "2", {
      timeout: 14000,
    });
    const during = await block.boundingBox();
    assert(
      Math.abs(before.x - during.x) < 1,
      "writing moved columns while diagram was being revealed",
    );
    await expect(block).toHaveAttribute("data-flow-writing", "true");
    const height = (await diagram.boundingBox()).height;
    await diagram
      .getByRole("button", { name: "注意被拉走", exact: true })
      .click();
    await expect(diagram.locator(".diagram-explanation p")).toContainText(
      "没有回复",
    );
    await expect(
      page.getByRole("button", { name: "暂停讲解", exact: true }),
    ).toBeVisible();
    assert(
      Math.abs((await diagram.boundingBox()).height - height) < 1,
      "diagram explanation changed board height",
    );
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    const phase = await diagram.getAttribute("data-revealed");
    await page.waitForTimeout(400);
    assert.equal(await diagram.getAttribute("data-revealed"), phase);
    await page.screenshot({
      path: `screenshots/teaching-diagrams/attention-${width}.png`,
    });
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    await page
      .getByRole("textbox", { name: "向导师提问" })
      .fill("能不能画图说明个人选择和环境条件的联系？");
    await page.getByRole("button", { name: "向导师发送", exact: true }).click();
    const venn = page.locator(".diagram-venn");
    await expect(venn).toBeVisible({ timeout: 10000 });
    await expect(venn).toHaveAttribute("data-revealed", "2", {
      timeout: 15000,
    });
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].kind, "classroom_adapt");
    assert(requests[0].messages.some((m) => m.content.includes("注意力")));
    await expect(venn.locator("svg circle")).toHaveCount(2);
    await expect(venn.locator(".diagram-intersection")).toContainText(
      "共同影响注意分配",
    );
    await venn.getByRole("button", { name: "环境条件", exact: true }).click();
    await expect(venn.locator(".diagram-explanation p")).toHaveText(
      "减少不必要的通知与切换。",
    );
    const bounds = await venn.boundingBox();
    const tutor = await page.locator(".class-tutor").boundingBox();
    assert(
      bounds.x + bounds.width <= tutor.x + 1,
      "current diagram is obscured by tutor",
    );
    const styles = await page
      .locator(".board-frame > h2")
      .last()
      .evaluate((e) => ({
        color: getComputedStyle(e).color,
        font: getComputedStyle(e).fontFamily,
      }));
    assert.equal(styles.color, "rgb(103, 65, 217)");
    const headingBounds = await page
      .locator(".board-frame > h2")
      .last()
      .boundingBox();
    assert(
      headingBounds.y >= 131,
      "current diagram heading is hidden behind toolbar",
    );
    await page.waitForTimeout(600);
    await page.screenshot({
      path: `screenshots/teaching-diagrams/followup-${width}.png`,
    });
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      phase,
      styles,
      diagram: bounds,
      tutor,
      model: "fixture",
      errors,
    });
    await context.close();
  }
  await writeFile(
    "screenshots/teaching-diagrams/verification.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log("Teaching diagrams desktop QA passed", JSON.stringify(evidence));
} finally {
  await browser.close();
}
