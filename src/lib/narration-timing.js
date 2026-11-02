// A shared sentence clock keeps captions, writing cues and optional speech in step.
const graphemes = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
const sentences = new Intl.Segmenter("zh-CN", { granularity: "sentence" });
export const textUnits = (text = "") =>
  Array.from(graphemes.segment(text), (part) => part.segment);
export const NARRATION_PACING_VERSION = 1;
const cache = new Map();

export function narrationTiming(text = "") {
  if (cache.has(text)) return cache.get(text);
  const units = textUnits(text),
    offsets = [0];
  for (const unit of units) offsets.push(offsets.at(-1) + unit.length);
  const boundaries = new Map(offsets.map((offset, index) => [offset, index]));
  const contentDuration = Math.max(1400, units.length * 65);
  const unitDuration = units.length ? contentDuration / units.length : 0;
  const ranges = [];
  let segmentStart = 0;
  for (const sentence of sentences.segment(text)) {
    const end = boundaries.get(sentence.index + sentence.segment.length);
    if (end === undefined) continue;
    // Bound synthesis latency and phoneme input size for very long sentences.
    // These internal audio boundaries add no extra sentence pause.
    while (end - segmentStart > 220) {
      let cut = segmentStart + 220;
      for (let i = cut - 1; i > segmentStart + 110; i--) {
        if (/[，；、,;\s]/u.test(units[i])) {
          cut = i + 1;
          break;
        }
      }
      ranges.push({ end: cut, pause: 0 });
      segmentStart = cut;
    }
    if (sentence.segment.trim()) ranges.push({ end });
    else if (ranges.length) ranges.at(-1).end = end;
    segmentStart = end;
  }
  const phases = [];
  let start = 0,
    time = 0;
  for (const { end, pause: chunkPause } of ranges) {
    const speechEnd = time + (end - start) * unitDuration;
    const pause =
      chunkPause ??
      (/\n\s*$/u.test(units.slice(start, end).join("")) ? 1200 : 800);
    phases.push({
      index: phases.length,
      start,
      end,
      startTime: time,
      speechEnd,
      pauseEnd: speechEnd + pause,
    });
    time = speechEnd + pause;
    start = end;
  }
  const result = {
    units,
    offsets,
    phases,
    unitDuration,
    contentDuration,
    duration: phases.length ? time : contentDuration,
  };
  if (cache.size >= 128) cache.delete(cache.keys().next().value);
  cache.set(text, result);
  return result;
}

export function narrationFrame(text, elapsed = 0) {
  const timing = narrationTiming(text);
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  for (const phase of timing.phases) {
    if (time < phase.pauseEnd) {
      const paused = time >= phase.speechEnd;
      const count = paused
        ? phase.end
        : Math.min(
            phase.end,
            phase.start + (time - phase.startTime) / timing.unitDuration,
          );
      return {
        phase,
        paused,
        progress: timing.units.length ? count / timing.units.length : 1,
        count: Math.floor(count + 1e-7),
        activeTime: count * timing.unitDuration,
      };
    }
  }
  return {
    phase: timing.phases.at(-1),
    paused: false,
    progress: 1,
    count: timing.units.length,
    activeTime: timing.phases.length
      ? timing.contentDuration + Math.max(0, time - timing.duration)
      : time,
  };
}

export const narrationProgressAt = (text, elapsed) =>
  narrationFrame(text, elapsed).progress;
export const narrationActiveTime = (text, elapsed) =>
  narrationFrame(text, elapsed).activeTime;

// Inverse of the active clock; include the pause before a following sentence.
export function narrationElapsedAtActive(text, activeTime) {
  const timing = narrationTiming(text);
  const active = Math.max(0, activeTime);
  for (const phase of timing.phases) {
    if (active < phase.end * timing.unitDuration)
      return (
        phase.startTime +
        Math.max(0, active - phase.start * timing.unitDuration)
      );
  }
  return timing.duration + Math.max(0, active - timing.contentDuration);
}

export function narrationCueActiveTime(text, utf16Offset) {
  return (
    textUnits(text.slice(0, utf16Offset)).length *
    narrationTiming(text).unitDuration
  );
}
