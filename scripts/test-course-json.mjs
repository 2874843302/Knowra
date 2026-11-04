import { directedTeaching } from "./fixtures/teaching-direction.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCourseJSON,
  validateCoursePlan,
  courseBrief,
  generateCourseLecture,
  CourseLectureGenerationError,
  COURSE_LECTURE_ATTEMPTS,
} from "../src/lib/course-generation.js";
import { validateOutline } from "../src/data.js";
import { lessonSequence, streamMarkdown } from "../src/lib/lesson-sequence.js";
import { normalizeBoardAnnotations } from "../src/lib/board-emphasis.js";

const expectedUnit = { title: "共享状态", summary: "理解跨组件数据流" };
const expectedLesson = { title: "认识 Store", summary: "用购物车解释共享状态" };
const validLecture = () => ({
  title: "Vue 与 Spring 实践",
  units: [
    {
      ...expectedUnit,
      lessons: [
        {
          ...expectedLesson,
          content:
            "## 概念\n明确数据来源。\n\n## 实例\n购物车共享数量。\n\n## 验证\n检查组件间的同步。",
          teaching: directedTeaching({
            steps: [
              {
                title: "统一状态",
                board: "组件 → Store → 组件",
                narration:
                  "想象多个收银台共享同一本账本，各组件从同一份状态读取数量。",
              },
            ],
          }),
          quiz: {
            question: "状态应该从哪里读取？",
            options: ["统一的 Store", "每个组件重复创建"],
            answer: 0,
            explanation: "同一个数据来源保持同步。",
          },
        },
      ],
    },
  ],
});
const lectureMessages = [
  { role: "user", content: "深入讲解购物车，遵守已确认蓝图。" },
];

test("successive lectures and validation repairs carry the same course conversation ID", async () => {
  const calls = [];
  let repair = true;
  const request = async (messages, kind, signal, conversationId) => {
    calls.push({ kind, conversationId });
    if (repair) {
      repair = false;
      return "not valid JSON";
    }
    return JSON.stringify(validLecture());
  };
  for (const conversationId of ["course-A", "course-A", "course-B"]) {
    await generateCourseLecture({
      request,
      messages: lectureMessages,
      expectedUnit,
      expectedLesson,
      conversationId,
    });
  }
  assert.deepEqual(
    calls.map((call) => call.conversationId),
    ["course-A", "course-A", "course-A", "course-B"],
  );
  assert.ok(calls.every((call) => call.kind === "course_unit"));
});

for (const [name, broken, correction] of [
  ["unreadable JSON", () => '{"title":"未完成', /完整 JSON/],
  ["missing unit", () => ({ title: "课程", units: [] }), /指定的一个单元/],
  [
    "wrong unit title",
    (v) => {
      v.units[0].title = "错误单元";
      return v;
    },
    /共享状态/,
  ],
  [
    "wrong lesson title",
    (v) => {
      v.units[0].lessons[0].title = "错误讲次";
      return v;
    },
    /认识 Store/,
  ],
  [
    "extra lecture",
    (v) => {
      v.units[0].lessons.push(structuredClone(v.units[0].lessons[0]));
      return v;
    },
    /当前一个讲次/,
  ],
  [
    "missing teaching",
    (v) => {
      delete v.units[0].lessons[0].teaching;
      return v;
    },
    /teaching.steps/,
  ],
  [
    "missing quiz",
    (v) => {
      delete v.units[0].lessons[0].quiz;
      return v;
    },
    /缺少 quiz/,
  ],
  [
    "invalid answer",
    (v) => {
      v.units[0].lessons[0].quiz.answer = 9;
      return v;
    },
    /测验格式/,
  ],
  [
    "quiz returned as an array of several valid questions",
    (v) => {
      v.units[0].lessons[0].quiz = [
        v.units[0].lessons[0].quiz,
        {
          type: "true_false",
          question: "共享状态是否需要统一来源？",
          answer: true,
          explanation: "统一来源保持同步。",
        },
      ];
      return v;
    },
    /quiz 必须是单个题目对象，不能是题目数组/,
  ],
  [
    "identical board and narration",
    (v) => {
      const s = v.units[0].lessons[0].teaching.steps[0];
      s.narration = s.board;
      return v;
    },
    /板书与讲解/,
  ],
]) {
  test(`recover ${name} automatically with targeted feedback`, async () => {
    const attempts = [],
      bad = broken(validLecture());
    const signal = new AbortController().signal;
    const lesson = await generateCourseLecture({
      expectedUnit,
      expectedLesson,
      signal,
      messages: lectureMessages,
      request: async (messages, kind, requestSignal) => {
        attempts.push(messages);
        assert.equal(kind, "course_unit");
        assert.equal(requestSignal, signal);
        return attempts.length === 1
          ? typeof bad === "string"
            ? bad
            : JSON.stringify(bad)
          : JSON.stringify(validLecture());
      },
    });
    assert.equal(attempts.length, 2);
    assert.deepEqual(
      attempts[0].slice(0, lectureMessages.length),
      lectureMessages,
    );
    assert.match(attempts[0].at(-1).content, /teaching.*design/);
    assert.deepEqual(attempts[1][0], lectureMessages[0]);
    assert.match(attempts[1].at(-1).content, correction);
    assert.equal(lectureMessages.length, 1);
    assert.equal(lesson.title, expectedLesson.title);
    assert.equal(lesson.teaching.mode, "script");
    assert.equal(lesson.quiz.answer, 0);
    assert.equal(lesson.content, validLecture().units[0].lessons[0].content);
  });
}

test("valid lecture is accepted without another model call", async () => {
  let count = 0;
  await generateCourseLecture({
    expectedUnit,
    expectedLesson,
    messages: lectureMessages,
    request: async () => {
      count++;
      return JSON.stringify(validLecture());
    },
  });
  assert.equal(count, 1);
});

test("correction is attempted again when the first repair is still invalid", async () => {
  const attempts = [];
  await generateCourseLecture({
    expectedUnit,
    expectedLesson,
    messages: lectureMessages,
    request: async (messages) => {
      attempts.push(messages);
      if (attempts.length === 1) return "{";
      const value = validLecture();
      if (attempts.length === 2) delete value.units[0].lessons[0].quiz;
      return JSON.stringify(value);
    },
  });
  assert.equal(attempts.length, 3);
  assert.match(attempts[2].at(-1).content, /缺少 quiz/);
});

test("persistent invalid output ends with a recoverable message and no partial result", async () => {
  let count = 0;
  await assert.rejects(
    generateCourseLecture({
      expectedUnit,
      expectedLesson,
      messages: lectureMessages,
      request: async () => {
        count++;
        return "{";
      },
    }),
    (error) => {
      assert(error instanceof CourseLectureGenerationError);
      assert.match(error.message, /未通过内容校验.*无法解析的完整课程 JSON/);
      assert.match(error.message, /已完成的讲次已保留/);
      assert(error.cause instanceof SyntaxError);
      return true;
    },
  );
  assert.equal(count, COURSE_LECTURE_ATTEMPTS);
});

test("repeated array quiz failures keep precise feedback and expose the final reason", async () => {
  const calls = [];
  await assert.rejects(
    generateCourseLecture({
      expectedUnit,
      expectedLesson,
      messages: lectureMessages,
      conversationId: "course-fixture",
      request: async (messages, kind, signal, conversationId) => {
        calls.push({ messages, conversationId });
        const value = validLecture();
        value.units[0].lessons[0].quiz = [value.units[0].lessons[0].quiz];
        return JSON.stringify(value);
      },
    }),
    (error) => {
      assert(error instanceof CourseLectureGenerationError);
      assert.match(error.message, /单个题目对象，不能是题目数组/);
      assert.match(error.message, /已完成的讲次已保留/);
      return true;
    },
  );
  assert.equal(calls.length, COURSE_LECTURE_ATTEMPTS);
  assert.ok(calls.every((c) => c.conversationId === "course-fixture"));
  for (const call of calls.slice(1)) {
    assert.match(call.messages.at(-1).content, /quiz 必须是单个题目对象/);
    assert.match(call.messages.at(-1).content, /\/units\/0\/lessons\/0\/quiz/);
    assert.match(call.messages.at(-1).content, /patches/);
    assert(
      call.messages.some(
        (m) =>
          m.role === "assistant" &&
          JSON.parse(m.content).units[0].lessons[0].quiz instanceof Array,
      ),
    );
  }
});

test("connection and authorization errors do not trigger content correction calls", async () => {
  const unavailable = new Error("服务不可用");
  let count = 0;
  await assert.rejects(
    generateCourseLecture({
      expectedUnit,
      expectedLesson,
      messages: lectureMessages,
      request: async () => {
        count++;
        throw unavailable;
      },
    }),
    (error) => error === unavailable,
  );
  assert.equal(count, 1);
});

test("stopping during correction backoff prevents another request", async () => {
  const controller = new AbortController();
  let count = 0;
  const task = generateCourseLecture({
    expectedUnit,
    expectedLesson,
    messages: lectureMessages,
    signal: controller.signal,
    request: async () => {
      count++;
      setTimeout(() => controller.abort(), 0);
      return "{";
    },
  });
  await assert.rejects(task, { name: "AbortError" });
  assert.equal(count, 1);
});

test("a late model response after stopping is discarded", async () => {
  const controller = new AbortController();
  let count = 0;
  await assert.rejects(
    generateCourseLecture({
      expectedUnit,
      expectedLesson,
      messages: lectureMessages,
      signal: controller.signal,
      request: async () => {
        count++;
        controller.abort();
        return JSON.stringify(validLecture());
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(count, 1);
});

const plan = {
  title: "接口与状态",
  description: '字符串中的 {括号}、[列表]、"引号" 与路径 C:\\notes',
  units: [
    { title: "基础", lessons: [{ title: "状态", summary: "理解数据流" }] },
  ],
};
const json = JSON.stringify(plan);
for (const [name, source] of [
  ["bare JSON", json],
  ["BOM and whitespace", `\uFEFF \n${json}\n`],
  ["Markdown fence", `\`\`\`json\n${json}\n\`\`\``],
  ["uppercase fence and CRLF", `\`\`\`JSON\r\n${json}\r\n\`\`\``],
  [
    "explanation around fenced JSON",
    `这是规划的蓝图：\n\`\`\`json\n${json}\n\`\`\`\n请确认方向。`,
  ],
  ["explanation around bare JSON", `这是课程蓝图：\n${json}\n请确认方向。`],
  ["complete reasoning wrapper", `<think>先规划各个单元。</think>\n${json}`],
]) {
  test(`accept ${name} without changing fields`, () => {
    assert.deepEqual(parseCourseJSON(source), plan);
    assert.equal(validateCoursePlan(parseCourseJSON(source)).units.length, 1);
  });
}

for (const [name, source] of [
  ["empty response", ""],
  ["non-text response", null],
  ["truncated root with complete nested objects", json.slice(0, -1)],
  ["truncated fenced JSON", `\`\`\`json\n${json.slice(0, -1)}\n\`\`\``],
  ["malformed JSON", '{"title": "课程",,}'],
  ["missing value", '{"title":,}'],
  ["multiple bare results", `${json}\n${json}`],
  [
    "multiple fenced results",
    `\`\`\`json\n${json}\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``,
  ],
  ["unfinished reasoning", `<think>尚未结束\n${json}`],
]) {
  test(`reject ${name} rather than inventing a blueprint`, () => {
    assert.throws(() => parseCourseJSON(source), SyntaxError);
  });
}

test("presentation handling does not bypass blueprint validation", () => {
  assert.throws(
    () =>
      validateCoursePlan(
        parseCourseJSON('说明：{"title":"无单元","units":[]}'),
      ),
    /蓝图不完整/,
  );
});

test("course structure follows the learner's scope instead of a three by two cap", () => {
  const expanded = {
    ...plan,
    units: Array.from({ length: 12 }, (_, i) => ({
      title: `单元${i}`,
      lessons: Array.from({ length: 21 }, (_, j) => ({
        title: `讲次${j}`,
        summary: "掌握当前目标",
        content: "完整讲义",
      })),
    })),
  };
  assert.equal(validateCoursePlan(expanded).units.length, 12);
  assert.equal(validateCoursePlan(expanded).units[0].lessons.length, 21);
  assert.equal(validateOutline(expanded)[0].lessons.length, 21);
});

test("depth and free-form scope reach planning and lesson requests", () => {
  const brief = courseBrief({
    topic: "全栈开发",
    learningPreferences: { depth: "deep", scale: "约 24 讲，每周 3 小时" },
    questions: [],
    messages: [],
    files: [],
  });
  assert.match(brief, /深入掌握/);
  assert.match(brief, /推导、边界、常见误区/);
  assert.match(brief, /约 24 讲，每周 3 小时/);
  const legacy = courseBrief({
    topic: "全栈开发",
    questions: [],
    messages: [],
    files: [],
  });
  assert.match(legacy, /按目标推荐/);
  assert.match(legacy, /不预设单元数或每单元讲数/);
});

test("detailed lectures retain all validated teaching fragments", () => {
  const steps = Array.from({ length: 31 }, (_, i) => ({
    title: `知识点 ${i}`,
    board: `板书要点 ${i}`,
    narration: `通过例子详细解释当前要点 ${i}。`,
  }));
  const units = validateOutline({
    title: "深入讲解",
    units: [
      {
        title: "主题",
        lessons: [
          {
            title: "原理",
            content: "教材",
            teaching: directedTeaching({ steps }),
          },
        ],
      },
    ],
  });
  assert.equal(units[0].lessons[0].teaching.steps.length, 31);
});

test("complete trailing separators are tolerated without rewriting literal content", () => {
  const source =
    '{"title":"保留 ,} 与 ,]、\\\"引号\\\"", "steps":[{"board":"原样保留",},],}';
  assert.deepEqual(parseCourseJSON(source), {
    title: '保留 ,} 与 ,]、"引号"',
    steps: [{ board: "原样保留" }],
  });
  assert.deepEqual(
    parseCourseJSON("```json\n" + source + "\n```"),
    parseCourseJSON(source),
  );
  assert.throws(() => parseCourseJSON(source.slice(0, -1)), SyntaxError);
});

test("null or empty outline entries report a course validation error", () => {
  for (const units of [
    [null],
    [{ title: "单元", lessons: [null] }],
    [{ title: "", lessons: [] }],
  ])
    assert.throws(() => validateOutline({ title: "课程", units }), /课程/);
});

test("generated emphasis survives course validation and playback without changing text", () => {
  const value = validLecture();
  const authored = value.units[0].lessons[0].teaching.steps[0];
  authored.board = "**Store** 保存共享状态。\n\n**统一数据来源，组件同步更新**";
  authored.annotations = [
    { kind: "highlight", snippet: " 统一数据来源，组件同步更新 " },
  ];
  const lesson = validateOutline(value)[0].lessons[0];
  const sequence = lessonSequence(lesson.content, lesson);
  const step = sequence.steps[0];
  assert.deepEqual(step.annotations, [
    { kind: "highlight", snippet: "统一数据来源，组件同步更新" },
  ]);
  assert.equal(step.content, authored.board);
  assert.equal(step.narration, authored.narration);
  assert.equal(streamMarkdown(step, 1), authored.board);
  assert.match(streamMarkdown(step, 0.3), /\*\*Store\*\*/);
});

test("invalid optional decoration metadata never rejects a complete lecture", () => {
  const value = validLecture();
  value.units[0].lessons[0].teaching.steps[0].annotations = [
    null,
    { kind: "html", snippet: "状态" },
    { kind: "highlight", snippet: " " },
    { kind: "circle", snippet: 2 },
    { kind: "underline", snippet: "x".repeat(121) },
    { kind: "highlight", snippet: "Store" },
    { kind: "circle", snippet: "Store" },
    { kind: "underline", snippet: "不存在的内容" },
  ];
  const lesson = validateOutline(value)[0].lessons[0];
  const step = lessonSequence(lesson.content, lesson).steps[0];
  assert.deepEqual(step.annotations, [{ kind: "highlight", snippet: "Store" }]);
  assert.deepEqual(normalizeBoardAnnotations("highlight"), []);
  assert.equal(
    normalizeBoardAnnotations(
      Array.from({ length: 6 }, (_, i) => ({
        kind: "highlight",
        snippet: `重点${i}`,
      })),
    ).length,
    3,
  );
});

test("legacy board conclusions receive selective highlights but inline terms stay bold only", () => {
  const lesson = {
    content:
      "## 状态管理\n\n**Store** 是共享容器。\n\n**统一数据来源，组件同步更新**\n\n**修改数据后，界面自动响应**",
  };
  const sequence = lessonSequence(lesson.content, lesson);
  assert.equal(sequence.steps.flatMap((s) => s.annotations || []).length, 2);
  assert(
    sequence.steps.every(
      (s) => !s.annotations?.some((a) => a.snippet === "Store"),
    ),
  );
  assert.equal(sequence.readingPages[0].content.includes("**Store**"), true);
});

test("explicit circle or underline takes precedence over fallback highlights", () => {
  const value = validLecture();
  const authored = value.units[0].lessons[0].teaching.steps[0];
  authored.board = "**统一数据来源，组件同步更新**\n\nStore → 组件";
  authored.annotations = [{ kind: "underline", snippet: "Store" }];
  const lesson = validateOutline(value)[0].lessons[0];
  assert.deepEqual(
    lessonSequence(lesson.content, lesson).steps[0].annotations,
    authored.annotations,
  );
});

test("multiple understanding checks follow their exact teaching segments, before the lecture ends", () => {
  const value = validLecture(),
    base = value.units[0].lessons[0].teaching.steps[0];
  const checkpoint = {
    question: "共享状态放在哪里？",
    options: ["Store", "重复创建"],
    answer: 0,
    explanation: "多个组件需要同一个数据来源。",
  };
  value.units[0].lessons[0].teaching.steps = [
    { ...base, checkpoint },
    {
      ...base,
      title: "检查更新",
      board: "操作 → 状态 → 界面",
      checkpoint: { ...checkpoint, question: "状态更新后，界面从哪里读取？" },
    },
    { ...base, title: "再做一次实践", board: "加入商品，验证两个页面的数量。" },
  ];
  const lesson = validateOutline(value)[0].lessons[0],
    sequence = lessonSequence(lesson.content, lesson);
  assert.deepEqual(
    sequence.steps.map((s) => s.kind),
    ["board", "checkpoint", "board", "checkpoint", "board"],
  );
  assert.equal(sequence.steps[1].quiz.question, checkpoint.question);
  assert.equal(sequence.steps[3].quiz.question, "状态更新后，界面从哪里读取？");
  assert.equal(new Set(sequence.steps.map((s) => s.block)).size, 5);
  assert(
    sequence.steps
      .filter((s) => s.kind === "checkpoint")
      .every((s) => s.assessment === "understanding"),
  );
  assert.equal(lesson.quiz.question, "状态应该从哪里读取？");
});

test("malformed embedded checks are corrected rather than silently removed", async () => {
  const value = validLecture(),
    base = value.units[0].lessons[0].teaching.steps[0];
  value.units[0].lessons[0].teaching.steps = [
    {
      ...base,
      checkpoint: {
        question: "判断来源",
        options: ["A", "B"],
        answer: 9,
        explanation: "选择正确来源",
      },
    },
    { ...base, title: "继续实践" },
  ];
  assert.throws(() => validateOutline(value), /随堂理解题/);
  let calls = 0;
  await generateCourseLecture({
    expectedUnit,
    expectedLesson,
    messages: lectureMessages,
    request: async (messages) => {
      calls++;
      if (calls === 2) {
        assert.match(messages.at(-1).content, /随堂理解题/);
        value.units[0].lessons[0].teaching.steps[0].checkpoint.answer = 0;
      }
      return JSON.stringify(value);
    },
  });
  assert.equal(calls, 2);
});

test("fresh multi-segment lectures repair missing or end-only understanding checks", async () => {
  const value = validLecture(),
    base = value.units[0].lessons[0].teaching.steps[0];
  value.units[0].lessons[0].teaching.steps = [base, { ...base, title: "应用" }];
  let calls = 0;
  await generateCourseLecture({
    expectedUnit,
    expectedLesson,
    messages: lectureMessages,
    request: async (messages) => {
      calls++;
      if (calls > 1) {
        assert.match(messages.at(-1).content, /讲解过程中的理解题/);
        value.units[0].lessons[0].teaching.steps[
          calls === 2 ? 1 : 0
        ].checkpoint = {
          question: "共享状态如何组织？",
          options: ["统一来源", "每页复制"],
          answer: 0,
          explanation: "统一来源可以保持组件同步。",
        };
      }
      return JSON.stringify(value);
    },
  });
  assert.equal(calls, 3);
});
