import { mockCourseResearch } from "./fixtures/course-research.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";

const routes = {
  home: "/",
  courses: "/courses",
  marketplace: "/marketplace",
  course: "/course/linear-algebra",
  classroom: "/learn/linear-algebra/vectors",
  feed: "/feed",
  history: "/history",
  settings: "/settings",
  assistant: "/assistant",
  login: "/login",
  signup: "/signup",
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ reducedMotion: "reduce" });
await mockCourseResearch(context);
await context.route("**/api/provider", (route) =>
  route.fulfill({ json: { configured: true, model: "fixture-model" } }),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    /Failed to decode|OTS parsing|Failed to load resource/.test(message.text())
  )
    errors.push(message.text());
});
const checks = [];
async function step(name, run) {
  await run();
  checks.push(name);
  console.log("PASS", name);
}
async function visit(route) {
  await page.goto(`http://127.0.0.1:5173${route}`);
  await expect(
    page.locator(".page, .classroom, .auth-page").first(),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(async (image) => {
        image.loading = "eager";
        await image.decode().catch(() => {});
      }),
    );
  });
}
try {
  await step(
    "One theme source, no legacy imports or parallel native controls",
    async () => {
      const entry = await readFile("src/design/tailwind.css", "utf8");
      assert(!/legacy|refinements|polish|easyui|course-reference/.test(entry));
      for (const file of [
        "pages",
        "ui",
        "study",
        "courseExtras",
        "courseCreation",
        "courseCreationChat",
        "classroomBoard",
        "design/primitives",
      ]) {
        const source = await readFile(`src/${file}.jsx`, "utf8");
        assert(
          !/<(?:button|textarea|select)\b/.test(source),
          `${file}: bypasses the shared UI`,
        );
        for (const input of source.matchAll(/<input\b[\s\S]*?\/>/g))
          assert(
            /type="file"/.test(input[0]) && /\bhidden\b/.test(input[0]),
            `${file}: visible native input`,
          );
      }
      for (const file of [
        "layouts",
        "workspace",
        "pages",
        "shadcn",
        "states",
      ]) {
        const root = postcss.parse(
          await readFile(`src/design/${file}.css`, "utf8"),
        );
        root.walkRules((rule) =>
          assert(
            !rule.selector.includes(":root"),
            `${file}: competing theme root`,
          ),
        );
        root.walkDecls((declaration) =>
          assert(
            !/#[\da-f]{3,8}\b|rgba?\(/i.test(declaration.value),
            `${file}: color outside tokens: ${declaration.value}`,
          ),
        );
      }
    },
  );
  await step(
    "All 11 routes use shared controls, fonts and loaded assets at desktop and mobile widths",
    async () => {
      for (const width of [390, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        for (const [name, route] of Object.entries(routes)) {
          await visit(route);
          const health = await page.evaluate(() => {
            const visible = (element) =>
              element.getBoundingClientRect().width > 0 &&
              element.getBoundingClientRect().height > 0 &&
              getComputedStyle(element).visibility !== "hidden";
            return {
              fits: document.documentElement.scrollWidth <= innerWidth,
              unowned: [...document.querySelectorAll("button:not([data-slot])")]
                .filter(visible)
                .filter((element) => !element.closest("[data-sonner-toaster]"))
                .map((element) => element.outerHTML.slice(0, 160)),
              fonts: [
                ...document.querySelectorAll(
                  'button, input:not([type="hidden"]), textarea',
                ),
              ]
                .filter(visible)
                .every((element) =>
                  getComputedStyle(element).fontFamily.includes("Satoshi"),
                ),
              images: [...document.images].every(
                (image) => image.complete && image.naturalWidth > 0,
              ),
              fontsLoaded: [...document.fonts].every(
                (font) => font.status !== "error",
              ),
            };
          });
          assert(health.fits, `${name} ${width}: page overflow`);
          assert.deepEqual(
            health.unowned,
            [],
            `${name}: controls bypass shared components`,
          );
          assert(health.fonts, `${name}: inconsistent control fonts`);
          assert(health.images, `${name}: failed asset`);
          assert(health.fontsLoaded, `${name}: failed font`);
          await page.screenshot({
            path: `screenshots/unified-${name}-${width}.png`,
            fullPage: name !== "classroom",
            animations: "disabled",
          });
          if (width === 390)
            await page.screenshot({
              path: `screenshots/unified-${name}-390-viewport.png`,
              animations: "disabled",
            });
        }
      }
    },
  );
  await step(
    "Theme tokens reach both shared controls and custom course surfaces",
    async () => {
      await visit("/");
      await page
        .locator(".sidebar")
        .getByRole("button", { name: "创建课程", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(page.locator(".generation-chat")).toBeVisible();
      await page
        .getByRole("button", { name: "从课程模板开始", exact: true })
        .click();
      await expect(dialog).toBeVisible();
      await page.evaluate(() =>
        document.documentElement.style.setProperty(
          "--action-primary",
          "rgb(143, 45, 86)",
        ),
      );
      await expect
        .poll(() =>
          dialog
            .locator('[data-variant="default"]')
            .first()
            .evaluate((element) => getComputedStyle(element).backgroundColor),
        )
        .toBe("rgb(143, 45, 86)");
      await dialog.getByRole("textbox").first().focus();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await page
        .getByRole("textbox", { name: "课程生成对话", exact: true })
        .fill("设计系统验证");
      await page
        .getByRole("textbox", { name: "课程生成对话", exact: true })
        .press("Enter");
      await page.getByRole("radio", { name: /^已有基础/ }).click();
      await expect
        .poll(() =>
          page
            .getByRole("radio", { name: /^已有基础/ })
            .evaluate((element) => getComputedStyle(element).borderTopColor),
        )
        .toBe("rgb(143, 45, 86)");
      await visit("/");
    },
  );
  await step(
    "Notification menu supports Escape and focus restoration",
    async () => {
      const trigger = page.getByRole("button", {
        name: "学习通知",
        exact: true,
      });
      await trigger.click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Tab");
    },
  );
  await step(
    "Mobile navigation traps focus and returns it after Escape",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await visit("/courses");
      const trigger = page.getByRole("button", {
        name: "展开导航",
        exact: true,
      });
      await trigger.click();
      const sheet = page.getByRole("dialog", { name: "学习导航" });
      await expect(sheet).toBeVisible();
      for (let index = 0; index < 14; index++) {
        await page.keyboard.press(index % 3 === 0 ? "Shift+Tab" : "Tab");
        assert(
          await sheet.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        );
      }
      // Focus a navigation link to exercise sheet dismissal independently of tooltips.
      await sheet.getByRole("link", { name: "首页", exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Tab");
    },
  );
  await step(
    "History and creation tabs share roving keyboard focus",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await visit("/history");
      await page.getByRole("tab", { name: "全部", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByRole("tab", { name: "对话", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await visit("/");
      await page
        .locator(".sidebar")
        .getByRole("button", { name: "创建课程", exact: true })
        .click();
      await page
        .getByRole("button", { name: "从课程模板开始", exact: true })
        .click();
      await page.getByRole("tab", { name: "课程模板", exact: true }).focus();
      await page.keyboard.press("End");
      await expect(
        page.getByRole("tab", { name: "自主创建", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "qa-design-system-results.json",
    JSON.stringify({ routes, widths: [390, 1440], checks, errors }, null, 2),
  );
} finally {
  await browser.close();
}
