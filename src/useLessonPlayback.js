import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { rebaseClassroomCursor } from "./lib/adaptive-classroom";
import { useStore } from "./store";
import { evaluateQuestion } from "./lib/questions";
import { writingProgress } from "./lib/teaching-direction.js";
import { useModelSpeech } from "./useModelSpeech";
import {
  initialNarrationRate,
  initialNarrationVoice,
} from "./lib/speech-preferences";
import {
  NARRATION_PACING_VERSION,
  narrationFrame,
  narrationProgressAt,
  narrationElapsedAtActive,
} from "./lib/narration-timing.js";

const clamp = (value, max) =>
  Math.max(0, Math.min(Math.max(0, max), Number.isFinite(value) ? value : 0));

export function useLessonPlayback(key, sequence, active, pauseSignal) {
  const { state, setState, notify } = useStore();
  const saved = state.lessonPlayback?.[key];
  const valid = saved?.signature === sequence.signature;
  const [cursor, setCursor] = useState(() => {
    const index = valid
      ? Math.floor(clamp(saved.step, sequence.steps.length - 1))
      : Math.max(
          0,
          sequence.steps.findIndex((s) => s.id === sequence.focusStepId),
        );
    return {
      signature: sequence.signature,
      index,
      elapsed: valid
        ? clamp(
            saved.pacingVersion === NARRATION_PACING_VERSION
              ? saved.elapsed
              : narrationElapsedAtActive(
                  sequence.steps[index]?.narration || "",
                  saved.elapsed || 0,
                ),
            sequence.steps[index]?.duration || 0,
          )
        : 0,
      revealedStep: valid
        ? Math.max(
            index,
            Math.floor(clamp(saved.revealedStep, sequence.steps.length - 1)),
          )
        : index,
      revealedProgress: valid ? clamp(saved.revealedProgress, 1) : 0,
      revealedNarrationProgress: valid
        ? clamp(saved.revealedNarrationProgress, 1)
        : 0,
      finished: valid && !!saved.finished,
      answers:
        valid && saved.answers && typeof saved.answers === "object"
          ? saved.answers
          : {},
    };
  });
  const [rate, setPlaybackRate] = useState(() =>
    initialNarrationRate(saved, state.appearance),
  );
  const setRate = (value) => {
    setPlaybackRate(value);
    setState((s) => ({
      ...s,
      appearance: { ...s.appearance, narrationRate: value },
    }));
  };
  const [playing, setPlaying] = useState(false);
  const voiceRequested = state.appearance?.narrationVoice ?? true;
  const voiceId = initialNarrationVoice(state.appearance);
  const snapshot = useRef(null);
  snapshot.current = { ...cursor, rate };
  const current = sequence.steps[cursor.index] || sequence.steps.at(-1);
  const last = cursor.index === sequence.steps.length - 1;
  const waiting =
    current?.kind === "checkpoint" && !cursor.answers[cursor.index];
  const progress = writingProgress(current, cursor.elapsed);
  const revealedProgress =
    cursor.index === cursor.revealedStep
      ? Math.max(progress, cursor.revealedProgress)
      : cursor.revealedProgress;
  const narration = narrationFrame(current?.narration || "", cursor.elapsed);
  const speech = useModelSpeech({
    enabled: voiceRequested,
    voiceId,
    active,
    playing: playing && !cursor.finished,
    current,
    elapsed: cursor.elapsed,
    phase: narration.phase,
    rate,
    following: sequence.steps.slice(cursor.index + 1, cursor.index + 3),
    onError: (error) => {
      setPlaying(false);
      notify(error.message);
    },
  });
  const speechClock = useRef(speech);
  speechClock.current = speech;
  const voice = voiceRequested && speech.effective;
  const narrationProgress =
    current?.kind === "checkpoint" ? 1 : narration.progress;
  const revealedNarrationProgress =
    cursor.index === cursor.revealedStep
      ? Math.max(narrationProgress, cursor.revealedNarrationProgress)
      : cursor.revealedNarrationProgress;
  const persist = () => {
    const value = snapshot.current;
    if (!value || value.signature !== sequence.signature) return;
    const step = sequence.steps[value.index];
    setState((s) => ({
      ...s,
      boardPages: { ...s.boardPages, [key]: step?.page || 0 },
      lessonPlayback: {
        ...s.lessonPlayback,
        [key]: {
          signature: sequence.signature,
          pacingVersion: NARRATION_PACING_VERSION,
          step: value.index,
          stepId: step?.id,
          revealedStepId: sequence.steps[value.revealedStep]?.id,
          elapsed: value.elapsed,
          revealedStep: value.revealedStep,
          revealedProgress:
            value.index === value.revealedStep
              ? Math.max(
                  value.revealedProgress,
                  writingProgress(step, value.elapsed),
                )
              : value.revealedProgress,
          revealedNarrationProgress:
            value.index === value.revealedStep
              ? Math.max(
                  value.revealedNarrationProgress,
                  narrationProgressAt(step?.narration || "", value.elapsed),
                )
              : value.revealedNarrationProgress,
          rate: value.rate,
          finished: value.finished,
          answers: value.answers,
        },
      },
    }));
  };
  const saveOnLeave = useRef(persist);
  saveOnLeave.current = persist;
  // Save transitions and pauses, rather than writing the workspace every character.
  useEffect(persist, [
    key,
    cursor.index,
    cursor.revealedStep,
    cursor.answers,
    cursor.finished,
    playing,
    rate,
    sequence.signature,
    cursor.signature,
  ]);
  useEffect(() => () => saveOnLeave.current(), []);
  useEffect(() => {
    setPlaying(false);
  }, [active, pauseSignal]);
  const previousSequence = useRef(sequence);
  useLayoutEffect(() => {
    const previous = previousSequence.current;
    previousSequence.current = sequence;
    if (previous.signature === sequence.signature) return;
    setCursor((value) => rebaseClassroomCursor(value, previous, sequence));
    setPlaying(true);
  }, [sequence.signature]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  useEffect(() => {
    if (waiting) setPlaying(false);
  }, [waiting]);

  const move = (previous, index, elapsed = 0) => ({
    ...previous,
    index,
    elapsed,
    finished: false,
    revealedStep: Math.max(previous.revealedStep, index),
    revealedNarrationProgress:
      index > previous.revealedStep
        ? narrationProgressAt(sequence.steps[index]?.narration || "", elapsed)
        : previous.index === previous.revealedStep
          ? Math.max(
              previous.revealedNarrationProgress,
              narrationProgressAt(
                sequence.steps[previous.index]?.narration || "",
                previous.elapsed,
              ),
            )
          : previous.revealedNarrationProgress,
    revealedProgress:
      index > previous.revealedStep
        ? writingProgress(sequence.steps[index], elapsed)
        : previous.index === previous.revealedStep
          ? Math.max(
              previous.revealedProgress,
              writingProgress(sequence.steps[previous.index], previous.elapsed),
            )
          : previous.revealedProgress,
  });
  const seek = (next) => {
    setPlaying(false);
    setCursor((previous) => {
      let index = Math.floor(clamp(next, sequence.steps.length - 1));
      const unanswered = sequence.steps.find(
        (step) =>
          step.index <= index &&
          step.kind === "checkpoint" &&
          !previous.answers[step.index],
      );
      if (unanswered && index > previous.index)
        index = Math.min(index, unanswered.index);
      return move(
        previous,
        index,
        sequence.steps[index]?.kind === "checkpoint"
          ? 0
          : sequence.steps[index]?.duration || 0,
      );
    });
  };
  const replay = () => {
    setPlaying(false);
    setCursor({
      signature: sequence.signature,
      index: 0,
      elapsed: 0,
      revealedStep: 0,
      revealedProgress: 0,
      revealedNarrationProgress: 0,
      finished: false,
      answers: {},
    });
  };
  // Continuing an answered checkpoint is never a replay operation. Guard the
  // expected index so rapid duplicate clicks cannot skip the following step.
  const continueAfterAnswer = () => {
    if (current?.kind !== "checkpoint" || waiting || cursor.finished) return;
    setCursor((value) => {
      if (
        value.index !== cursor.index ||
        value.finished ||
        !value.answers[value.index]
      )
        return value;
      return last
        ? { ...value, elapsed: current.duration, finished: true }
        : move(value, value.index + 1);
    });
    setPlaying(!last);
  };
  useEffect(() => {
    if (!playing || !active || !current || current.kind === "checkpoint")
      return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = (now - previous) * rate;
      previous = now;
      setCursor((value) => {
        const elapsed = speechClock.current.elapsed(value.elapsed, delta);
        if (elapsed < current.duration) return { ...value, elapsed };
        if (last)
          return { ...value, elapsed: current.duration, finished: true };
        return move(value, value.index + 1);
      });
    }, 60);
    return () => clearInterval(timer);
  }, [playing, active, current, rate, last]);
  useEffect(() => {
    if (cursor.finished) setPlaying(false);
  }, [cursor.finished]);
  return {
    ...cursor,
    current,
    rate,
    setRate,
    voice,
    voiceId: speech.voiceId,
    speechStatus: speech.status,
    speechService: speech.service,
    setVoiceId: (narrationVoiceId) =>
      setState((s) => ({
        ...s,
        appearance: {
          ...s.appearance,
          narrationVoiceId,
          narrationVoiceVersion: 3,
        },
      })),
    progress,
    revealedProgress,
    narrationProgress,
    sentencePaused: narration.paused,
    revealedNarrationProgress,
    last,
    waiting,
    playing: playing && active && !waiting && !cursor.finished,
    seek,
    replay,
    continueAfterAnswer,
    restart: () => {
      replay();
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    answer: (selected) => {
      if (!waiting) return;
      const result = evaluateQuestion(current.quiz, selected);
      if (!result) return;
      const { correct } = result;
      setCursor((value) => ({
        ...value,
        answers: { ...value.answers, [value.index]: { selected, correct } },
      }));
      if (current.assessment === "lesson" && typeof correct === "boolean")
        setState((s) => ({
          ...s,
          progress: {
            ...s.progress,
            [key]: { ...s.progress[key], quizCorrect: correct },
          },
        }));
    },
    toggle: () => {
      if (waiting) return;
      if (cursor.finished) {
        replay();
        setPlaying(true);
      } else if (current?.kind === "checkpoint") {
        continueAfterAnswer();
      } else setPlaying((value) => !value);
    },
    toggleVoice: () => {
      if (!voice && speech.service?.ready === false) {
        notify(speech.service.message);
        return;
      }
      setState((s) => ({
        ...s,
        appearance: { ...s.appearance, narrationVoice: !voiceRequested },
      }));
    },
  };
}
