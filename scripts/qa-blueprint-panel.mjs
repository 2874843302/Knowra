import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";
import { newCourseDraft } from "../src/lib/course-generation.js";
import {
  interviewFixture,
  researchFixture,
} from "./fixtures/course-research.mjs";

const plan = {
  title: "Vue 3 与 Spring Boot：从界面状态到全栈购物车",
  description:
    "面向有 JavaScript 或 Java 基础的学习者，先建立前后端协作的全局认识，再完成购物车数据流转与接口联调。",
  units: [
    {
      title: "项目启动与协作边界",
      summary: "搭建前后端开发环境，厘清请求、响应和数据的流动。",
      lessons: [
        {
          title: "从一次商品查询认识全栈链路",
          summary: "沿着浏览器、接口与数据存储逐层解释请求过程。",
          points: [
            "浏览器与服务端的职责",
            "请求与响应的数据契约",
            "从页面到接口的完整路径",
          ],
        },
        {
          title: "建立可运行的前后端工程",
          summary: "分别启动应用，并验证最小接口调用。",
          points: [
            "项目结构与开发环境",
            "本地服务与跨域代理",
            "验证第一个商品接口",
          ],
        },
      ],
    },
    {
      title: "响应式界面与共享状态",
      summary: "将购物车操作组织成可复用的数据逻辑。",
      lessons: [
        {
          title: "Pinia：让不同组件共享购物车",
          summary: "区分状态、派生值和业务操作。",
          points: [
            "State：存储商品与数量",
            "Getters：计算总价",
            "Actions：统一更新购物车",
          ],
        },
        {
          title: "连接商品接口与用户反馈",
          summary: "让加载、成功与失败状态都可被用户理解。",
          points: ["统一封装请求", "加载与错误反馈", "保持页面状态同步"],
        },
      ],
    },
    {
      title: "联调验证与成果交付",
      summary: "检查真实数据的流转，并整理可演示的项目。",
      lessons: [
        {
          title: "排查联调中的常见问题",
          summary: "用可观察的请求证据定位问题。",
          points: ["请求地址与响应结构", "数据边界与校验", "失败后的恢复策略"],
        },
        {
          title: "完成购物车项目演示",
          summary: "演示添加、修改数量与总价计算的完整流程。",
          points: ["核对核心交互", "运行与演示说明", "整理下一步改进方向"],
        },
      ],
    },
  ],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = [];
await mkdir("screenshots/blueprint-panel", { recursive: true });
try {
  for (const [width, reducedMotion] of [
    [2048, "no-preference"],
    [1440, "no-preference"],
    [1024, "reduce"],
    [390, "no-preference"],
    [320, "reduce"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: width < 700 ? 844 : 1100 },
      reducedMotion,
    });
    const seed = initialState(),
      draft = newCourseDraft({ topic: "学习前端 Vue 和 Spring" });
    Object.assign(draft, {
      plan,
      phase: "review",
      confirmed: false,
      interrupted: false,
      research: researchFixture,
      questions: interviewFixture.questions,
      summary: interviewFixture.summary,
      answers: {
        foundation: "familiar",
        direction: "fullstack",
        outcome: "cart",
      },
    });
    seed.courseDrafts = { [draft.id]: draft };
    await context.addInitScript(
      ({ workspace, seed }) => {
        localStorage.setItem("knowra-workspace-id", workspace);
        localStorage.setItem("knowra-workspace-v1", JSON.stringify(seed));
      },
      { workspace: crypto.randomUUID(), seed },
    );
    let requests = 0;
    await context.route("**/api/provider", (r) =>
      r.fulfill({ json: { configured: true, model: "fixture-only" } }),
    );
    await context.route("**/api/ai", (r) => {
      requests++;
      return r.abort();
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:5173/create/${draft.id}`);
    const trigger = page.getByRole("button", { name: /课程蓝图，等你确认/ });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const panel = page.getByRole("dialog", { name: "课程蓝图与课程预览" });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("tab", { name: "课程蓝图", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("tab", { name: "课程蓝图", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    assert.match(
      await page
        .locator(".blueprint-map-viewport")
        .evaluate((e) => getComputedStyle(e).backgroundImage),
      /radial-gradient/,
    );
    await expect(page.locator(".blueprint-node-unit")).toHaveCount(3);
    await expect(page.locator(".blueprint-node-lesson")).toHaveCount(6);
    await expect(page.locator(".blueprint-node-point")).toHaveCount(18);
    await expect
      .poll(() =>
        page
          .locator(".blueprint-node")
          .evaluateAll((nodes) =>
            nodes.every(
              (e) => getComputedStyle(e.parentElement).opacity === "1",
            ),
          ),
      )
      .toBe(true);
    const geometry = await panel.boundingBox();
    assert(geometry.x >= 0 && geometry.x + geometry.width <= width + 1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    if (width >= 1440) {
      const chat = await page.locator(".generation-chat").boundingBox();
      assert(
        chat.x + chat.width < geometry.x,
        "Conversation must remain beside the blueprint",
      );
      const input = page.getByRole("textbox", {
        name: "课程生成对话",
        exact: true,
      });
      await input.fill("保留原来的学习目标");
      await expect(panel).toBeVisible();
      const composer = await page.locator(".generation-composer").boundingBox();
      assert(
        composer.x + composer.width < geometry.x,
        "Composer must remain usable beside the panel",
      );
    }
    await page.screenshot({
      path: `screenshots/blueprint-panel/map-${width}.png`,
    });
    const output = panel.getByRole("status", { name: "蓝图缩放比例" });
    const beforeZoom = await output.textContent();
    await panel.getByRole("button", { name: "放大蓝图", exact: true }).click();
    assert.notEqual(await output.textContent(), beforeZoom);
    await panel
      .getByRole("button", { name: "适应蓝图宽度", exact: true })
      .click();
    await page.locator(".blueprint-node-unit").first().click();
    await expect(
      panel.getByRole("complementary", { name: "蓝图节点详情" }),
    ).toContainText(plan.units[0].summary);
    await panel
      .getByRole("button", { name: "关闭节点详情", exact: true })
      .click();
    if (width >= 1440) {
      for (
        let i = 0;
        i < 12 &&
        (await panel
          .getByRole("button", { name: "放大蓝图", exact: true })
          .isEnabled());
        i++
      )
        await panel
          .getByRole("button", { name: "放大蓝图", exact: true })
          .click();
      const viewport = page.locator(".blueprint-map-viewport");
      await viewport.evaluate((e) => e.scrollTo(0, 0));
      const rect = await viewport.boundingBox();
      await page.mouse.move(rect.x + 10, rect.y + 10);
      await page.mouse.down();
      await page.mouse.move(rect.x - 70, rect.y - 50, { steps: 6 });
      await page.mouse.up();
      assert(
        await viewport.evaluate((e) => e.scrollLeft > 20 && e.scrollTop > 20),
        "Dragging the canvas must pan both axes",
      );
      await panel
        .getByRole("button", { name: "展开蓝图全屏", exact: true })
        .click();
      assert((await panel.boundingBox()).width > width - 35);
      await panel
        .getByRole("button", { name: "退出蓝图全屏", exact: true })
        .click();
    }
    await panel.getByRole("tab", { name: "课程蓝图", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      panel.getByRole("tab", { name: "课程", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".blueprint-preview-lesson")).toHaveCount(6);
    assert.equal(
      await page.locator(".blueprint-preview-quiz").count(),
      0,
      "Do not invent unfinished exercises",
    );
    await expect(panel).toContainText("已生成 0 / 3 个单元");
    await page.waitForTimeout(reducedMotion === "reduce" ? 0 : 220);
    await page.screenshot({
      path: `screenshots/blueprint-panel/course-${width}.png`,
    });
    const previewOverflow = await page
      .locator(".blueprint-panel-course-tab")
      .evaluate((e) => e.scrollWidth > e.clientWidth + 1);
    assert.equal(previewOverflow, false);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(panel).toBeVisible();
    await panel
      .getByRole("button", { name: "关闭课程蓝图", exact: true })
      .click();
    assert.equal(
      requests,
      0,
      "Previewing must never generate paid model calls",
    );
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      reducedMotion,
      geometry,
      nodes: 27,
      documentOverflow: overflow,
      previewOverflow,
      requests,
      errors,
    });
    console.log(
      `PASS ${width}px ${reducedMotion}: actual plan graph, preview, zoom, node details, focus, independent panel and no model calls`,
    );
    await context.close();
  }
  await writeFile(
    "screenshots/blueprint-panel/verification.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
