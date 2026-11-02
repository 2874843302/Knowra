import { mockCourseResearch } from "./fixtures/course-research.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const fixtures = path.resolve("../../work/qa-fixtures");
await mkdir(fixtures, { recursive: true });
await writeFile(
  path.join(fixtures, "learning-notes.txt"),
  "Knowra learning notes: active recall and spaced repetition.",
);
const docx = new JSZip();
docx.file(
  "[Content_Types].xml",
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
);
docx.file(
  "_rels/.rels",
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
);
docx.file(
  "word/document.xml",
  '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Knowra document fixture text</w:t></w:r></w:p></w:body></w:document>',
);
await writeFile(
  path.join(fixtures, "learning-document.docx"),
  await docx.generateAsync({ type: "nodebuffer" }),
);
const pptx = new JSZip();
pptx.file(
  "ppt/slides/slide1.xml",
  '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Knowra slide fixture text</a:t></a:r></a:p></p:sld>',
);
await writeFile(
  path.join(fixtures, "learning-slides.pptx"),
  await pptx.generateAsync({ type: "nodebuffer" }),
);
const pdfObjects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
const pdfStream = "BT /F1 16 Tf 50 720 Td (Knowra PDF fixture text) Tj ET";
pdfObjects.push(
  `<< /Length ${pdfStream.length} >>\nstream\n${pdfStream}\nendstream`,
);
let pdf = "%PDF-1.4\n";
const offsets = [0];
pdfObjects.forEach((object, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
  .join(
    "",
  )}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
await writeFile(path.join(fixtures, "learning-reading.pdf"), pdf);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
await context.route("**/api/provider", (route) =>
  route.fulfill({ json: { configured: false, baseUrl: "", model: "" } }),
);
await context.route("**/api/ai", (route) =>
  route.fulfill({ status: 503, json: { error: "请先在设置中连接 AI 模型。" } }),
);
await mockCourseResearch(context);
const page = await context.newPage();
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
async function step(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS", name);
}
const goto = (route) => page.goto(`http://127.0.0.1:5173${route}`);
try {
  await step(
    "Home, mode switch, and honest unconfigured AI state",
    async () => {
      await goto("/");
      await expect(
        page.getByRole("heading", { name: /打造你的专属课程/ }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "即时协助" }).click();
      await page
        .getByRole("textbox", { name: "学习主题" })
        .fill("解释主动回忆");
      await page.getByRole("button", { name: "开始对话", exact: true }).click();
      await expect(page).toHaveURL(/assistant\//);
      await expect(page.getByRole("textbox", { name: "输入问题" })).toHaveValue(
        "解释主动回忆",
      );
      await page.getByRole("button", { name: "发送问题", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("连接 AI 模型");
    },
  );
  await step(
    "Marketplace search, bookmarking and course enrollment",
    async () => {
      await goto("/marketplace");
      await page
        .getByRole("textbox", { name: "搜索课程集市" })
        .fill("认知心理学");
      await expect(page.locator(".course-card")).toHaveCount(1);
      await page.getByRole("button", { name: "收藏课程", exact: true }).click();
      await page.getByRole("button", { name: "我的收藏", exact: true }).click();
      await expect(page.locator(".course-card")).toHaveCount(1);
      await page
        .getByRole("heading", { name: "认知心理学：理解自己", exact: true })
        .click();
      await page
        .getByRole("button", { name: "加入我的课程", exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: "开始学习", exact: true }).first(),
      ).toBeVisible();
    },
  );
  await step("Actual TXT, DOCX, PPTX and PDF text extraction", async () => {
    await page.getByRole("tab", { name: "资料", exact: true }).click();
    await page
      .locator("input[type=file]")
      .setInputFiles(
        [
          "learning-notes.txt",
          "learning-document.docx",
          "learning-slides.pptx",
          "learning-reading.pdf",
        ].map((f) => path.join(fixtures, f)),
      );
    await expect(page.locator(".material-row")).toHaveCount(4, {
      timeout: 20000,
    });
    for (const [file, text] of [
      ["learning-notes.txt", "active recall"],
      ["learning-document.docx", "Knowra document fixture text"],
      ["learning-slides.pptx", "Knowra slide fixture text"],
      ["learning-reading.pdf", "Knowra PDF fixture text"],
    ]) {
      await page
        .getByRole("button", { name: new RegExp(file.replace(".", "\\.")) })
        .filter({ has: page.locator("strong") })
        .click();
      await expect(page.locator(".material-preview")).toContainText(text);
      await page.getByRole("button", { name: "关闭", exact: true }).click();
    }
  });
  await step(
    "Wrong and correct quiz feedback, notes persistence, and completion",
    async () => {
      await goto("/learn/cognitive/memory");
      await page.getByRole("tab", { name: "随堂练习", exact: true }).click();
      await page.getByRole("button", { name: /A 始终等价/ }).click();
      await page.getByRole("button", { name: "检查答案" }).click();
      await expect(page.getByRole("status")).toContainText("再看一下");
      await page.getByRole("button", { name: "重新作答" }).click();
      await page.getByRole("button", { name: /B 不一定/ }).click();
      await page.getByRole("button", { name: "检查答案" }).click();
      await expect(page.getByRole("status")).toContainText("理解得很准确");
      await page.getByRole("tab", { name: "我的笔记", exact: true }).click();
      await page
        .getByRole("textbox", { name: "我的课堂笔记" })
        .fill("主动回忆：合上资料后独立解释。");
      await page.reload();
      await page.getByRole("tab", { name: "我的笔记", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "我的课堂笔记" }),
      ).toHaveValue("主动回忆：合上资料后独立解释。");
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "导出笔记", exact: true }).click();
      assert.ok((await downloaded).suggestedFilename().endsWith(".md"));
      await page.getByRole("button", { name: "标记为已学完" }).click();
      await page.getByRole("link", { name: "下一讲", exact: true }).click();
      await page.getByRole("button", { name: "标记为已学完" }).click();
      await goto("/courses");
      await page.getByRole("tab", { name: "已完成", exact: true }).click();
      await expect(page.locator(".learning-ticket")).toHaveCount(1);
      await expect(page.locator(".learning-ticket-progress")).toContainText(
        "100%",
      );
    },
  );
  await step("Calendar task creation, completion, and deletion", async () => {
    await goto("/feed");
    await page
      .getByRole("button", { name: "添加学习任务", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "学习内容" })
      .fill("复习向量和矩阵");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    await expect(page.locator(".task-item")).toHaveCount(1);
    await page
      .getByRole("checkbox", { name: "完成复习向量和矩阵", exact: true })
      .click();
    await expect(page.locator(".task-item")).toHaveClass(/completed/);
    await page.reload();
    await expect(page.locator(".task-item")).toHaveClass(/completed/);
    await page
      .getByRole("button", { name: "删除任务复习向量和矩阵", exact: true })
      .click();
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.locator(".task-item")).toHaveCount(0);
    await page.getByRole("tab", { name: "周", exact: true }).click();
    await expect(page.locator(".calendar-grid>button")).toHaveCount(7);
    await page.getByRole("tab", { name: "月", exact: true }).click();
    await expect(page.locator(".calendar-grid>button")).toHaveCount(42);
  });
  await step("Custom course creation, local profile, and history", async () => {
    await goto("/courses");
    await page
      .locator("main.page")
      .getByRole("button", { name: "创建课程", exact: true })
      .click();
    await page
      .getByRole("button", { name: "自己编排课程", exact: true })
      .click();
    await page.getByRole("tab", { name: "自主创建", exact: true }).click();
    await page
      .getByRole("textbox", { name: "课程名称" })
      .fill("我的数据可视化课程");
    await page
      .getByRole("textbox", { name: "课程单元" })
      .fill("图表基础\n视觉编码");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "创建课程", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "我的数据可视化课程", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "课程大纲", exact: true }).click();
    await expect(page.locator(".unit-navigation>button")).toHaveCount(2);
    await goto("/settings");
    await page.getByRole("textbox", { name: "称呼", exact: true }).fill("小知");
    await page.getByRole("button", { name: "保存档案", exact: true }).click();
    await goto("/");
    await expect(page.locator(".header-actions .avatar")).toHaveAttribute(
      "title",
      "小知",
    );
    await goto("/history");
    await expect(page.locator(".ui-history-record")).toHaveCount(6);
    await page.getByRole("textbox", { name: "搜索历史记录" }).fill("完成学习");
    await expect(page.locator(".ui-history-record")).toHaveCount(2);
  });
  await step(
    "AI course creation with a fixture provider contract",
    async () => {
      await page.route("**/api/provider", (route) =>
        route.fulfill({
          json: {
            configured: true,
            baseUrl: "http://fixture/v1",
            model: "fixture-model",
          },
        }),
      );
      await page.route("**/api/ai", (route) =>
        route.fulfill({
          json: {
            content: JSON.stringify({
              title: "测试生成课程",
              description: "Fixture course",
              units: [
                {
                  title: "测试单元",
                  lessons: [
                    {
                      title: "测试讲次",
                      summary: "测试目标",
                      points: ["测试要点"],
                      content:
                        "## 测试教材\n\n这是用于验证生成流程的固定测试资料。",
                      teaching: {
                        steps: [
                          {
                            title: "测试板书",
                            board: "**概念 → 例子 → 练习**",
                            narration:
                              "先从一个具体的例子理解这个概念，再试着用自己的语言解释，最后通过练习检查理解是否正确。",
                          },
                        ],
                      },
                      quiz: {
                        question: "测试题目",
                        options: ["对", "错"],
                        answer: 0,
                        explanation: "测试解析",
                      },
                    },
                  ],
                },
              ],
            }),
          },
        }),
      );
      await mockCourseResearch(page);
      await goto("/");
      await page
        .getByRole("textbox", { name: "学习主题" })
        .fill("测试生成课程");
      await page
        .locator(".composer")
        .getByRole("button", { name: "创建课程", exact: true })
        .click();
      await page.getByRole("radio", { name: /^刚刚开始/ }).click();
      await page.getByRole("radio", { name: /^前端交互/ }).click();
      await page.getByRole("radio", { name: /^购物车项目/ }).click();
      await page
        .getByRole("button", { name: "确认方向，生成蓝图", exact: true })
        .click();
      await expect(page.locator(".generation-blueprint")).toContainText(
        "测试生成课程",
      );
      await page
        .getByRole("button", { name: "确认蓝图，生成课程", exact: true })
        .click();
      await page.getByRole("link", { name: "查看课程", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "测试生成课程", exact: true }),
      ).toBeVisible();
      await page.unroute("**/api/provider");
      await page.unroute("**/api/ai");
    },
  );
  await step(
    "Responsive routes have no document overflow or broken images",
    async () => {
      for (const width of [360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of [
          "/",
          "/courses",
          "/marketplace",
          "/course/linear-algebra",
          "/learn/linear-algebra/matrices",
          "/feed",
          "/settings",
          "/history",
          "/assistant",
          "/signup",
        ]) {
          await goto(route);
          await page.waitForTimeout(80);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            ),
            false,
            `${width} ${route} horizontal overflow`,
          );
          assert.equal(
            await page.evaluate(() =>
              [...document.images].some((i) => i.complete && !i.naturalWidth),
            ),
            false,
            `${width} ${route} broken image`,
          );
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await goto("/learn/linear-algebra/matrices");
      await page.getByRole("tab", { name: "导师", exact: true }).click();
      await expect(page.locator(".class-tutor")).toBeVisible();
      await page.getByRole("tab", { name: "课堂", exact: true }).click();
      await expect(page.locator(".class-tutor")).not.toBeVisible();
      await page.getByRole("button", { name: "大纲", exact: true }).click();
      await expect(page.locator(".class-outline")).toBeVisible();
      await page.getByRole("button", { name: "收起大纲", exact: true }).click();
      await expect(page.locator(".class-outline")).not.toBeVisible();
    },
  );
  assert.deepEqual(errors, [], "No uncaught browser errors");
  await writeFile(
    path.resolve("qa-results.json"),
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        uncaughtErrors: errors,
        liveProviderTested: false,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `All ${checks.length} checks passed; no uncaught browser errors.`,
  );
} finally {
  await browser.close();
}
