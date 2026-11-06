import { validateOutline } from "../data.js";
import { parseCourseJSON } from "./course-generation.js";
import { lessonSequence } from "./lesson-sequence.js";
import { contentError } from "./generation-validation.js";
import {
  TEACHING_DELIVERY_REQUEST,
  validateTeachingDelivery,
} from "./teaching-direction.js";

export function validateClassroomAdaptation(text) {
  const value = parseCourseJSON(text);
  const nonempty = (v) => typeof v === "string" && !!v.trim();
  if (!nonempty(value?.reply) || !["insert", "replan"].includes(value.action))
    throw contentError(
      !nonempty(value?.reply) ? "/reply" : "/action",
      "缺少 reply 或有效的 action（insert / replan）。",
    );
  if (
    !Array.isArray(value.plan) ||
    !value.plan.length ||
    value.plan.some((p) => !nonempty(p?.title) || !nonempty(p?.reason))
  )
    throw contentError(
      "/plan",
      "plan 必须说明接下来讲什么以及为什么这样安排。",
    );
  if (!Array.isArray(value.steps) || !value.steps.length)
    throw contentError("/steps", "steps 必须包含能直接讲解的板书与口语脚本。");
  const content = value.steps
    .map((s) => `## ${s?.title || ""}\n\n${s?.board || ""}`)
    .join("\n\n");
  let lesson;
  try {
    lesson = validateOutline({
      title: "课堂调整",
      units: [
        {
          title: "响应学习诉求",
          lessons: [
            { title: "课堂调整", content, teaching: { steps: value.steps } },
          ],
        },
      ],
    })[0].lessons[0];
  } catch (error) {
    const path = error.path?.replace(/^\/units\/0\/lessons\/0\/teaching/, "");
    throw contentError(
      path?.startsWith("/steps") ? path : "/steps",
      error.message,
      error,
    );
  }
  validateTeachingDelivery(lesson.teaching.steps);
  return {
    reply: value.reply.trim(),
    action: value.action,
    plan: value.plan.map((p) => ({
      title: p.title.trim(),
      reason: p.reason.trim(),
    })),
    steps: lesson.teaching.steps,
  };
}

export async function requestClassroomAdaptation(
  request,
  messages,
  signal,
  validate = validateClassroomAdaptation,
  onDelta,
) {
  signal?.throwIfAborted();
  const { runValidatedGeneration } = await import("./course-agent.js");
  const directedMessages = [
    ...messages,
    { role: "user", content: TEACHING_DELIVERY_REQUEST },
  ];
  return runValidatedGeneration({
    signal,
    request: onDelta
      ? (items, kind, innerSignal, conversationId) =>
          request(items, kind, innerSignal, conversationId, onDelta)
      : request,
    messages: directedMessages,
    kind: "classroom_adapt",
    repairLabel: "课堂调整",
    validate,
    exhausted: () =>
      new Error(
        "这次课堂调整暂未完成，原有板书和学习进度已保留，可以重新发送问题。",
      ),
  });
}

// Revisions point at stable steps, not mutable array indices. Existing writing,
// checkpoint answers and unrelated lessons survive a new teaching direction.
export function composeClassroomSequence(base, revisions = []) {
  let steps = base.steps.map((s) => ({
    ...s,
    id: `base:${base.signature}:${s.index}`,
    section: `base:${s.page}`,
  }));
  const applied = [];
  let focusStepId;
  for (const revision of revisions) {
    if (revision.baseSignature !== base.signature) continue;
    const at = steps.findIndex((s) => s.id === revision.afterStepId);
    if (at < 0) continue;
    const content = revision.steps
      .map((s) => `## ${s.title}\n\n${s.board}`)
      .join("\n\n");
    const extra = lessonSequence(content, {
      teaching: { source: content, mode: "script", steps: revision.steps },
    });
    const additions = extra.steps.map((s) => ({
      ...s,
      id: `adaptive:${revision.id}:${s.index}`,
      section: `adaptive:${revision.id}:${s.page}`,
      adaptationId: revision.id,
    }));
    if (!additions.length) continue;
    steps = [
      ...steps.slice(0, at + 1),
      ...additions,
      ...(revision.action === "replan" ? [] : steps.slice(at + 1)),
    ];
    focusStepId = additions[0].id;
    applied.push(revision);
  }
  const pages = [];
  steps = steps.map((s, index) => {
    if (pages.at(-1)?.section !== s.section)
      pages.push({
        section: s.section,
        title: s.title,
        steps: [],
        content: "",
      });
    const step = { ...s, index, page: pages.length - 1 };
    pages.at(-1).steps.push(step);
    pages.at(-1).content +=
      step.kind === "checkpoint" ? "" : step.content + "\n\n";
    return step;
  });
  return {
    ...base,
    baseSignature: base.signature,
    steps,
    pages,
    focusStepId,
    adaptations: applied,
    readingPages: [
      ...base.readingPages,
      ...pages.filter((p) => p.section.startsWith("adaptive:")),
    ],
    signature: applied.length
      ? `${base.signature}:${applied.map((r) => r.id).join(":")}`
      : base.signature,
  };
}

export function rebaseClassroomCursor(cursor, previous, next) {
  const indexOf = (id) => next.steps.findIndex((s) => s.id === id);
  const current = indexOf(previous.steps[cursor.index]?.id);
  const revealed = indexOf(previous.steps[cursor.revealedStep]?.id);
  const focus = indexOf(next.focusStepId);
  const index = focus >= 0 ? focus : Math.max(0, current);
  const pendingCheck =
    previous.steps[cursor.revealedStep]?.kind === "checkpoint" &&
    !cursor.answers?.[cursor.revealedStep];
  const revealedStep = Math.max(index, pendingCheck ? index : revealed);
  const answers = {};
  for (const [at, answer] of Object.entries(cursor.answers || {})) {
    const mapped = indexOf(previous.steps[at]?.id);
    if (mapped >= 0) answers[mapped] = answer;
  }
  return {
    ...cursor,
    signature: next.signature,
    index,
    elapsed: 0,
    revealedStep,
    revealedProgress: revealedStep === index ? 0 : cursor.revealedProgress,
    revealedNarrationProgress:
      revealedStep === index ? 0 : cursor.revealedNarrationProgress,
    finished: false,
    answers,
  };
}
