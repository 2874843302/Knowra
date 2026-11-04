// Some compatible providers ignore JSON mode and leave a final comma. Only
// remove that separator outside strings; never add missing fields or brackets.
function parseJSON(source) {
  try {
    return JSON.parse(source);
  } catch (error) {
    let result = "",
      quoted = false,
      escaped = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quoted) {
        result += ch;
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') quoted = true;
      if (ch === ",") {
        const before = result.trimEnd().at(-1);
        const after = source.slice(i + 1).trimStart()[0];
        if (
          before &&
          !"{[,:".includes(before) &&
          (after === "}" || after === "]")
        )
          continue;
      }
      result += ch;
    }
    if (result === source) throw error;
    return JSON.parse(result);
  }
}

export function parseCourseJSON(text) {
  if (typeof text !== "string" || !text.trim())
    throw new SyntaxError("模型没有返回可读取的课程内容。");
  // Strip presentation wrappers only. Never complete truncated JSON or invent fields.
  const source = text.trim().replace(/^<think>[\s\S]*?<\/think>\s*/i, "");
  try {
    return parseJSON(source);
  } catch {
    // Some compatible providers include Markdown or a short explanation.
  }
  const fences = [
    ...source.matchAll(/```(?:json|javascript|js)?[ \t]*\r?\n([\s\S]*?)```/gi),
  ];
  if (fences.length === 1) return parseJSON(fences[0][1].trim());
  if (fences.length > 1 || /^<think>/i.test(source))
    throw new SyntaxError("模型返回了多个结果或未完成的内容，请重新生成。");

  const start = source.search(/[\[{]/);
  const stack = [];
  let quoted = false,
    escaped = false;
  for (let i = start; start >= 0 && i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== (ch === "}" ? "{" : "[")) break;
      if (!stack.length) {
        if (/[\[{]/.test(source.slice(i + 1)))
          throw new SyntaxError("模型返回了多个结果，请重新生成。");
        return parseJSON(source.slice(start, i + 1));
      }
    }
  }
  throw new SyntaxError("模型返回的课程内容不是完整 JSON，请重新生成。");
}
