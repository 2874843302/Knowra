const units = (text) => Array.from(String(text || ""));

// One clock for the whole illustration: label -> expression -> result -> detail.
// Finished trace rows retain their ink while subsequent code lines are explained.
export function visualWritingFields(visual, progress, previous) {
  const entries = [["title", visual.title]];
  const items = visual.items || visual.rows || [];
  const retained = visual.type === "trace" ? previous?.rows?.length || 0 : 0;
  const names =
    {
      comparison: ["label", "expression", "result", "detail"],
      bindings: ["name", "value", "type"],
      trace: ["name", "value"],
    }[visual.type] || [];
  items.forEach((item, i) => {
    if (i >= retained)
      names.forEach((name) => entries.push([`${i}.${name}`, item[name]]));
  });
  if (visual.output) entries.push(["output", visual.output]);
  const total = entries.reduce(
    (sum, [, text]) => sum + units(text).length + 4,
    0,
  );
  let budget = Math.floor(Math.max(0, Math.min(1, progress)) * total);
  const result = {};
  for (const [key, value] of entries) {
    const chars = units(value);
    result[key] = chars.slice(0, Math.max(0, budget)).join("");
    budget -= chars.length + 4;
  }
  if (retained) {
    result.title = visual.title;
    items.slice(0, retained).forEach((item, i) =>
      names.forEach((name) => {
        result[`${i}.${name}`] = item[name];
      }),
    );
  }
  return result;
}
