import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";

// Rendered QA uses a disposable workspace, never the learner's saved progress.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
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
await mkdir("screenshots/board-effects", { recursive: true });

async function aligned() {
  return page.locator(".board-annotation-anchor").evaluateAll((anchors) =>
    anchors.every((anchor) => {
      const mark = anchor.querySelector("[data-annotation]");
      const svg = anchor.querySelector("svg");
      if (!svg?.querySelector("path")) return false;
      const rect = mark.getBoundingClientRect();
      const stroke = svg.getBBox();
      const center = new DOMPoint(
        stroke.x + stroke.width / 2,
        stroke.y + stroke.height / 2,
      ).matrixTransform(svg.getScreenCTM());
      const centerX = center.x;
      const centerY = center.y;
      // Rough strokes deliberately wobble. Their centers must still track the text.
      return (
        Math.abs(centerX - rect.x - rect.width / 2) < 15 &&
        Math.abs(centerY - rect.y - rect.height / 2) < 15
      );
    }),
  );
}

try {
  await page.goto("http://127.0.0.1:5173/learn/python/py-values");
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "下一步讲解", exact: true }).click();
  await expect(page.locator(".binding-value")).toHaveCount(2);
  await expect.poll(aligned).toBe(true);
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  async function renderedFonts(selector) {
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector,
    });
    return (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })).fonts;
  }
  const boardFonts = await renderedFonts(".board-frame > h2");
  const controlFonts = await renderedFonts(".lesson-player-caption");
  const codeFonts = await renderedFonts(".board-frame code mark");
  assert(controlFonts.length > 0);
  assert(
    codeFonts.length > 0 &&
      !codeFonts.some((font) => /Knowra Board Hand/.test(font.familyName)),
  );
  assert(
    boardFonts.some(
      (font) => font.isCustomFont && /Knowra Board Hand/.test(font.familyName),
    ),
    JSON.stringify(boardFonts),
  );
  assert(
    !controlFonts.some((font) => /Knowra Board Hand/.test(font.familyName)),
  );
  const typography = await page
    .locator(
      ".board-frame > h2, .teaching-writing, .binding-value, .lesson-player-caption",
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node),
          rect = node.getBoundingClientRect();
        return {
          selector: node.className || node.tagName,
          width: rect.width,
          height: rect.height,
          font: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
          lineHeight: style.lineHeight,
          color: style.color,
          padding: style.padding,
          border: style.border,
          background: style.backgroundColor,
        };
      }),
    );
  const supplementalFont = await page.evaluate(async () => {
    const faces = await document.fonts.load('19px "Knowra Board Hand"', "龘");
    return faces.length > 0 && faces.every((face) => face.status === "loaded");
  });
  assert(
    supplementalFont,
    "Characters outside built-in lessons must load their local subset",
  );
  console.log(
    "PASS Chrome confirms Chinese glyphs use the local handwritten font; controls retain UI fonts",
  );

  await expect
    .poll(() =>
      page
        .locator(".teaching-block")
        .evaluateAll((nodes) =>
          nodes.every((node) => getComputedStyle(node).opacity === "1"),
        ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((animation) =>
            animation.effect?.target?.closest?.(".rough-annotation"),
          )
          .every((animation) => animation.playState !== "running"),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: "screenshots/board-effects/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(aligned).toBe(true);
  await page
    .locator(".board-frame")
    .nth(1)
    .evaluate((frame) => {
      const scroll = frame.closest(".board-scroll");
      scroll.scrollTop +=
        frame.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top -
        16;
    });
  await page.screenshot({ path: "screenshots/board-effects/mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.evaluate(() => {
    window.__boardStroke = document.querySelector(".annotation-circle > svg");
  });
  await page.getByRole("button", { name: "下一步讲解", exact: true }).click();
  assert(
    await page.evaluate(
      () =>
        window.__boardStroke ===
        document.querySelector(".annotation-circle > svg"),
    ),
  );
  const measurements = [];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await expect.poll(aligned).toBe(true);
    measurements.push(
      await page.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        annotations: document.querySelectorAll(".board-annotation-anchor")
          .length,
        strokes: document.querySelectorAll(".rough-annotation").length,
      })),
    );
    assert.equal(measurements.at(-1).annotations, measurements.at(-1).strokes);
    assert(measurements.at(-1).documentWidth <= width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".board-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect.poll(aligned).toBe(true);
  await page.screenshot({
    path: "screenshots/board-effects/checkpoint-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(aligned).toBe(true);
  await page.screenshot({
    path: "screenshots/board-effects/checkpoint-mobile.png",
  });
  // Exercise the actual classroom zoom buttons, not device scale emulation.
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "放大白板", exact: true }).click();
  try {
    await expect.poll(aligned).toBe(true);
  } catch (error) {
    console.log(
      await page.locator(".board-annotation-anchor").evaluateAll((anchors) =>
        anchors.map((anchor) => {
          const svg = anchor.querySelector("svg"),
            mark = anchor.querySelector("[data-annotation]");
          const box = svg.getBBox(),
            center = new DOMPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            ).matrixTransform(svg.getScreenCTM());
          return {
            text: mark.textContent,
            rect: mark.getBoundingClientRect().toJSON(),
            svg: svg.getBoundingClientRect().toJSON(),
            viewBox: svg.getAttribute("viewBox"),
            matrix: svg.getScreenCTM().toString(),
            center: { x: center.x, y: center.y },
          };
        }),
      ),
    );
    throw error;
  }
  for (let i = 0; i < 7; i++)
    await page.getByRole("button", { name: "缩小白板", exact: true }).click();
  await expect.poll(aligned).toBe(true);
  await page.locator(".zoom-label").click();
  await expect.poll(aligned).toBe(true);
  console.log(
    "PASS Strokes survive accumulated writing, four viewport widths and layout zoom without duplicates",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "重新讲解", exact: true }).click();
  await expect(page.locator(".rough-annotation")).toHaveCount(0);
  await page.getByRole("button", { name: "下一步讲解", exact: true }).click();
  await expect.poll(aligned).toBe(true);
  assert(
    await page
      .locator(".rough-annotation path")
      .evaluateAll((paths) =>
        paths.every((path) => getComputedStyle(path).animationName === "none"),
      ),
  );
  assert(
    await page
      .locator(".rough-annotation")
      .evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            node.getAttribute("aria-hidden") === "true" &&
            getComputedStyle(node).pointerEvents === "none",
        ),
      ),
  );
  await page.getByRole("button", { name: "选择文字", exact: true }).click();
  await page
    .locator(".teaching-writing p")
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
  const selection = await page.evaluate(() => getSelection().toString());
  assert(selection.includes("变量"));
  assert(!selection.includes("undefined"));
  await page.getByRole("tab", { name: "连续讲义", exact: true }).click();
  await expect(page.locator(".rough-annotation")).toHaveCount(0);
  assert.deepEqual(errors, []);
  const manifest = JSON.parse(
    await readFile("public/fonts/board/manifest.json", "utf8"),
  );
  await writeFile(
    "screenshots/board-effects/verification.json",
    JSON.stringify(
      {
        scope:
          "Local classroom, authored content, real Chrome rendering; no live AI",
        boardFonts,
        controlFonts,
        codeFonts,
        typography,
        supplementalFont,
        measurements,
        source: manifest.upstream,
        checks: [
          "actual Chinese font",
          "stroke alignment",
          "stable accumulated strokes",
          "resize",
          "layout zoom",
          "reduced motion",
          "selection",
          "replay and reading cleanup",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS Reduced motion, text selection, replay and reading cleanup",
  );
} finally {
  await browser.close();
}
