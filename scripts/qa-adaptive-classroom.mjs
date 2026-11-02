import { directedStep } from "./fixtures/teaching-direction.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, catalog, lessonsOf } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("screenshots/adaptive-classroom", { recursive: true });
const evidence = [],
  lesson = lessonsOf(catalog[0])[0],
  base = lessonSequence(lesson.content, lesson);
const answers = [
  {
    reply:
      "可以，我们先把向量看成送货路线，弄清方向和长度，再回到原来的向量相加。",
    action: "insert",
    plan: [
      { title: "用送货路线理解位移", reason: "先让抽象的坐标有一个具体对应" },
      { title: "检查理解，再继续原课", reason: "确认你分清起点与位移" },
    ],
    steps: [
      directedStep({
        title: "送货路线里的向量",
        board:
          "**向量记录方向与长度**\n\n- 向东 3 格\n- 向北 2 格\n- 位移 v = (3, 2)",
        narration:
          "先想象你在给一家小店送货。从仓库出发，向东走三格，再向北走两格，这就描述了一次具体位移。我们把它写成三和二，不是在记录仓库的门牌号，而是在记录方向和距离。",
        checkpoint: {
          question: "仓库与目的地一起平移，位移会改变吗？",
          options: ["方向和长度都不变", "方向一定改变"],
          answer: 0,
          explanation: "整体平移不改变两点之间的位移。",
        },
      }),
      directedStep({
        title: "继续原来的向量相加",
        board: "两段位移首尾相接 → 向量相加",
        narration:
          "先保留这个送货路线的直觉，下面回到原课，看看两段路线怎样合成一次总位移。",
      }),
    ],
  },
  {
    reply:
      "我们先不急着选答案，用同一组坐标平移一次，算完再回来回答刚才的问题。",
    action: "insert",
    plan: [
      { title: "对比平移前后的位移", reason: "用减法确认方向与长度没有变化" },
    ],
    steps: [
      directedStep({
        title: "把起点移到另一条街",
        board: "(0, 0) → (3, 2)\n\n(5, 5) → (8, 7)\n\n**两次位移都是 (3, 2)**",
        narration:
          "第一次从原点到三和二，第二次把两端都加上五，终点就到了八和七。用终点减起点，两次结果都是三和二。这说明平移的是路线所在的位置，方向和长度并没有变。",
      }),
    ],
  },
  {
    reply:
      "好，保留已经弄懂的位移，接下来直接讨论数乘，原先未讲的后续安排会按这个方向调整。",
    action: "replan",
    plan: [
      { title: "先看两倍位移", reason: "衔接你已经理解的送货路线" },
      { title: "再比较正负系数", reason: "分清长度变化与方向反转" },
    ],
    steps: [
      directedStep({
        title: "按新方向学习数乘",
        board: "v = (3, 2)\n\n**2v = (6, 4)**",
        narration:
          "现在沿着原来的方向走两倍距离。每个分量都乘以二，所以三变成六，二变成四。接着我们再比较正系数和负系数，看看什么时候会发生方向反转。",
      }),
      directedStep({
        title: "负系数让方向反转",
        board: "−v = (−3, −2)\n\n长度不变，方向相反",
        narration:
          "负一并没有改变路线的长度，它让我们往完全相反的方向走。因此数乘既可能改变长度，也可能改变方向，关键是分清系数的绝对值和正负号。",
      }),
    ],
  },
];
try {
  for (const [width, reducedMotion] of [
    [1440, "no-preference"],
    [1920, "reduce"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion,
    });
    const seed = initialState();
    seed.lessonPlayback["linear-algebra/vectors"] = {
      signature: base.signature,
      step: 0,
      elapsed: base.steps[0].duration,
      revealedStep: 0,
      revealedProgress: 1,
      revealedNarrationProgress: 1,
    };
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
      r.fulfill({ json: { configured: true, model: "fixture" } }),
    );
    const page = await context.newPage(),
      errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let phase = 0,
      attempts = 0,
      bad = false,
      delayed = false;
    await context.route("**/api/ai", async (route) => {
      const body = route.request().postDataJSON();
      requests.push(body);
      assert.equal(body.kind, "classroom_adapt");
      attempts++;
      if (
        body.messages[0].content.startsWith("这是一次课堂理解检查后的即时回应")
      ) {
        await route.fulfill({
          json: {
            content: JSON.stringify({
              reply: "对，整体平移没有改变方向和长度。",
              action: "insert",
              plan: [
                { title: "作答后的简短确认", reason: "确认区分起点与位移" },
              ],
              steps: [
                directedStep({
                  title: "作答后的简短确认",
                  board: "**整体平移 → 位移不变**",
                  narration:
                    "你选择了方向和长度都不变，这个理解是对的。起点移动只是换了摆放位置，位移本身没有改变。",
                }),
              ],
            }),
          },
        });
        return;
      }
      if (delayed) await new Promise((resolve) => setTimeout(resolve, 1000));
      await route
        .fulfill({
          json: {
            content:
              bad || (phase === 0 && attempts === 1)
                ? "malformed"
                : JSON.stringify(answers[phase]),
          },
        })
        .catch(() => {});
    });
    const ready = async (route) => {
      await page.goto("http://127.0.0.1:5173" + route);
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("button", { name: "展开导师", exact: true }).click();
      await page.waitForTimeout(300);
    };
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
    const ask = async (text) => {
      await page.getByRole("textbox", { name: "向导师提问" }).fill(text);
      await page
        .getByRole("button", { name: "向导师发送", exact: true })
        .click();
    };
    const nextStep = async () => {
      await page.getByRole("button", { name: "白板设置", exact: true }).click();
      await page
        .getByRole("button", { name: "下一步讲解", exact: true })
        .click();
    };
    await ready("/learn/linear-algebra/vectors");
    await page
      .locator(".teaching-writing")
      .first()
      .evaluate((el) => (window.originalWriting = el));
    await ask("向量我没听懂，能用送货路线举个例子吗？");
    await expect(
      page
        .getByRole("heading", { name: "送货路线里的向量", exact: true })
        .first(),
    ).toBeVisible();
    const current = page.locator(".teaching-block.is-current");
    await expect(current.locator(".writing-pencil")).toBeVisible();
    assert(
      Number(
        await current
          .locator(".teaching-writing")
          .getAttribute("data-write-progress"),
      ) < 1,
    );
    assert(
      await page
        .locator(".teaching-writing")
        .first()
        .evaluate((el) => el === window.originalWriting),
      "existing board remounted",
    );
    assert.equal(requests.length, 2);
    await expect(page.locator(".inline-error")).toHaveCount(0);
    await expect(page.locator(".tutor-adaptive-plan")).toContainText(
      "用送货路线理解位移",
    );
    await expect
      .poll(() =>
        page.locator(".tutor-teaching").evaluate((el) => {
          const question = el.querySelector(".tutor-message.user");
          const plan = el.querySelector(".tutor-message.assistant");
          const explanation = plan?.nextElementSibling;
          return (
            !!question &&
            !!plan &&
            !!(
              question.compareDocumentPosition(plan) &
              Node.DOCUMENT_POSITION_FOLLOWING
            ) &&
            explanation?.classList.contains("tutor-teaching-entry")
          );
        }),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "暂停讲解", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await nextStep();
    await expect(page.locator(".lesson-stage h3")).toHaveText(
      "仓库与目的地一起平移，位移会改变吗？",
    );
    await expect(
      page.getByRole("button", { name: "开始讲解", exact: true }),
    ).toBeDisabled();
    phase = 1;
    await ask("这道题还不懂，请把坐标算给我看再让我答");
    await expect(
      page
        .getByRole("heading", { name: "把起点移到另一条街", exact: true })
        .first(),
    ).toBeVisible();
    await expect(current.locator(".writing-pencil")).toBeVisible();
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await nextStep();
    await expect(page.locator(".lesson-stage h3")).toHaveText(
      "仓库与目的地一起平移，位移会改变吗？",
    );
    await page
      .locator(".lesson-stage")
      .getByRole("button", { name: /方向和长度都不变/ })
      .click();
    await expect(
      page
        .getByRole("heading", { name: "作答后的简短确认", exact: true })
        .first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    phase = 2;
    await ask("后面我想先学数乘，其他尚未讲的内容先跳过，请重新安排");
    await expect(
      page
        .getByRole("heading", { name: "按新方向学习数乘", exact: true })
        .first(),
    ).toBeVisible();
    await expect(current.locator(".writing-pencil")).toBeVisible();
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await expect(
      page.locator(".board-frame > h2", { hasText: "继续原来的向量相加" }),
    ).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await remote()).lessonAdaptations?.["linear-algebra/vectors"]
            ?.length,
      )
      .toBe(4);
    await expect
      .poll(async () =>
        Object.values(
          (await remote()).lessonPlayback["linear-algebra/vectors"].answers,
        ).some((a) => a.correct),
      )
      .toBe(true);
    await page.screenshot({
      path: `screenshots/adaptive-classroom/replanned-${width}.png`,
    });
    await page.reload();
    await page.getByRole("button", { name: "展开导师", exact: true }).click();
    await expect(
      page
        .getByRole("heading", { name: "按新方向学习数乘", exact: true })
        .first(),
    ).toBeVisible();
    await expect(page.locator(".tutor-adaptive-plan")).toHaveCount(3);
    assert.equal(
      await page.getByRole("button", { name: "暂停讲解", exact: true }).count(),
      0,
      "reload autoplayed",
    );
    const before = await page.locator(".board-surface").innerText();
    delayed = true;
    await ask("先暂停这个调整测试");
    await expect(
      page.getByRole("button", { name: "停止调整", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "停止调整", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "停止调整", exact: true }),
    ).toHaveCount(0);
    await page.waitForTimeout(1100);
    assert.equal(
      (await remote()).lessonAdaptations["linear-algebra/vectors"].length,
      4,
    );
    assert.equal(await page.locator(".board-surface").innerText(), before);
    delayed = false;
    bad = true;
    const count = requests.length;
    await ask("请调整这个例子");
    await expect(page.locator(".inline-error")).toContainText(
      "原有板书和学习进度已保留",
    );
    assert.equal(requests.length - count, 3);
    assert.equal(
      (await remote()).lessonAdaptations["linear-algebra/vectors"].length,
      4,
    );
    assert.equal(await page.locator(".board-surface").innerText(), before);
    assert(requests[2].messages[0].content.includes("送货路线"));
    await ready("/learn/python/py-values");
    await expect(page.locator("[data-adaptation-id]")).toHaveCount(0);
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      reducedMotion,
      requests: requests.length,
      revisions: 4,
      errors,
    });
    await context.close();
    console.log(
      `PASS ${width} ${reducedMotion}: follow-up writing/narration/plan, mid-lesson check and follow-up, replan, answer retention, refresh, cancel, internal repair, failure isolation`,
    );
  }
  await writeFile(
    "screenshots/adaptive-classroom/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
