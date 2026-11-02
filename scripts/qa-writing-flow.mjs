import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const introduction = Array.from(
  { length: 5 },
  (_, i) => `已有概念 ${i + 1}：先确定对象，再观察它们之间的关系。`,
).join("\n\n");
const growing = Array.from(
  { length: 18 },
  (_, i) =>
    `第 ${i + 1} 个推理：先沿第一支箭头移动，再接上第二支箭头，两个方向的分量分别相加。`,
).join("\n\n");
const lesson = {
  id: "writing",
  title: "整块写完后再换栏",
  points: [],
  content: `## 前面的概念\n\n${introduction}\n\n## 正在输出\n\n${growing}`,
  teaching: {
    mode: "script",
    steps: [
      {
        title: "前面的概念",
        board: introduction,
        narration: "回顾已经理解的概念。",
      },
      {
        title: "正在输出",
        board: growing,
        narration: "这一段推理会连续写完，再安排后面的板书。".repeat(100),
      },
    ],
  },
};
lesson.teaching.source = lesson.content;
const codeLesson = {
  id: "code",
  title: "完整代码输出后换栏",
  points: [],
  content: `## 前面的概念\n\n${introduction}\n\n## 连续代码\n\n\`\`\`python\n${Array.from({ length: 24 }, (_, i) => `print("step ${i + 1}")`).join("\n")}\n\`\`\``,
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/writing-flow", { recursive: true });
try {
  for (const width of [1440, 1024]) {
    const sequence = lessonSequence(lesson.content, lesson);
    const index = 1;
    const progress = 0.08;
    const seed = initialState();
    seed.customCourses = [
      {
        ...catalog[0],
        id: "writing-qa",
        units: [{ title: "分栏时机", lessons: [lesson, codeLesson] }],
      },
    ];
    seed.lessonPlayback = {
      "writing-qa/writing": {
        signature: sequence.signature,
        step: index,
        revealedStep: index,
        elapsed: sequence.steps[index].writeDuration * progress,
        revealedProgress: progress,
        revealedNarrationProgress: 0,
        answers: {},
        rate: 1,
      },
    };
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
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
    await page.clock.install();
    await page.goto("http://127.0.0.1:5173/learn/writing-qa/writing");
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(300);
    const current = page.locator(".teaching-block.is-current");
    const writing = current.locator(".teaching-writing");
    const local = () =>
      writing.evaluate((e) => {
        const b = e.closest(".board-surface").getBoundingClientRect();
        const r = e.getBoundingClientRect();
        return {
          x: r.x - b.x,
          y: r.y - b.y,
          height: r.height,
          limit: b.height,
          fragments: e.getClientRects().length,
        };
      });
    await expect(current).toHaveAttribute("data-flow-writing", "true");
    const start = await local();
    await writing.evaluate((e) => (window.originalWriting = e));
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await page.clock.runFor(sequence.steps[index].writeDuration * 0.72);
    const overrun = await local();
    assert.equal(overrun.x, start.x);
    assert(Math.abs(overrun.y - start.y) < 1);
    assert.equal(overrun.fragments, 1);
    assert(overrun.y + overrun.height > overrun.limit);
    assert(await writing.evaluate((e) => e === window.originalWriting));
    await expect(current).toHaveAttribute("data-flow-writing", "true");
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await page.clock.runFor(3000);
    await page.clock.runFor(500);
    assert.deepEqual(await local(), overrun);
    const lastLine = writing.locator("p").last();
    const stageTop = (await page.locator(".lesson-stage").boundingBox()).y;
    await page
      .getByRole("button", { name: "回到当前讲解", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await lastLine.boundingBox()).y +
          (await lastLine.boundingBox()).height,
      )
      .toBeLessThan(stageTop);
    await page.screenshot({
      path: `screenshots/writing-flow/writing-${width}.png`,
    });
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await page.clock.runFor(sequence.steps[index].writeDuration * 0.3);
    await expect(current).toHaveAttribute("data-flow-writing", "false");
    await expect(writing).toContainText("第 18 个推理");
    const committed = await local();
    assert(committed.fragments > 1 || committed.x > start.x);
    assert(await writing.evaluate((e) => e === window.originalWriting));
    await page.clock.runFor(400);
    await page.screenshot({
      path: `screenshots/writing-flow/committed-${width}.png`,
    });
    console.log(
      `PASS ${width}: long output stays in starting column beyond height limit; pause keeps layout; column flow resumes only after final text`,
    );

    const codeSequence = lessonSequence(codeLesson.content, codeLesson);
    const firstCode = codeSequence.steps.findIndex((s) => s.kind === "code");
    const codeSeed = initialState();
    codeSeed.customCourses = seed.customCourses;
    codeSeed.lessonPlayback = {
      "writing-qa/code": {
        signature: codeSequence.signature,
        step: firstCode + 2,
        revealedStep: firstCode + 2,
        elapsed: 0,
        revealedProgress: 0,
        revealedNarrationProgress: 0,
        answers: {},
        rate: 1,
      },
    };
    await page.evaluate(
      ({ seed, id }) => {
        localStorage.setItem("knowra-workspace-id", id);
        localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
      },
      { seed: codeSeed, id: crypto.randomUUID() },
    );
    await page.goto("http://127.0.0.1:5173/learn/writing-qa/code");
    await page.clock.runFor(300);
    const codeBlock = page.locator(".teaching-block.is-current");
    const codeWriting = codeBlock.locator(".teaching-writing");
    const codeOrigin = await codeWriting.evaluate(
      (e) =>
        e.getBoundingClientRect().x -
        e.closest(".board-surface").getBoundingClientRect().x,
    );
    await codeBlock.evaluate((e) => (window.originalCodeBlock = e));
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    for (let i = firstCode + 2; i < codeSequence.steps.length - 1; i++) {
      await page.clock.fastForward(codeSequence.steps[i].duration + 100);
      await expect(codeBlock).toHaveAttribute("data-step", String(i + 1));
      await expect(codeBlock).toHaveAttribute("data-flow-writing", "true");
      assert.equal(
        await codeWriting.evaluate(
          (e) =>
            e.getBoundingClientRect().x -
            e.closest(".board-surface").getBoundingClientRect().x,
        ),
        codeOrigin,
      );
      assert(await codeBlock.evaluate((e) => e === window.originalCodeBlock));
    }
    await page.clock.runFor(codeSequence.steps.at(-1).writeDuration + 150);
    await expect(codeBlock).toHaveAttribute("data-flow-writing", "false");
    await expect(codeBlock.locator("pre")).toContainText("step 24");
    assert.deepEqual(errors, []);
    evidence.push({ width, start, overrun, committed, errors });
    console.log(
      `PASS ${width}: line-by-line code stays in its original column until the entire code block finishes; DOM identity retained`,
    );
    await context.close();
  }
  // Native smooth scrolling uses compositor time. Verify its clearance and
  // the idle-return animation in a fresh real-clock context, not the mock clock.
  const realSeed = initialState();
  realSeed.customCourses = [
    {
      ...catalog[0],
      id: "writing-qa",
      units: [{ title: "分栏时机", lessons: [lesson] }],
    },
  ];
  const realSequence = lessonSequence(lesson.content, lesson);
  realSeed.lessonPlayback = {
    "writing-qa/writing": {
      signature: realSequence.signature,
      step: 1,
      revealedStep: 1,
      elapsed: realSequence.steps[1].writeDuration * 0.8,
      revealedProgress: 0.8,
      revealedNarrationProgress: 0,
      answers: {},
      rate: 1,
    },
  };
  const realContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await realContext.addInitScript(
    ({ seed, id }) => {
      localStorage.setItem("knowra-workspace-id", id);
      localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
    },
    { seed: realSeed, id: crypto.randomUUID() },
  );
  await realContext.route("**/api/provider", (r) =>
    r.fulfill({ json: { configured: false } }),
  );
  const realPage = await realContext.newPage();
  await realPage.goto("http://127.0.0.1:5173/learn/writing-qa/writing");
  await realPage.evaluate(() => document.fonts.ready);
  const tail = realPage
    .locator(".teaching-block.is-current .teaching-writing p")
    .last();
  const realStage = realPage.locator(".lesson-stage");
  const tailBottom = async () => {
    const box = await tail.boundingBox();
    return box.y + box.height;
  };
  await expect.poll(tailBottom).toBeLessThan((await realStage.boundingBox()).y);
  await realPage.mouse.move(1300, 500);
  await realPage.mouse.wheel(200, -200);
  await expect
    .poll(tailBottom)
    .toBeGreaterThan((await realStage.boundingBox()).y);
  await expect
    .poll(tailBottom, { timeout: 4000 })
    .toBeLessThan((await realStage.boundingBox()).y);
  await expect(
    realPage.getByRole("button", { name: "开始讲解", exact: true }),
  ).toBeVisible();
  await realPage.screenshot({
    path: "screenshots/writing-flow/real-clock-follow.png",
  });
  await realContext.close();
  console.log(
    "PASS real clock: overflowing text follows above subtitles; idle return focuses the latest output and keeps explicit pause",
  );
  await writeFile(
    "screenshots/writing-flow/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
