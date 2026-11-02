import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { initialState, validateOutline } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import {
  narrationTiming,
  narrationElapsedAtActive,
} from "../src/lib/narration-timing.js";

const narration =
  "先看数据怎样进入计算过程。再把单价和数量相乘得到总价。最后确认计算结果的含义。";
const course = {
  id: "qa-pacing",
  title: "句间节奏验证",
  units: validateOutline({
    title: "句间节奏验证",
    units: [
      {
        title: "理解计算",
        lessons: [
          {
            title: "从数据到结果",
            content:
              "## 数据\n\n确认单价和数量。\n\n## 计算\n\n总价等于单价乘以数量。\n\n## 结果\n\n理解计算结果。",
            teaching: {
              steps: [
                {
                  title: "先理解再计算",
                  board: "先确认数据的含义，再选择运算。".repeat(12),
                  narration,
                },
              ],
            },
            quiz: {
              type: "true_false",
              question: "总价等于单价乘以数量？",
              answer: true,
              explanation: "单价乘数量得到总价。",
            },
          },
        ],
      },
    ],
  }),
};
const lesson = course.units[0].lessons[0],
  key = `${course.id}/${lesson.id}`;
const sequence = lessonSequence(lesson.content, lesson);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
try {
  // Real model audio is verified separately by npm run qa:tts.
  for (const mode of ["text", "double-speed", "legacy"]) {
    const seed = initialState();
    seed.customCourses = [course];
    seed.appearance.narrationRate = mode === "double-speed" ? 2 : 1;
    const legacyElapsed = 1100;
    seed.lessonPlayback[key] = {
      signature: sequence.signature,
      step: 0,
      revealedStep: 0,
      elapsed: mode === "legacy" ? legacyElapsed : 0,
      rate: mode === "double-speed" ? 2 : 1,
      answers: {},
      ...(mode === "legacy" ? {} : { pacingVersion: 1 }),
    };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      reducedMotion: "reduce",
    });
    let state = seed,
      revision = 0;
    const errors = [];
    await context.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          user: {
            id: `pacing-${mode}`,
            name: "测试学习者",
            workspaceId: `pacing-${mode}`,
          },
        },
      }),
    );
    await context.route("**/api/workspace", (r) => {
      if (r.request().method() === "PATCH") {
        for (const op of r.request().postDataJSON().operations) {
          let target = state;
          for (const part of op.path.slice(0, -1)) target = target[part];
          if (op.op === "remove") delete target[op.path.at(-1)];
          else target[op.path.at(-1)] = op.value;
        }
        revision++;
      }
      return r.fulfill({
        json: { state, revision, updatedAt: new Date().toISOString() },
      });
    });
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: false } }),
    );
    await context.route("**/api/ai", (r) => r.abort());
    await context.route("**/api/tts/status", (r) =>
      r.fulfill({
        json: { ready: false, voices: [], message: "Text-only fixture" },
      }),
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:5173/learn/${key}`);
    const caption = page.locator(".lesson-subtitle-text"),
      subtitle = page.locator(".lesson-subtitle");
    await expect(subtitle).toBeVisible();
    await page.evaluate(() => {
      window.__holds = [];
      let hold;
      const element = document.querySelector(".lesson-subtitle");
      const sample = () => {
        const text = element.querySelector(".lesson-subtitle-text").textContent;
        const board = document.querySelector(
          ".teaching-block.is-current",
        )?.textContent;
        if (element.dataset.sentencePaused === "true") {
          hold ||= { start: performance.now(), samples: [] };
          hold.samples.push({ text, board });
        } else if (hold) {
          window.__holds.push({
            ...hold,
            duration: performance.now() - hold.start,
          });
          hold = null;
        }
      };
      new MutationObserver(sample).observe(
        document.querySelector(".class-main"),
        {
          subtree: true,
          attributes: true,
          childList: true,
          characterData: true,
        },
      );
    });
    const saved = () =>
      page.evaluate(
        ({ key, mode }) =>
          JSON.parse(localStorage.getItem(`knowra-workspace-v1:pacing-${mode}`))
            .lessonPlayback[key],
        { key, mode },
      );
    if (mode === "legacy") {
      await expect.poll(async () => (await saved()).pacingVersion).toBe(1);
      assert.equal(
        (await saved()).elapsed,
        narrationElapsedAtActive(narration, legacyElapsed),
      );
      assert(
        (await caption.textContent()).length > 0,
        "old progress is retained",
      );
    } else {
      await page.getByRole("button", { name: "开始讲解", exact: true }).click();
      {
        await expect
          .poll(() => page.evaluate(() => window.__holds.length))
          .toBeGreaterThan(0);
        const hold = await page.evaluate(() => window.__holds[0]);
        assert(
          hold.duration >= (mode === "double-speed" ? 400 : 800) - 80,
          `hold duration: ${hold.duration}`,
        );
        assert.equal(hold.samples[0].text, "先看数据怎样进入计算过程。");
        assert(
          hold.samples.every(
            (s) =>
              s.text === hold.samples[0].text &&
              s.board === hold.samples[0].board,
          ),
          "caption and board stay unchanged during the hold",
        );
      }
      if (mode === "text") {
        await page
          .getByRole("button", { name: "暂停讲解", exact: true })
          .click();
        const pausedCaption = await caption.textContent();
        await page.waitForTimeout(900);
        assert.equal(await caption.textContent(), pausedCaption);
        const held = await saved();
        await page.reload();
        await expect(caption).toHaveText(pausedCaption);
        assert.equal((await saved()).elapsed, held.elapsed);
        await page
          .getByRole("button", { name: "开始讲解", exact: true })
          .click();
        await expect.poll(() => caption.textContent()).not.toBe(pausedCaption);
      }
      const question = page.getByRole("region", {
        name: "课堂提问",
        exact: true,
      });
      await expect(question).toBeVisible({ timeout: 20000 });
      await question.getByRole("button", { name: /正确/ }).click();
      await question
        .getByRole("button", { name: "完成本讲", exact: true })
        .click();
      await expect(question).toContainText("本讲讲解已完成");
      await page.waitForTimeout(400);
      assert.equal((await saved()).finished, true);
      assert.equal((await saved()).step, sequence.steps.length - 1);
    }
    assert.deepEqual(errors, []);
    evidence.push({ mode, passed: true });
    await context.close();
  }
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
