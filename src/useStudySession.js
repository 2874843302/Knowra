import { useEffect, useRef } from "react";
import { localDate, useStore } from "./store";
import { FLUSH_SECONDS, addStudySeconds, isStudying } from "./lib/study-session";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "scroll"];

export function useStudySession({ active, playing }) {
  const { setState } = useStore();
  const pending = useRef(0);
  const lastActivity = useRef(0);
  const status = useRef({ playing });
  status.current = { playing };

  useEffect(() => {
    if (!active) return;
    const flush = () => {
      const seconds = pending.current;
      if (!seconds) return;
      pending.current = 0;
      const day = localDate();
      setState((s) => ({ ...s, studyLog: addStudySeconds(s.studyLog, day, seconds) }));
    };
    const mark = () => {
      lastActivity.current = Date.now();
    };
    mark();
    const tick = () => {
      if (
        !isStudying({
          visible: !document.hidden,
          playing: status.current.playing,
          idleMs: Date.now() - lastActivity.current,
        })
      )
        return;
      pending.current += 1;
      if (pending.current >= FLUSH_SECONDS) flush();
    };
    const visibility = () => {
      if (document.hidden) flush();
    };
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", visibility);
    for (const type of ACTIVITY_EVENTS)
      document.addEventListener(type, mark, { capture: true, passive: true });
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      for (const type of ACTIVITY_EVENTS)
        document.removeEventListener(type, mark, { capture: true });
      flush();
    };
  }, [active, setState]);
}
