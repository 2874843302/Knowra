const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };

// Decode a possibly incomplete JSON string value, so the UI can render text
// while the rest of a structured model response is still arriving.
export function extractJsonStringField(raw, field) {
  if (typeof raw !== "string") return "";
  const marker = new RegExp(`"${field}"\\s*:\\s*"`);
  const start = raw.search(marker);
  if (start < 0) return "";
  let index = raw.indexOf('"', raw.indexOf(":", start)) + 1;
  let value = "";
  while (index < raw.length) {
    const char = raw[index];
    if (char === '"') break;
    if (char !== "\\") {
      value += char;
      index += 1;
      continue;
    }
    const next = raw[index + 1];
    if (next === undefined) break;
    if (next === "u") {
      const hex = raw.slice(index + 2, index + 6);
      if (hex.length < 4) break;
      value += String.fromCharCode(parseInt(hex, 16));
      index += 6;
      continue;
    }
    value += escapes[next] ?? next;
    index += 2;
  }
  return value;
}

export function streamPreview(raw, kind = "chat") {
  if (typeof raw !== "string" || !raw) return "";
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return raw;
  if (kind === "classroom_adapt") return extractJsonStringField(raw, "reply");
  return extractJsonStringField(raw, "content");
}