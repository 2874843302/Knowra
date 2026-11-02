import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const workspace = crypto.randomUUID();
const seed = initialState();
seed.courseEdits = {
  "linear-algebra": {
    description: "从向量到线性变换，理解每一步推导背后的几何意义。".repeat(12),
  },
};
await context.addInitScript(
  ({ workspace, seed }) => {
    if (!localStorage.getItem("knowra-workspace-id")) {
      localStorage.setItem("knowra-workspace-id", workspace);
      localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
    }
  },
  { workspace, seed },
);
let provider = { configured: false, baseUrl: "", model: "" };
let rejectProvider = true;
let rejectWorkspace = false;
await context.route("**/api/provider", async (route) => {
  if (route.request().method() === "PUT") {
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (rejectProvider)
      return route.fulfill({
        status: 503,
        json: { error: "暂时无法保存，请重试。" },
      });
    const { baseUrl, model } = route.request().postDataJSON();
    provider = { configured: true, baseUrl, model };
  }
  await route.fulfill({ json: provider });
});
await context.route("**/api/workspace", async (route) => {
  if (route.request().method() === "PATCH" && rejectWorkspace) {
    rejectWorkspace = false;
    return route.fulfill({ status: 503, json: { error: "同步暂时不可用" } });
  }
  await route.continue();
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
let passed = false;
await mkdir("screenshots/interactions", { recursive: true });
async function visit(path) {
  await page.goto(`http://127.0.0.1:5173${path}`);
  await expect(page.locator(".page")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function step(name, test) {
  await test();
  checks.push(name);
  console.log("PASS", name);
}
async function sampleHeight(locator, action) {
  await locator.evaluate((element) => {
    window.disclosureSamples = [];
    const until = performance.now() + 450;
    const sample = () => {
      window.disclosureSamples.push(element.getBoundingClientRect().height);
      if (performance.now() < until) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await action();
  await page.waitForTimeout(500);
  return page.evaluate(() => window.disclosureSamples);
}
try {
  await step(
    "Profile edits can be discarded; failed saves remain local and retry persists both fields",
    async () => {
      await visit("/settings");
      const save = page.getByRole("button", { name: "保存档案", exact: true });
      await expect(save).toBeDisabled();
      await page.getByLabel("称呼", { exact: true }).fill("交互验证");
      await page.getByRole("button", { name: "增加目标", exact: true }).click();
      await expect(
        page.getByText("有未保存的更改", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "撤销档案修改", exact: true })
        .click();
      await expect(page.getByLabel("称呼", { exact: true })).toHaveValue(
        seed.name,
      );
      await expect(page.locator(".goal-value")).toHaveText(
        `${seed.dailyGoal} 分钟`,
      );
      await page.getByLabel("称呼", { exact: true }).fill("交互验证");
      await page.getByRole("button", { name: "增加目标", exact: true }).click();
      rejectWorkspace = true;
      await save.click();
      await expect(
        page.getByText("正在保存档案…", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("保留在本机，点击保存重试", { exact: true }),
      ).toBeVisible();
      await save.click();
      await expect(page.getByText("档案已保存", { exact: true })).toBeVisible();
      await expect(save).toBeDisabled();
      const persisted = await page.evaluate(async () =>
        (
          await fetch("/api/workspace", {
            headers: {
              "X-Workspace-Id": localStorage.getItem("knowra-workspace-id"),
            },
          })
        ).json(),
      );
      assert.equal(persisted.state.name, "交互验证");
      assert.equal(persisted.state.dailyGoal, seed.dailyGoal + 15);
      await page.screenshot({
        path: "screenshots/interactions/settings-saved-1440.png",
      });
    },
  );
  await step(
    "Secret visibility, pending feedback, provider failure and successful retry",
    async () => {
      await page
        .getByLabel("接口地址", { exact: false })
        .fill("https://fixture.invalid/v1");
      await page.getByLabel("模型名称", { exact: false }).fill("fixture-model");
      const key = page.getByLabel("API 密钥", { exact: true });
      await key.fill("fixture-only-secret");
      await page.getByRole("button", { name: "显示密钥", exact: true }).click();
      await expect(key).toHaveAttribute("type", "text");
      await page.getByRole("button", { name: "隐藏密钥", exact: true }).click();
      await expect(key).toHaveAttribute("type", "password");
      const save = page.getByRole("button", { name: "保存连接", exact: true });
      const before = await save.boundingBox();
      await save.click();
      await expect(
        page.getByText("正在保存连接…", { exact: true }),
      ).toBeVisible();
      const pending = await save.boundingBox();
      assert.equal(pending.width, before.width, "loading resized save control");
      await expect(
        page.getByText("暂时无法保存，请重试。", { exact: true }),
      ).toBeVisible();
      await expect(key).toHaveValue("fixture-only-secret");
      rejectProvider = false;
      await save.click();
      await expect(
        page.getByText("连接配置已保存", { exact: true }),
      ).toBeVisible();
      await expect(key).toHaveValue("");
      await expect(save).toBeDisabled();
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${width}: settings overflow`,
        );
        const field = await key.boundingBox();
        const toggle = await page
          .getByRole("button", { name: "显示密钥", exact: true })
          .boundingBox();
        assert(
          toggle.x >= field.x &&
            toggle.x + toggle.width <= field.x + field.width,
          `${width}: secret toggle outside field`,
        );
        assert(
          Math.abs(
            toggle.y + toggle.height / 2 - (field.y + field.height / 2),
          ) < 1,
          `${width}: secret toggle not centered`,
        );
        await page.screenshot({
          path: `screenshots/interactions/settings-${width}.png`,
          fullPage: true,
        });
      }
    },
  );
  await step(
    "Composer disclosures animate, preserve drafts and hide course-only hints in assist mode",
    async () => {
      for (const width of [1440, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await visit("/");
        const textarea = page.getByRole("textbox", {
          name: "学习主题",
          exact: true,
        });
        const compactHeight = (await textarea.boundingBox()).height;
        await textarea.fill(
          Array.from(
            { length: 14 },
            () => "测试长内容，输入框应按内容增高。",
          ).join("\n"),
        );
        const expandedHeight = (await textarea.boundingBox()).height;
        assert(
          expandedHeight > compactHeight && expandedHeight <= 240,
          `${width}: composer height ${compactHeight} -> ${expandedHeight} does not resize within its limit`,
        );
        await page
          .getByRole("textbox", { name: "学习主题", exact: true })
          .fill("保留正在输入的学习主题");
        const composerTop = (await page.locator(".composer").boundingBox()).y;
        const trigger = page.getByRole("button", {
          name: "从一个主题开始",
          exact: false,
        });
        await trigger.click();
        await expect(
          page.getByRole("button", { name: "理解大语言模型", exact: true }),
        ).toBeVisible();
        const samples = await sampleHeight(
          page.locator("#composer-suggestions"),
          () => trigger.click(),
        );
        const start = Math.max(...samples);
        assert(
          samples.some((height) => height > 1 && height < start - 1),
          "disclosure snapped instead of transitioning",
        );
        await expect(page.locator("#composer-suggestions")).toHaveCount(0);
        await page.getByRole("tab", { name: "学校同步", exact: true }).click();
        await expect(page.locator(".school-note")).toBeVisible();
        await page.getByRole("tab", { name: "即时协助", exact: true }).click();
        await expect(page.locator(".school-note")).toHaveCount(0);
        assert(
          Math.abs(
            (await page.locator(".composer").boundingBox()).y - composerTop,
          ) < 1,
          `${width}: mode switch moved the input surface`,
        );
        await expect(
          page.getByRole("textbox", { name: "学习主题", exact: true }),
        ).toHaveValue("保留正在输入的学习主题");
        await page.screenshot({
          path: `screenshots/interactions/composer-assist-${width}.png`,
        });
      }
    },
  );
  await step(
    "Course description and lecture details expand smoothly and restore their actions",
    async () => {
      for (const width of [1440, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await visit("/course/linear-algebra");
        const description = page.locator(".course-description");
        await expect
          .poll(() =>
            description.evaluate((element) => {
              const text = element.querySelector("p");
              const collapsed = Math.min(
                text.getBoundingClientRect().height,
                parseFloat(getComputedStyle(text).lineHeight) * 3,
              );
              return (
                Math.abs(element.getBoundingClientRect().height - collapsed) <
                0.5
              );
            }),
          )
          .toBe(true);
        const collapsed = (await description.boundingBox()).height;
        const samples = await sampleHeight(description, () =>
          page.getByRole("button", { name: "显示更多", exact: true }).click(),
        );
        const expanded = (await description.boundingBox()).height;
        assert(expanded > collapsed + 10);
        assert(
          samples.some(
            (height) => height > collapsed + 1 && height < expanded - 1,
          ),
          "description snapped instead of expanding",
        );
        const lesson = page.locator(".lesson-row").first();
        const original = (await lesson.boundingBox()).height;
        await lesson.getByRole("button", { name: /^收起/ }).click();
        await expect(
          lesson.locator('[data-slot="disclosure-content"]'),
        ).toHaveCount(0);
        assert((await lesson.boundingBox()).height < original - 20);
        await lesson.getByRole("button", { name: /^展开/ }).click();
        await expect(
          lesson.getByRole("link", { name: /开始学习|继续学习|重新学习/ }),
        ).toBeVisible();
        await page.screenshot({
          path: `screenshots/interactions/course-expanded-${width}.png`,
          fullPage: true,
        });
      }
    },
  );
  await step(
    "Reduced motion, backup feedback and invalid import recovery",
    async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await visit("/");
      await page
        .getByRole("button", { name: "从一个主题开始", exact: false })
        .click();
      await expect(page.locator("#composer-suggestions")).toBeVisible();
      await page
        .getByRole("button", { name: "从一个主题开始", exact: false })
        .click();
      await expect(page.locator("#composer-suggestions")).toHaveCount(0);
      await visit("/settings");
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "导出备份", exact: true }).click();
      await download;
      await expect(page.getByText("备份已导出", { exact: true })).toBeVisible();
      await page.locator('input[type="file"]').setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from("{}"),
      });
      await expect(
        page.getByText("备份格式不正确，请选择知序导出的 JSON 文件", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "导入备份", exact: true }),
      ).toBeEnabled();
      const toast = page.locator("[data-sonner-toast]").first();
      await expect(toast).toBeVisible();
      const box = await toast.boundingBox();
      assert(
        box.x >= 0 && box.x + box.width <= 390,
        "mobile notification outside viewport",
      );
      assert.deepEqual(errors, []);
    },
  );
  passed = true;
} finally {
  await writeFile(
    "qa-interactions-results.json",
    JSON.stringify({ passed, checks, errors }, null, 2),
  );
  await context.close();
  await browser.close();
}
