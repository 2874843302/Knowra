export const questionType = (q) => q.type || "choice";
export const isObjectiveQuestion = (q) =>
  ["choice", "true_false", "fill"].includes(questionType(q));
const text = (v) => typeof v === "string" && !!v.trim();

export function normalizeQuestion(q, { allowEmptyExplanation = false } = {}) {
  const type = questionType(q || {});
  if (
    !q ||
    !["choice", "true_false", "fill", "response", "code"].includes(type) ||
    !text(q.question) ||
    (!allowEmptyExplanation && !text(q.explanation))
  )
    throw new Error("请补全题型、题目和参考解析。");
  const result = {
    question: q.question.trim(),
    explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
    ...(q.type ? { type } : {}),
  };
  if (type === "choice") {
    if (
      !Array.isArray(q.options) ||
      q.options.length < 2 ||
      !q.options.every(text) ||
      new Set(q.options.map((o) => o.trim())).size !== q.options.length ||
      !Number.isInteger(q.answer) ||
      q.answer < 0 ||
      q.answer >= q.options.length
    )
      throw new Error("选择题需要不同的选项和有效答案索引。");
    result.options = q.options.map((o) => o.trim());
    result.answer = q.answer;
  } else if (type === "true_false") {
    if (typeof q.answer !== "boolean")
      throw new Error("判断题的 answer 必须是 true 或 false。");
    result.answer = q.answer;
  } else if (type === "fill") {
    if (
      !Array.isArray(q.blanks) ||
      !q.blanks.length ||
      q.blanks.some(
        (b) =>
          !Array.isArray(b?.answers) ||
          !b.answers.length ||
          !b.answers.every(text) ||
          (b.caseSensitive !== undefined &&
            typeof b.caseSensitive !== "boolean"),
      )
    )
      throw new Error("填空题需要每一空的可接受答案 answers。");
    result.blanks = q.blanks.map((b, i) => ({
      label: text(b.label) ? b.label.trim() : `第 ${i + 1} 空`,
      answers: b.answers.map((a) => a.trim()),
      caseSensitive: b.caseSensitive !== false,
    }));
  }
  return result;
}

export function questionOptions(q) {
  return questionType(q) === "true_false"
    ? [
        { label: "正确", value: true },
        { label: "错误", value: false },
      ]
    : (q.options || []).map((label, value) => ({ label, value }));
}
export function answerReady(q, answer) {
  switch (questionType(q)) {
    case "choice":
      return (
        Number.isInteger(answer) && answer >= 0 && answer < q.options.length
      );
    case "true_false":
      return typeof answer === "boolean";
    case "fill":
      return (
        Array.isArray(answer) &&
        answer.length === q.blanks.length &&
        answer.every(text)
      );
    default:
      return text(answer);
  }
}
const normalizeFill = (s, sensitive) => {
  const value = s.normalize("NFKC").trim().replace(/\s+/g, " ");
  return sensitive ? value : value.toLocaleLowerCase();
};
export function evaluateQuestion(q, answer) {
  if (!answerReady(q, answer)) return null;
  if (questionType(q) === "fill") {
    const blanks = q.blanks.map((b, i) =>
      b.answers.some(
        (a) =>
          normalizeFill(a, b.caseSensitive !== false) ===
          normalizeFill(answer[i], b.caseSensitive !== false),
      ),
    );
    return { correct: blanks.every(Boolean), blanks };
  }
  return { correct: isObjectiveQuestion(q) ? answer === q.answer : null };
}
export function formatQuestionAnswer(q, answer) {
  if (questionType(q) === "fill") return (answer || []).join("；");
  if (["choice", "true_false"].includes(questionType(q)))
    return questionOptions(q).find((o) => o.value === answer)?.label || "";
  return answer || "";
}
