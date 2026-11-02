import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog, initialState } from "../src/data.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/writing-pencil", { recursive: true });
try {
  for (const [width, reducedMotion] of [
    [1440, "no-preference"],
    [390, "no-preference"],
    [1440, "reduce"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion,
    });
    const seed = initialState();
    const course = structuredClone(
      catalog.find((c) => c.id === "linear-algebra"),
    );
    course.id = "pencil-qa";
    course.units = [
      {
        title: "书写定位验证",
        lessons: [
          {
            id: "writing",
            title: "铅笔书写",
            summary: "流式文字与铅笔同步",
            points: [],
            content:
              "## 书写定位\n\n" +
              "铅笔沿着**正在生成的文字**向前移动，遇到换行时继续书写。这里也包含 English、数字 123 和表情 👩‍💻，用来检查不同字符的实际排版。".repeat(
                3,
              ) +
              "\n\n1. 列表中的文字也会逐步生成，并保持铅笔跟随在文字末端。\n\n```python\nmessage = 'A long code example with mixed characters 中文 and values 123'\n```",
          },
        ],
      },
    ];
    const writingLesson = course.units[0].lessons[0];
    writingLesson.teaching = {
      source: writingLesson.content,
      steps: [
        {
          board: writingLesson.content.split("\n\n")[1],
          narration: "观察铅笔的笔尖，文字换行后它会继续跟随。",
        },
      ],
    };
    seed.customCourses.push(course);
    await context.addInitScript(
      ({ id, seed }) => {
        localStorage.setItem("knowra-workspace-id", id);
        localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
      },
      { id: crypto.randomUUID(), seed },
    );
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: false } }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/learn/pencil-qa/writing");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".writing-pencil")).toHaveCount(0);
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect(page.locator(".writing-pencil")).toBeVisible();
    async function measure() {
      return page.locator(".writing-pencil").evaluate((pencil) => {
        const root = pencil.parentElement;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let tail;
        while (walker.nextNode())
          if (
            walker.currentNode.textContent.trim() &&
            !walker.currentNode.parentElement.closest(".writing-pencil, svg")
          )
            tail = walker.currentNode;
        const range = document.createRange();
        const end = tail.textContent.trimEnd().length;
        range.setStart(tail, end - 1);
        range.setEnd(tail, end);
        const text = range.getBoundingClientRect(),
          bounds = root.getBoundingClientRect();
        const scale = bounds.width / root.offsetWidth;
        const tipX = bounds.left + (parseFloat(pencil.style.left) - 2) * scale;
        const tipY = bounds.top + (parseFloat(pencil.style.top) + 4) * scale;
        return {
          x: parseFloat(pencil.style.left),
          y: parseFloat(pencil.style.top),
          error: Math.max(
            Math.abs(tipX - text.right),
            Math.abs(tipY - text.bottom),
          ),
          animation: getComputedStyle(pencil.firstElementChild).animationName,
          pointerEvents: getComputedStyle(pencil).pointerEvents,
        };
      });
    }
    const first = await measure();
    await page.waitForTimeout(1000);
    const second = await measure();
    assert(first.error < 2 && second.error < 2);
    assert(Math.abs(second.x - first.x) + Math.abs(second.y - first.y) > 10);
    assert.equal(
      second.animation,
      reducedMotion === "reduce" ? "none" : "teaching-pencil-write",
    );
    assert.equal(second.pointerEvents, "none");
    if (width === 390)
      assert(second.y > first.y, "pencil follows wrapped lines");
    if (width === 1440) {
      await page.getByRole("button", { name: "放大白板", exact: true }).click();
      const zoomed = await measure();
      assert(
        zoomed.error < 2,
        "CSS whiteboard zoom must retain endpoint alignment",
      );
    }
    await page.screenshot({
      path: `screenshots/writing-pencil/${width}-${reducedMotion}.png`,
    });
    await page.getByRole("button", { name: "暂停讲解", exact: true }).click();
    await expect(page.locator(".writing-pencil")).toHaveCount(0);
    await page.getByRole("button", { name: "开始讲解", exact: true }).click();
    await expect(page.locator(".writing-pencil")).toBeVisible();
    if (width === 1440 && reducedMotion === "no-preference") {
      // Let the real clock enter each block. Seeking intentionally reveals a
      // complete block and therefore must not be used to simulate generation.
      for (const step of [1, 2]) {
        await expect(
          page.locator(`.teaching-block[data-step="${step}"] .writing-pencil`),
        ).toBeVisible({ timeout: 18000 });
        assert((await measure()).error < 2);
      }
      await expect(page.locator(".writing-pencil")).toHaveCount(0, {
        timeout: 8000,
      });
    } else {
      await page
        .getByRole("button", { name: "下一步讲解", exact: true })
        .click();
      await expect(page.locator(".writing-pencil")).toHaveCount(0);
    }
    assert.deepEqual(errors, []);
    evidence.push({ width, reducedMotion, first, second });
    console.log(
      `PASS ${width}px ${reducedMotion}: pencil tracks text, wraps, zoom, pause/resume, list/code and completion`,
    );
    await context.close();
  }
  await writeFile(
    "screenshots/writing-pencil/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
