import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState, validateOutline } from "../src/data.js";
import { lessonSequence, streamMarkdown } from "../src/lib/lesson-sequence.js";

const source =
  "## 完整教材\n\nPinia 是 Vue 的官方状态管理库。我们将从跨组件共享状态开始，理解 Store 的作用。\n\n可以把 Store 想象成超市的中央仓库，各个货架都从这里取货。商品列表、购物车和结算页面由此共享数据。\n\nState 存储数据，Getters 根据数据计算新结果，Actions 负责修改数据的业务逻辑。实际项目应按业务领域组织 Store。";
const script = [
  {
    title: "本节课路线图",
    board:
      "- **共享数据** → Pinia\n- **管理请求** → Axios\n- **实时联动** → 购物车",
    narration:
      "今天我们围绕一个电商场景学习。你在商品页点击加入购物车，右上角的数量应该立刻更新，结算页面也要拿到同一份商品数据。如果每个组件都各自保存一份，修改起来就很容易遗漏。这节课先解决跨组件共享数据的问题，再理解统一管理请求，最后把购物车的交互串起来。我们先从共享数据的工具 Pinia 开始。",
  },
  {
    title: "什么是 Pinia？",
    board:
      "**Pinia：Vue 官方状态管理库**\n\n- 作用：跨组件共享数据\n- 核心：**Store（存储中心）**",
    narration:
      "想象你开了一家超市，如果每个货架都有自己的账本，库存很快就会对不上。更好的办法是设置一个中央仓库，所有货架从这里取货、记录。Pinia 在应用里就像这个仓库。商品列表和购物车不用互相传来传去，而是访问同一个 Store。因此，一个地方修改后，其他使用这份状态的组件也能随之更新。",
  },
  {
    title: "Store 的结构",
    board:
      "- **State**：存什么（数据）\n- **Getters**：怎么算（派生状态）\n- **Actions**：怎么改（业务逻辑）",
    narration:
      "先把 Store 看成一个容器。State 保存购物车中的商品和数量；Getters 根据已有商品计算总价，所以不必再维护一份容易过期的总价副本；Actions 则描述加入商品、调整数量这些操作。比如用户再次点击加入购物车，Action 可以先检查商品是否已存在，再决定增加数量还是添加新项。这样数据、计算和操作各有清楚的职责。",
  },
];
const outline = {
  title: "Pinia 课堂验证",
  units: [
    {
      title: "状态管理",
      lessons: [
        {
          title: "让购物车动起来",
          summary: "理解状态管理的分工",
          points: ["共享状态", "Store"],
          content: source,
          teaching: { steps: script },
        },
      ],
    },
  ],
};
const units = validateOutline(outline);
const lesson = units[0].lessons[0];
const seq = lessonSequence(lesson.content, lesson);
assert.equal(seq.pages.length, 3);
assert.equal(seq.readingPages.length, 1);
assert.equal(seq.steps.length, 3);
assert(seq.readingPages[0].content.includes("实际项目应按业务领域组织 Store"));
for (const step of seq.steps) {
  assert(step.narration.length > step.text.length * 2);
  assert(step.narrationDuration > step.writeDuration);
  assert(!step.content.includes("想象你开了一家超市"));
  for (const p of [0, 0.2, 0.7, 1])
    assert(!streamMarkdown(step, p).includes("undefined"));
}
const duplicate = structuredClone(outline);
duplicate.units[0].lessons[0].teaching.steps[0].narration = script[0].board;
assert.throws(() => validateOutline(duplicate), /板书与讲解/);
const malformed = structuredClone(outline);
delete malformed.units[0].lessons[0].teaching.steps[0].board;
assert.throws(() => validateOutline(malformed), /板书与讲解/);
const old = structuredClone(outline);
delete old.units[0].lessons[0].teaching;
assert(validateOutline(old)[0].lessons[0].content === source);
const edited = lessonSequence(
  "## 更新后的教材\n\n这一段已被修改，不应继续播放旧脚本。",
  lesson,
);
assert(!edited.steps.some((s) => s.narration.includes("超市")));
for (const course of catalog)
  for (const unit of course.units)
    for (const item of unit.lessons) {
      const authored = lessonSequence(item.content, item).steps.filter(
        (s) => s.kind === "board",
      );
      assert(authored.length > 0, item.id);
      assert(
        authored.every((s) => s.content !== s.sourceContent),
        item.id,
      );
    }
console.log(
  "PASS Independent board and narration scripts, complete reading material, legacy fallback, validation and edit invalidation",
);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const seed = initialState();
seed.customCourses.push({
  ...catalog[0],
  id: "narration-qa",
  title: outline.title,
  units,
});
await context.addInitScript(
  ({ id, seed }) => {
    if (!localStorage.getItem("knowra-workspace-id")) {
      localStorage.setItem("knowra-workspace-id", id);
      localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
    }
  },
  { id: crypto.randomUUID(), seed },
);
await context.route("**/api/provider", (r) =>
  r.fulfill({ json: { configured: false } }),
);
let aiCalls = 0;
await context.route("**/api/ai", (r) => {
  aiCalls++;
  return r.abort();
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const key = `narration-qa/${lesson.id}`;
const transcript = () =>
  page.locator('.tutor-teaching-entry[data-narration-index="0"] p').first();
await mkdir("screenshots/board-narration", { recursive: true });
try {
  await page.goto(`http://127.0.0.1:5173/learn/${key}`);
  await expect(page.locator(".lesson-player")).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await page.clock.runFor(500);
  await expect(page.locator(".writing-pencil")).toBeVisible();
  await page.clock.runFor(seq.steps[0].writeDuration + 150 - 500);
  await expect(page.locator(".teaching-writing").first()).toHaveAttribute(
    "data-write-progress",
    "1.000",
  );
  await expect(page.locator(".writing-pencil")).toHaveCount(0);
  const boardComplete = await page
    .locator(".teaching-writing")
    .first()
    .innerText();
  const earlyNarration = await transcript().innerText();
  assert(
    earlyNarration.length > 0 &&
      earlyNarration.length < script[0].narration.length,
  );
  await page.clock.runFor(1400);
  assert((await transcript().innerText()).length > earlyNarration.length);
  assert.equal(
    await page.locator(".teaching-writing").first().innerText(),
    boardComplete,
  );
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  const paused = await transcript().innerText();
  await page.clock.runFor(20000);
  assert.equal(await transcript().innerText(), paused);
  const remote = () =>
    page.evaluate(async (key) => {
      const r = await fetch("/api/workspace", {
        headers: {
          "X-Workspace-Id": localStorage.getItem("knowra-workspace-id"),
        },
      });
      return (await r.json()).state.lessonPlayback?.[key];
    }, key);
  await expect.poll(async () => (await remote())?.revealedProgress).toBe(1);
  const saved = await remote();
  assert(
    saved.revealedNarrationProgress > 0 && saved.revealedNarrationProgress < 1,
  );
  await page.reload();
  await expect(transcript()).toHaveText(paused);
  await expect(page.locator(".teaching-writing").first()).toHaveAttribute(
    "data-write-progress",
    "1.000",
  );
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await page.clock.runFor(800);
  assert((await transcript().innerText()).length > paused.length);
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "下一步讲解", exact: true }).click();
  await expect(page.locator(".board-frame")).toHaveCount(3);
  await expect(page.locator(".tutor-teaching-entry")).toHaveCount(3);
  await expect(page.locator(".tutor-teaching")).toContainText("中央仓库");
  assert(
    !(await page.locator(".board-surface").innerText()).includes("中央仓库"),
  );
  await page.evaluate(() => {
    document.querySelector(".board-scroll").scrollTop = 0;
    document.querySelector(".tutor-scroll").scrollTop = 0;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "screenshots/board-narration/desktop.png" });
  await page.getByRole("tab", { name: "连续讲义", exact: true }).click();
  await expect(page.locator(".board-frame")).toHaveCount(1);
  await expect(page.locator(".board-surface")).toContainText(
    "实际项目应按业务领域组织 Store",
  );
  await page.getByRole("tab", { name: "连续白板", exact: true }).click();
  await expect(page.locator(".board-frame")).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "screenshots/board-narration/mobile.png" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.equal(aiCalls, 0);
  assert.deepEqual(errors, []);
  await writeFile(
    "screenshots/board-narration/verification.json",
    JSON.stringify(
      {
        boardComplete,
        paused,
        saved,
        source: "local fixture; no model requests",
        widths: [1440, 390],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS Writing finishes while narration continues; independent pause/reload/resume; cumulative board; complete reading; desktop/mobile and pencil",
  );
} finally {
  await browser.close();
}
