import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("screenshots", { recursive: true });

async function step(name, run) {
  await run();
  checks.push(name);
  console.log("PASS", name);
}

async function visit(route) {
  await page.goto(`http://127.0.0.1:5173${route}`);
  await expect(page.locator(".page, .classroom").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page
        .locator(".page-transition")
        .evaluateAll((elements) =>
          elements.every(
            (element) => getComputedStyle(element).opacity === "1",
          ),
        ),
    )
    .toBe(true);
}

async function verifyLayout(width) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    `${width}: page overflow`,
  );
  assert.equal(
    await page
      .locator(".page img")
      .evaluateAll((images) =>
        images.every((image) => image.complete && image.naturalWidth > 0),
      ),
    true,
    `${width}: image missing`,
  );
  const collisions = await page
    .locator(".ui-kpi")
    .evaluateAll((items) =>
      items.some((item) => item.scrollWidth > item.clientWidth + 1),
    );
  assert.equal(collisions, false, `${width}: metric text overflow`);
}

try {
  await step(
    "Sidebar navigation keeps content visible and stationary, including scrolled pages",
    async () => {
      for (const reducedMotion of ["no-preference", "reduce"]) {
        await page.emulateMedia({ reducedMotion });
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 844 });
          await visit("/marketplace");
          for (const [route, name] of [
            ["/courses", "我的课程"],
            ["/feed", "学习动态"],
            ["/history", "历史记录"],
            ["/", "首页"],
          ]) {
            await page.evaluate(() => window.scrollTo(0, 300));
            if (width < 1050) await page.locator(".mobile-menu").click();
            await page.evaluate(
              ({ destination, heading }) => {
                window.navigationSamples = [];
                window.navigationCaptureDone = false;
                const deadline = performance.now() + 3500;
                let started;
                const sample = () => {
                  const now = performance.now();
                  const title = document.querySelector(".page h1")?.textContent;
                  if (
                    location.pathname === destination &&
                    title?.includes(heading)
                  ) {
                    started ??= now;
                    const surface = document.querySelector(".page-transition");
                    const style = getComputedStyle(surface);
                    const matrix = new DOMMatrixReadOnly(style.transform);
                    window.navigationSamples.push({
                      opacity: Number(style.opacity),
                      x: matrix.m41,
                      y: matrix.m42,
                      scroll: scrollY,
                      left: surface.getBoundingClientRect().left,
                    });
                  }
                  if (
                    started === undefined ? now < deadline : now - started < 500
                  )
                    requestAnimationFrame(sample);
                  else window.navigationCaptureDone = true;
                };
                requestAnimationFrame(sample);
              },
              { destination: route, heading: route === "/" ? "Knowra" : name },
            );
            await page
              .getByRole("navigation", { name: "主导航" })
              .getByRole("link", { name, exact: true })
              .click();
            await expect(page).toHaveURL(`http://127.0.0.1:5173${route}`);
            await page.waitForFunction(
              () => window.navigationCaptureDone,
              null,
              { timeout: 6000 },
            );
            const samples = await page.evaluate(() => window.navigationSamples);
            assert.ok(
              samples.length > 0,
              `${width} ${route}: navigation frames missing`,
            );
            assert.ok(
              samples.every(
                ({ opacity, x, y, scroll }, index) =>
                  opacity >= 0.54 &&
                  opacity <= 1 &&
                  (index === 0 ||
                    opacity >= samples[index - 1].opacity - 0.001) &&
                  x === 0 &&
                  y === 0 &&
                  scroll === 0,
              ),
              `${width} ${route}: page flashes, moves or resets scroll after paint: ${JSON.stringify(samples)}`,
            );
            assert.ok(
              samples.at(-1).opacity >= 0.99,
              "navigation fade must finish",
            );
            assert.ok(
              samples.every(
                ({ left }) => Math.abs(left - samples[0].left) < 0.5,
              ),
              `${width} ${route}: page shifts horizontally during navigation`,
            );
          }
        }
      }
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await step(
    "Shared shadcn buttons and Motion tabs retain keyboard navigation",
    async () => {
      await visit("/");
      await expect(page.locator('[data-ui="shadcn"]').first()).toBeAttached();
      const course = page.getByRole("tab", { name: "打造课程", exact: true });
      const assist = page.getByRole("tab", { name: "即时协助", exact: true });
      await course.focus();
      await page.keyboard.press("ArrowRight");
      await expect(assist).toBeFocused();
      await expect(assist).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".mode-switch .tab-indicator")).toHaveCount(1);
      await page.keyboard.press("ArrowLeft");
      await expect(course).toHaveAttribute("aria-selected", "true");
    },
  );

  await step(
    "Course dialog keeps focus inside and closes on Escape",
    async () => {
      await page.goto("http://127.0.0.1:5173/courses");
      const create = page
        .locator("main.page")
        .getByRole("button", { name: "创建课程", exact: true });
      await create.click();
      await page
        .getByRole("button", { name: "从课程模板开始", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: "创建你的课程" }),
      ).toBeVisible();
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            Number(getComputedStyle(element).opacity),
          ),
        )
        .toBe(1);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
          true,
        );
      }
      await page.screenshot({ path: "screenshots/easyui-dialog-desktop.png" });
      await dialog.getByRole("textbox").first().focus();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    },
  );

  await step(
    "Home layouts and assets at 360, 390, 768, 1024, 1440 and 1920 pixels",
    async () => {
      for (const width of [360, 390, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
        await visit("/");
        await verifyLayout(width);
        if (width === 390) {
          const menu = page.locator(".mobile-menu");
          await expect(
            page.getByRole("navigation", { name: "主导航" }),
          ).toHaveCount(0);
          await menu.click();
          await expect(menu).toHaveAttribute("aria-expanded", "true");
          await expect(
            page.getByRole("navigation", { name: "主导航" }),
          ).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(menu).toHaveAttribute("aria-expanded", "false");
          await expect(menu).toBeFocused();
          await page.goto("http://127.0.0.1:5173/courses");
          await page
            .locator("main.page")
            .getByRole("button", { name: "创建课程", exact: true })
            .click();
          const dialog = page.getByRole("dialog");
          await page
            .getByRole("button", { name: "从课程模板开始", exact: true })
            .click();
          await expect(dialog).toBeVisible();
          await expect
            .poll(() =>
              dialog.evaluate((element) =>
                Number(getComputedStyle(element).opacity),
              ),
            )
            .toBe(1);
          const bounds = await dialog.boundingBox();
          assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
          await page.screenshot({
            path: "screenshots/easyui-dialog-mobile.png",
          });
          await page.keyboard.press("Escape");
          await visit("/");
        }
        if ([390, 1440, 1920].includes(width)) {
          await page.screenshot({
            path: `screenshots/easyui-home-${width}.png`,
            fullPage: true,
          });
        }
      }
    },
  );

  await step(
    "Course, marketplace, feed, history, settings and classroom still render",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      for (const [name, route] of Object.entries({
        courses: "/courses",
        marketplace: "/marketplace",
        feed: "/feed",
        history: "/history",
        settings: "/settings",
        course: "/course/linear-algebra",
        classroom: "/learn/linear-algebra/vectors",
      })) {
        await visit(route);
        await page.screenshot({
          path: `screenshots/easyui-${name}.png`,
          fullPage: name !== "classroom",
        });
      }
    },
  );

  await step(
    "Reduced motion keeps controls usable without page or tab transforms",
    async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await visit("/");
      assert.equal(
        await page
          .locator(".page-transition")
          .evaluate((element) => getComputedStyle(element).transform),
        "none",
      );
      await page.getByRole("tab", { name: "即时协助", exact: true }).click();
      await expect(
        page.getByRole("tab", { name: "即时协助", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await page.screenshot({
        path: "screenshots/easyui-reduced-motion.png",
        fullPage: true,
      });
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "qa-easyui-results.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log("PASS No uncaught browser errors");
} finally {
  await browser.close();
}
