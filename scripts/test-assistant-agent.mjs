import test from "node:test";
import assert from "node:assert/strict";
import { runAssistantAgent } from "../src/lib/assistant-agent.js";
import { visualWritingFields } from "../src/lib/visual-writing.js";
import { visualProgress } from "../src/lib/teaching-direction.js";

const messages = [
  { role: "user", content: "查一下 Python 官方文档的字符串说明" },
];
const research = {
  queries: ["Python docs str"],
  engine: "Bing",
  scope: "search_snippets",
  retrievedAt: new Date().toISOString(),
  failedQueries: [],
  sources: [
    {
      id: "source-1",
      title: "Python docs",
      url: "https://docs.python.org/3/library/stdtypes.html",
      snippet: "Text sequences are strings.",
    },
  ],
};
const answer = JSON.stringify({
  action: "answer",
  content:
    "字符串是文本序列。[Python docs](https://docs.python.org/3/library/stdtypes.html)",
});
test("adapter presentation wrappers don't turn a real tool call into displayed prose", async () => {
  let searched = 0,
    count = 0;
  const result = await runAssistantAgent({
    messages,
    request: async () =>
      ++count === 1
        ? '<think>需要官方来源</think>\n```json\n{"action":"search","queries":["Python docs"]}\n```'
        : answer,
    search: async () => {
      searched++;
      return research;
    },
  });
  assert.equal(searched, 1);
  assert.match(result.content, /字符串/);
});
test("model -> real search tool -> model observes sources; publishes running and completed traces", async () => {
  const traces = [],
    requests = [];
  const result = await runAssistantAgent({
    messages,
    request: async (m, kind) => {
      requests.push({ m, kind });
      return requests.length === 1
        ? JSON.stringify({ action: "search", queries: ["Python docs str"] })
        : answer;
    },
    search: async (queries) => {
      assert.deepEqual(queries, research.queries);
      return research;
    },
    onToolCalls: (v) => traces.push(v),
  });
  assert.equal(traces[0][0].status, "running");
  assert.equal(traces[1][0].status, "completed");
  assert.deepEqual(
    traces[0][0].sources,
    [],
    "snapshots do not change retroactively",
  );
  assert.match(requests[1].m.at(-1).content, /Text sequences/);
  assert.match(requests[1].m.at(-1).content, /未阅读网页全文/);
  assert.equal(result.sources[0].url, research.sources[0].url);
  assert.match(result.content, /Python docs/);
});
test("ordinary explanations answer in one request without a search; disabling networking bypasses routing", async () => {
  for (const webSearch of [true, false]) {
    let count = 0;
    const result = await runAssistantAgent({
      messages,
      webSearch,
      request: async (_, kind) => {
        count++;
        assert.equal(kind, webSearch ? "chat_agent" : "chat");
        return webSearch ? answer : "直接回答";
      },
      search: () => assert.fail("must not search"),
    });
    assert.equal(count, 1);
    assert.equal(result.toolCalls.length, 0);
  }
});
test("tool failures are observed, visible and bounded to two searches, never fabricated", async () => {
  let requests = 0,
    searches = 0;
  const result = await runAssistantAgent({
    messages,
    request: async (m, kind) => {
      requests++;
      if (requests > 1) assert.match(m.at(-1).content, /network unavailable/);
      return kind === "chat"
        ? "检索失败，暂时无法核实。"
        : JSON.stringify({ action: "search", queries: [`query ${requests}`] });
    },
    search: async () => {
      searches++;
      throw new Error("network unavailable");
    },
  });
  assert.equal(searches, 2);
  assert.equal(requests, 3);
  assert.deepEqual(result.sources, []);
  assert(
    result.toolCalls.every(
      (c) => c.status === "failed" && c.sources.length === 0,
    ),
  );
});
test("cancelling an in-flight search marks it stopped and cannot publish an answer", async () => {
  const controller = new AbortController(),
    traces = [];
  let requests = 0;
  await assert.rejects(
    runAssistantAgent({
      messages,
      signal: controller.signal,
      request: async () => {
        requests++;
        return JSON.stringify({ action: "search", queries: ["query"] });
      },
      search: async () => {
        controller.abort();
        controller.signal.throwIfAborted();
      },
      onToolCalls: (v) => traces.push(v),
    }),
    (e) => e.name === "AbortError",
  );
  assert.equal(requests, 1);
  assert.equal(traces.at(-1)[0].status, "cancelled");
});
test("invalid tool arguments receive specific repair feedback, transport errors do not retry", async () => {
  let count = 0;
  await runAssistantAgent({
    messages,
    request: async (m) => {
      count++;
      if (count === 1) return '{"action":"search","queries":[]}';
      assert.match(m.at(-1).content, /工具决策无效/);
      return answer;
    },
    search: () => assert.fail("invalid tool not executed"),
  });
  assert.equal(count, 2);
  count = 0;
  await assert.rejects(
    runAssistantAgent({
      messages,
      request: async () => {
        count++;
        throw new Error("401");
      },
      search: () => assert.fail("must not search"),
    }),
    /401/,
  );
  assert.equal(count, 1);
});
test("comparison fields reveal label, expression, result then next row, retaining final geometry", () => {
  const visual = {
    type: "comparison",
    title: "同一个 +，两种含义",
    items: [
      {
        label: "数字相加",
        expression: "3 + 2",
        result: "5",
        detail: "int → int",
      },
      {
        label: "文本拼接",
        expression: '"3" + "2"',
        result: '"32"',
        detail: "str → str",
      },
    ],
  };
  const frames = Array.from({ length: 101 }, (_, i) =>
    visualWritingFields(visual, i / 100),
  );
  assert(
    frames.some((f) => f.title && f.title !== visual.title && !f["0.label"]),
  );
  assert(frames.some((f) => f["0.expression"] && !f["0.result"]));
  assert(frames.some((f) => f["0.detail"] === "int → int" && !f["1.label"]));
  assert.equal(frames.at(-1)["1.result"], '"32"');
  for (let i = 1; i < frames.length; i++)
    for (const key of Object.keys(frames[i]))
      assert(frames[i][key].startsWith(frames[i - 1][key]));
  assert.equal(
    visualProgress({ visual }, 0.1, 1),
    0.1,
    "short board completion doesn't finish the illustration",
  );
});
test("completed trace rows retain their ink while a new row is being explained", () => {
  const previous = { rows: [{ name: "x", value: "1" }] };
  const visual = {
    type: "trace",
    title: "变量",
    rows: [...previous.rows, { name: "y", value: "2" }],
  };
  const f = visualWritingFields(visual, 0, previous);
  assert.equal(f["0.value"], "1");
  assert.equal(f["1.value"], "");
});
