// Adapted from EasyUI AIResponse safeHref (MIT), Copyright (c) 2026 Suraj Maurya.
// Keep browser URL parsing and reject credentials and control characters.
const relativeBase = "https://relative.invalid";
export function safeResponseHref(raw) {
  if (
    typeof raw !== "string" ||
    !raw.trim() ||
    /[\u0000-\u001f\u007f]/.test(raw)
  )
    return null;
  try {
    const value = raw.trim();
    const url = new URL(value, relativeBase);
    if (url.username || url.password) return null;
    if (url.origin === relativeBase) return value;
    return ["http:", "https:", "mailto:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
