import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, catalog } from "../src/data.js";

const folder = ".test/report/course-experience";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const course = catalog.find((c) => c.id === "python");
const lessons = course.units[0].lessons;
let state = {
    ...initialState(),
    courseEdits: { python: { description: "封面修改应保留这段课程简介" } },
  },
  revision = 0;
state.progress[`python/${lessons[0].id}`] = {
  completed: true,
  quizCorrect: true,
};
state.progress[`python/${lessons[1].id}`] = {
  completed: true,
  visited: true,
  quizCorrect: false,
};
let releaseAccount,
  releaseWorkspace,
  failWorkspace = false;
const accountGate = new Promise((resolve) => (releaseAccount = resolve));
const workspaceGate = new Promise((resolve) => (releaseWorkspace = resolve));
const errors = [],
  aiCalls = [];
await context.route("**/api/auth/me", async (route) => {
  await accountGate;
  await route.fulfill({
    json: {
      user: {
        id: "course-experience-qa",
        name: "学习者",
        workspaceId: "course-experience",
      },
    },
  });
});
await context.route("**/api/provider", (r) =>
  r.fulfill({ json: { configured: false } }),
);
await context.route("**/api/ai", (r) => {
  aiCalls.push(r.request().postDataJSON());
  return r.abort();
});
await context.route("**/api/workspace", async (route) => {
  await workspaceGate;
  if (failWorkspace)
    return route.fulfill({
      status: 503,
      json: { error: "学习记录暂时无法同步" },
    });
  if (route.request().method() === "PATCH") {
    for (const op of route.request().postDataJSON().operations) {
      let target = state;
      for (const part of op.path.slice(0, -1)) target = target[part] ??= {};
      if (op.op === "remove") delete target[op.path.at(-1)];
      else target[op.path.at(-1)] = op.value;
    }
    revision++;
  }
  return route.fulfill({
    json: { state, revision, updatedAt: new Date().toISOString() },
  });
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const moveAway = () => page.mouse.move(1100, 80);
const cover = page.locator(".course-identity-cover .course-cover img");
const openCover = async () => {
  const editor = page.getByRole("dialog", { name: "编辑课程", exact: true });
  if (!(await editor.isVisible()))
    await page.getByRole("button", { name: "编辑课程", exact: true }).click();
  await editor.getByRole("button", { name: "修改封面", exact: true }).click();
  return page.getByRole("dialog", { name: "修改课程封面" });
};
const closeEditor = () =>
  page
    .getByRole("dialog", { name: "编辑课程", exact: true })
    .getByRole("button", { name: "取消", exact: true })
    .click();
try {
  await page.goto("http://127.0.0.1:5173/course/python");
  await expect(page.getByRole("status")).toContainText("正在确认登录状态");
  const animationBefore = await page
    .locator(".opening-turn-page.primary")
    .evaluate((el) => {
      const box = el.getBBox();
      return [box.x, box.y, box.width, box.height];
    });
  await page.screenshot({ path: `${folder}/opening-1.png` });
  await page.waitForTimeout(350);
  const animationAfter = await page
    .locator(".opening-turn-page.primary")
    .evaluate((el) => {
      const box = el.getBBox();
      return [box.x, box.y, box.width, box.height];
    });
  assert.notDeepEqual(
    animationBefore,
    animationAfter,
    "Book page visibly animates",
  );
  await page.screenshot({ path: `${folder}/opening-2.png` });
  const frames = [];
  for (const time of [0, 0.18, 0.38, 0.62, 0.85]) {
    const frame = await page
      .locator(".opening-illustration svg")
      .evaluate((svg, time) => {
        svg.pauseAnimations();
        svg.setCurrentTime(time);
        const page = svg.querySelector(".opening-turn-page.primary");
        const point = page.getPointAtLength(page.getTotalLength() * 0.28);
        const box = page.getBBox();
        return {
          time,
          point: { x: point.x, y: point.y },
          bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
        };
      }, time);
    frames.push(frame);
    await page
      .locator(".opening-illustration")
      .screenshot({
        path: `${folder}/page-turn-${Math.round(time * 1000)}.png`,
      });
  }
  assert(
    frames.some((frame) => frame.point.x > 170),
    "Page begins to the right of spine",
  );
  assert(
    frames.some((frame) => frame.point.x < 100),
    "Page visibly lands on the left",
  );
  assert(
    Math.min(...frames.map((frame) => frame.bounds.y)) < 55,
    "Page lifts clearly above the book",
  );
  await writeFile(
    `${folder}/page-turn-frames.json`,
    JSON.stringify(frames, null, 2),
  );
  await page
    .locator(".opening-illustration svg")
    .evaluate((svg) => svg.unpauseAnimations());
  releaseAccount();
  await expect(page.getByRole("status")).toContainText(
    "正在同步课程与学习记录",
  );
  releaseWorkspace();
  await expect(page.locator(".course-reference h1")).toHaveText(course.title);
  await moveAway();
  const rows = page.locator(".lesson-row");
  await expect(rows).toHaveCount(lessons.length);
  await expect(page.locator(".lesson-row.is-expanded")).toHaveCount(0);
  const first = rows.first();
  await first.hover();
  await expect(first).toHaveClass(/is-expanded/);
  await expect(first.locator(".lesson-actions")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${folder}/course-hover.png` });
  await moveAway();
  await expect(page.locator(".lesson-row.is-expanded")).toHaveCount(0);
  await expect(first.locator("[data-slot=disclosure-content]")).toHaveCount(0);
  const heading = first.locator(".lesson-title-row a");
  await heading.focus();
  await page.keyboard.press("Tab");
  await expect(first).toHaveClass(/is-expanded/);
  await page.keyboard.press("Escape");
  await expect(first).not.toHaveClass(/is-expanded/);

  const legend = page.getByRole("group", { name: "按掌握程度筛选小节" });
  await expect(
    legend.getByRole("button", { name: "已掌握 1", exact: true }),
  ).toBeVisible();
  await legend.getByRole("button", { name: "已掌握 1", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(lessons[0].title);
  await legend.getByRole("button", { name: "熟悉 0", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator(".mastery-empty")).toBeVisible();
  await page.getByRole("button", { name: "查看全部小节", exact: true }).click();

  await rows.first().hover();
  await rows.first().getByRole("combobox").click();
  await page.getByRole("option", { name: "熟练", exact: true }).click();
  await moveAway();
  await expect(page.locator(".lesson-row.is-expanded")).toHaveCount(0);
  await expect(
    legend.getByRole("button", { name: "熟练 1", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => state.progress[`python/${lessons[0].id}`]?.mastery)
    .toBe("proficient");

  await page
    .locator(".mastery-overview")
    .getByRole("button", { name: /项目/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("阶段项目");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page
    .locator(".mastery-overview")
    .getByRole("button", { name: /测验/ })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .locator(".quiz-options > button")
    .nth(lessons[0].quiz.answer)
    .click();
  await dialog.getByRole("button", { name: "检查答案", exact: true }).click();
  await dialog.getByRole("button", { name: "下一题", exact: true }).click();
  await dialog
    .locator(".quiz-options > button")
    .nth(lessons[1].quiz.answer)
    .click();
  await dialog.getByRole("button", { name: "检查答案", exact: true }).click();
  await dialog.getByRole("button", { name: "查看结果", exact: true }).click();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    legend.getByRole("button", { name: "已掌握 1", exact: true }),
  ).toBeVisible();
  await expect(
    legend.getByRole("button", { name: "已尝试 0", exact: true }),
  ).toBeVisible();

  const original = await cover.getAttribute("src");
  await expect(
    page
      .locator(".course-identity-cover")
      .getByRole("button", { name: "修改封面", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "编辑课程", exact: true }).click();
  const editInput = page.locator(".course-edit-composer textarea");
  await editInput.fill("保留这个尚未提交的编辑要求");
  dialog = await openCover();
  await dialog.getByRole("button", { name: "地球与远方", exact: true }).click();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(editInput).toHaveValue("保留这个尚未提交的编辑要求");
  await closeEditor();
  await expect(cover).toHaveAttribute("src", original);
  dialog = await openCover();
  await dialog.getByRole("button", { name: "地球与远方", exact: true }).click();
  await dialog.getByRole("button", { name: "保存封面", exact: true }).click();
  await closeEditor();
  await expect(cover).toHaveAttribute("src", "/images/earth.jpg");
  await expect
    .poll(() => state.courseEdits.python.coverImage)
    .toBe("/images/earth.jpg");
  assert.equal(
    state.courseEdits.python.description,
    "封面修改应保留这段课程简介",
  );
  await page.getByRole("button", { name: "AI 编辑", exact: true }).click();
  await page.getByRole("button", { name: "手动编辑", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "课程名称", exact: true })
    .fill("Python 学习与实践");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect
    .poll(() => state.courseEdits.python.title)
    .toBe("Python 学习与实践");
  assert.equal(
    state.courseEdits.python.coverImage,
    "/images/earth.jpg",
    "Editing course text preserves cover",
  );
  await page.reload();
  await expect(cover).toHaveAttribute("src", "/images/earth.jpg");
  dialog = await openCover();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(dialog.getByRole("alert")).toContainText("请选择 JPG");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#85cdca";
    ctx.fillRect(0, 0, 320, 220);
    ctx.fillStyle = "#4a6fa5";
    ctx.fillRect(80, 40, 160, 140);
    return canvas.toDataURL("image/png");
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from(png.split(",")[1], "base64"),
  });
  await expect(dialog.locator(".course-cover-preview img")).toHaveAttribute(
    "src",
    /^data:image\/jpeg/,
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${folder}/cover-editor.png` });
  await dialog.getByRole("button", { name: "保存封面", exact: true }).click();
  await closeEditor();
  await expect
    .poll(() => state.courseEdits.python.coverImage)
    .toMatch(/^data:image\/jpeg/);
  await page.goto("http://127.0.0.1:5173/courses");
  const ticket = page
    .locator('a[href="/course/python"]')
    .filter({ has: page.locator("img") })
    .first();
  await expect(ticket.locator("img").first()).toHaveAttribute(
    "src",
    /^data:image\/jpeg/,
  );
  await page.goto("http://127.0.0.1:5173/course/python");
  dialog = await openCover();
  await dialog.getByRole("button", { name: "恢复默认", exact: true }).click();
  await dialog.getByRole("button", { name: "保存封面", exact: true }).click();
  await closeEditor();
  await expect(cover).toHaveAttribute("src", original);
  await expect.poll(() => state.courseEdits.python.coverImage).toBe("");
  await moveAway();
  await page.screenshot({ path: `${folder}/course-resting.png` });
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(layout.scrollWidth <= layout.width);
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    const box = await cover.boundingBox();
    assert(
      Math.abs(box.width / box.height - 4 / 3) < 0.02,
      `Taller cover at ${width}x${height}`,
    );
  }
  failWorkspace = true;
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("学习记录暂时无法同步");
  failWorkspace = false;
  await page.getByRole("button", { name: "重新连接", exact: true }).click();
  await expect(page.locator(".course-reference h1")).toHaveText(
    "Python 学习与实践",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  failWorkspace = true;
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  const animation = await page
    .locator(".opening-book")
    .evaluate((el) => getComputedStyle(el).animationName);
  assert.equal(animation, "none");
  assert.deepEqual(aiCalls, []);
  assert.deepEqual(errors, []);
  const result = {
    loadingAnimation: true,
    realLoadingStages: true,
    errorRetry: true,
    reducedMotion: true,
    hoverDisclosure: true,
    keyboardDisclosure: true,
    masteryCountsAndFiltering: true,
    quizUpdatesMastery: true,
    coverPreviewAndCancellation: true,
    coverUpload: true,
    coverPersistenceAndCards: true,
    defaultRestore: true,
    layout,
    errors,
  };
  await writeFile(`${folder}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: `${folder}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
