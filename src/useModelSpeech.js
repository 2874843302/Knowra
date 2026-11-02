import { useEffect, useRef, useState } from "react";
import { useAuth, accountRequest } from "./auth";
import { LessonAudio } from "./lib/lesson-audio";
import { narrationTiming } from "./lib/narration-timing";
import { speechPreloadPlan } from "./lib/speech-preload";

export function useModelSpeech({
  enabled,
  voiceId,
  active,
  playing,
  current,
  elapsed,
  phase,
  rate,
  following,
  onError,
}) {
  const { user } = useAuth();
  const player = useRef(null);
  const [service, setService] = useState(null);
  const [status, setStatus] = useState("ready");
  const error = useRef(onError);
  error.current = onError;
  useEffect(() => {
    const value = new LessonAudio(user?.id || "");
    player.current = value;
    return () => {
      value.dispose();
      player.current = null;
    };
  }, [user?.id]);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    accountRequest("/tts/status")
      .then((value) => {
        if (!disposed) setService(value);
      })
      .catch(() => {
        if (!disposed)
          setService({
            ready: false,
            voices: [],
            message: "语音服务暂时不可用",
          });
      });
    return () => {
      disposed = true;
    };
  }, [active, user?.id]);
  const selectedVoice = service?.voices?.some((v) => v.id === voiceId)
    ? voiceId
    : service?.defaultVoice || "zf_006";
  const effective = enabled && service?.ready === true;
  const spoken =
    effective &&
    active &&
    current?.kind !== "checkpoint" &&
    !!current?.narration &&
    phase;
  useEffect(() => {
    const value = player.current;
    if (!spoken) {
      value?.stop();
      setStatus("ready");
      return;
    }
    const timing = narrationTiming(current.narration);
    value.sync({
      text: timing.units.slice(phase.start, phase.end).join(""),
      voice: selectedVoice,
      phase,
      elapsed,
      playing,
      rate,
      bufferTexts:
        elapsed === 0
          ? speechPreloadPlan(current, phase.index, following, 3).slice(1)
          : [],
      onStatus: setStatus,
      onError: (reason) => error.current(reason),
    });
    // Pause without disposing the cache; resume from the same audio position.
    return () => {
      if (value.record) {
        value.record.playing = false;
        value.record.audio?.pause();
      }
    };
  }, [
    spoken,
    current?.id,
    current?.narration,
    phase?.index,
    playing,
    rate,
    selectedVoice,
  ]);
  useEffect(() => {
    if (!spoken) return;
    const value = player.current;
    let cancelled = false;
    const texts = speechPreloadPlan(current, phase.index, following);
    // Prepare while the learner reads or pauses too. Keep a bounded queue and
    // stop adding work after a seek, voice change, or checkpoint.
    (async () => {
      for (const text of texts) {
        if (cancelled) break;
        await value.prepare(text, selectedVoice);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [spoken, current?.id, current?.narration, phase?.index, selectedVoice]);
  return {
    voiceId: selectedVoice,
    service,
    status,
    effective,
    elapsed: (previous, delta) =>
      enabled && !service
        ? previous
        : !spoken || previous >= narrationTiming(current.narration).duration
          ? previous + delta
          : (player.current?.elapsed(previous, delta) ?? previous),
  };
}
