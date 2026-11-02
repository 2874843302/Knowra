import { narrationTiming } from "./narration-timing.js";

export function speechPreloadPlan(
  current,
  phaseIndex,
  following = [],
  limit = 5,
) {
  const texts = [];
  if (!current || current.kind === "checkpoint") return texts;
  for (const [index, step] of [current, ...following].entries()) {
    if (step.kind === "checkpoint") break;
    const timing = narrationTiming(step.narration || "");
    for (const phase of timing.phases.slice(index ? 0 : phaseIndex)) {
      texts.push(timing.units.slice(phase.start, phase.end).join(""));
      if (texts.length === limit) return texts;
    }
  }
  return texts;
}
