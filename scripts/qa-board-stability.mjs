import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState, catalog } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import { writingProgress } from "../src/lib/teaching-direction.js";

const intro = Array.from(
  { length: 6 },
  (_, i) => `已有概念 ${i + 1}：确定对象，观察它们之间的关系。`,
).join("\n\n");
const long = Array.from(
  { length: 20 },
  (_, i) =>
    `第 ${i + 1} 个推理：先沿第一支箭头移动，再接上第二支箭头，两个方向的分量分别相加。`,
).join("\n\n");
const code =
  "```python\n" +
  Array.from({ length: 35 }, (_, i) => `print(\"step ${i + 1}\")`).join("\n") +
  "\n```";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/board-stability", { recursive: true });
try {
  for (const width of [1440, 1024]) {
    for (const kind of ["text", "code", "code-lines", "visual"]) {
      console.log(`Checking ${kind} at ${width}px`);
      const board = kind.startsWith("code") ? code : long;
      const steps = [
        {
          title: "前面的概念",
          board: intro,
          narration: "先回顾已理解的概念。",
        },
        {
          title: "连续推理",
          board,
          narration: "接下来完整写出推理，再观察结果。",
          ...(kind === "visual"
            ? {
                visual: {
                  type: "vector-transform",
                  title: "横向拉伸，纵向保持",
                  factors: [2, 1],
                  mode: "axes",
                  vector: [1, 2],
                },
              }
            : {}),
        },
        {
          title: "继续观察",
          board: "结论：沿箭头方向依次相加。".repeat(
            kind === "code-lines" ? 12 : 1,
          ),
          narration: "现在观察下一块内容与前面的联系。".repeat(8),
        },
      ];
      const content = steps
        .map((s) => `## ${s.title}\n\n${s.board}`)
        .join("\n\n");
      const lesson = {
        id: "stable",
        title: "写完后位置保持稳定",
        points: [],
        content,
        ...(kind === "code-lines"
          ? {}
          : { teaching: { mode: "script", source: content, steps } }),
      };
      const course = {
        ...structuredClone(catalog[0]),
        id: "qa-board-stable",
        units: [{ title: "板书稳定性", lessons: [lesson] }],
      };
      const sequence = lessonSequence(content, lesson);
      const index =
        kind === "code-lines"
          ? sequence.steps.findLastIndex((s) => s.kind === "code")
          : sequence.steps.findIndex((s) => s.title === "连续推理");
      assert.ok(index > 0);
      const current = sequence.steps[index];
      let start = 0,
        end = current.duration;
      for (let i = 0; i < 30; i++) {
        const middle = (start + end) / 2;
        if (writingProgress(current, middle) < 1) start = middle;
        else end = middle;
      }
      const elapsed = end - 700;
      const state = initialState();
      state.customCourses = [course];
      state.lessonPlayback[`${course.id}/${lesson.id}`] = {
        signature: sequence.signature,
        pacingVersion: 1,
        step: index,
        revealedStep: index,
        elapsed,
        revealedProgress: writingProgress(current, elapsed),
        revealedNarrationProgress: 0,
        answers: {},
        rate: 1,
      };
      let revision = 0;
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      await context.route("**/api/auth/me", (r) =>
        r.fulfill({
          json: {
            user: {
              id: "stability",
              name: "测试学习者",
              workspaceId: "stability",
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
        return r.fulfill({ json: { state, revision } });
      });
      await context.route("**/api/provider", (r) =>
        r.fulfill({ json: { configured: false } }),
      );
      await context.route("**/api/ai", (r) => r.abort());
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.error(e.message);
      });
      await page.clock.install();
      await page.goto(`http://127.0.0.1:5173/learn/${course.id}/${lesson.id}`);
      await expect(page.locator(".teaching-block.is-current")).toBeAttached();
      await page.evaluate(() => document.fonts.ready);
      await page.clock.runFor(300);
      await page.getByRole("button", { name: "开始讲解", exact: true }).click();
      await page.clock.runFor(200);
      const block = page.locator(`.teaching-block[data-step="${index}"]`);
      const position = () =>
        block.evaluate((e) => ({
          x: e.offsetLeft,
          y: e.offsetTop,
          height: e.offsetHeight,
          screenY: e.getBoundingClientRect().top,
          transform: e.closest(".board-surface").style.transform,
          scroll: e.closest(".board-scroll").scrollTop,
        }));
      const before = await position();
      await page.clock.runFor(650);
      await expect(block).toHaveAttribute("data-writing-complete", "true");
      const complete = await position();
      assert.equal(
        complete.x,
        before.x,
        "finishing writing must not migrate to another lane",
      );
      assert.equal(
        complete.y,
        before.y,
        "finishing writing must not move its starting line",
      );
      assert.ok(
        Math.abs(complete.screenY - before.screenY) < 100,
        "camera must not jump at completion",
      );
      assert.equal(
        complete.scroll,
        0,
        "automatic following uses one camera, not competing native scroll",
      );
      await page.clock.runFor(current.duration - end + 600);
      const after = await position();
      assert.equal(
        after.x,
        before.x,
        "the next step preserves previous writing",
      );
      assert.equal(after.y, before.y);
      const next = page.locator(".teaching-block.is-current");
      await expect(next).not.toHaveAttribute("data-step", String(index));
      const nextPosition = await next.evaluate((e) => ({
        x: e.offsetLeft,
        y: e.getBoundingClientRect().top,
        bottom: e.getBoundingClientRect().bottom,
      }));
      if (complete.height + complete.y > 1330)
        assert.ok(
          nextPosition.x > complete.x,
          "overflow advances only the following block",
        );
      assert.ok(
        nextPosition.y >= 130 && nextPosition.bottom <= 925,
        "the camera follows the newly placed block",
      );
      // Manual panning never pauses playback; after two idle seconds it returns.
      await page.mouse.move(800, 500);
      await page.mouse.down();
      await page.mouse.move(1000, 600, { steps: 5 });
      await page.mouse.up();
      await expect(
        page.getByRole("button", { name: "暂停讲解", exact: true }),
      ).toBeVisible();
      await page.clock.runFor(2500);
      // Pausing disables the idle return, including after writing is complete.
      await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
      await page.mouse.move(800, 500);
      await page.mouse.down();
      await page.mouse.move(950, 580, { steps: 4 });
      await page.mouse.up();
      await page.clock.runFor(50);
      const paused = await page.locator(".board-surface").getAttribute("style");
      await page.clock.runFor(3000);
      assert.equal(
        await page.locator(".board-surface").getAttribute("style"),
        paused,
        "a paused lesson must not pull the canvas back",
      );
      const heading = page.locator(".board-frame > h2").last();
      const headingPosition = () =>
        heading.evaluate((e) => {
          const range = document.createRange();
          range.selectNodeContents(e);
          const box = range.getBoundingClientRect();
          return {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            lane: e.offsetLeft,
            width: e.offsetWidth,
          };
        });
      const anchor = await headingPosition();
      await page.mouse.move(anchor.x, anchor.y);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -100);
      await page.keyboard.up("Control");
      await page.clock.runFor(100);
      const scaled = await headingPosition();
      assert.equal(
        scaled.lane,
        anchor.lane,
        "zoom must not repack the existing lanes",
      );
      assert.equal(scaled.width, anchor.width);
      assert.ok(
        Math.abs(scaled.x - anchor.x) < 2 && Math.abs(scaled.y - anchor.y) < 2,
        "zoom preserves the pointer anchor",
      );
      if (width === 1440 && kind === "text") {
        // Native Web Animations use compositor time, not Playwright's clock.
        await page.clock.resume();
        await page
          .getByRole("button", { name: "开始讲解", exact: true })
          .click();
        await page.mouse.move(800, 500);
        await page.mouse.down();
        await page.mouse.move(1050, 700, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(2700);
        const returned = await page
          .locator(".teaching-block.is-current")
          .boundingBox();
        assert.ok(
          returned.x >= 19 &&
            returned.y >= 131 &&
            returned.y + returned.height <= 925,
          "idle camera returns to the current writing",
        );
        const settled = await page
          .locator(".board-surface")
          .getAttribute("style");
        await page.waitForTimeout(300);
        assert.equal(
          await page.locator(".board-surface").getAttribute("style"),
          settled,
          "a settled idle return must not bounce",
        );
        await page
          .getByRole("button", { name: "暂停讲解", exact: true })
          .click();
      }
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `screenshots/board-stability/${kind}-${width}.png`,
      });
      evidence.push({ width, kind, before, complete, after, nextPosition });
      await context.close();
    }
  }
  await writeFile(
    "screenshots/board-stability/results.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(`${evidence.length} desktop board stability cases passed.`);
} finally {
  await browser.close();
}
