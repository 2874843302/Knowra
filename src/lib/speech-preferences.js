export const NARRATION_RATES = [0.75, 1, 1.15, 1.25, 1.5, 2];
export const DEFAULT_NARRATION_RATE = 1.25;

export function initialNarrationVoice(appearance) {
  const voice = appearance?.narrationVoiceId || "";
  // Adopt fluent narration once for old automatic defaults. Future explicit
  // high-quality selections remain available and persist as version 3.
  if (
    appearance?.narrationVoiceVersion !== 3 &&
    ["zf_001", "friendly-female"].includes(voice)
  )
    return "";
  return voice;
}

export function initialNarrationRate(saved, appearance) {
  if (NARRATION_RATES.includes(appearance?.narrationRate))
    return appearance.narrationRate;
  // Old 1x entries were saved automatically. Future explicit choices, including
  // 1x, are remembered at account level and take priority over this migration.
  if (NARRATION_RATES.includes(saved?.rate) && saved.rate !== 1)
    return saved.rate;
  return DEFAULT_NARRATION_RATE;
}
