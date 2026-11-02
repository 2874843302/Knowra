import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import { deliveryStart } from "../src/lib/teaching-direction.js";

const output = "screenshots/generative-teaching";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const topics = [
  {
    id: "inertia",
    title: "从刹车理解惯性",
    unit: "运动与作用力",
    lesson: "为什么刹车时身体向前倾",
    goal: "零基础理解惯性，区分保持运动与受到向前的力；有必要的适用边界。",
    followup:
      "如果没有一股向前的力，为什么我感觉自己被推向前了？请换一种直观的解释，最好用图对比刹车前后。",
  },
  {
    id: "accumulator",
    title: "用 Python 处理订单",
    unit: "筛选与累计",
    lesson: "筛选订单并累计金额",
    goal: "已有列表和条件语句基础，理解循环中先筛选再累加，能逐步说明变量变化；系统讲清零值和未匹配的情况。",
    followup:
      "我还是不明白 total 放在循环外和里面有什么区别，能用两笔订单对比解释吗？",
  },
];
const evidence = [];
try {
  const generationContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await generationContext.addInitScript(() =>
    localStorage.setItem(
      "knowra-workspace-id",
      "generation-probe-" + crypto.randomUUID(),
    ),
  );
  const generationPage = await generationContext.newPage();
  await generationPage.goto("http://127.0.0.1:5173/");
  for (const topic of topics) {
    const filename = `${output}/${topic.id}.json`;
    let generated;
    if (process.argv.includes("--cached"))
      generated = JSON.parse(await readFile(filename, "utf8"));
    else {
      console.log(`Generating fresh ${topic.id}`);
      generated = await generationPage.evaluate(async (topic) => {
        const { generateCourseLecture } =
          await import("/src/lib/course-generation.js");
        const { aiRequest } = await import("/src/store.jsx");
        let calls = 0;
        const start = performance.now();
        const lesson = await generateCourseLecture({
          expectedUnit: { title: topic.unit },
          expectedLesson: { title: topic.lesson },
          messages: [
            {
              role: "user",
              content: `已确认蓝图：课程《${topic.title}》，当前只生成单元《${topic.unit}》中的讲次《${topic.lesson}》。目标：${topic.goal}。按目标决定讲法和片段数，不套固定学科模板。只返回该讲完整 JSON，包含教材、教学脚本、理解检查和课后测验。`,
            },
          ],
          request: (...args) => {
            calls++;
            return aiRequest(...args);
          },
        });
        return {
          lesson,
          calls,
          elapsed: Math.round(performance.now() - start),
        };
      }, topic);
      await writeFile(filename, JSON.stringify(generated, null, 2));
    }
    const lesson = generated.lesson;
    const course = {
      id: `generated-${topic.id}`,
      title: topic.title,
      description: topic.goal,
      cover: "library",
      color: "#efece3",
      source: "生成验证",
      minutes: 30,
      units: [{ title: topic.unit, lessons: [lesson] }],
    };
    const sequence = lessonSequence(lesson.content, lesson);
    const target =
      sequence.steps.find((s) => s.visual) ||
      sequence.steps.find((s) => s.role === "example" || s.role === "apply") ||
      sequence.steps[0];
    const seed = initialState(),
      key = `${course.id}/${lesson.id}`;
    seed.customCourses = [course];
    seed.lessonPlayback[key] = {
      signature: sequence.signature,
      step: target.index,
      revealedStep: target.index,
      elapsed: Math.max(
        0,
        Math.min(target.writeStart, deliveryStart(target, "visual")) - 100,
      ),
      answers: Object.fromEntries(
        sequence.steps
          .filter((s) => s.kind === "checkpoint" && s.index < target.index)
          .map((s) => [s.index, { selected: s.quiz.answer, correct: true }]),
      ),
    };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
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
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${lesson.id}`);
    await page.evaluate(() => document.fonts.ready);
    const block = page.locator(`.teaching-block[data-step="${target.index}"]`);
    await expect(block).toBeVisible();
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect(block.locator(".teaching-writing")).toHaveAttribute(
      "data-write-progress",
      "1.000",
      { timeout: 45000 },
    );
    if (target.visual)
      await expect(block.locator(".teaching-visual")).toBeVisible({
        timeout: 15000,
      });
    await expect(block).toHaveAttribute("data-writing-complete", "true", {
      timeout: 45000,
    });
    await expect(
      page.getByRole("button", { name: "暂停讲解", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    const paused = await block
      .locator(".teaching-writing")
      .getAttribute("data-write-progress");
    await page.waitForTimeout(300);
    assert.equal(
      await block
        .locator(".teaching-writing")
        .getAttribute("data-write-progress"),
      paused,
    );
    await page.screenshot({ path: `${output}/${topic.id}-playback.png` });
    if (process.argv.includes("--cached")) {
      const recorded = JSON.parse(
        await readFile(`${output}/${topic.id}-followup.json`, "utf8"),
      );
      await context.route("**/api/ai", (route) =>
        route.fulfill({ json: { content: JSON.stringify(recorded) } }),
      );
    }
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    await page
      .getByRole("textbox", { name: "向导师提问" })
      .fill(topic.followup);
    await page.getByRole("button", { name: "向导师发送", exact: true }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem("knowra-workspace-v1"))
                ?.lessonAdaptations?.[key]?.length || 0,
            key,
          ),
        { timeout: 180000 },
      )
      .toBeGreaterThan(0);
    const revisions = await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem("knowra-workspace-v1"))
          .lessonAdaptations[key],
      key,
    );
    assert(revisions.at(-1).steps.every((s) => s.delivery?.write && s.role));
    await writeFile(
      `${output}/${topic.id}-followup.json`,
      JSON.stringify(revisions.at(-1), null, 2),
    );
    const current = page.locator(".teaching-block.is-current").last();
    await expect(current).toHaveAttribute("data-writing-complete", "true", {
      timeout: 90000,
    });
    const pause = page.getByRole("button", { name: "暂停讲解", exact: true });
    if (await pause.isVisible()) await pause.click();
    await page.waitForTimeout(600);
    const currentVisual = current.locator(".teaching-visual");
    if (await currentVisual.count()) {
      const bounds = await currentVisual.boundingBox();
      const tutor = await page.locator(".class-tutor").boundingBox();
      const stage = await page.locator(".lesson-stage").boundingBox();
      assert(
        bounds.x + bounds.width <= tutor.x + 1,
        "generated visual overlaps tutor",
      );
      assert(
        bounds.y + bounds.height <= stage.y + 1,
        "generated visual overlaps subtitles",
      );
    }
    await page.screenshot({ path: `${output}/${topic.id}-followup.png` });
    assert.deepEqual(errors, []);
    evidence.push({
      topic: topic.title,
      generationSource: "real-model",
      followupSource: process.argv.includes("--cached")
        ? "recorded-real-model"
        : "real-model",
      calls: generated.calls,
      generationMs: generated.elapsed,
      design: lesson.teaching.design,
      stepCount: lesson.teaching.steps.length,
      checkpoints: lesson.teaching.steps.filter((s) => s.checkpoint).length,
      forms: lesson.teaching.steps
        .filter((s) => s.visual)
        .map((s) => s.visual.type),
      target: target.title,
      writeStart: target.writeStart,
      visualStart: deliveryStart(target, "visual"),
      followup: revisions.at(-1).plan,
      errors,
    });
    console.log(`Verified ${topic.id}`, JSON.stringify(evidence.at(-1)));
    await context.close();
  }
  await generationContext.close();
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
