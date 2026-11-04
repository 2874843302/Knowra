import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { initialState } from "../src/data.js";
import {
  interviewFixture,
  researchFixture,
} from "./fixtures/course-research.mjs";

// Entirely fixture-backed, including authentication and workspace persistence.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const folder = ".test/report/learning-mode";
await mkdir(folder, { recursive: true });
const model = JSON.parse(
  await readFile("scripts/fixtures/mcp-course.json", "utf8"),
);
const results = [];
try {
  for (const mode of ["school", "self"]) {
    let state = initialState(),
      revision = 0,
      planCalls = 0;
    const requests = [],
      errors = [],
      lectureCalls = new Map();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const payload = route.request().postDataJSON();
      if (path === "/api/auth/me")
        return route.fulfill({
          json: {
            user: {
              id: "mode-fixture",
              name: "学习者",
              email: "mode@example.test",
              workspaceId: "mode-fixture",
            },
          },
        });
      if (path === "/api/provider")
        return route.fulfill({
          json: {
            configured: true,
            model: "fixture-only",
            baseUrl: "http://127.0.0.1:9999/v1",
          },
        });
      if (path === "/api/workspace") {
        if (route.request().method() === "PATCH") {
          for (const operation of payload.operations) {
            let parent = state;
            for (const key of operation.path.slice(0, -1))
              parent = parent[key] ??= {};
            const key = operation.path.at(-1);
            if (operation.op === "remove") delete parent[key];
            else parent[key] = operation.value;
          }
          revision++;
        } else if (payload?.state) state = payload.state;
        return route.fulfill({ json: { state, revision } });
      }
      if (path === "/api/course-research")
        return route.fulfill({ json: researchFixture });
      if (path === "/api/ai") {
        requests.push(payload);
        let result;
        if (payload.kind === "course_search")
          result = { queries: researchFixture.queries };
        else if (payload.kind === "course_questions") result = interviewFixture;
        else if (payload.kind === "course_plan") {
          planCalls++;
          // Exercise the actual graph's validate -> repair edge in the browser.
          if (planCalls === 1) return route.fulfill({ json: { content: "{" } });
          result = model;
        } else if (payload.kind === "course_unit") {
          const match = payload.messages[0].content.match(
            /第 (\d+) 个单元的第 (\d+) 讲/,
          );
          const i = +match[1] - 1,
            j = +match[2] - 1;
          result = {
            title: model.title,
            units: [
              {
                ...model.units[i],
                lessons: [structuredClone(model.units[i].lessons[j])],
              },
            ],
          };
          const key = `${i}/${j}`;
          const count = (lectureCalls.get(key) || 0) + 1;
          lectureCalls.set(key, count);
          if (count === 1) delete result.units[0].lessons[0].quiz;
          else {
            assert.match(
              payload.messages.at(-1).content,
              /\/units\/0\/lessons\/0\/quiz/,
            );
            const candidate = JSON.parse(
              payload.messages.find((m) => m.role === "assistant").content,
            );
            assert.equal(
              candidate.units[0].lessons[0].content,
              model.units[i].lessons[j].content,
            );
            result = {
              patches: [
                {
                  op: "add",
                  path: "/units/0/lessons/0/quiz",
                  value: model.units[i].lessons[j].quiz,
                },
                ...(count === 2 && j === 0
                  ? [
                      {
                        op: "replace",
                        path: "/units/0/lessons/0/content",
                        value: "must not replace valid content",
                      },
                    ]
                  : []),
              ],
            };
          }
        } else throw new Error(`Unexpected model kind: ${payload.kind}`);
        return route.fulfill({ json: { content: JSON.stringify(result) } });
      }
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/");
    await page
      .getByRole("textbox", { name: "学习主题", exact: true })
      .fill("学习 Vue 状态管理");
    if (mode === "school") {
      await page.getByRole("tab", { name: "学校同步", exact: true }).click();
      await page
        .locator(".composer")
        .getByRole("button", { name: "创建课程", exact: true })
        .click();
      await expect(page).toHaveURL("http://127.0.0.1:5173/");
      assert.equal(requests.length, 0);
      await page
        .getByRole("textbox", { name: "教材／课程大纲", exact: true })
        .fill("学校 Vue 讲义");
      await page
        .getByRole("textbox", { name: "当前章节", exact: true })
        .fill("第二章 Store");
      await page
        .getByRole("textbox", { name: "课程进度", exact: true })
        .fill("本周复习");
      await page
        .getByRole("textbox", { name: "考核要求", exact: true })
        .fill("期中重点：共享状态");
      await page.screenshot({ path: `${folder}/school-home.png` });
    }
    await page
      .locator(".composer")
      .getByRole("button", { name: "创建课程", exact: true })
      .click();
    await expect(page).toHaveURL(/\/create\//);
    await expect(page.locator(".generation-question"))
      .toHaveCount(4, { timeout: 20000 })
      .catch(async (error) => {
        console.log(
          JSON.stringify({
            errors,
            kinds: requests.map((r) => r.kind),
            text: (await page.locator("body").innerText()).slice(-4000),
          }),
        );
        await page.screenshot({ path: `${folder}/failure.png` });
        throw error;
      });
    const routeUrl = page.url();
    if (mode === "school") {
      const beforeSwitch = requests.length;
      await page.getByRole("tab", { name: "自学", exact: true }).click();
      await expect(
        page.locator(".generation-question").first().getByRole("radio").first(),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "确认方向，生成蓝图", exact: true }),
      ).toBeDisabled();
      await page.getByRole("tab", { name: "学校同步", exact: true }).click();
      assert.equal(
        requests.length,
        beforeSwitch,
        "Mode changes must not silently trigger paid generation",
      );
      await expect(
        page.getByRole("textbox", { name: "教材／课程大纲", exact: true }),
      ).toHaveValue("学校 Vue 讲义");
      await page
        .getByRole("button", { name: "按当前模式重新确认需求", exact: true })
        .click();
      await expect(
        page.locator(".generation-question").first().getByRole("radio").first(),
      ).toBeEnabled();
    }
    for (const group of await page.locator(".generation-question").all())
      await group.getByRole("radio").first().click();
    await page
      .getByRole("button", { name: "确认方向，生成蓝图", exact: true })
      .click();
    await expect(page.locator(".generation-blueprint")).toContainText(
      model.title,
    );
    assert.equal(planCalls, 2);
    if (mode === "school") {
      await page
        .getByRole("textbox", { name: "当前章节", exact: true })
        .fill("第二章 Store，重点复习共享状态");
      await expect(
        page.getByRole("button", { name: "确认蓝图，生成课程", exact: true }),
      ).toBeDisabled();
      await expect
        .poll(
          () =>
            Object.values(state.courseDrafts).at(-1)?.schoolContext?.chapter,
        )
        .toBe("第二章 Store，重点复习共享状态");
      await page.reload();
      await expect(
        page.getByRole("textbox", { name: "当前章节", exact: true }),
      ).toHaveValue("第二章 Store，重点复习共享状态");
      await expect(
        page.getByRole("button", { name: "确认蓝图，生成课程", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "按新偏好更新蓝图", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "确认蓝图，生成课程", exact: true }),
      ).toBeEnabled();
      await page
        .locator(".generation-mode-context")
        .screenshot({ path: `${folder}/school-context.png` });
    }
    await page.evaluate(() => {
      window.repairErrorFlashes = [];
      new MutationObserver(() => {
        const error = document.querySelector(".generation-error");
        if (error) window.repairErrorFlashes.push(error.textContent);
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    await page
      .getByRole("button", { name: "确认蓝图，生成课程", exact: true })
      .click();
    await expect
      .poll(() => state.customCourses.length, { timeout: 20000 })
      .toBe(1)
      .catch(async (error) => {
        console.log(
          JSON.stringify({
            mode,
            errors,
            lectureCalls: [...lectureCalls],
            drafts: Object.values(state.courseDrafts).map((d) => ({
              phase: d.phase,
              error: d.error,
            })),
            feedback: requests
              .filter((r) => r.kind === "course_unit")
              .map((r) => r.messages.at(-1).content.slice(0, 1400)),
          }),
        );
        await page.screenshot({ path: `${folder}/repair-failure.png` });
        throw error;
      });
    const course = state.customCourses[0];
    for (const [i, unit] of course.units.entries())
      for (const [j, lesson] of unit.lessons.entries()) {
        assert.equal(lesson.content, model.units[i].lessons[j].content);
        assert.equal(lectureCalls.get(`${i}/${j}`), j === 0 ? 3 : 2);
      }
    assert.deepEqual(await page.evaluate(() => window.repairErrorFlashes), []);
    assert.equal(course.learningMode, mode);
    for (const request of requests) {
      assert.match(
        request.messages[0].content,
        mode === "school" ? /学习模式：学校同步/ : /学习模式：自学/,
      );
      if (mode === "school")
        assert.ok(request.messages[0].content.includes("学校 Vue 讲义"));
      else assert.ok(!request.messages[0].content.includes("学校 Vue 讲义"));
    }
    if (mode === "school") {
      assert.equal(
        course.schoolContext.chapter,
        "第二章 Store，重点复习共享状态",
      );
      assert.equal(course.schoolContext.assessment, "期中重点：共享状态");
    }
    await page.goto(routeUrl);
    await expect(
      page.getByRole("tab", {
        name: mode === "school" ? "学校同步" : "自学",
        exact: true,
      }),
    ).toHaveAttribute("aria-selected", "true");
    assert.deepEqual(errors, []);
    results.push({
      mode,
      modelCalls: requests.length,
      planCalls,
      lectures: course.units.flatMap((u) => u.lessons).length,
      repairRequests: [...lectureCalls],
      targetedRepairPreservedContent: true,
      errors,
    });
    await context.close();
  }
  await writeFile(`${folder}/result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
