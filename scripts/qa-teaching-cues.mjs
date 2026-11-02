import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { initialState, validateOutline } from "../src/data.js";
import { lessonSequence } from "../src/lib/lesson-sequence.js";
import { mkdir, writeFile } from "node:fs/promises";

const narration =
  "先想象水杯倒满了却还在接水。不要急着背定义，我们先观察水位为什么会变化。现在写下这个关系，比较流入与流出。看这条路径，先比较两边水量，再观察水位。最后强调结论，流入多于流出才会让存量增加。";
const course = {
  id: "qa-delivery-cues",
  title: "讲解同步验证",
  units: validateOutline({
    title: "同步验证",
    units: [
      {
        title: "存量",
        lessons: [
          {
            title: "水杯",
            content: "## 水量变化\n\n比较流入与流出。",
            teaching: {
              steps: [
                {
                  title: "比较流入与流出",
                  board: "流入 > 流出 → **存量增加**",
                  narration,
                  role: "example",
                  delivery: {
                    write: "现在写下",
                    visual: "看这条路径",
                    emphasis: "最后强调结论",
                  },
                  annotations: [{ kind: "highlight", snippet: "存量增加" }],
                  visual: {
                    type: "diagram",
                    layout: "flow",
                    title: "水位如何变化",
                    nodes: [
                      { label: "比较流量", detail: "流入与流出" },
                      { label: "水位变化", detail: "比较后得到净流入" },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  }),
};
const lesson = course.units[0].lessons[0],
  sequence = lessonSequence(lesson.content, lesson),
  key = `${course.id}/${lesson.id}`;
const seed = initialState();
seed.customCourses = [course];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
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
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:5173/learn/${key}`);
  const writing = page.locator(".teaching-writing").first(),
    diagram = page.locator(".teaching-diagram");
  await expect(writing).toHaveAttribute("data-write-progress", "0.000");
  await expect(diagram).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => localStorage.getItem("knowra-server-base-v2") !== null,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await expect
    .poll(
      async () => Number(await writing.getAttribute("data-write-progress")),
      { timeout: 7000 },
    )
    .toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
  const paused = Number(await writing.getAttribute("data-write-progress"));
  assert(paused < 1, "pause must occur during writing");
  await page.waitForTimeout(350);
  assert.equal(
    Number(await writing.getAttribute("data-write-progress")),
    paused,
  );
  await page.reload();
  await expect(writing).toHaveAttribute(
    "data-write-progress",
    paused.toFixed(3),
  );
  await expect(diagram).toHaveCount(0);
  await page.getByRole("button", { name: "开始讲解", exact: true }).click();
  await expect(diagram).toBeVisible({ timeout: 10000 });
  await expect(diagram).toHaveAttribute("data-revealed", "1");
  const annotations = writing.locator('[data-annotation="highlight"]');
  await expect(annotations).toHaveCount(0);
  await expect(annotations).toHaveCount(1, { timeout: 12000 });
  await expect(diagram).toHaveAttribute("data-revealed", "2", {
    timeout: 10000,
  });
  await expect(writing).toHaveAttribute("data-write-progress", "1.000");
  await mkdir("screenshots/generative-teaching", { recursive: true });
  await page.screenshot({
    path: "screenshots/generative-teaching/delivery-cues.png",
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "screenshots/generative-teaching/delivery-cues.json",
    JSON.stringify(
      {
        paused,
        writeStart: sequence.steps[0].writeStart,
        restored: true,
        visualDelayed: true,
        emphasisDelayed: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS narration-driven writing/diagram/emphasis, pause, reload and resume",
  );
} finally {
  await browser.close();
}
