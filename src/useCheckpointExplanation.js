import { useEffect, useRef, useState } from "react";
import { aiRequest, useStore } from "./store";
import {
  checkpointFallback,
  preparedCheckpointExplanation,
  requestCheckpointExplanation,
} from "./lib/checkpoint-explanation";
import { evaluateQuestion } from "./lib/questions";

// Only a fresh answer starts a request. Restoring progress or reopening the
// tutor never generates another explanation for an already answered question.
export function useCheckpointExplanation({
  course,
  lesson,
  sequence,
  playback,
  active,
  pauseSignal,
}) {
  const { provider, state, setState } = useStore();
  const key = `${course.id}/${lesson.id}`;
  const [explaining, setExplaining] = useState(false);
  const request = useRef(null);
  const committedAnswer = useRef(null);
  if (!playback.waiting) committedAnswer.current = null;
  const live = useRef(null);
  live.current = { sequence, playback, active };
  useEffect(() => {
    setExplaining(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [key, sequence.signature, playback.index, active, pauseSignal]);

  const continueAfterAnswer = () => {
    // Continuing is immediate. A late model response must never pull the
    // learner back from the next concept or reopen a completed lecture.
    request.current?.abort();
    request.current = null;
    setExplaining(false);
    playback.continueAfterAnswer();
  };

  const answer = async (selected) => {
    if (
      !playback.waiting ||
      committedAnswer.current === playback.current.id ||
      request.current ||
      !evaluateQuestion(playback.current.quiz, selected)
    )
      return;
    const stepId = playback.current.id;
    committedAnswer.current = stepId;
    playback.answer(selected);
    const feedback = checkpointFallback(playback.current.quiz, selected);
    const prepared = preparedCheckpointExplanation(
      playback.current.quiz,
      selected,
    );
    // Read the immediate right/wrong copy first. The supplement request starts
    // as soon as that audio begins, so it loads silently while the learner listens.
    if (active) {
      try {
        await playback.speakFeedback?.(feedback);
      } catch {
        // A failed feedback clip must not block the original lesson or the supplement.
      }
    }
    if (!active || (!prepared && !provider.configured)) return;
    const latest = live.current;
    if (!latest.active || latest.playback.current.id !== stepId) return;
    const controller = new AbortController();
    request.current = controller;
    setExplaining(true);
    const signature = sequence.signature;
    const revisions = state.lessonAdaptations?.[key];
    const revisionVersion = JSON.stringify(revisions || []);
    try {
      const result =
        prepared ||
        (await requestCheckpointExplanation(
          aiRequest,
          { course, lesson, sequence, index: playback.index, selected },
          controller.signal,
        ));
      controller.signal.throwIfAborted();
      const latest = live.current;
      if (
        !latest.active ||
        latest.sequence.signature !== signature ||
        latest.playback.current.id !== stepId
      )
        return;
      const revision = {
        ...result,
        id: crypto.randomUUID(),
        afterStepId: stepId,
        baseSignature: sequence.baseSignature,
        request: feedback,
        date: new Date().toISOString(),
        source: "checkpoint-answer",
      };
      setState((s) =>
        JSON.stringify(s.lessonAdaptations?.[key] || []) !== revisionVersion
          ? s
          : {
              ...s,
              lessonAdaptations: {
                ...s.lessonAdaptations,
                [key]: [
                  ...(revisions || []).filter(
                    (r) =>
                      r.source !== "checkpoint-answer" ||
                      r.afterStepId !== stepId,
                  ),
                  revision,
                ],
              },
            },
      );
    } catch {
      // The selected answer and its explanation remain available when a model
      // is offline or the learner leaves. Never block the original lesson.
    } finally {
      if (request.current === controller) {
        request.current = null;
        setExplaining(false);
      }
    }
  };
  return {
    ...playback,
    explaining,
    answer,
    toggle: () => !explaining && playback.toggle(),
    continueAfterAnswer,
  };
}
