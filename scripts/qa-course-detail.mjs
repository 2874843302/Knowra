import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
await context.addInitScript(
  ({ id, seed }) => {
    if (!localStorage.getItem("knowra-workspace-id")) {
      localStorage.setItem("knowra-workspace-id", id);
      localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
    }
  },
  { id: crypto.randomUUID(), seed: initialState() },
);
await context.route("**/api/provider", (route) =>
  route.fulfill({ json: { configured: false } }),
);
await context.route("**/api/ai", (route) => route.abort());
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const measurements = [];
await mkdir("screenshots/course-detail", { recursive: true });

async function settle() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await expect
    .poll(() =>
      page
        .locator(".main-shell")
        .evaluate((el) => el.getBoundingClientRect().left),
    )
    .toBe(page.viewportSize().width <= 1050 ? 0 : 240);
}

async function layout() {
  await settle();
  const result = await page.evaluate(() => {
    const box = (selector) =>
      document.querySelector(selector).getBoundingClientRect().toJSON();
    const reference = box(".course-reference"),
      sidebar = box(".course-reference-sidebar");
    const title = box(".course-reference-copy h1"),
      directory = box(".unit-navigation");
    const tools = box(".course-cover-actions"),
      viewbar = box(".course-viewbar");
    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      reference,
      sidebar,
      title,
      directory,
      tools,
      viewbar,
      cover: box(".course-identity-cover"),
      heading: box(".unit-heading"),
      toolButtons: [
        ...document.querySelectorAll(".course-cover-actions > button"),
      ].map((el) => el.getBoundingClientRect().toJSON()),
      unitAlignment: [
        ...document.querySelectorAll(".unit-navigation > button"),
      ].map((el) => {
        const badge = el.querySelector("span").getBoundingClientRect(),
          row = el.getBoundingClientRect();
        return Math.abs(
          badge.top + badge.height / 2 - row.top - row.height / 2,
        );
      }),
      assets: [...document.querySelectorAll(".course-reference img")].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
      typography: [
        ...document.querySelectorAll(
          ".course-reference-copy h1, .course-description, .unit-heading h2, .lesson-row h3",
        ),
      ].map((el) => {
        const s = getComputedStyle(el);
        return {
          selector: el.className || el.tagName,
          family: s.fontFamily,
          size: s.fontSize,
          weight: s.fontWeight,
          lineHeight: s.lineHeight,
          color: s.color,
        };
      }),
    };
  });
  assert(
    result.documentWidth <= result.width,
    `${result.width}: page overflow`,
  );
  assert(result.assets);
  assert.equal(
    result.directory.x,
    result.sidebar.x,
    `${result.width}: directory drifts from sidebar`,
  );
  assert.equal(
    result.directory.width,
    result.sidebar.width,
    `${result.width}: directory width`,
  );
  assert(
    result.unitAlignment.every((offset) => offset < 1),
    `${result.width}: number badges not centered`,
  );
  for (const button of result.toolButtons) {
    assert(
      button.left >= result.tools.left && button.right <= result.tools.right,
    );
    const minimum = result.width <= 760 ? 25 : 32;
    assert(button.width >= minimum && button.height >= minimum);
    assert(
      button.left >= result.cover.left && button.right <= result.cover.right,
    );
    assert(
      button.top >= result.cover.top && button.bottom <= result.cover.bottom,
    );
  }
  assert(
    Math.abs(result.cover.width - result.cover.height) < 1,
    "Original square cover layout",
  );
  await expect(
    page.locator(".course-reference-sidebar > .course-viewbar"),
  ).toHaveCount(1);
  await expect(
    page.locator(".course-reference-content .course-viewbar"),
  ).toHaveCount(0);
  assert(result.viewbar.top >= result.cover.bottom);
  assert(result.directory.top >= result.viewbar.bottom);
  assert(result.viewbar.right <= result.reference.right);
  const unobscured = await page
    .getByRole("button", { name: "面板", exact: true })
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return el.contains(top);
    });
  assert(
    unobscured,
    `${result.width}: global header obscures course view controls`,
  );
  await expect(
    page.locator(
      ".course-reference .publisher-dot, .course-identity .cover-mark",
    ),
  ).toHaveCount(0);
  measurements.push(result);
}

try {
  for (const width of [320, 390, 760, 768, 1024, 1050, 1100, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await page.goto("http://127.0.0.1:5173/course/how-ai-works");
    await layout();
    if ([390, 1440].includes(width))
      await page.screenshot({
        path: `screenshots/course-detail/final-${width}.png`,
        fullPage: true,
      });
  }
  console.log(
    "PASS Real course artwork, no placeholder shapes; aligned directory, centered numbers and usable controls across 9 widths",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173/course/how-ai-works");
  await settle();
  await expect(
    page.getByRole("button", { name: "显示更多", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "面板", exact: true }).click();
  await expect(page.locator(".course-dashboard")).toBeVisible();
  await page.screenshot({
    path: "screenshots/course-detail/dashboard-desktop.png",
  });
  await expect(page.getByRole("navigation", { name: "课程单元" })).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: "资料", exact: true }).click();
  await expect(page.locator(".materials-section")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "课程单元" })).toHaveCount(
    0,
  );
  await page
    .locator(".materials-section .section-heading button")
    .click({ trial: true });
  await page.screenshot({
    path: "screenshots/course-detail/materials-desktop.png",
  });
  await page.getByRole("tab", { name: "练习", exact: true }).click();
  await expect(page.locator(".course-practice")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "课程单元" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: "screenshots/course-detail/practice-desktop.png",
  });
  await page.getByRole("tab", { name: "单元", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "课程单元" }),
  ).toBeVisible();
  await page.locator(".unit-navigation > button").nth(1).click();
  await expect(page.locator(".unit-heading h2")).toContainText(
    "理解能力与边界",
  );
  await expect(page.locator(".unit-heading h2")).toBeFocused();
  await expect
    .poll(
      async () =>
        (await page.locator(".unit-heading .date-caption").boundingBox()).y,
    )
    .toBeGreaterThanOrEqual(0);
  await expect(page.locator(".next-lesson-strip a")).toHaveAttribute(
    "href",
    await page.locator(".lesson-title-row > a").first().getAttribute("href"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173/course/how-ai-works");
  await settle();
  await page.locator(".unit-navigation > button").nth(1).click();
  await expect(page.locator(".unit-heading h2")).toBeFocused();
  await expect
    .poll(async () => (await page.locator(".unit-heading h2").boundingBox()).y)
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(async () => (await page.locator(".unit-heading h2").boundingBox()).y)
    .toBeLessThan(150);
  const selectedLesson = await page
    .locator(".lesson-title-row > a")
    .first()
    .getAttribute("href");
  await expect(page.locator(".next-lesson-strip a")).toHaveAttribute(
    "href",
    selectedLesson,
  );
  await expect
    .poll(
      async () =>
        (await page.locator(".unit-heading .date-caption").boundingBox()).y,
    )
    .toBeGreaterThanOrEqual(0);
  await page.screenshot({
    path: "screenshots/course-detail/selected-unit-mobile.png",
  });
  await page.locator(".next-lesson-strip a").click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${selectedLesson}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173/course/how-ai-works");
  await settle();
  await page.getByRole("button", { name: "下一单元", exact: true }).click();
  await expect(page.locator(".unit-heading h2")).toContainText(
    "理解能力与边界",
  );
  await expect(page.locator(".unit-heading h2")).toBeFocused();
  await expect
    .poll(async () => (await page.locator(".unit-heading h2").boundingBox()).y)
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(async () => (await page.locator(".unit-heading h2").boundingBox()).y)
    .toBeLessThan(200);
  console.log(
    "PASS Unit selection reveals and focuses the current heading; next lesson stays inside the selected unit on desktop/mobile",
  );
  await page.getByRole("tab", { name: "单元", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "资料", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "编辑课程", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出课程讲义", exact: true }).click();
  assert((await file).suggestedFilename().endsWith(".md"));
  await page.getByRole("button", { name: "安排学习", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  console.log(
    "PASS Outline, materials, practice, dashboard, unit navigation, keyboard tabs, edit, schedule and export",
  );
  await page.getByRole("button", { name: "加入我的课程", exact: true }).click();
  await expect(page.locator(".course-enroll-row a")).toHaveText("开始学习");
  await page.locator(".course-enroll-row a").click();
  await expect(page).toHaveURL(/\/learn\/how-ai-works\//);
  // The optional cover mark remains available on shared cards elsewhere.
  await page.goto("http://127.0.0.1:5173/marketplace");
  await expect(page.locator(".course-card .cover-mark").first()).toBeAttached();
  await expect
    .poll(() =>
      page
        .locator(".course-card img")
        .evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  assert.deepEqual(errors, []);
  await writeFile(
    "screenshots/course-detail/verification.json",
    JSON.stringify(
      {
        scope:
          "Local course detail redesign; disposable workspace, no live AI requests",
        measurements,
        checks: [
          "actual artwork",
          "placeholder removal",
          "original cover, overlay actions and sidebar navigation composition",
          "alignment",
          "header overlap",
          "responsive",
          "view navigation",
          "keyboard",
          "course actions",
          "enrollment to classroom",
          "selected-unit lesson and content navigation",
          "shared cover compatibility",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS Enrollment opens the classroom; shared course-card cover rendering preserved",
  );
} finally {
  await browser.close();
}
