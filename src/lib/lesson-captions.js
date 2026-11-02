import { narrationTiming } from "./narration-timing.js";

// Reveal the current spoken thought with the playback clock. Keep the full
// sentence for accessibility while only the spoken text occupies visual space.
export function captionFrame(text = "", progress = 0) {
  const { units, phases } = narrationTiming(text);
  if (!phases.length) return { full: "", text: "" };
  const chunks = [];
  for (const phase of phases) {
    for (let start = phase.start; start < phase.end; start += 76)
      chunks.push({ start, end: Math.min(phase.end, start + 76) });
  }
  const fraction = Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress))
    : 0;
  const count = Math.floor(units.length * fraction + 1e-7);
  const chunk = chunks.find((part) => count <= part.end);
  return {
    full: units.slice(chunk.start, chunk.end).join("").trim(),
    text: units.slice(chunk.start, count).join("").trim(),
  };
}

export const narrationCaption = (text, progress) =>
  captionFrame(text, progress).text;
