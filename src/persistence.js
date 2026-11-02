export const WORKSPACE_KEY = "knowra-workspace-id";
export const BASE_KEY = "knowra-server-base-v2";
export function workspaceHeaders() {
  // Ownership is derived exclusively from the HttpOnly login session.
  return {};
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
export function changes(base, next, path = []) {
  if (equal(base, next)) return [];
  if (record(base) && record(next)) {
    return [...new Set([...Object.keys(base), ...Object.keys(next)])].flatMap(
      (key) => changes(base[key], next[key], [...path, key]),
    );
  }
  return [{ op: next === undefined ? "remove" : "set", path, value: next }];
}
// Preserve independent edits from other tabs, including additions to keyed lists.
export function mergeState(base, local, remote) {
  if (equal(base, local)) return remote;
  if (equal(base, remote) || equal(local, remote)) return local;
  if (record(base) && record(local) && record(remote)) {
    const merged = {};
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      const value = mergeState(base[key], local[key], remote[key]);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  if ([base, local, remote].every(Array.isArray)) {
    const keyOf = (value) => (typeof value === "string" ? value : value?.id);
    if ([...base, ...local, ...remote].every((value) => keyOf(value))) {
      const maps = [base, local, remote].map((items) =>
        Object.fromEntries(items.map((value) => [keyOf(value), value])),
      );
      const merged = mergeState(...maps);
      return [...new Set([...local.map(keyOf), ...remote.map(keyOf)])]
        .filter((key) => merged[key] !== undefined)
        .map((key) => merged[key]);
    }
  }
  return local;
}
export async function workspaceRequest(method = "GET", payload, accountId) {
  const response = await fetch("/api/workspace", {
    method,
    headers: {
      ...workspaceHeaders(),
      "Content-Type": "application/json",
      ...(accountId ? { "X-Account-Id": accountId } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json();
  if (response.status === 401)
    window.dispatchEvent(new Event("knowra-auth-required"));
  if (response.status === 409) return { ...data, conflict: true };
  if (!response.ok) throw new Error(data.error || "无法连接学习空间");
  return data;
}
