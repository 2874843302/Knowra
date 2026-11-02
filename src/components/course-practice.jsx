import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  ListChecks,
  Pencil,
  Sparkles,
  CircleHelp,
  TextCursorInput,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useStore, aiRequest } from "../store";
import { Button, Empty, Modal } from "../ui";
import { Md } from "../pages";
import { Checkbox } from "./ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  coursePractices,
  practiceComplete,
  requestCoursePractice,
} from "../lib/course-practice";
import { QuestionFields } from "./question-fields";
import {
  answerReady,
  evaluateQuestion,
  isObjectiveQuestion,
} from "../lib/questions";

const types = {
  choice: [ListChecks, "情境选择"],
  response: [Pencil, "简答题"],
  code: [Code2, "编程练习"],
  true_false: [CircleHelp, "判断题"],
  fill: [TextCursorInput, "填空题"],
};
const statusLabel = (attempt) =>
  ({
    correct: "已答对",
    reviewed: "已自评",
    incorrect: "待订正",
    submitted: "待复盘",
    draft: "有草稿",
  })[attempt?.status] || "未开始";

function ExerciseDialog({ course, exercise, onClose, onCloseAutoFocus }) {
  const { state, setState } = useStore();
  const key = `${course.id}/${exercise.id}`;
  const attempt = state.practiceAttempts?.[key] || {};
  const isChoice = isObjectiveQuestion(exercise);
  const submitted = ["correct", "incorrect", "submitted", "reviewed"].includes(
    attempt.status,
  );
  const checks = attempt.checks || [];
  const save = (patch) =>
    setState((s) => ({
      ...s,
      practiceAttempts: {
        ...s.practiceAttempts,
        [key]: {
          ...s.practiceAttempts?.[key],
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  const edit = (answer) => save({ answer, status: "draft", checks: [] });
  const ready = answerReady(exercise, attempt.answer);
  const [Icon, type] = types[exercise.type];
  return (
    <Modal
      title={exercise.title}
      onClose={onClose}
      wide
      className="exercise-dialog"
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className="modal-body exercise-body">
        <div className="exercise-meta">
          <span>
            <Icon size={15} />
            {type}
          </span>
          <span>
            <Clock3 size={14} />约 {exercise.minutes} 分钟
          </span>
          <span>单元 {exercise.unitIndex + 1}</span>
        </div>
        <div className="exercise-prompt">
          <Md>{exercise.prompt}</Md>
        </div>
        <QuestionFields
          question={exercise}
          value={attempt.answer}
          onChange={edit}
        />
        {!["choice", "true_false"].includes(exercise.type) && (
          <small className="question-save-hint">
            草稿自动保存
            {exercise.type === "code"
              ? " · 此处不执行代码，可在本地运行后记录结果"
              : ""}
          </small>
        )}
        <div className="exercise-submit">
          <span>
            {submitted ? statusLabel(attempt) : "先独立尝试，再对照参考思路"}
          </span>
          <Button
            variant="primary"
            disabled={!ready || submitted}
            onClick={() =>
              save({
                status: isChoice
                  ? evaluateQuestion(exercise, attempt.answer)?.correct
                    ? "correct"
                    : "incorrect"
                  : "submitted",
                submittedAt: new Date().toISOString(),
                submissions: (attempt.submissions || 0) + 1,
              })
            }
          >
            {isChoice ? "提交答案" : "保存并查看参考思路"}
          </Button>
        </div>
        {submitted && (
          <section className="exercise-review" aria-label="参考与复盘">
            <div className="exercise-review-heading">
              <CheckCircle2 size={18} />
              <h3>
                {isChoice
                  ? attempt.status === "correct"
                    ? "回答正确"
                    : "再看看这道题的关键"
                  : "对照思路，完成复盘"}
              </h3>
            </div>
            <Md>{exercise.referenceAnswer}</Md>
            {!isChoice && (
              <>
                <h4>检查自己的解答</h4>
                <div className="exercise-criteria">
                  {exercise.criteria.map((criterion, i) => (
                    <label key={i}>
                      <Checkbox
                        checked={checks.includes(i)}
                        onCheckedChange={(checked) =>
                          save({
                            checks: checked
                              ? [...checks, i]
                              : checks.filter((v) => v !== i),
                            status: "submitted",
                          })
                        }
                      />
                      {criterion}
                    </label>
                  ))}
                </div>
                <Button
                  variant={
                    attempt.status === "reviewed" ? "secondary" : "primary"
                  }
                  icon={Check}
                  disabled={
                    checks.length !== exercise.criteria.length ||
                    attempt.status === "reviewed"
                  }
                  onClick={() =>
                    save({
                      status: "reviewed",
                      completedAt: new Date().toISOString(),
                    })
                  }
                >
                  {attempt.status === "reviewed" ? "已完成复盘" : "完成复盘"}
                </Button>
              </>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}

export function CoursePractice({
  course,
  initialUnit = "all",
  compact = false,
}) {
  const { state, setState, provider } = useStore();
  const [unit, setUnit] = useState(String(initialUnit));
  const [filter, setFilter] = useState("all");
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(null);
  const exerciseTrigger = useRef(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    setLoading(false);
    setError("");
    return () => request.current?.abort();
  }, [course.id, unit]);
  const items = coursePractices(course, state);
  const scoped = items.filter(
    (p) => unit === "all" || p.unitIndex === Number(unit),
  );
  const attemptFor = (p) => state.practiceAttempts?.[`${course.id}/${p.id}`];
  const complete = scoped.filter((p) => practiceComplete(attemptFor(p))).length;
  const visible = scoped.filter(
    (p) =>
      filter === "all" ||
      (filter === "complete"
        ? practiceComplete(attemptFor(p))
        : !practiceComplete(attemptFor(p))),
  );
  const generationUnit = unit === "all" ? 0 : Number(unit);
  const generate = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const generated = await requestCoursePractice(
        aiRequest,
        course,
        generationUnit,
        items,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      setState((s) => ({
        ...s,
        coursePractices: {
          ...s.coursePractices,
          [course.id]: [
            ...(s.coursePractices?.[course.id] || []),
            ...generated,
          ],
        },
      }));
      setFilter("all");
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (request.current === controller && !controller.signal.aborted)
        setLoading(false);
    }
  };
  return (
    <section
      className={`course-practice ${compact ? "is-compact" : ""}`}
      aria-label="独立练习模块"
    >
      <header className="course-practice-heading">
        <div>
          <span className="practice-eyebrow">
            <Pencil size={14} />
            学以致用
          </span>
          <h2>独立练习</h2>
          <p>换一个情境，把学到的知识真正用起来。</p>
        </div>
        <div className="practice-summary">
          <strong>
            {complete}
            <small> / {scoped.length}</small>
          </strong>
          <span>已完成</span>
        </div>
      </header>
      <div className="course-practice-toolbar">
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger aria-label="练习所属单元">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部单元</SelectItem>
            {course.units.map((u, i) => (
              <SelectItem key={i} value={String(i)}>
                单元 {i + 1} · {u.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          icon={Sparkles}
          loading={loading}
          disabled={!provider.configured}
          onClick={generate}
        >
          补充练习
        </Button>
        {loading && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              request.current?.abort();
              setLoading(false);
            }}
          >
            取消
          </Button>
        )}
      </div>
      <p className="practice-generation-note">
        {loading
          ? `正在为“${course.units[generationUnit].title}”设计新练习…`
          : !provider.configured
            ? "连接 AI 后，可为课程补充专属练习。"
            : unit === "all"
              ? "选择单元可定向补充练习，默认补充第 1 单元。"
              : "可按本单元的学习目标补充新的应用练习。"}
      </p>
      {error && (
        <div className="practice-error" role="alert">
          {error}
          <Button size="sm" variant="link" onClick={generate}>
            重试
          </Button>
        </div>
      )}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList aria-label="独立练习筛选">
          {[
            ["all", "全部", scoped.length],
            ["pending", "待完成", scoped.length - complete],
            ["complete", "已完成", complete],
          ].map(([v, label, count]) => (
            <TabsTrigger key={v} value={v}>
              {label}
              <span>{count}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <motion.div
        key={`${unit}-${filter}`}
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="practice-groups"
      >
        {course.units.map((u, i) => {
          const group = visible.filter((p) => p.unitIndex === i);
          if (!group.length) return null;
          return (
            <section className="practice-unit" key={i}>
              <h3>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {u.title}
                <small>{group.length} 项练习</small>
              </h3>
              <div className="practice-task-list">
                {group.map((p) => {
                  const [Icon, label] = types[p.type];
                  const attempt = attemptFor(p);
                  const done = practiceComplete(attempt);
                  return (
                    <button
                      type="button"
                      className="practice-task"
                      key={p.id}
                      onClick={(event) => {
                        exerciseTrigger.current = event.currentTarget;
                        setExercise(p);
                      }}
                    >
                      <span
                        className={`practice-type-icon ${done ? "is-complete" : ""}`}
                      >
                        {done ? <Check size={19} /> : <Icon size={19} />}
                      </span>
                      <span className="practice-task-copy">
                        <strong>{p.title}</strong>
                        <span>
                          {label}
                          <i />约 {p.minutes} 分钟
                        </span>
                      </span>
                      <span
                        className={`practice-task-status ${done ? "is-complete" : ""}`}
                      >
                        {statusLabel(attempt)}
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!visible.length && (
          <Empty
            icon={Pencil}
            title={
              filter === "complete"
                ? "完成的练习会出现在这里"
                : filter === "pending" && scoped.length
                  ? "本单元练习已全部完成"
                  : "当前范围还没有独立练习"
            }
            text={
              !scoped.length
                ? "选择一个单元，点击“补充练习”创建与课程目标匹配的练习。"
                : ""
            }
          />
        )}
      </motion.div>
      {exercise && (
        <ExerciseDialog
          course={course}
          exercise={exercise}
          onClose={() => setExercise(null)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            exerciseTrigger.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </section>
  );
}
