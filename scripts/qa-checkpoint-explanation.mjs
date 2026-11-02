import { directedStep } from "./fixtures/teaching-direction.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, validateOutline } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const quiz = {
  type: "true_false",
  question: "只搬动箭头起点，方向和长度不变，自由向量就改变了吗？",
  answer: false,
  explanation: "自由向量由方向和长度决定，与起点无关。",
};
const first = directedStep({
  title: "自由向量",
  board: "**向量 = 方向 + 长度**",
  narration: "先把向量看成一次位移，它说明朝哪里移动，以及移动多远。",
  checkpoint: quiz,
});
const content = "## 位移\n\n自由向量由方向和长度决定。";
const course = {
  id: "qa-checkpoint-explanation",
  title: "理解检查实时补讲",
  description: "只用于本地交互验证",
  units: validateOutline({
    title: "理解检查",
    units: [
      {
        title: "位移",
        lessons: [
          {
            title: "中途检查",
            content,
            points: [],
            teaching: {
              steps: [
                first,
                directedStep({
                  title: "原来的下一步",
                  board: "**两段移动首尾相接**",
                  narration:
                    "现在回到原本的安排，把两次移动首尾相接，就能得到总位移。",
                }),
              ],
            },
          },
          {
            title: "最后检查",
            content,
            points: [],
            teaching: { steps: [first] },
          },
        ],
      },
    ],
  }),
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("screenshots/checkpoint-explanation", { recursive: true });
const evidence = [];
try {
  for (const scenario of [
    "correct",
    "incorrect",
    "terminal",
    "failure",
    "cancel",
    "continue",
    "terminal-continue",
  ]) {
    const seed = initialState();
    seed.customCourses = [course];
    const lesson =
      course.units[0].lessons[scenario.startsWith("terminal") ? 1 : 0];
    const sequence = lessonSequence(lesson.content, lesson);
    const check = sequence.steps.find((s) => s.kind === "checkpoint");
    const key = `${course.id}/${lesson.id}`;
    seed.lessonPlayback[key] = {
      signature: sequence.signature,
      step: check.index,
      revealedStep: check.index,
      elapsed: 0,
      rate: 2,
      answers: {},
    };
    const workspace = crypto.randomUUID();
    const context = await browser.newContext({
      viewport: { width: scenario === "terminal" ? 1024 : 1440, height: 900 },
      reducedMotion: scenario === "terminal" ? "reduce" : "no-preference",
    });
    await context.addInitScript(
      ({ seed, workspace }) => {
        if (!localStorage.getItem("knowra-workspace-id")) {
          localStorage.setItem("knowra-workspace-id", workspace);
          localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
        }
      },
      { seed, workspace },
    );
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: true, model: "fixture" } }),
    );
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const requests = [],
      errors = [];
    let selected = scenario === "incorrect";
    const title = selected ? "起点与位移要分开" : "你的理解成立";
    let response = {
      reply: selected
        ? "你把起点和位移混在了一起。"
        : "对，起点搬动不改变位移。",
      action: "insert",
      plan: [{ title, reason: "根据刚才的答案检查理解" }],
      steps: [
        directedStep({
          title,
          board: selected
            ? "**搬动起点 ≠ 改变位移**"
            : "**方向和长度不变 → 同一个向量**",
          narration: selected
            ? "你选的是会改变。把箭头从家门口搬到学校，朝向和长度都不变，所以位移并没有改变。"
            : "你选的是不会改变，这是对的。向量记录方向和长度，搬动起点并没有改变这两项。",
        }),
      ],
    };
    await context.route("**/api/ai", async (route) => {
      requests.push(route.request().postDataJSON());
      await gate;
      if (scenario === "correct" && requests.length > 1)
        await new Promise((resolve) => setTimeout(resolve, 650));
      await route
        .fulfill(
          scenario === "failure"
            ? {
                status: 503,
                json: { error: "fixture unavailable" },
              }
            : {
                json: {
                  content:
                    scenario === "incorrect" && requests.length === 1
                      ? JSON.stringify({ ...response, action: "replan" })
                      : JSON.stringify(response),
                },
              },
        )
        .catch(() => {});
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const saved = () =>
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
    await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${lesson.id}`);
    await page.getByRole("button", { name: "白板设置", exact: true }).waitFor();
    await expect(page.locator(".lesson-stage h3")).toHaveText(quiz.question);
    await expect
      .poll(() =>
        page.evaluate(
          () => localStorage.getItem("knowra-server-base-v2") !== null,
        ),
      )
      .toBe(true);
    assert.equal(requests.length, 0, "opening a question must not request AI");
    await page
      .locator(".lesson-stage-option")
      .nth(selected ? 0 : 1)
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await expect(page.locator(".checkpoint-explaining")).toContainText(
      "根据你的回答",
    );
    assert.equal(requests.length, 1, "duplicate choice must send once");
    await expect(page.locator(".lesson-playback-tools button")).toBeDisabled();
    await expect(page.locator(".lesson-stage-feedback")).toContainText(
      selected ? "你选择了“正确”" : "你选择了“错误”",
    );
    const payload = JSON.parse(
      requests[0].messages[0].content.split("\n").at(-1),
    );
    assert.equal(payload.selected, selected ? "正确" : "错误");
    assert.equal(payload.correct, !selected);
    assert(payload.taught.length);
    const continueButton = page.locator(".lesson-stage").getByRole("button", {
      name: scenario.startsWith("terminal") ? "完成本讲" : "继续讲解",
      exact: true,
    });
    await expect(continueButton).toBeEnabled();
    if (scenario.endsWith("continue")) {
      await continueButton.click();
      if (scenario.startsWith("terminal")) {
        await expect(page.locator(".lesson-stage-complete")).toBeVisible();
      } else {
        await expect(page.locator(".lesson-subtitle")).toBeVisible();
      }
      release();
      await page.waitForTimeout(750);
      assert.equal(
        (await remote()).lessonAdaptations?.[key]?.length || 0,
        0,
        "late feedback must not interrupt the next concept or reopen the finished lesson",
      );
      if (scenario.startsWith("terminal"))
        await expect(page.locator(".lesson-stage-complete")).toBeVisible();
    } else if (scenario === "cancel") {
      await expect
        .poll(
          async () =>
            (await remote()).lessonPlayback[key]?.answers[check.index]
              ?.selected,
        )
        .toBe(false);
      await page.goto(`http://127.0.0.1:5173/course/${course.id}`);
      release();
      await page.waitForTimeout(500);
      assert.equal((await remote()).lessonAdaptations?.[key]?.length || 0, 0);
    } else {
      release();
      if (scenario === "failure") {
        await expect(page.locator(".checkpoint-explaining")).toHaveCount(0);
        await page
          .locator(".lesson-stage")
          .getByRole("button", { name: "继续讲解", exact: true })
          .click();
        await expect(page.locator(".lesson-subtitle")).toBeVisible();
        assert.equal((await saved()).lessonAdaptations?.[key]?.length || 0, 0);
      } else {
        await expect(
          page
            .locator(".teaching-block.is-current")
            .locator("xpath=..")
            .getByRole("heading", { name: title }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "暂停讲解", exact: true }),
        ).toBeEnabled();
        await expect(page.locator(".teaching-block.is-current")).toContainText(
          selected ? "搬动起点" : "方向和长度不变",
        );
        await page
          .getByRole("button", { name: "暂停讲解", exact: true })
          .click();
        await expect
          .poll(async () => (await saved()).lessonAdaptations?.[key]?.length)
          .toBe(1);
        const state = await saved();
        assert.equal(
          state.lessonPlayback[key].answers[check.index].selected,
          selected,
        );
        assert.equal(
          state.lessonAdaptations[key][0].afterStepId,
          `base:${sequence.signature}:${check.index}`,
        );
        assert.equal(
          state.lessonAdaptations[key][0].source,
          "checkpoint-answer",
        );
        assert.equal(requests.length, scenario === "incorrect" ? 2 : 1);
        await page
          .getByRole("button", { name: "展开导师", exact: true })
          .click();
        await expect(page.locator(".tutor-teaching")).toContainText(title);
        await expect
          .poll(() =>
            page
              .locator(".class-tutor")
              .evaluate((el) => getComputedStyle(el).opacity),
          )
          .toBe("1");
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `screenshots/checkpoint-explanation/${scenario}.png`,
        });
        await page
          .getByRole("button", { name: "开始讲解", exact: true })
          .click();
        if (scenario === "terminal") {
          await expect(page.locator(".lesson-subtitle-resume")).toHaveText(
            "再听一遍",
            { timeout: 15000 },
          );
          await expect
            .poll(async () => (await remote()).lessonPlayback[key]?.finished)
            .toBe(true);
        } else {
          await expect(
            page
              .locator(".teaching-block.is-current")
              .locator("xpath=..")
              .getByRole("heading", { name: "原来的下一步" }),
          ).toBeVisible({ timeout: 15000 });
          await page
            .getByRole("button", { name: "暂停讲解", exact: true })
            .click();
        }
        const count = requests.length;
        await expect
          .poll(async () => (await remote()).lessonAdaptations?.[key]?.length)
          .toBe(1);
        await page.reload();
        await expect(
          page.getByRole("heading", { name: title }).first(),
        ).toBeVisible();
        assert.equal(
          requests.length,
          count,
          "reload must not regenerate an answered checkpoint",
        );
        if (scenario === "correct") {
          const previousId = (await saved()).lessonAdaptations[key][0].id;
          await page
            .getByRole("button", { name: "白板设置", exact: true })
            .click();
          await page
            .getByRole("button", { name: "重新讲解", exact: true })
            .click();
          await page
            .getByRole("button", { name: "白板设置", exact: true })
            .click();
          await page
            .getByRole("button", { name: "下一步讲解", exact: true })
            .click();
          selected = true;
          response = {
            ...response,
            reply: "这次需要区分起点与位移。",
            steps: [
              directedStep({
                title: "这次换个角度解释",
                board: "**起点不是位移**",
                narration:
                  "这次你选择了会改变。起点只是摆放箭头的位置，方向和长度才决定自由向量。",
              }),
            ],
          };
          await page.locator(".lesson-stage-option").first().click();
          await expect(
            page.getByRole("heading", {
              name: "这次换个角度解释",
              exact: true,
            }),
          ).toBeVisible();
          await expect
            .poll(async () => (await saved()).lessonAdaptations[key][0].id)
            .not.toBe(previousId);
          assert.equal(
            (await saved()).lessonAdaptations[key].length,
            1,
            "new answer replaces previous tailored feedback",
          );
          assert.equal(requests.length, 2);
          assert.equal(
            (await saved()).lessonPlayback[key].answers[check.index].selected,
            true,
          );
        }
      }
    }
    assert.deepEqual(errors, []);
    evidence.push({ scenario, calls: requests.length, errors });
    console.log(
      `PASS ${scenario}: answer-specific live teaching, original progress retained`,
    );
    await context.close();
  }
  await writeFile(
    "screenshots/checkpoint-explanation/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
