import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowUp,
  BookOpen,
  Check,
  LoaderCircle,
  Pencil,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useStore, aiRequest } from "../store";
import { CourseEditor as ManualCourseEditor } from "../courseExtras";
import { Md } from "../pages";
import { Button, Modal, Textarea } from "../ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  applyCourseEdit,
  courseEditSnapshot,
  draftCourseEdit,
} from "../lib/course-editing";

export function CourseEditor({ course, onClose }) {
  const { provider, state, setState, notify } = useStore();
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const [scope, setScope] = useState("course");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const controller = useRef(null);
  const input = useRef(null);
  const preview = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => () => controller.current?.abort(), []);
  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setProgress(null);
  };
  const generate = async (e) => {
    e?.preventDefault();
    if (!text.trim() || busy || controller.current || !provider.configured)
      return;
    const task = new AbortController();
    controller.current = task;
    setBusy(true);
    setError("");
    const instruction = text.trim();
    try {
      const result = await draftCourseEdit({
        request: aiRequest,
        course,
        instruction: history.length
          ? `请结合下面的编辑对话，累计满足用户的修改要求；用户的新要求可以覆盖旧要求。仍然基于原课程产出完整的最终修改预览。\n历史对话：\n${history.map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.content}`).join("\n")}\n用户本次要求：${instruction}`
          : instruction,
        scope,
        signal: task.signal,
        onProgress: (value) => {
          if (!task.signal.aborted) setProgress(value);
        },
      });
      task.signal.throwIfAborted();
      setDraft(result);
      setHistory((previous) => [
        ...previous,
        { role: "user", content: instruction },
        { role: "assistant", content: result.reply },
      ]);
      setText("");
      requestAnimationFrame(() => preview.current?.focus());
    } catch (e) {
      if (!task.signal.aborted) setError(e.message);
    } finally {
      if (controller.current === task) {
        controller.current = null;
        setBusy(false);
      }
    }
  };
  const apply = () => {
    const latest = { ...course, ...state.courseEdits?.[course.id] };
    if (courseEditSnapshot(latest) !== draft.source) {
      setError("课程已发生变化，请基于最新课程重新生成修改。");
      return;
    }
    setState((s) => {
      const current = { ...course, ...s.courseEdits?.[course.id] };
      if (courseEditSnapshot(current) !== draft.source) return s;
      return applyCourseEdit(s, current, draft);
    });
    notify("课程修改已应用，学习记录与笔记已保留");
    onClose();
  };
  if (manual) return <ManualCourseEditor course={course} onClose={onClose} />;
  const originalIds = new Set(
    course.units.flatMap((u) => u.lessons).map((l) => l.id),
  );
  const stale = draft && courseEditSnapshot(course) !== draft.source;
  return (
    <Modal
      title="编辑课程"
      wide
      className="ai-course-editor"
      onClose={() => {
        stop();
        onClose();
      }}
    >
      <div className="modal-body ai-course-editor-body">
        <div className="course-edit-intro">
          <span className="course-edit-symbol">
            <Sparkles size={22} />
          </span>
          <div>
            <span className="course-edit-eyebrow">和 AI 一起打磨课程</span>
            <h2>想让这门课，变得更适合你？</h2>
            <p>补充案例、调整深度，或重新安排学习路线。</p>
          </div>
        </div>
        {history.length > 0 && (
          <section
            className="course-edit-conversation"
            aria-label="课程编辑对话"
          >
            {history.map((message, index) => (
              <div
                key={index}
                className={`course-help-message is-${message.role}`}
              >
                <span className="course-help-speaker">
                  {message.role === "user" ? "你" : "AI 编辑"}
                </span>
                <p>{message.content}</p>
              </div>
            ))}
          </section>
        )}
        <form className="course-edit-composer" onSubmit={generate}>
          <Select
            value={scope}
            onValueChange={(value) => {
              setScope(value);
              setDraft(null);
              setHistory([]);
            }}
            disabled={busy}
          >
            <SelectTrigger aria-label="课程修改范围">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="course">整门课程</SelectItem>
              {course.units
                .flatMap((u) => u.lessons)
                .map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    仅修改：{l.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <label className="sr-only" htmlFor="course-edit-request">
            告诉 AI 如何修改课程
          </label>
          <Textarea
            ref={input}
            id="course-edit-request"
            value={text}
            disabled={busy}
            maxLength={5000}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              history.length
                ? "还想怎么调整？继续告诉我，我会结合前面的要求更新预览…"
                : "例如：保留现有结构，多加一些生活中的例子；把第二单元讲得更深入，再补一讲实际应用。"
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                generate();
              }
            }}
          />
          <div className="course-edit-composer-footer">
            <span>Enter 生成修改 · Shift + Enter 换行</span>
            {busy ? (
              <Button
                type="button"
                size="sm"
                icon={Square}
                onClick={(event) => {
                  event.preventDefault();
                  stop();
                }}
              >
                停止生成
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="sm"
                icon={ArrowUp}
                disabled={!text.trim() || !provider.configured}
              >
                生成修改
              </Button>
            )}
          </div>
        </form>
        {!draft && !busy && (
          <div className="course-edit-suggestions">
            {[
              "增加贴近日常生活的例子，保留原有知识点",
              "用更适合零基础的方式讲解",
              "补充实践应用，循序渐进地加深理解",
            ].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setText(t);
                  input.current?.focus();
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        {!provider.configured && (
          <p className="course-edit-note">
            连接 AI 模型后即可生成修改，也可以使用手动编辑。
          </p>
        )}
        {busy && (
          <motion.div
            className="course-edit-progress"
            role="status"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <LoaderCircle size={17} className="animate-spin" />
            <div>
              <strong>{progress?.label || "正在准备修改"}</strong>
              <span>
                {progress?.total
                  ? `已完成 ${progress.completed} / ${progress.total} 讲`
                  : "先规划修改，再逐讲完善内容"}
              </span>
            </div>
          </motion.div>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {stale && (
          <p className="inline-error" role="alert">
            课程已发生变化，请基于最新课程重新生成修改。
          </p>
        )}
        {draft && (
          <motion.section
            ref={preview}
            tabIndex={-1}
            aria-label="课程修改预览"
            className="course-edit-preview"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <header>
              <span>
                <Check size={15} />
                修改预览
              </span>
              <button
                type="button"
                aria-label="放弃修改预览"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setHistory([]);
                }}
              >
                <X size={16} />
              </button>
            </header>
            <p className="course-edit-reply">{draft.reply}</p>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.focus()}
            >
              继续对话调整
            </Button>
            <h3>{draft.title}</h3>
            <p>{draft.description}</p>
            <div className="course-edit-counts">
              <span>{draft.changedIds.length} 讲内容更新</span>
              <span>
                {
                  draft.units
                    .flatMap((u) => u.lessons)
                    .filter((l) => !originalIds.has(l.id)).length
                }{" "}
                讲新增
              </span>
              {!!draft.removed.length && (
                <span>{draft.removed.length} 讲移除</span>
              )}
            </div>
            {draft.units.map((u, i) => (
              <section className="course-edit-unit" key={i}>
                <h4>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {u.title}
                </h4>
                {u.lessons.map((l) => {
                  const changed = draft.changedIds.includes(l.id);
                  return (
                    <details key={l.id} className={changed ? "is-updated" : ""}>
                      <summary>
                        <BookOpen size={15} />
                        <strong>{l.title}</strong>
                        <span>
                          {!originalIds.has(l.id)
                            ? "新增"
                            : changed
                              ? "已更新"
                              : "保留"}
                        </span>
                      </summary>
                      <p>{l.summary}</p>
                      <Md>{l.content}</Md>
                      {l.teaching?.steps?.length > 0 && (
                        <details className="course-edit-script-preview">
                          <summary>
                            白板、讲解与测验 · {l.teaching.steps.length} 段
                          </summary>
                          {l.teaching.steps.map((step, index) => (
                            <section key={index}>
                              <h5>{step.title}</h5>
                              <Md>{step.board}</Md>
                              <p>{step.narration}</p>
                              {step.checkpoint && (
                                <p>课堂提问：{step.checkpoint.question}</p>
                              )}
                            </section>
                          ))}
                          {l.quiz && <p>课后测验：{l.quiz.question}</p>}
                        </details>
                      )}
                    </details>
                  );
                })}
              </section>
            ))}
            {!!draft.removed.length && (
              <div className="course-edit-removed">
                <strong>将移除的讲次</strong>
                <p>{draft.removed.map((l) => l.title).join("、")}</p>
              </div>
            )}
          </motion.section>
        )}
      </div>
      <div className="modal-footer course-edit-footer">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={Pencil}
          disabled={busy}
          onClick={() => setManual(true)}
        >
          手动编辑
        </Button>
        <div>
          <Button
            type="button"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            取消
          </Button>
          {draft && (
            <Button
              type="button"
              variant="primary"
              icon={Check}
              disabled={busy || stale}
              onClick={apply}
            >
              应用修改
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
