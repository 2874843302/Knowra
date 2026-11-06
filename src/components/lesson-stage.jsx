import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Pause, Play, ArrowRight, LoaderCircle } from "lucide-react";
import { Button, IconButton } from "../design/primitives";
import { captionFrame } from "../lib/lesson-captions";
import { QuestionFields } from "./question-fields";
import { checkpointFallback } from "../lib/checkpoint-explanation";
import {
  answerReady,
  isObjectiveQuestion,
  questionType,
} from "../lib/questions";
export function LessonPlaybackControls({ playback }) {
  return (
    <div className="lesson-playback-tools" role="group" aria-label="讲解控制">
      <IconButton
        icon={
          playback.playing
            ? Pause
            : playback.speechStatus === "loading"
              ? LoaderCircle
              : Play
        }
        label={
          playback.finished
            ? "再听一遍"
            : playback.playing
              ? "暂停讲解"
              : "开始讲解"
        }
        onClick={playback.toggle}
        disabled={playback.waiting || playback.explaining}
      />
      {playback.playing && playback.speechStatus === "loading" && (
        <span className="lesson-audio-loading" role="status">
          正在准备语音…
        </span>
      )}
    </div>
  );
}

export function LessonStage({ playback }) {
  const root = useRef(null);
  const reduced = useReducedMotion();
  const step = playback.current;
  const checkpoint = step.kind === "checkpoint";
  const answer = playback.answers[playback.index];
  const [draft, setDraft] = useState(null);
  useEffect(() => setDraft(null), [step.id, playback.index]);
  const objective = checkpoint && isObjectiveQuestion(step.quiz);
  const submit = () => {
    if (answerReady(step.quiz, draft)) playback.answer(draft);
  };
  const caption = captionFrame(step.narration, playback.narrationProgress);
  useLayoutEffect(() => {
    const stage = root.current;
    const host = stage.closest(".class-main");
    let previousHeight;
    const resize = () => {
      const height = Math.ceil(stage.getBoundingClientRect().height);
      // Growing a line changes width on every character; only reflow the
      // canvas safe area when a line wraps or the question panel opens.
      if (height === previousHeight) return;
      previousHeight = height;
      host?.style.setProperty("--lesson-stage-height", `${height}px`);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => {
      observer.disconnect();
      host?.style.removeProperty("--lesson-stage-height");
    };
  }, []);
  return (
    <section
      ref={root}
      className={`lesson-stage ${checkpoint ? "is-question" : ""}`}
      aria-label={checkpoint ? "课堂提问" : "讲解字幕"}
    >
      <motion.div
        key={step.id || playback.index}
        className="lesson-stage-content"
        initial={reduced ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        {checkpoint && playback.finished ? (
          <div className="lesson-stage-complete" role="status">
            <p>
              <Check size={17} />
              本讲讲解已完成
            </p>
            <Button
              size="sm"
              variant="ghost"
              icon={Play}
              onClick={playback.restart}
            >
              再听一遍
            </Button>
          </div>
        ) : checkpoint ? (
          <>
            <h3 id="lesson-stage-question">{step.quiz.question}</h3>
            <QuestionFields
              question={step.quiz}
              mode="stage"
              value={answer ? answer.selected : draft}
              disabled={!!answer}
              submitted={!!answer}
              onCommit={submit}
              onChange={(value) => {
                setDraft(value);
                if (["choice", "true_false"].includes(questionType(step.quiz)))
                  playback.answer(value);
              }}
            />
            {!answer &&
              !["choice", "true_false"].includes(questionType(step.quiz)) && (
                <Button
                  size="sm"
                  disabled={!answerReady(step.quiz, draft)}
                  onClick={submit}
                >
                  {objective ? "提交答案" : "提交并查看参考思路"}
                </Button>
              )}
            {answer ? (
              <div
                className={`lesson-stage-feedback ${answer.correct ? "is-correct" : ""}`}
                role="status"
              >
                <p>{checkpointFallback(step.quiz, answer.selected)}</p>
                {playback.explaining ? (
                  <p className="checkpoint-explaining" role="status">
                    <LoaderCircle size={14} className="animate-spin" />
                    正在根据你的回答补充讲解，也可以直接继续
                  </p>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  iconRight={ArrowRight}
                  onClick={playback.continueAfterAnswer}
                >
                  {playback.last
                    ? "完成本讲"
                    : objective
                      ? "继续讲解"
                      : "我已复盘，继续讲解"}
                </Button>
              </div>
            ) : (
              <p className="lesson-stage-hint">
                {!["choice", "true_false"].includes(questionType(step.quiz))
                  ? "写下你的答案，再对照参考思路"
                  : "选一个答案，或在对话中说说你的想法"}
              </p>
            )}
          </>
        ) : (
          <>
            <p
              className="lesson-subtitle"
              data-typing={
                playback.playing &&
                !playback.sentencePaused &&
                caption.text !== caption.full
              }
              data-sentence-paused={playback.playing && playback.sentencePaused}
            >
              <span className="lesson-subtitle-text" aria-hidden="true">
                {caption.text}
              </span>
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {caption.full}
              </span>
            </p>
            {!playback.playing && (
              <Button
                variant={playback.index === 0 ? "primary" : "ghost"}
                size={playback.index === 0 ? "md" : "sm"}
                className={`lesson-subtitle-resume ${
                  playback.index === 0 ? "is-start" : ""
                }`}
                icon={Play}
                onClick={playback.toggle}
              >
                {playback.finished
                  ? "再听一遍"
                  : playback.index === 0
                    ? "开始讲解"
                    : "继续讲解"}
              </Button>
            )}
          </>
        )}
      </motion.div>
    </section>
  );
}
