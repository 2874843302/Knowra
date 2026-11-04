import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import {
  applyGenerationPatch,
  generationRepairMessages,
  readRepairCandidate,
} from "./generation-repair.js";

const generationState = new StateSchema({
  attempt: z.number().default(0),
  response: z.unknown().optional(),
  result: z.unknown().optional(),
  feedback: z.string().default(""),
  valid: z.boolean().default(false),
  rawResponse: z.unknown().optional(),
  actionError: z.string().default(""),
  path: z.string().default(""),
  observations: z.array(z.string()).default([]),
});

// A real generate -> validate -> repair loop. Transport errors escape the graph:
// retrying auth failures, cooldowns or disconnects would multiply paid requests.
export async function runValidatedGeneration({
  generate,
  request,
  messages,
  kind,
  conversationId,
  repairLabel = "生成结果",
  validate,
  correction = (error) => error.message,
  exhausted = (error) => error,
  beforeRepair,
  signal,
  attempts = 3,
}) {
  let validationError;
  const graph = new StateGraph(generationState)
    .addNode("generate", async (state) => {
      signal?.throwIfAborted();
      const rawResponse = request
        ? await request(
            generationRepairMessages(messages, state, repairLabel),
            kind,
            signal,
            conversationId,
          )
        : await generate(state.feedback, state.attempt);
      signal?.throwIfAborted();
      let response = rawResponse,
        actionError = "";
      const candidate =
        request && state.attempt && readRepairCandidate(state.response);
      if (candidate) {
        try {
          const action = readRepairCandidate(rawResponse);
          if (!action) throw new Error("修复响应不是完整 JSON。");
          if (Object.hasOwn(action, "patches"))
            response = JSON.stringify(
              applyGenerationPatch(candidate, action.patches, state.path),
            );
          // Compatibility with models that return the corrected full object:
          // copy only the failed subtree, keeping all other content untouched.
          else if (state.path) {
            const keys = state.path
              .slice(1)
              .split("/")
              .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));
            let value = action;
            for (const key of keys) {
              if (value == null || !Object.hasOwn(value, key))
                throw new Error(
                  `修复结果缺少失败字段 ${state.path}，请返回 patches。`,
                );
              value = value[key];
            }
            let previous = candidate;
            for (const key of keys.slice(0, -1)) previous = previous?.[key];
            const op =
              previous != null && Object.hasOwn(previous, keys.at(-1))
                ? "replace"
                : "add";
            response = JSON.stringify(
              applyGenerationPatch(
                candidate,
                [{ op, path: state.path, value }],
                state.path,
              ),
            );
          }
        } catch (error) {
          response = state.response;
          actionError = error.message;
        }
      }
      return { response, rawResponse, actionError, attempt: state.attempt + 1 };
    })
    .addNode("validate", async (state) => {
      signal?.throwIfAborted();
      try {
        if (state.actionError)
          throw new Error(
            `修复未能应用：${state.actionError} 原校验错误：${state.feedback}`,
          );
        const result = await validate(state.response);
        signal?.throwIfAborted();
        return {
          result,
          valid: true,
          feedback: "",
        };
      } catch (error) {
        signal?.throwIfAborted();
        validationError = error;
        const feedback = correction(error);
        return {
          valid: false,
          feedback,
          path: state.actionError ? state.path : error.path || "",
          observations: [...state.observations, feedback],
        };
      }
    })
    .addNode("repair", async (state) => {
      await beforeRepair?.(state.attempt);
      signal?.throwIfAborted();
      return {};
    })
    .addNode("failed", () => {
      throw exhausted(validationError);
    })
    .addEdge(START, "generate")
    .addEdge("generate", "validate")
    .addConditionalEdges("validate", (state) =>
      state.valid ? END : state.attempt < attempts ? "repair" : "failed",
    )
    .addEdge("repair", "generate")
    .addEdge("failed", END)
    .compile();
  const state = await graph.invoke(
    {},
    { signal, recursionLimit: attempts * 3 + 2 },
  );
  signal?.throwIfAborted();
  return state.result;
}

// Discovery stages have independent saved outputs. A resumed interview reuses
// successful search work, and cancellation never publishes a late stage result.
export async function runCourseDiscovery({
  queries = [],
  research = null,
  search,
  lookup,
  interview,
  onProgress,
  signal,
}) {
  const state = new StateSchema({
    queries: z.array(z.string()),
    research: z.unknown(),
    interview: z.unknown().optional(),
  });
  const publish = (update) => {
    signal?.throwIfAborted();
    onProgress?.(update);
    return update;
  };
  const graph = new StateGraph(state)
    .addNode("search", async () => publish({ queries: await search() }))
    .addNode("lookup", async (s) =>
      publish({ research: await lookup(s.queries) }),
    )
    .addNode("ask", async (s) => {
      signal?.throwIfAborted();
      const result = await interview(s.research);
      signal?.throwIfAborted();
      return { interview: result };
    })
    .addConditionalEdges(START, (s) =>
      s.research ? "ask" : s.queries.length ? "lookup" : "search",
    )
    .addEdge("search", "lookup")
    .addEdge("lookup", "ask")
    .addEdge("ask", END)
    .compile();
  const result = await graph.invoke({ queries, research }, { signal });
  return result.interview;
}
