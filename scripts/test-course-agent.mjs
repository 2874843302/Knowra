import test from "node:test";
import assert from "node:assert/strict";
import {
  runCourseDiscovery,
  runValidatedGeneration,
} from "../src/lib/course-agent.js";
import {
  newCourseDraft,
  courseBrief,
  generateCoursePlan,
} from "../src/lib/course-generation.js";
import {
  learningContext,
  learningModeError,
} from "../src/lib/learning-mode.js";
import { courseHelpContext } from "../src/lib/course-help.js";

const school = {
  learningMode: "school",
  schoolContext: {
    textbook: "同济高数第八版",
    chapter: "第二章 导数",
    schedule: "下周链式法则",
    assessment: "期中只考前两章",
  },
};
const plan = {
  title: "导数",
  description: "同步复习第二章",
  units: [
    {
      title: "第二章",
      lessons: [{ title: "链式法则", summary: "计算复合函数的导数" }],
    },
  ],
};

test("legacy/self-study ignore stale school context; school details survive drafts, prompts and help", () => {
  assert.deepEqual(learningContext({}), {
    learningMode: "self",
    schoolContext: {},
  });
  const self = newCourseDraft({
    topic: "数学",
    schoolContext: school.schoolContext,
  });
  assert.match(courseBrief(self), /学习模式：自学/);
  assert.doesNotMatch(courseBrief(self), /同济/);
  const draft = newCourseDraft({ topic: "导数", ...school });
  assert.deepEqual(learningContext(draft), school);
  for (const text of Object.values(school.schoolContext))
    assert.ok(courseBrief(draft).includes(text));
  assert.match(courseBrief(draft), /章节顺序.*当前章节/);
  assert.deepEqual(
    JSON.parse(courseHelpContext({ ...plan, ...school }, null, "导数"))
      .schoolContext,
    school.schoolContext,
  );
});

test("school requires a real sync reference; materials or chapter suffice", () => {
  assert.match(learningModeError({ learningMode: "school" }), /同步依据/);
  assert.match(
    learningModeError({
      learningMode: "school",
      schoolContext: { textbook: "  " },
    }),
    /同步依据/,
  );
  assert.equal(learningModeError(school), "");
  assert.equal(learningModeError({ learningMode: "school" }, true), "");
  assert.equal(learningModeError({ learningMode: "self" }), "");
});

test("blueprint graph repairs malformed output, preserving school instructions", async () => {
  const messages = [
    {
      role: "user",
      content: courseBrief(newCourseDraft({ topic: "导数", ...school })),
    },
  ];
  let calls = 0;
  const result = await generateCoursePlan({
    messages,
    request: async (sent, kind) => {
      calls++;
      assert.equal(kind, "course_plan");
      assert.deepEqual(sent[0], messages[0]);
      if (calls > 1) assert.match(sent.at(-1).content, /蓝图校验失败/);
      return calls === 1 ? "{" : JSON.stringify(plan);
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.units[0].title, "第二章");
  assert.equal(messages.length, 1);
});

test("discovery graph follows search -> lookup -> interview and resumes from saved research", async () => {
  const calls = [],
    saved = [];
  const research = { sources: [] };
  const options = {
    search: async () => {
      calls.push("search");
      return ["导数 官方教程"];
    },
    lookup: async (queries) => {
      calls.push("lookup");
      assert.equal(queries[0], "导数 官方教程");
      return research;
    },
    interview: async (value) => {
      calls.push("interview");
      assert.deepEqual(value, research);
      return { questions: ["当前进度？"] };
    },
    onProgress: (update) => saved.push(update),
  };
  assert.deepEqual(await runCourseDiscovery(options), {
    questions: ["当前进度？"],
  });
  assert.deepEqual(calls, ["search", "lookup", "interview"]);
  assert.equal(saved.length, 2);
  calls.length = 0;
  await runCourseDiscovery({ ...options, research });
  assert.deepEqual(calls, ["interview"]);
  calls.length = 0;
  await runCourseDiscovery({ ...options, queries: ["导数 官方教程"] });
  assert.deepEqual(calls, ["lookup", "interview"]);
});

test("cancelled discovery discards late research and never calls the model again", async () => {
  const controller = new AbortController();
  let calls = 0,
    saved = 0;
  await assert.rejects(
    runCourseDiscovery({
      queries: ["导数"],
      signal: controller.signal,
      lookup: async () => {
        controller.abort();
        return { sources: [] };
      },
      interview: async () => {
        calls++;
      },
      onProgress: () => saved++,
    }),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);
  assert.equal(saved, 0);
});

test("transport failures escape graph unchanged with one request; validation repair stays bounded", async () => {
  const transport = new Error("429 Retry-After");
  let calls = 0;
  await assert.rejects(
    runValidatedGeneration({
      generate: async () => {
        calls++;
        throw transport;
      },
      validate: JSON.parse,
    }),
    (error) => error === transport,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    runValidatedGeneration({
      generate: async () => {
        calls++;
        return "{";
      },
      validate: JSON.parse,
    }),
    SyntaxError,
  );
  assert.equal(calls, 3);
});
