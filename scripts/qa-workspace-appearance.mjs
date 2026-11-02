import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState, lessonsOf } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import { newCourseDraft } from "../src/lib/course-generation.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("screenshots/workspace-appearance", { recursive: true });
const evidence = [];
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    for (const width of [1440, 1920]) {
      const seed = initialState(),
        draft = newCourseDraft();
      seed.courseDrafts[draft.id] = draft;
      const lesson = lessonsOf(catalog[0])[0],
        sequence = lessonSequence(lesson.content, lesson);
      seed.lessonPlayback["linear-algebra/vectors"] = {
        signature: sequence.signature,
        step: 0,
        elapsed: 1000,
        revealedStep: 0,
        revealedProgress: 1,
        revealedNarrationProgress: 1,
      };
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion,
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
      const page = await context.newPage(),
        errors = [],
        failedFonts = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => {
        if (/\.(woff2?|ttf)/.test(r.url()) && r.status() >= 400)
          failedFonts.push(r.url());
      });
      const ready = async (route) => {
        await page.goto("http://127.0.0.1:5173" + route);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
      };
      const assertLayout = async (collapsed) => {
        await expect(page.locator(".app-shell")).toHaveAttribute(
          "data-sidebar-collapsed",
          String(collapsed),
        );
        await expect
          .poll(async () =>
            Math.round((await page.locator(".app-header").boundingBox()).x),
          )
          .toBe(collapsed ? 0 : 240);
        await expect
          .poll(async () =>
            Math.round((await page.locator(".main-shell").boundingBox()).x),
          )
          .toBe(collapsed ? 0 : 240);
        assert.equal(
          await page.locator(".sidebar").evaluate((el) => el.inert),
          collapsed,
        );
        if (collapsed)
          await expect(page.locator(".sidebar")).toHaveCSS("opacity", "0");
        assert(
          !(await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )),
        );
      };
      await ready("/courses");
      await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
      await assertLayout(true);
      await expect(
        page.getByRole("button", { name: "展开侧栏", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await assertLayout(false);
      await expect(
        page.getByRole("button", { name: "收起侧栏", exact: true }),
      ).toBeFocused();
      for (let i = 0; i < 3; i++) {
        await page
          .getByRole("button", { name: "收起侧栏", exact: true })
          .click();
        await page
          .getByRole("button", { name: "展开侧栏", exact: true })
          .click();
      }
      await assertLayout(false);
      for (const route of [
        "/",
        "/course/linear-algebra",
        "/settings",
        "/assistant",
        "/create/" + draft.id,
      ]) {
        await ready(route);
        await page
          .getByRole("button", { name: "收起侧栏", exact: true })
          .click();
        await assertLayout(true);
        if (route.startsWith("/create/"))
          assert.equal(
            (await page.locator(".generation-composer-wrap").boundingBox()).x,
            0,
          );
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        assert.equal((await page.locator(".app-header").boundingBox()).y, 0);
        if (
          route === "/course/linear-algebra" &&
          reducedMotion === "no-preference"
        )
          await page.screenshot({
            path: `screenshots/workspace-appearance/collapsed-course-${width}.png`,
          });
        await page.reload();
        await assertLayout(true);
        await page
          .getByRole("button", { name: "展开侧栏", exact: true })
          .click();
        await assertLayout(false);
      }
      // Navigation uses the same Shell instance and retains the preference.
      await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
      await ready("/learn/linear-algebra/vectors");
      const board = page.locator(".guided-board"),
        selector = page.getByRole("combobox", {
          name: "白板字体",
          exact: true,
        });
      const fonts = [
        ["sans", "清晰黑体", "Satoshi"],
        ["serif", "书卷宋体", "ChillDuanHeiSong"],
        ["hand", "手写板书", "Knowra Virgil"],
      ];
      for (const [id, label, family] of fonts) {
        const caption = await page
          .locator(".lesson-player-caption")
          .innerText();
        const uiFont = await selector.evaluate(
          (el) => getComputedStyle(el).fontFamily,
        );
        await selector.click();
        await expect(page.getByRole("listbox")).toBeVisible();
        await page.waitForTimeout(300);
        if (
          id === "sans" &&
          width === 1440 &&
          reducedMotion === "no-preference"
        )
          await page.screenshot({
            path: "screenshots/workspace-appearance/font-menu.png",
          });
        await page.getByRole("option", { name: new RegExp(label) }).click();
        await expect(board).toHaveAttribute("data-board-font", id);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        assert(
          (
            await page
              .locator(".board-frame .markdown")
              .first()
              .evaluate((el) => getComputedStyle(el).fontFamily)
          ).includes(family),
        );
        assert.equal(
          await selector.evaluate((el) => getComputedStyle(el).fontFamily),
          uiFont,
        );
        assert.equal(
          await page.locator(".lesson-player-caption").innerText(),
          caption,
          "font change reset playback",
        );
        await expect(
          page.locator(".board-frame .markdown strong").first(),
        ).toHaveCSS("font-weight", "700");
        assert(
          (await page.locator(".board-annotation-anchor svg").count()) > 0,
          "highlight lost after changing font",
        );
        await expect(selector).toBeFocused();
        if (reducedMotion === "no-preference")
          await page.screenshot({
            path: `screenshots/workspace-appearance/font-${id}-${width}.png`,
          });
      }
      await selector.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("listbox")).toBeVisible();
      await page.keyboard.press("Home");
      await expect(
        page.getByRole("option", { name: /手写板书/ }),
      ).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("option", { name: /清晰黑体/ }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(board).toHaveAttribute("data-board-font", "sans");
      await page.reload();
      await expect(board).toHaveAttribute("data-board-font", "sans");
      await ready("/learn/python/py-values");
      await expect(board).toHaveAttribute("data-board-font", "sans");
      // Changing fonts during playback must keep the running lesson alive.
      await page.getByRole("button", { name: "开始讲解", exact: true }).click();
      await selector.click();
      await page.getByRole("option", { name: /书卷宋体/ }).click();
      await expect(
        page.getByRole("button", { name: "暂停讲解", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
      await ready("/courses");
      await assertLayout(true);
      // Compact desktop uses the drawer and does not erase the saved desktop preference.
      await page.setViewportSize({ width: 1024, height: 1000 });
      await page.getByRole("button", { name: "展开导航", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.setViewportSize({ width, height: 1000 });
      await assertLayout(true);
      assert.deepEqual(errors, []);
      assert.deepEqual(failedFonts, []);
      evidence.push({
        width,
        reducedMotion,
        fonts: fonts.map((f) => f[1]),
        errors,
        failedFonts,
      });
      await context.close();
      console.log(
        `PASS ${width}px ${reducedMotion}: collapse, focus, offsets, reload, drawer; 3 fonts, previews, emphasis, running playback and persistence`,
      );
    }
  }
  await writeFile(
    "screenshots/workspace-appearance/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
