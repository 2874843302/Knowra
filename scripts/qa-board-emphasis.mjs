import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, validateOutline } from "../src/data.js";

// An isolated generated-course fixture exercises the same normalized script
// contract as model output, without sending prompts or touching user progress.
const units = validateOutline({
  title: "看懂共享状态",
  units: [
    {
      title: "共享状态与数据流",
      lessons: [
        {
          title: "用一个 Store 连接多个页面",
          content:
            "## 共享状态\n\n多个页面从同一个 Store 读取数据。\n\n## 实践\n\n通过统一操作更新状态，检查组件间是否同步。",
          teaching: {
            steps: [
              {
                title: "先建立一个共同来源",
                board:
                  "**Store** 保存共享状态。\n\n**统一数据来源，组件同步更新**\n\n商品页、购物车、结算页，读取同一份数据。",
                narration:
                  "想象几个收银台共用同一本账本。一个收银台记下变化，其他收银台就能读取到最新的结果，不必再各自维护一份。",
                annotations: [
                  { kind: "highlight", snippet: "统一数据来源，组件同步更新" },
                ],
              },
              {
                title: "再检查数据如何流动",
                board:
                  "**不要重复创建共享状态**\n\n页面 A → Store ← 页面 B\n\n- **State**：保存数据\n- **Actions**：更新数据",
                narration:
                  "先让两个页面使用同一个容器，再试着修改其中的数据。共享状态保存事实，操作负责表达如何改变它，界面会从这个共同来源读到变化。",
                annotations: [
                  { kind: "underline", snippet: "不要重复创建共享状态" },
                  { kind: "circle", snippet: "Store" },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/board-emphasis", { recursive: true });
try {
  for (const [width, reducedMotion] of [
    [1440, "no-preference"],
    [390, "reduce"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion,
    });
    const seed = initialState();
    seed.customCourses.push({
      id: "emphasis-qa",
      title: "看懂共享状态",
      units,
    });
    await context.addInitScript(
      ({ id, seed }) => {
        localStorage.setItem("knowra-workspace-id", id);
        localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
      },
      { id: crypto.randomUUID(), seed },
    );
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: false } }),
    );
    await context.route("**/api/ai", (r) => r.abort());
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:5173/learn/emphasis-qa/${units[0].lessons[0].id}`,
    );
    await page.evaluate(() => document.fonts.ready);
    const board = page.locator(".board-surface");
    const first = page.locator(
      '.teaching-block[data-step="0"] .teaching-writing',
    );
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect(first.locator("strong").first()).toContainText("Store");
    await expect(first.locator(".writing-pencil")).toBeVisible();
    assert(Number(await first.getAttribute("data-write-progress")) < 1);
    await expect(first.locator("mark")).toHaveCount(0);
    const typography = await first
      .locator("strong")
      .first()
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          weight: style.fontWeight,
          synthesis: style.fontSynthesis,
          background: style.backgroundColor,
        };
      });
    assert.equal(typography.weight, "700");
    assert.equal(typography.synthesis, "weight");
    assert.equal(typography.background, "rgba(0, 0, 0, 0)");
    await expect(first.locator('mark[data-annotation="highlight"]')).toHaveText(
      "统一数据来源，组件同步更新",
      { timeout: 10000 },
    );
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await expect(first.locator(".writing-pencil")).toHaveCount(0);
    const stroke = first.locator(".annotation-highlight > svg");
    await expect(stroke.locator("path")).not.toHaveCount(0);
    await stroke.evaluate((node) => {
      window.__emphasisStroke = node;
    });
    await page.getByRole("button", { name: "下一步讲解", exact: true }).click();
    await expect(board.locator('mark[data-annotation="underline"]')).toHaveText(
      "不要重复创建共享状态",
    );
    await expect(board.locator('mark[data-annotation="circle"]')).toHaveText(
      "Store",
    );
    assert(await stroke.evaluate((node) => node === window.__emphasisStroke));

    const aligned = () =>
      board.locator(".board-annotation-anchor").evaluateAll((anchors) =>
        anchors.every((anchor) => {
          const mark = anchor.querySelector("mark"),
            svg = anchor.querySelector("svg");
          if (!svg?.querySelector("path")) return false;
          const text = mark.getBoundingClientRect(),
            bounds = svg.getBBox();
          const center = new DOMPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          ).matrixTransform(svg.getScreenCTM());
          return (
            Math.abs(center.x - text.x - text.width / 2) < 15 &&
            Math.abs(center.y - text.y - text.height / 2) < 15
          );
        }),
      );
    await expect.poll(aligned).toBe(true);
    await page.locator(".board-scroll").evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          document
            .getAnimations()
            .filter((a) => a.effect?.target?.closest?.(".rough-annotation"))
            .every((a) => a.playState !== "running"),
        ),
      )
      .toBe(true);
    await page.screenshot({ path: `screenshots/board-emphasis/${width}.png` });
    for (const targetWidth of width === 1440 ? [1024, 320, 1440] : [390]) {
      await page.setViewportSize({ width: targetWidth, height: 1000 });
      await expect.poll(aligned).toBe(true);
      assert.equal(
        await page
          .locator(".board-scroll")
          .evaluate((node) => node.scrollWidth > node.clientWidth + 1),
        false,
      );
    }
    await page.getByRole("button", { name: "放大白板", exact: true }).click();
    await expect.poll(aligned).toBe(true);
    await page.getByRole("button", { name: "重新讲解", exact: true }).click();
    await expect(board.locator("mark")).toHaveCount(0);
    assert.deepEqual(errors, []);
    evidence.push({ width, reducedMotion, typography, errors });
    await context.close();
  }
  await writeFile(
    "screenshots/board-emphasis/verification.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    "PASS Generated board emphasis: streamed bold, selective delayed highlight, underline/circle, stable strokes, responsive alignment, zoom and replay",
  );
} finally {
  await browser.close();
}
