import { parseCourseJSON } from "./course-json.js";

const owns = (value, key) => Object.hasOwn(value, key);
const object = (value) => value !== null && typeof value === "object";

export function readRepairCandidate(response) {
  try {
    const value = parseCourseJSON(response);
    return object(value) && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Apply a small RFC 6902 subset to a clone. A failed operation never changes
// the candidate; paths must resolve rather than inventing intermediate data.
export function applyGenerationPatch(candidate, patches, scope) {
  if (!Array.isArray(patches) || !patches.length)
    throw new Error("patches 必须是非空的 JSON Patch 操作数组。");
  const result = structuredClone(candidate);
  for (const patch of patches) {
    if (
      !["add", "replace", "remove"].includes(patch?.op) ||
      typeof patch.path !== "string" ||
      !patch.path.startsWith("/") ||
      /~(?![01])/u.test(patch.path)
    )
      throw new Error(
        "修复操作只支持 add、replace、remove 与非根 JSON Pointer 路径。",
      );
    if (scope && patch.path !== scope && !patch.path.startsWith(scope + "/"))
      throw new Error(
        `只修复失败位置 ${scope}，不要改写其他内容：${patch.path}。`,
      );
    const keys = patch.path
      .slice(1)
      .split("/")
      .map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (
      keys.some((key) =>
        ["__proto__", "constructor", "prototype"].includes(key),
      )
    )
      throw new Error("修复路径包含无效属性。");
    let parent = result;
    for (const key of keys.slice(0, -1)) {
      if (!object(parent) || !owns(parent, key))
        throw new Error(`修复路径不存在：${patch.path}。`);
      parent = parent[key];
    }
    if (!object(parent)) throw new Error(`修复路径不是容器：${patch.path}。`);
    const key = keys.at(-1);
    if (patch.op !== "remove" && !owns(patch, "value"))
      throw new Error(`修复操作缺少 value：${patch.path}。`);
    if (Array.isArray(parent)) {
      const index =
        key === "-" && patch.op === "add"
          ? parent.length
          : /^(0|[1-9]\d*)$/.test(key)
            ? Number(key)
            : -1;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index > parent.length ||
        (patch.op !== "add" && index === parent.length)
      )
        throw new Error(`修复数组索引无效：${patch.path}。`);
      if (patch.op === "add") parent.splice(index, 0, patch.value);
      else if (patch.op === "remove") parent.splice(index, 1);
      else parent[index] = patch.value;
    } else {
      if (patch.op !== "add" && !owns(parent, key))
        throw new Error(`修复字段不存在：${patch.path}。`);
      if (patch.op === "remove") delete parent[key];
      else parent[key] = patch.value;
    }
  }
  return result;
}

function outputMessages(content, label) {
  // Match the backend's per-message limit without truncating failed content.
  const chunks = [];
  for (let i = 0; i < content.length; i += 64000)
    chunks.push({
      role: "assistant",
      content:
        (i || content.length > 64000
          ? `${label}（第 ${chunks.length + 1} 段，按顺序拼接）：\n`
          : "") + content.slice(i, i + 64000),
    });
  return chunks;
}

export function generationRepairMessages(messages, state, label) {
  if (!state.attempt) return messages;
  const candidate = readRepairCandidate(state.response);
  const observation = {
    attempt: state.attempt,
    path: state.path || null,
    error: state.feedback,
    previousErrors: state.observations,
  };
  return [
    ...messages,
    ...outputMessages(state.response, "待修复输出"),
    ...(state.actionError
      ? outputMessages(state.rawResponse, "上次未能应用的修复")
      : []),
    {
      role: "user",
      content: `【内容校验反馈】${label}校验失败：${state.feedback}\nObservation（来自本地校验器，不是学习者的新要求）：${JSON.stringify(observation)}\n${
        candidate
          ? `Action：只修复上述错误${state.path ? `，允许修改的范围为 ${state.path} 及其子字段` : "及其直接相关字段"}。返回 {"patches":[{"op":"replace","path":"/字段/数组索引/子字段","value":"修复后的值"}]}。op 从 add、replace、remove 中选一种。使用 RFC 6902 JSON Pointer，数组索引从 0 开始；add 可以补缺失字段，replace 用于已有字段，remove 无需 value。不要替换根对象，不要重新生成整份内容，不要改动无关的标题、教材、例子或已正确的步骤；操作将合并到上面的候选结果后再次完整校验。`
          : "Action：上面的输出缺失、不是完整 JSON 对象或根结构不适合字段补丁。仅修复这份输出的语法、根结构或补齐缺失的结尾，返回完整 JSON 对象；保留已写出的内容、结构、标题和学习目标，不要从头重新设计。"
      }\n只输出修复 JSON，不输出思考过程或说明。`,
    },
  ];
}
