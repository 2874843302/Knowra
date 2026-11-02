import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const output = path.resolve("screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const viewport of [
  { width: 1440, height: 1100 },
  { width: 390, height: 844 },
]) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
  for (const [route, name] of [
    ["/", "home"],
    ["/marketplace", "marketplace"],
    ["/course/linear-algebra", "course"],
    ["/learn/linear-algebra/matrices", "classroom"],
  ]) {
    await page.goto(`http://127.0.0.1:5173${route}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(output, `${name}-${viewport.width}.png`),
      fullPage: route.startsWith("/learn") ? false : true,
    });
    if (name === "course") {
      await page.getByRole("button", { name: "课程大纲", exact: true }).click();
      await page.screenshot({
        path: path.join(output, `units-${viewport.width}.png`),
        fullPage: true,
      });
    }
    console.log(
      name,
      viewport.width,
      await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        images: [...document.images].every(
          (i) => i.complete && i.naturalWidth > 0,
        ),
      })),
    );
  }
  await context.close();
}
await browser.close();
