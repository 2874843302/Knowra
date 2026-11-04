import {
  narrationTiming,
  narrationActiveTime,
  narrationElapsedAtActive,
  narrationCueActiveTime,
} from "./narration-timing.js";
import { contentError } from "./generation-validation.js";

// Shared by generation, AI editing and live teaching. Delivery cues refer to
// literal narration, so presentation follows meaning rather than a second clock.
const roles = new Set([
  "hook",
  "explain",
  "example",
  "contrast",
  "apply",
  "recap",
]);
const representations = new Set([
  "diagram",
  "comparison",
  "code",
  "table",
  "worked-example",
]);
const text = (value, field, limit = 1200) => {
  if (typeof value !== "string" || !value.trim() || value.length > limit)
    throw new Error(`教学设计 ${field} 缺失或无效。`);
  return value.trim();
};

export const TEACHING_DELIVERY_REQUEST = `每步增加 role（hook/explain/example/contrast/apply/recap，按实际教学用途选择）和 delivery。delivery.write 是 narration 中开始书写时的一小段连续原文；有 visual 时 delivery.visual 是开始展开图解的 narration 原文；需要稍后强调时可提供 delivery.emphasis。锚点必须逐字出现在该步 narration 中，不要填时间、概括或板书文字。先用口语建立问题，在讲到对应关系时书写/画图，再解释原因；板书是精炼的关系、例子或推理，不能照搬口语。图解节点顺序与口语解释顺序一致。不强制每段都画图，短补讲不必重复整套开场。`;

export const TEACHING_DESIGN_REQUEST = `这是可播放的教学内容，不是文章分段。teaching 增加 design:{problem:"本讲要解决的具体情境或问题",approach:"从什么直觉/例子出发，如何推理到目标",representations:["diagram/comparison/code/table/worked-example 中实际使用的形式"],rationale:"这些形式为什么适合当前内容"}。按主题和用户详细度设计，不固定步骤数、图解数量或学科模板；至少把一种有解释力的例子、对比、推演或图示实际写进 steps，不能只在设计里宣称。worked-example 对应 role=example/contrast/apply 的具体例子或推演。diagram/comparison/code/table 必须在 visual 或 board 中实际存在。理解题围绕刚讲的推理及常见误区，答题后继续推进。${TEACHING_DELIVERY_REQUEST}`;

export function normalizeTeachingDesign(value) {
  if (value == null) return undefined;
  if (
    !Array.isArray(value.representations) ||
    !value.representations.length ||
    value.representations.some((r) => !representations.has(r))
  )
    throw new Error("教学设计 representations 必须选择实际使用的呈现形式。");
  return {
    problem: text(value.problem, "problem"),
    approach: text(value.approach, "approach"),
    representations: [...new Set(value.representations)],
    rationale: text(value.rationale, "rationale"),
  };
}

export function normalizeTeachingDirection(step) {
  const result = {};
  if (step.role != null) {
    if (!roles.has(step.role)) throw new Error("教学步骤 role 无效。");
    result.role = step.role;
  }
  if (step.delivery != null) {
    const delivery = {};
    for (const field of ["write", "visual", "emphasis"]) {
      if (step.delivery[field] == null) continue;
      const anchor = text(step.delivery[field], `delivery.${field}`, 200);
      if (!step.narration.includes(anchor))
        throw new Error(
          `delivery.${field} 必须逐字引用当前 narration 中的一段原文。`,
        );
      delivery[field] = anchor;
    }
    if (!delivery.write || (step.visual && !delivery.visual))
      throw new Error(
        "delivery 需要 write，带图解的步骤还需要 visual 讲解锚点。",
      );
    result.delivery = delivery;
  }
  return result;
}

export function validateTeachingDesign(teaching) {
  if (!teaching?.design)
    throw contentError(
      "/design",
      "缺少 teaching.design：先明确本讲的具体问题、推理路径与呈现依据，再落实到 steps。",
    );
  validateTeachingDelivery(teaching.steps);
  const actual = {
    diagram: (s) => ["diagram", "vector-transform"].includes(s.visual?.type),
    comparison: (s) => s.visual?.type === "comparison",
    code: (s) => /```[^\n]*\n[\s\S]+?```/.test(s.board),
    table: (s) => /\|[^\n]+\|\s*\n\s*\|?\s*:?-{3}/.test(s.board),
    "worked-example": (s) => ["example", "contrast", "apply"].includes(s.role),
  };
  for (const form of teaching.design.representations)
    if (!teaching.steps.some(actual[form]))
      throw contentError(
        "/steps",
        `教学设计宣称使用 ${form}，但 steps 中没有相应内容；请落实或选择真实使用的形式。`,
      );
  // Ignore formatting when detecting a narration pasted into the board.
  const plain = (v) => v.replace(/[\p{P}\p{S}\s]/gu, "");
  if (teaching.steps.some((s) => plain(s.board) === plain(s.narration)))
    throw contentError(
      "/steps",
      "板书仍在照抄口语：请提炼关系或推理，narration 解释为什么与如何理解。",
    );
}

export function validateTeachingDelivery(steps) {
  const index = steps.findIndex(
    (s) => !s.role || !s.delivery?.write || (s.visual && !s.delivery.visual),
  );
  if (index >= 0)
    throw contentError(
      `/steps/${index}`,
      "每步需要 role 和 delivery.write；带图解的步骤需要 delivery.visual，锚点逐字引用 narration。",
    );
}

const clamp = (n) => Math.max(0, Math.min(1, n));
export function deliveryStart(step, field) {
  const anchor = step.delivery?.[field];
  const index = anchor ? step.narration.indexOf(anchor) : -1;
  return index < 0
    ? 0
    : narrationElapsedAtActive(
        step.narration,
        narrationCueActiveTime(step.narration, index),
      );
}
export function writingProgress(step, elapsed) {
  if (step?.kind === "checkpoint") return 1;
  return clamp(
    (narrationActiveTime(step?.narration || "", elapsed) -
      narrationActiveTime(step?.narration || "", step?.writeStart || 0)) /
      (step?.writeDuration || 1),
  );
}
export function visualProgress(step, narrationProgress, boardProgress) {
  if (!step?.delivery?.visual)
    // Even a short board may accompany a long explanation. Illustrations follow
    // speech, rather than finishing as soon as that short board has been written.
    return narrationProgress;
  const start = narrationCueActiveTime(
    step.narration,
    step.narration.indexOf(step.delivery.visual),
  );
  const duration = narrationTiming(step.narration).contentDuration;
  return clamp(
    (narrationProgress * duration - start) / Math.max(1, duration - start),
  );
}
export function emphasisReady(step, narrationProgress, boardProgress) {
  return (
    boardProgress >= 1 &&
    narrationProgress * narrationTiming(step.narration).contentDuration >=
      narrationActiveTime(step.narration, deliveryStart(step, "emphasis"))
  );
}
