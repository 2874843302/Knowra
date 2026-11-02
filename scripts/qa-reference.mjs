import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 2048, height: 1017 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const measurements = {};
const routes = {
  home: "/",
  courses: "/courses",
  marketplace: "/marketplace",
  detail: "/course/linear-algebra",
  classroom: "/learn/linear-algebra/vectors",
};
async function visit(route) {
  await page.goto(`http://127.0.0.1:5173${route}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".page, .classroom").first()).toBeVisible();
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map(async (image) => {
        image.loading = "eager";
        try {
          await image.decode();
        } catch {
          /* Report failed assets in the health assertion. */
        }
      }),
    );
  });
}
async function bounds(selector) {
  return page.locator(selector).first().boundingBox();
}
function near(actual, expected, label, tolerance = 2) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual}, expected ${expected}`,
  );
}
try {
  await visit("/");
  measurements.home = {
    sidebar: await bounds(".sidebar"),
    composer: await bounds(".composer"),
    ticket: await bounds(".course-card"),
  };
  near(measurements.home.sidebar.width, 240, "Reference sidebar");
  near(measurements.home.composer.width, 1004, "Reference home composer width");
  const layout = await bounds(".main-shell");
  near(
    measurements.home.composer.x,
    layout.x + (layout.width - measurements.home.composer.width) / 2,
    "Composer centered beside sidebar with reserved scrollbar gutter",
  );
  near(measurements.home.composer.y, 234, "Reference home composer top", 12);
  near(measurements.home.ticket.width, 290, "Reference course ticket width");
  await visit("/courses");
  measurements.courses = {
    ticket: await bounds(".learning-ticket"),
    rail: await bounds(".course-right-rail"),
  };
  near(measurements.courses.ticket.width, 620, "Reference course list width");
  near(
    measurements.courses.ticket.height,
    210,
    "Reference horizontal ticket height",
  );
  near(measurements.courses.rail.width, 320, "Reference right rail width");
  console.log("PASS Reference layout measurements at 2048px");
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const [name, route] of Object.entries(routes)) {
      await visit(route);
      const health = await page.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= innerWidth,
        images: [
          ...document.querySelectorAll(".page img, .classroom img"),
        ].every((image) => image.complete && image.naturalWidth > 0),
      }));
      assert(health.fits, `${name} ${width}: horizontal overflow`);
      assert(health.images, `${name} ${width}: broken image`);
      if ([390, 1440].includes(width)) {
        await page.screenshot({
          path: `screenshots/reference-local-${name}-${width}.png`,
          fullPage: name !== "classroom",
          animations: "disabled",
        });
      }
    }
    console.log(`PASS Reference surfaces at ${width}px`);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "qa-reference-results.json",
    JSON.stringify(
      {
        measurements,
        widths: [360, 390, 768, 1024, 1440, 1920],
        routes,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
