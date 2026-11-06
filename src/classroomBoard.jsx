import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { lessonSequence, visibleSteps } from "./lib/lesson-sequence";
import { useLessonPlayback } from "./useLessonPlayback";
import { useCheckpointExplanation } from "./useCheckpointExplanation";
import { useBoardCanvas } from "./useBoardCanvas";
import { useBoardLayout } from "./useBoardLayout";
import { useStudySession } from "./useStudySession";
import { composeClassroomSequence } from "./lib/adaptive-classroom";
import { LessonStage, LessonPlaybackControls } from "./components/lesson-stage";
import { TeachingMarkdown, TeachingVisual } from "./teachingContent";
import { visualProgress, emphasisReady } from "./lib/teaching-direction.js";
import {
  Bookmark,
  FileText,
  Highlighter,
  MessageSquare,
  Trash2,
  Hand,
  TextCursor,
  LocateFixed,
  Play,
} from "lucide-react";
import { useStore } from "./store";
import { Md } from "./pages";
import { Button, IconButton } from "./ui";
import { BoardSettings, boardFonts } from "./components/board-settings";

const hasTeachingVisual = (step) =>
  ["bindings", "comparison", "trace", "vector-transform", "diagram"].includes(
    step.visual?.type,
  );

const needsWideBoard = (part) =>
  part.steps.some(
    (step) =>
      hasTeachingVisual(step) ||
      ["code", "table"].includes(step.kind) ||
      step.fragment?.children?.some((node) =>
        ["code", "table"].includes(node.type),
      ),
  );

export function ClassroomBoard({
  course,
  lesson,
  onAsk,
  active = true,
  pauseSignal,
  onTeachingChange,
  zoom = 100,
  onZoomChange,
  onDownload,
}) {
  const { state, setState, notify } = useStore();
  const boardFont =
    boardFonts.find((font) => font.id === state.appearance?.boardFont) ||
    boardFonts[0];
  const key = `${course.id}/${lesson.id}`;
  const sequence = useMemo(
    () =>
      composeClassroomSequence(
        lessonSequence(lesson.content, lesson),
        state.lessonAdaptations?.[key],
      ),
    [
      lesson.content,
      lesson.quiz,
      lesson.teaching,
      state.lessonAdaptations?.[key],
    ],
  );
  const [mode, setMode] = useState("board");
  const pages = mode === "reading" ? sequence.readingPages : sequence.pages;
  const cursor = useLessonPlayback(
    key,
    sequence,
    active && mode === "board",
    pauseSignal,
  );
  const playback = useCheckpointExplanation({
    course,
    lesson,
    sequence,
    playback: cursor,
    active: active && mode === "board",
    pauseSignal,
  });
  useStudySession({ active, playing: playback.playing });
  const page = playback.current?.page || 0;
  const reducedMotion = useReducedMotion();
  const currentBlock = useRef(null);
  useEffect(() => {
    onTeachingChange?.({
      ...playback.current,
      baseSignature: sequence.baseSignature,
      remaining: sequence.steps
        .slice(Math.max(playback.index, playback.revealedStep) + 1)
        .map((s) => ({ id: s.id, title: s.title, content: s.content })),
      playing: playback.playing,
      finished: playback.finished,
      waiting: playback.waiting,
      progress: playback.progress,
      revealedProgress: playback.revealedProgress,
      narrationProgress: playback.narrationProgress,
      revealedNarrationProgress: playback.revealedNarrationProgress,
      revealedStep: playback.revealedStep,
      answers: playback.answers,
      history: sequence.steps.slice(
        0,
        Math.max(playback.index, playback.revealedStep) + 1,
      ),
      total: sequence.steps.length,
    });
  }, [
    playback.index,
    playback.playing,
    playback.finished,
    playback.revealedStep,
    playback.elapsed,
    playback.answers,
    onTeachingChange,
    sequence,
  ]);
  const [selection, setSelection] = useState("");
  const [selectionSection, setSelectionSection] = useState(0);
  const [showClips, setShowClips] = useState(false);
  const board = useRef(null);
  useBoardLayout(board, active && mode === "board", `${key}/${boardFont.id}`);
  const canvas = useBoardCanvas({
    board,
    active: active && mode === "board",
    zoom,
    onZoomChange,
    step: playback.index,
    playing:
      playback.playing &&
      playback.current?.kind !== "checkpoint" &&
      !playback.finished,
  });
  const [playerHost, setPlayerHost] = useState(null);
  useEffect(() => {
    setPlayerHost(board.current?.closest(".class-main"));
  }, []);
  useEffect(() => {
    const scroll = board.current?.closest(".board-scroll");
    if (
      !scroll ||
      mode !== "board" ||
      !active ||
      !playback.playing ||
      playback.finished ||
      playback.current?.kind === "checkpoint"
    )
      return;
    const follow = () => {
      if (canvas.manual.current) return;
      const block =
        board.current?.querySelector(".teaching-block.is-current") ||
        currentBlock.current;
      if (!block) return;
      canvas.reveal(block);
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(scroll);
    if (board.current) observer.observe(board.current);
    if (currentBlock.current) {
      observer.observe(currentBlock.current);
      const writing = currentBlock.current.querySelector(".teaching-writing");
      if (writing) observer.observe(writing);
    }
    const stage = scroll.closest(".class-main")?.querySelector(".lesson-stage");
    if (stage) observer.observe(stage);
    return () => observer.disconnect();
  }, [
    playback.index,
    playback.revealedProgress >= 1,
    playback.playing,
    mode,
    reducedMotion,
    active,
    playback.finished,
  ]);
  const firstRun =
    playback.index === 0 &&
    !playback.playing &&
    !playback.finished &&
    playback.revealedProgress === 0;
  const clips = state.highlights?.[key] || [];
  const focusExcerpt = (clip) => {
    const matches = sequence.steps.filter((step) => step.page === clip.page);
    const step =
      sequence.steps.find(
        (step) =>
          step.text.includes(clip.quote) ||
          step.content.includes(clip.quote) ||
          step.sourceText?.includes(clip.quote) ||
          step.narration.includes(clip.quote),
      ) || matches[0];
    playback.seek(step?.index || 0);
    setSelection("");
  };
  const writtenSteps = visibleSteps(
    sequence,
    Math.max(playback.index, playback.revealedStep),
  );
  const isFlowWriting = (step) => {
    if (
      step.visual &&
      step.index >= playback.revealedStep &&
      visualProgress(
        step,
        playback.revealedNarrationProgress,
        playback.revealedProgress,
      ) < 1
    )
      return true;
    if (step.index >= playback.revealedStep && playback.revealedProgress < 1)
      return true;
    const next = sequence.steps[step.index + 1];
    return (
      step.kind === "code" &&
      next?.kind === "code" &&
      next.page === step.page &&
      next.block === step.block
    );
  };
  const saveClip = () => {
    if (!selection) return;
    if (clips.some((c) => c.quote === selection)) {
      notify("这段摘录已经保存");
      return;
    }
    setState((s) => ({
      ...s,
      highlights: {
        ...s.highlights,
        [key]: [
          ...(s.highlights?.[key] || []),
          {
            id: crypto.randomUUID(),
            quote: selection,
            page: selectionSection,
            date: new Date().toISOString(),
          },
        ],
      },
    }));
    window.getSelection()?.removeAllRanges();
    setSelection("");
    setShowClips(true);
  };
  return (
    <div
      className={`interactive-board guided-board mode-${mode}`}
      data-board-font={boardFont.id}
      style={{ "--font-board": boardFont.family }}
    >
      {playerHost &&
        firstRun &&
        createPortal(
          <div className="classroom-first-run-layer">
            <div className="classroom-first-run" role="status">
              <span>准备好了吗？</span>
              <strong>点击开始，跟着板书学这一讲</strong>
              <Button variant="primary" icon={Play} onClick={playback.toggle}>
                开始讲解
              </Button>
            </div>
          </div>,
          playerHost,
        )}
      {playerHost?.querySelector("[data-board-settings-host]") &&
        createPortal(
          <BoardSettings
            font={boardFont}
            onFontChange={(boardFont) =>
              setState((s) => ({
                ...s,
                appearance: { ...s.appearance, boardFont },
              }))
            }
            mode={mode}
            onModeChange={setMode}
            zoom={zoom}
            onZoomChange={(value) => {
              canvas.interact();
              onZoomChange?.(value);
            }}
            playback={playback}
            clipCount={clips.length}
            onClips={() => setShowClips((value) => !value)}
            onDownload={onDownload}
          />,
          playerHost.querySelector("[data-board-settings-host]"),
        )}
      {playerHost &&
        createPortal(
          <div className="board-modebar">
            {mode === "board" && <LessonPlaybackControls playback={playback} />}
            {mode === "board" && (
              <div
                className="board-canvas-tools"
                role="group"
                aria-label="画布工具"
              >
                <IconButton
                  icon={Hand}
                  label="拖动画布"
                  aria-pressed={canvas.tool === "pan"}
                  onClick={() => {
                    canvas.setTool("pan");
                    setSelection("");
                    window.getSelection()?.removeAllRanges();
                  }}
                />
                <IconButton
                  icon={TextCursor}
                  label="选择文字"
                  aria-pressed={canvas.tool === "select"}
                  onClick={() => canvas.setTool("select")}
                />
                <span />
                <IconButton
                  icon={LocateFixed}
                  label="回到当前讲解"
                  onClick={canvas.center}
                />
              </div>
            )}
          </div>,
          playerHost,
        )}
      {pages.length ? (
        <>
          <div className="board-canvas-viewport">
            <div
              ref={board}
              className="board-surface"
              data-board-layout={pages.length === 1 ? "single" : "spread"}
              onMouseUp={() => {
                const range = window.getSelection();
                if (
                  range &&
                  board.current?.contains(range.anchorNode) &&
                  board.current?.contains(range.focusNode)
                ) {
                  const text = range.toString().trim().slice(0, 2000);
                  setSelection(text);
                  const anchor =
                    range.anchorNode?.nodeType === Node.ELEMENT_NODE
                      ? range.anchorNode
                      : range.anchorNode?.parentElement;
                  setSelectionSection(
                    Number(
                      anchor?.closest("[data-section]")?.dataset.section || 0,
                    ),
                  );
                  if (text) canvas.interact();
                }
              }}
            >
              {pages.map(
                (part, index) =>
                  (mode === "reading" ||
                    part.steps.some(
                      (step) =>
                        step.kind !== "checkpoint" &&
                        step.index <=
                          Math.max(playback.index, playback.revealedStep),
                    )) && (
                    <section
                      className={`board-frame ${index === page ? "is-active-section" : ""}`}
                      data-section={index}
                      data-board-span={needsWideBoard(part) ? "wide" : "note"}
                      key={`${index}-${part.title}`}
                    >
                      <div className="board-frame-label">
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <i />
                        <small>{course.title.split("：")[0]}</small>
                      </div>
                      <h2>{part.title}</h2>
                      {mode === "reading" ? (
                        <Md>{part.content}</Md>
                      ) : (
                        writtenSteps
                          .filter(
                            (step) =>
                              step.page === index && step.kind !== "checkpoint",
                          )
                          .map((step) => (
                            <motion.div
                              key={`${step.block}-${step.kind === "code" ? "code" : step.part}`}
                              ref={
                                step.index === playback.index ||
                                (step.kind === "code" &&
                                  step.page === page &&
                                  step.block === playback.current?.block)
                                  ? currentBlock
                                  : undefined
                              }
                              className={`teaching-block ${hasTeachingVisual(step) ? "has-visual" : ""} ${step.index === playback.index || (step.kind === "code" && step.page === page && step.block === playback.current?.block) ? "is-current" : ""}`}
                              data-step={step.index}
                              data-flow-writing={isFlowWriting(step)}
                              data-writing-complete={
                                step.index < playback.revealedStep ||
                                (playback.revealedProgress >= 1 &&
                                  (!step.visual ||
                                    visualProgress(
                                      step,
                                      playback.revealedNarrationProgress,
                                      playback.revealedProgress,
                                    ) >= 1))
                              }
                              data-adaptation-id={step.adaptationId}
                              initial={reducedMotion ? false : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.24 }}
                            >
                              {
                                <>
                                  <TeachingMarkdown
                                    annotationReady={
                                      step.index < playback.revealedStep ||
                                      emphasisReady(
                                        step,
                                        playback.revealedNarrationProgress,
                                        playback.revealedProgress,
                                      )
                                    }
                                    step={
                                      step.kind === "code"
                                        ? {
                                            ...step,
                                            annotations: sequence.steps
                                              .filter(
                                                (previous) =>
                                                  previous.page === step.page &&
                                                  previous.block ===
                                                    step.block &&
                                                  previous.index <= step.index,
                                              )
                                              .flatMap(
                                                (previous) =>
                                                  previous.annotations || [],
                                              ),
                                          }
                                        : step
                                    }
                                    progress={
                                      step.index < playback.revealedStep
                                        ? 1
                                        : playback.revealedProgress
                                    }
                                    writing={
                                      playback.playing &&
                                      step.index === playback.index
                                    }
                                  />
                                  <TeachingVisual
                                    visual={step.visual}
                                    playing={
                                      playback.playing &&
                                      step.index === playback.index
                                    }
                                    onInteract={canvas.interact}
                                    previous={
                                      step.kind === "code" &&
                                      sequence.steps[step.index - 1]?.kind ===
                                        "code" &&
                                      sequence.steps[step.index - 1]?.block ===
                                        step.block
                                        ? sequence.steps[step.index - 1].visual
                                        : undefined
                                    }
                                    progress={
                                      step.index < playback.revealedStep
                                        ? 1
                                        : visualProgress(
                                            step,
                                            playback.revealedNarrationProgress,
                                            playback.revealedProgress,
                                          )
                                    }
                                  />
                                </>
                              }
                            </motion.div>
                          ))
                      )}
                    </section>
                  ),
              )}
            </div>
          </div>
          {selection && (
            <div className="selection-actions">
              <Highlighter size={16} />
              <span>
                {selection.length > 34
                  ? selection.slice(0, 34) + "…"
                  : selection}
              </span>
              <Button
                variant="surface"
                size="surface"
                title="保存摘录"
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveClip}
              >
                <Bookmark size={16} />
              </Button>
              <Button
                variant="surface"
                size="surface"
                title="向导师询问选中内容"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onAsk(`请解释这段内容，并举一个例子：${selection}`);
                  setSelection("");
                }}
              >
                <MessageSquare size={16} />
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="muted-line">本节暂无讲义。</p>
      )}
      {showClips && (
        <section className="board-clips">
          <h3>
            <Bookmark size={16} />
            我的课堂摘录
          </h3>
          {clips.length ? (
            clips.map((clip) => (
              <div key={clip.id}>
                <blockquote>{clip.quote}</blockquote>
                <div>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      focusExcerpt(clip);
                      setMode("board");
                    }}
                  >
                    定位摘录
                  </Button>
                  <IconButton
                    icon={FileText}
                    label="摘录加入笔记"
                    onClick={() => {
                      setState((s) => ({
                        ...s,
                        notes: {
                          ...s.notes,
                          [key]:
                            `${s.notes[key] || ""}\n\n> ${clip.quote}`.trim(),
                        },
                      }));
                      notify("摘录已加入课堂笔记");
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    label="删除摘录"
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        highlights: {
                          ...s.highlights,
                          [key]: (s.highlights[key] || []).filter(
                            (c) => c.id !== clip.id,
                          ),
                        },
                      }))
                    }
                  />
                </div>
              </div>
            ))
          ) : (
            <p>暂无摘录。</p>
          )}
        </section>
      )}
      {mode === "board" &&
        playback.current &&
        playerHost &&
        createPortal(<LessonStage playback={playback} />, playerHost)}
    </div>
  );
}
