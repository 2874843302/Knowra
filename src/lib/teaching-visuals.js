// Model-authored illustrations are data, never executable HTML or SVG.
const text = (value, limit, field) => {
  if (typeof value !== "string" || !value.trim() || value.length > limit)
    throw new Error(`图解 ${field} 缺失或过长。`);
  return value.trim();
};
const optional = (value, limit, field) =>
  value == null ? undefined : text(value, limit, field);
const list = (value, min, max, field) => {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new Error(`图解 ${field} 需要 ${min} 至 ${max} 项。`);
  return value;
};

export function normalizeTeachingVisual(value) {
  if (value == null) return undefined;
  const title = text(value.title, 100, "title");
  if (value.type === "diagram") {
    if (!["flow", "venn"].includes(value.layout))
      throw new Error("图解 layout 应为 flow 或 venn。");
    const nodes = list(
      value.nodes,
      2,
      value.layout === "venn" ? 2 : 6,
      "nodes",
    ).map((node) => ({
      label: text(node?.label, 28, "node.label"),
      detail: optional(node?.detail, 180, "node.detail"),
    }));
    return {
      type: "diagram",
      layout: value.layout,
      title,
      nodes,
      ...(value.layout === "venn"
        ? { intersection: text(value.intersection, 40, "intersection") }
        : {}),
      caption: optional(value.caption, 180, "caption"),
    };
  }
  if (["bindings", "comparison", "trace"].includes(value.type)) {
    const key = value.type === "trace" ? "rows" : "items";
    const fields = {
      bindings: ["name", "value", "type"],
      comparison: ["label", "expression", "result", "detail"],
      trace: ["name", "value"],
    }[value.type];
    return {
      type: value.type,
      title,
      [key]: list(value[key], 1, 8, key).map((item) =>
        Object.fromEntries(
          fields.map((field) => [field, text(item?.[field], 180, field)]),
        ),
      ),
      ...(value.type === "trace" && value.output != null
        ? { output: text(value.output, 300, "output") }
        : {}),
    };
  }
  if (value.type === "vector-transform") {
    const pair = (v) =>
      Array.isArray(v) &&
      v.length === 2 &&
      v.every(
        (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 10,
      );
    if (
      !pair(value.vector) ||
      !pair(value.factors) ||
      !["axes", "scalar"].includes(value.mode)
    )
      throw new Error("向量图解需要有效 mode、vector 与 factors。");
    return {
      type: value.type,
      title,
      mode: value.mode,
      vector: [...value.vector],
      factors: [...value.factors],
    };
  }
  throw new Error(
    "不支持的图解类型，请使用 diagram、bindings、comparison、trace 或 vector-transform。",
  );
}
