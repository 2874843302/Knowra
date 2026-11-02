import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState } from "../src/data.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/course-practice", { recursive: true });
async function workspace(width, configured = false) {
  const seed = initialState();
  seed.progress = { "python/py-values": { quizCorrect: true } };
  const original = catalog.find((c) => c.id === "python");
  seed.customCourses = [
    {
      ...structuredClone(original),
      id: "practice-fixture",
      title: "库存分析课程",
    },
  ];
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: width === 1024 ? "reduce" : "no-preference",
  });
  const id = crypto.randomUUID();
  await context.addInitScript(
    ({ seed, id }) => {
      if (!localStorage.getItem("knowra-workspace-id")) {
        localStorage.setItem("knowra-workspace-id", id);
        localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
      }
    },
    { seed, id },
  );
  await context.route("**/api/provider", (r) =>
    r.fulfill({ json: { configured } }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, id, seed, errors };
}
const settle = async (p) => {
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
};
const stored = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("knowra-workspace-v1")));
try {
  for (const width of [1440, 1024, 1920]) {
    const { context, page, errors } = await workspace(width);
    let requests = 0;
    await context.route("**/api/ai", (r) => {
      requests++;
      return r.abort();
    });
    await page.goto("http://127.0.0.1:5173/course/python");
    await settle(page);
    const tabs = page.getByRole("tablist", { name: "课程视图", exact: true });
    assert.deepEqual(await tabs.getByRole("tab").allTextContents(), [
      "单元",
      "资料",
      "练习",
    ]);
    const boxes = await tabs
      .getByRole("tab")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    assert(boxes.every((b) => Math.abs(b.y - boxes[0].y) < 1));
    const sidebar = page.locator(".course-reference-sidebar");
    const before = await sidebar.boundingBox();
    await page.screenshot({
      path: `screenshots/course-practice/units-${width}.png`,
    });
    await page.getByRole("button", { name: "面板", exact: true }).click();
    await expect(page.locator(".course-dashboard")).toBeVisible();
    await expect(page.locator(".course-metrics")).toContainText("独立练习");
    for (const name of ["资料", "练习", "单元"]) {
      await tabs.getByRole("tab", { name, exact: true }).click();
      await expect(
        page.getByRole("navigation", { name: "课程单元", exact: true }),
      ).toHaveCount(name === "单元" ? 1 : 0);
      assert.deepEqual(await sidebar.boundingBox(), before);
    }
    await tabs.getByRole("tab", { name: "练习", exact: true }).click();
    await expect(page.locator(".practice-task")).toHaveCount(5);
    await expect(page.locator(".practice-summary")).toContainText("0 / 5");
    assert(
      !(await page.locator(".course-practice").innerText()).includes(
        catalog.find((c) => c.id === "python").units[0].lessons[0].quiz
          .question,
      ),
    );
    await settle(page);
    await page.screenshot({
      path: `screenshots/course-practice/practice-${width}.png`,
    });
    if (width === 1440) {
      await page.getByRole("button", { name: /修复一张收银小票/ }).click();
      const dialog = page.getByRole("dialog", {
        name: "修复一张收银小票",
        exact: true,
      });
      await expect(
        dialog.getByRole("button", { name: "提交答案", exact: true }),
      ).toBeDisabled();
      await dialog.locator(".exercise-options button").nth(0).click();
      await dialog
        .getByRole("button", { name: "提交答案", exact: true })
        .click();
      await expect(dialog).toContainText("再看看这道题的关键");
      await dialog.locator(".exercise-options button").nth(1).click();
      await dialog
        .getByRole("button", { name: "提交答案", exact: true })
        .click();
      await expect(dialog).toContainText("回答正确");
      await page.keyboard.press("Escape");
      await expect(page.locator(".practice-summary")).toContainText("1 / 5");
      await page.getByRole("button", { name: /为购物清单计算折扣/ }).click();
      const code = page.getByRole("textbox", {
        name: "你的代码与验证思路",
        exact: true,
      });
      await code.fill("prices = [12, 25, 8]\n# 我会先生成折后清单，再计算总价");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /为购物清单计算折扣/ }).click();
      await expect(code).toHaveValue(/prices = \[12, 25, 8\]/);
      await page
        .getByRole("button", { name: "保存并查看参考思路", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "完成复盘", exact: true }),
      ).toBeDisabled();
      for (const check of await page
        .locator(".exercise-criteria")
        .getByRole("checkbox")
        .all())
        await check.click();
      await page.getByRole("button", { name: "完成复盘", exact: true }).click();
      await page
        .getByRole("dialog")
        .screenshot({ path: "screenshots/course-practice/code-review.png" });
      await page.keyboard.press("Escape");
      await expect(page.locator(".practice-summary")).toContainText("2 / 5");
      await page
        .getByRole("button", { name: /判断一份清单是否被修改/ })
        .click();
      const judgment = page.getByRole("dialog", {
        name: "判断一份清单是否被修改",
        exact: true,
      });
      await judgment.getByRole("button", { name: /错误/ }).click();
      await judgment
        .getByRole("button", { name: "提交答案", exact: true })
        .click();
      await expect(judgment).toContainText("回答正确");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /补全结账计算/ }).click();
      const fill = page.getByRole("dialog", {
        name: "补全结账计算",
        exact: true,
      });
      await fill
        .getByRole("textbox", { name: "转换后的单价", exact: true })
        .fill("12.50");
      await expect(
        fill.getByRole("button", { name: "提交答案", exact: true }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /补全结账计算/ }).click();
      await expect(
        fill.getByRole("textbox", { name: "转换后的单价", exact: true }),
      ).toHaveValue("12.50");
      await fill
        .getByRole("textbox", { name: "总价", exact: true })
        .fill("37.50");
      await fill.getByRole("button", { name: "提交答案", exact: true }).click();
      await expect(fill).toContainText("回答正确");
      await fill.screenshot({
        path: "screenshots/course-practice/fill-review.png",
      });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /解释一次计算异常/ }).click();
      const short = page.getByRole("dialog", {
        name: "解释一次计算异常",
        exact: true,
      });
      await short
        .getByRole("textbox", { name: "你的解答", exact: true })
        .fill("input 返回文本，应将数量转换为 int 后再与价格相乘。");
      await short
        .getByRole("button", { name: "保存并查看参考思路", exact: true })
        .click();
      for (const check of await short.getByRole("checkbox").all())
        await check.click();
      await short
        .getByRole("button", { name: "完成复盘", exact: true })
        .click();
      await expect(short).toContainText("已完成复盘");
      await page.keyboard.press("Escape");
      await expect(page.locator(".practice-summary")).toContainText("5 / 5");
      await page
        .getByRole("tablist", { name: "独立练习筛选" })
        .getByRole("tab", { name: /待完成/ })
        .click();
      await expect(page.locator(".practice-task")).toHaveCount(0);
      await expect
        .poll(
          async () =>
            Object.keys((await stored(page)).practiceAttempts || {}).length,
        )
        .toBe(5);
      assert.deepEqual((await stored(page)).progress, {
        "python/py-values": { quizCorrect: true },
      });
      // Wait for real local persistence, then verify hydration after reload.
      await expect
        .poll(async () => {
          const id = await page.evaluate(() =>
            localStorage.getItem("knowra-workspace-id"),
          );
          const r = await page.request.get(
            "http://127.0.0.1:5173/api/workspace",
            { headers: { "X-Workspace-Id": id } },
          );
          return Object.keys((await r.json()).state.practiceAttempts || {})
            .length;
        })
        .toBe(5);
      await page.reload();
      await settle(page);
      await page.getByRole("tab", { name: "练习", exact: true }).click();
      await expect(page.locator(".practice-summary")).toContainText("5 / 5");
      await page.getByRole("combobox", { name: "练习所属单元" }).click();
      await page.getByRole("option", { name: "全部单元", exact: true }).click();
      await expect(page.locator(".practice-task")).toHaveCount(6);
      await page.goto("http://127.0.0.1:5173/learn/python/py-values");
      await expect(page.locator(".board-surface")).toBeVisible();
      await page
        .locator(".board-surface")
        .evaluate((el) => (window.originalBoard = el));
      await page.getByRole("tab", { name: "独立练习", exact: true }).click();
      const panel = page.getByRole("dialog", { name: "独立练习", exact: true });
      await expect(panel.locator(".practice-summary")).toContainText("5 / 5");
      await panel.getByRole("button", { name: /修复一张收银小票/ }).click();
      await expect(
        page.getByRole("dialog", { name: "修复一张收银小票", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).toBeVisible();
      await expect(
        panel.getByRole("button", { name: /修复一张收银小票/ }),
      ).toBeFocused();
      assert(
        await page
          .locator(".board-surface")
          .evaluate((el) => el === window.originalBoard),
      );
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: "课堂板书", exact: true }),
      ).toBeFocused();
    }
    assert.equal(requests, 0, "opening exercises must not invoke AI");
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      tabs: boxes,
      errors,
      network: "No AI requests on open; provider mocked offline",
    });
    await context.close();
    console.log(
      `PASS ${width}: reference navigation, fixed sidebar, independent bank and no automatic generation`,
    );
  }
  const { context, page, errors } = await workspace(1440, true);
  let calls = 0,
    mode = "repair";
  const generated = {
    items: [
      {
        title: "合并两天的库存",
        type: "response",
        prompt: "周一和周二各有一份库存字典，请写出同名商品库存合计的思路。",
        referenceAnswer:
          "以商品为键，遍历两份字典并累加数量，验证同名键的总数。",
        criteria: ["合并同名键", "核对总数"],
        minutes: 8,
      },
    ],
  };
  await context.route("**/api/ai", async (r) => {
    const body = r.request().postDataJSON();
    assert.equal(body.kind, "course_practice");
    calls++;
    if (mode === "late")
      await new Promise((resolve) => setTimeout(resolve, 650));
    await r
      .fulfill({
        json: {
          content:
            mode === "failure" || calls === 1
              ? "{}"
              : JSON.stringify(
                  mode === "late"
                    ? {
                        items: [
                          {
                            ...generated.items[0],
                            title: "延迟任务",
                            prompt: "请描述一次新的库存盘点流程。",
                          },
                        ],
                      }
                    : generated,
                ),
        },
      })
      .catch(() => {});
  });
  await page.goto("http://127.0.0.1:5173/course/practice-fixture");
  await settle(page);
  await page.getByRole("tab", { name: "练习", exact: true }).click();
  await expect(page.locator(".practice-task")).toHaveCount(0);
  assert.equal(calls, 0);
  await page.getByRole("button", { name: "补充练习", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /合并两天的库存/ }),
  ).toBeVisible();
  assert.equal(
    calls,
    2,
    "invalid structure should retry without user interruption",
  );
  await expect(page.locator(".practice-error")).toHaveCount(0);
  mode = "failure";
  await page.getByRole("button", { name: "补充练习", exact: true }).click();
  await expect(page.locator(".practice-error")).toContainText("已保留");
  assert.equal(calls, 5);
  await expect(page.locator(".practice-task")).toHaveCount(1);
  mode = "late";
  await page.getByRole("button", { name: "补充练习", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.waitForTimeout(750);
  await expect(page.locator(".practice-task")).toHaveCount(1);
  await expect(page.locator(".practice-error")).toHaveCount(0);
  await page.getByRole("button", { name: "补充练习", exact: true }).click();
  await page.getByRole("tab", { name: "资料", exact: true }).click();
  await page.waitForTimeout(750);
  await page.getByRole("tab", { name: "练习", exact: true }).click();
  await expect(page.locator(".practice-task")).toHaveCount(1);
  await expect
    .poll(async () => {
      const id = await page.evaluate(() =>
        localStorage.getItem("knowra-workspace-id"),
      );
      const r = await page.request.get("http://127.0.0.1:5173/api/workspace", {
        headers: { "X-Workspace-Id": id },
      });
      return (await r.json()).state.coursePractices?.["practice-fixture"]
        ?.length;
    })
    .toBe(1);
  const callsBeforeReload = calls;
  await page.reload();
  await page.getByRole("tab", { name: "练习", exact: true }).click();
  await expect(page.locator(".practice-task")).toHaveCount(1);
  assert.equal(
    calls,
    callsBeforeReload,
    "hydrating the generated bank must not call AI",
  );
  assert.deepEqual(errors, []);
  evidence.push({
    generation:
      "Mocked AI: contract repair, final failure retains bank, cancel/tab exit discard late responses",
    calls,
    errors,
  });
  await context.close();
  console.log(
    "PASS generation: custom empty state, dedicated AI kind, internal repair, failure retention and cancellation",
  );
  await writeFile(
    "screenshots/course-practice/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
