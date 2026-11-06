export const IDLE_WINDOW_MS = 90000;
export const FLUSH_SECONDS = 30;

export function isStudying({ visible, playing, idleMs }) {
  if (!visible) return false;
  return playing || idleMs <= IDLE_WINDOW_MS;
}

export function addStudySeconds(log, dayKey, seconds) {
  if (!seconds) return log || {};
  return { ...(log || {}), [dayKey]: (Number(log?.[dayKey]) || 0) + seconds };
}

export function studiedSeconds(log, dayKey) {
  return Number(log?.[dayKey]) || 0;
}
