import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe2,
  ExternalLink,
  LoaderCircle,
  Paperclip,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useStore, aiRequest } from "./store";
import { lessonsOf } from "./data";
import {
  courseGenerationConcurrency,
  generateCourseCurriculum,
} from "./lib/course-generation-queue";
import {
  courseBrief,
  generateCourseLecture,
  learningDepthOptions,
  parseCourseJSON,
  validateCoursePlan,
  validateSearchQueries,
  validateCourseQuestions,
  researchRequest,
} from "./lib/course-generation";
import {
  Button,
  ButtonLink,
  IconButton,
  Input,
  Textarea,
} from "./design/primitives";
import { UploadButton } from "./ui";
import { DisclosureContent } from "./components/ui/disclosure";
import {
  DrawnCheck,
  GenerationActivity,
} from "./components/generation-activity";
import { SpotlightSurface } from "./components/ui/spotlight-surface";
import { MorphingAction } from "./components/ui/morphing-action";
import { AgentActivityItem } from "./components/ui/agent-activity-item";
import { CourseBlueprintPanel } from "./components/course-blueprint-panel";

function ChoiceQuestion({ question, value, disabled, onChange, index = 0 }) {
  const options = question.options;
  const reducedMotion = useReducedMotion();
  return (
    <motion.fieldset
      className="generation-question"
      disabled={disabled}
      initial={reducedMotion ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.32,
        delay: reducedMotion ? 0 : Math.min(index, 4) * 0.065,
      }}
    >
      <legend>
        {question.title}
        <span>单选题</span>
      </legend>
      <div
        role="radiogroup"
        aria-label={question.title}
        className="generation-choices"
      >
        {options.map(([id, label, hint], index) => (
          <Button
            key={id}
            variant="surface"
            size="surface"
            role="radio"
            aria-checked={value === id}
            tabIndex={value ? (value === id ? 0 : -1) : index === 0 ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(e) => {
              const offsets = {
                ArrowRight: 1,
                ArrowDown: 1,
                ArrowLeft: -1,
                ArrowUp: -1,
              };
              const target =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? options.length - 1
                    : offsets[e.key]
                      ? (index + offsets[e.key] + options.length) %
                        options.length
                      : null;
              if (target == null) return;
              e.preventDefault();
              onChange(options[target][0]);
              e.currentTarget.parentElement
                .querySelectorAll('[role="radio"]')
                [target].focus();
            }}
          >
            <motion.span
              className="generation-choice-check"
              aria-hidden="true"
              initial={false}
              animate={{
                opacity: value === id ? 1 : 0,
                scale: value === id ? 1 : reducedMotion ? 1 : 0.65,
              }}
              transition={
                reducedMotion || value !== id
                  ? { duration: 0 }
                  : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <Check size={15} />
            </motion.span>
            <strong>{label}</strong>
            <span>{hint}</span>
          </Button>
        ))}
      </div>
    </motion.fieldset>
  );
}

function ResearchSources({ research }) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  return (
    <section className="generation-research" aria-label="联网调研资料">
      <Button
        variant="ghost"
        size="surface"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Globe2 size={16} />
        <span>
          已检索 {research.sources.length} 份资料 <small>查看来源与摘要</small>
        </span>
        <ChevronDown size={15} className={open ? "is-open" : ""} />
      </Button>
      <DisclosureContent open={open}>
        <div className="generation-source-list">
          <p>
            以下为联网检索摘要，用于明确学习方向。检索于{" "}
            {new Date(research.retrievedAt).toLocaleDateString("zh-CN")}
            ，可打开原文了解详情。
          </p>
          {research.sources.map((source, i) => (
            <motion.a
              key={source.id}
              initial={reducedMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reducedMotion ? 0 : 0.24,
                delay: reducedMotion ? 0 : Math.min(i, 5) * 0.04,
              }}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{source.title}</strong>
                <small>{new URL(source.url).hostname}</small>
                <p>{source.snippet}</p>
              </div>
              <ExternalLink size={14} />
            </motion.a>
          ))}
        </div>
      </DisclosureContent>
      {!!research.failedQueries?.length && (
        <p className="generation-research-note">
          部分检索未返回资料，本轮仅参考上述可用来源。
        </p>
      )}
    </section>
  );
}

function Blueprint({
  plan,
  confirmed,
  disabled,
  planning,
  open,
  onOpen,
  onConfirm,
  onRevise,
}) {
  const reducedMotion = useReducedMotion();
  const count = plan.units.reduce(
    (total, item) => total + item.lessons.length,
    0,
  );
  return (
    <SpotlightSurface
      as={motion.section}
      className="generation-blueprint"
      aria-label="课程蓝图"
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.3 }}
    >
      <Button
        variant="surface"
        size="surface"
        className="generation-blueprint-toggle"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <span
          className={`generation-blueprint-icon ${confirmed ? "is-confirmed" : ""}`}
        >
          {confirmed ? <DrawnCheck size={23} /> : <BookOpen size={23} />}
        </span>
        <span>
          <strong>{confirmed ? "课程蓝图已确认" : "课程蓝图，等你确认"}</strong>
          <small>
            概念图 · {plan.units.length} 个单元 · {count} 讲 · 打开查看课程结构
          </small>
        </span>
        <ChevronRight size={18} />
      </Button>
      <span className="generation-blueprint-course-title">{plan.title}</span>
      <div className="generation-plan-actions">
        <MorphingAction
          status={planning ? "loading" : confirmed ? "success" : "idle"}
          idleIcon={Check}
          idleText="确认蓝图，生成课程"
          loadingText="正在调整课程蓝图"
          successText="蓝图已确认"
          disabled={disabled}
          onClick={onConfirm}
        />
        {!confirmed && (
          <Button variant="ghost" disabled={disabled} onClick={onRevise}>
            我想调整一下
          </Button>
        )}
      </div>
    </SpotlightSurface>
  );
}

export function CourseCreationPage() {
  const { draftId } = useParams();
  const { state, setCreate } = useStore();
  const draft = state.courseDrafts?.[draftId];
  return draft ? (
    <GenerationConversation key={draftId} draftId={draftId} />
  ) : (
    <div className="page generation-empty">
      <BookOpen size={32} />
      <h1>从一个想学的问题开始</h1>
      <p>这段课程对话还没有开始，创建一段新的对话吧。</p>
      <Button variant="primary" onClick={() => setCreate({})}>
        开始新对话
      </Button>
    </div>
  );
}

function GenerationConversation({ draftId }) {
  const { state, setState, provider, setCreate, activity, notify } = useStore();
  const draft = state.courseDrafts[draftId];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const blueprintAnchor = useRef(null);
  const changeBlueprintOpen = (open) => {
    blueprintAnchor.current = document
      .querySelector(".generation-blueprint-toggle")
      ?.getBoundingClientRect().top;
    setBlueprintOpen(open);
  };
  useLayoutEffect(() => {
    const top = document
      .querySelector(".generation-blueprint-toggle")
      ?.getBoundingClientRect().top;
    if (top != null && blueprintAnchor.current != null)
      window.scrollBy(0, top - blueprintAnchor.current);
    blueprintAnchor.current = null;
  }, [blueprintOpen]);
  const controller = useRef(null);
  const input = useRef(null);
  const composer = useRef(null);
  const end = useRef(null);
  const nearBottom = useRef(true);
  const reducedMotion = useReducedMotion();
  const patch = (values) =>
    setState((s) => ({
      ...s,
      courseDrafts: {
        ...s.courseDrafts,
        [draftId]: { ...s.courseDrafts[draftId], ...values },
      },
    }));
  const patchRef = useRef(patch);
  patchRef.current = patch;
  useEffect(() => {
    if (
      ["researching", "interviewing", "planning", "generating"].includes(
        draft.phase,
      )
    )
      patchRef.current({ interrupted: true });
    const scroll = () => {
      nearBottom.current =
        document.documentElement.scrollHeight -
          window.scrollY -
          window.innerHeight <
        260;
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      if (controller.current) {
        controller.current.abort();
        controller.current = null;
        patchRef.current({ interrupted: true });
      }
    };
  }, []);
  useEffect(() => {
    if (nearBottom.current)
      end.current?.scrollIntoView({
        block: "end",
        behavior: reducedMotion ? "instant" : "smooth",
      });
  }, [
    draft.messages.length,
    draft.phase,
    draft.plan,
    draft.completedUnits.length,
    reducedMotion,
  ]);
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    let active = true;
    const resize = () => {
      if (!active) return;
      field.style.overflowY = "hidden";
      field.style.height = "auto";
      const maximum = parseFloat(getComputedStyle(field).maxHeight);
      // scrollHeight rounds fractional line boxes down; leave one pixel so an
      // empty or single-line field never acquires a phantom scrollbar.
      const natural = field.scrollHeight + 1;
      field.style.height = `${Math.min(maximum, natural)}px`;
      field.style.overflowY = natural > maximum ? "auto" : "hidden";
    };
    resize();
    let width = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const next = field.getBoundingClientRect().width;
      if (next !== width) {
        width = next;
        resize();
      }
    });
    observer.observe(field);
    window.addEventListener("resize", resize);
    document.fonts.ready.then(resize);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [text, busy, draft.topic, !!draft.plan, draft.courseId]);
  useLayoutEffect(() => {
    const wrap = composer.current;
    if (!wrap) return;
    const page = wrap.closest(".generation-chat");
    const reserve = () =>
      page.style.setProperty(
        "--generation-composer-height",
        `${Math.ceil(wrap.getBoundingClientRect().height)}px`,
      );
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      page.style.removeProperty("--generation-composer-height");
    };
  }, [draft.courseId]);
  const questions = draft.questions || [];
  const learningPreferences = draft.learningPreferences || {
    depth: "recommended",
    scale: "",
  };
  const updateLearningPreferences = (values) =>
    patch({
      learningPreferences: { ...learningPreferences, ...values },
      preferencesChanged: !!draft.plan,
      error: "",
    });
  const completeAnswers =
    !!questions.length && questions.every((q) => draft.answers[q.key]);
  const canPlan = completeAnswers || (!questions.length && !!draft.plan);
  const changeFiles = (files) =>
    patch({
      files,
      ...(draft.plan
        ? {
            preferencesChanged: true,
            error: "",
            interrupted: false,
          }
        : {}),
    });
  const available = provider.configured && !busy && !uploading;
  const startRequest = (phase) => {
    if (controller.current) return null;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    patch({ phase, error: "", interrupted: false });
    return request;
  };
  const finishRequest = (request) => {
    if (controller.current === request) {
      controller.current = null;
      setBusy(false);
    }
  };
  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    patch({ interrupted: true, error: "" });
  };
  const researchCourse = async (refresh = false) => {
    if (!available || !draft.topic) return;
    const request = startRequest("researching");
    if (!request) return;
    if (refresh)
      patch({
        questions: [],
        answers: {},
        research: null,
        searchQueries: [],
        summary: "",
        preferencesChanged: !!draft.plan,
      });
    const active = () =>
      controller.current === request && !request.signal.aborted;
    try {
      let queries = refresh ? [] : draft.searchQueries || [];
      if (!queries.length) {
        const response = await aiRequest(
          [{ role: "user", content: courseBrief(draft) }],
          "course_search",
          request.signal,
        );
        if (!active()) return;
        queries = validateSearchQueries(parseCourseJSON(response));
        patch({ searchQueries: queries });
      }
      let research = refresh ? null : draft.research;
      if (!research) {
        research = await researchRequest(queries, request.signal);
        if (!active()) return;
        patch({ research });
      }
      patch({ phase: "interviewing" });
      const response = await aiRequest(
        [{ role: "user", content: courseBrief({ ...draft, research }) }],
        "course_questions",
        request.signal,
      );
      if (!active()) return;
      const interview = validateCourseQuestions(
        parseCourseJSON(response),
        research,
      );
      patch({
        ...interview,
        answers: {},
        ...(draft.plan
          ? { preferencesChanged: true }
          : {
              plan: null,
              confirmed: false,
              completedUnits: [],
              pendingLectures: {},
              partialUnit: null,
              preferencesChanged: false,
            }),
        phase: draft.plan ? "review" : "questions",
        interrupted: false,
      });
    } catch (e) {
      if (active() && e.name !== "AbortError")
        patch({
          phase: "research_error",
          error:
            e instanceof SyntaxError ? "调研结果无法读取，请重试。" : e.message,
        });
    } finally {
      finishRequest(request);
    }
  };
  // A fresh topic starts research once. Restoring an interrupted request requires an explicit retry.
  useEffect(() => {
    const legacy =
      !draft.questions && !draft.plan && draft.phase === "questions";
    if (
      !draft.interrupted &&
      (draft.phase === "research_pending" || legacy) &&
      available
    ) {
      const timer = setTimeout(() => researchCourse(), 0);
      return () => clearTimeout(timer);
    }
  }, [
    draft.phase,
    draft.topic,
    draft.interrupted,
    provider.configured,
    uploading,
  ]);
  const planCourse = async (revision = "") => {
    if (!available || !canPlan) return;
    const request = startRequest("planning");
    if (!request) return;
    if (draft.plan) patch({ preferencesChanged: true });
    const messages = revision
      ? [...draft.messages, { role: "user", text: revision }]
      : draft.messages;
    if (revision) patch({ messages });
    try {
      const response = await aiRequest(
        [
          {
            role: "user",
            content: `${courseBrief({ ...draft, messages })}${draft.plan ? `\n已有蓝图：${JSON.stringify(draft.plan)}\n根据对话中的最新调整要求重新规划。` : ""}`,
          },
        ],
        "course_plan",
        request.signal,
      );
      if (controller.current !== request || request.signal.aborted) return;
      const plan = validateCoursePlan(parseCourseJSON(response));
      patch({
        plan,
        phase: "review",
        confirmed: false,
        completedUnits: [],
        pendingLectures: {},
        partialUnit: null,
        preferencesChanged: false,
        interrupted: false,
      });
    } catch (e) {
      if (controller.current === request && e.name !== "AbortError")
        patch({
          error:
            e instanceof SyntaxError
              ? "模型返回的蓝图无法读取，请重试。"
              : e.message,
          phase: draft.plan ? "review" : "questions",
        });
    } finally {
      finishRequest(request);
    }
  };
  const generateCourse = async () => {
    if (!available || !draft.plan || draft.preferencesChanged || draft.courseId)
      return;
    const request = startRequest("generating");
    if (!request) return;
    patch({ confirmed: true });
    try {
      const completed = await generateCourseCurriculum({
        plan: draft.plan,
        completedUnits: draft.completedUnits,
        partialUnit: draft.partialUnit,
        pendingLectures: draft.pendingLectures,
        concurrency: courseGenerationConcurrency(provider),
        signal: request.signal,
        onProgress: (progress) => {
          if (controller.current === request && !request.signal.aborted)
            patch(progress);
        },
        generate: async (i, j) => {
          const expected = draft.plan.units[i];
          const target = { ...expected, lessons: [expected.lessons[j]] };
          return generateCourseLecture({
            request: aiRequest,
            expectedUnit: expected,
            expectedLesson: expected.lessons[j],
            signal: request.signal,
            conversationId: draftId,
            messages: [
              {
                role: "user",
                content: `${courseBrief(draft)}\n课程目标与单元路线：${JSON.stringify({ title: draft.plan.title, description: draft.plan.description, units: draft.plan.units.map(({ title, summary }) => ({ title, summary })) })}\n本次只生成第 ${i + 1} 个单元的第 ${j + 1} 讲：${JSON.stringify(target)}\n本单元的讲次顺序：${JSON.stringify(expected.lessons.map(({ title }) => title))}\n只返回当前这一个讲次，沿用指定标题。包含完整教材、独立板书与讲解脚本、测验。讲解深度遵循用户偏好，不压缩为固定数量的讲解片段。`,
              },
            ],
          });
        },
      });
      if (controller.current !== request || request.signal.aborted) return;
      const id = `generated-${draftId}`;
      const course = {
        ...draft.plan,
        id,
        units: completed,
        source: "AI 生成",
        research: draft.research,
        curated: false,
        cover: "earth",
        category: "自定义课程",
        level: "自定",
        minutes: completed.reduce((n, u) => n + u.lessons.length, 0) * 20,
      };
      setState((s) => ({
        ...s,
        customCourses: s.customCourses.some((c) => c.id === id)
          ? s.customCourses
          : [...s.customCourses, course],
        joined: s.joined.includes(id) ? s.joined : [...s.joined, id],
        materials: { ...s.materials, [id]: draft.files },
        courseDrafts: {
          ...s.courseDrafts,
          [draftId]: {
            ...s.courseDrafts[draftId],
            phase: "ready",
            courseId: id,
            interrupted: false,
            error: "",
          },
        },
        activities: s.customCourses.some((c) => c.id === id)
          ? s.activities
          : [
              activity(`创建课程：${course.title}`, "course", `/course/${id}`),
              ...s.activities,
            ],
      }));
      notify("课程已加入我的课程");
    } catch (e) {
      if (controller.current === request && e.name !== "AbortError")
        patch({
          phase: "review",
          error: e.message,
        });
    } finally {
      finishRequest(request);
    }
  };
  const submitMessage = (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy || uploading || draft.courseId) return;
    nearBottom.current = true;
    setText("");
    if (!draft.topic) {
      patch({
        topic: message,
        phase: "research_pending",
        messages: [{ role: "user", text: message }],
        error: "",
      });
      setState((s) => ({
        ...s,
        activities: s.activities.map((item) =>
          item.url === `/create/${draftId}`
            ? { ...item, title: `课程对话：${message.slice(0, 50)}` }
            : item,
        ),
      }));
    } else if (draft.plan && available) planCourse(message);
    else
      patch({
        messages: [...draft.messages, { role: "user", text: message }],
        error: "",
      });
  };
  const choose = (key, value) => {
    if (draft.answers[key] === value) return;
    patch({
      answers: { ...draft.answers, [key]: value },
      phase: draft.plan ? "review" : "questions",
      ...(draft.plan
        ? { preferencesChanged: true }
        : {
            plan: null,
            confirmed: false,
            completedUnits: [],
            pendingLectures: {},
            partialUnit: null,
            preferencesChanged: false,
          }),
      error: "",
      interrupted: false,
    });
  };
  const revise = () => {
    input.current?.focus();
    input.current?.scrollIntoView({
      behavior: reducedMotion ? "instant" : "smooth",
      block: "nearest",
    });
  };
  return (
    <div className="page generation-chat" data-blueprint-open={blueprintOpen}>
      {!draft.topic ? (
        <section className="generation-welcome">
          <span>
            <Sparkles size={27} />
          </span>
          <p>从好奇开始</p>
          <h1>一起设计，你想学的课程。</h1>
          <p>告诉我想学什么，我们一起明确目标，再把它变成一条学习路径。</p>
          <div>
            <Button
              variant="ghost"
              onClick={() => setCreate({ method: "template" })}
            >
              从课程模板开始
            </Button>
            <Button
              variant="ghost"
              onClick={() => setCreate({ method: "manual" })}
            >
              自己编排课程
            </Button>
          </div>
        </section>
      ) : (
        <div className="generation-dialogue">
          <div className="generation-user-message">
            {draft.messages[0]?.text || draft.topic}
          </div>
          <motion.section
            className="generation-assistant-turn"
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
          >
            <div className="generation-speaker">
              <Sparkles size={17} />
              <span>知序 · 课程设计</span>
            </div>
            <p className="generation-intro">
              {questions.length
                ? draft.summary
                : `先围绕「${draft.topic}」收集相关资料，再一起明确你的基础、学习方向和最终成果。`}
            </p>
            <div
              className="generation-research-status"
              role="status"
              aria-live="polite"
            >
              <GenerationActivity
                kind="research"
                active={
                  busy && ["researching", "interviewing"].includes(draft.phase)
                }
                paused={
                  draft.interrupted &&
                  ["researching", "interviewing"].includes(draft.phase)
                }
                failed={draft.phase === "research_error" && !!draft.error}
                stateLabel={
                  questions.length
                    ? "调研完成"
                    : draft.research
                      ? "资料已收集"
                      : "等待开始"
                }
                title={
                  busy && draft.phase === "interviewing"
                    ? "把资料，变成适合你的问题"
                    : draft.research
                      ? "学习的线索，已经找到"
                      : "为你的好奇，寻找可靠的线索"
                }
                detail={
                  draft.research
                    ? `已检索 ${draft.research.sources.length} 份资料 · ${questions.length ? "可以开始选择学习方向" : busy ? "正在整理学习方向" : "待继续整理学习方向"}`
                    : draft.searchQueries?.length
                      ? `围绕 ${draft.searchQueries.length} 个检索方向收集相关资料`
                      : "拆解主题 · 联网检索 · 整理学习方向"
                }
              />
              <div
                className={`generation-task ${draft.research ? "is-complete" : busy && draft.phase === "researching" ? "is-running" : "is-pending"}`}
              >
                {draft.research ? (
                  <DrawnCheck />
                ) : busy && draft.phase === "researching" ? (
                  <LoaderCircle size={16} className="creation-spinner" />
                ) : (
                  <Globe2 size={16} />
                )}
                <span>
                  {draft.research
                    ? "主题资料已收集"
                    : busy && draft.phase === "researching"
                      ? "正在拆解主题并联网检索资料"
                      : "等待调研学习主题"}
                </span>
              </div>
              {!!draft.searchQueries?.length && !draft.research && (
                <p className="generation-research-note">
                  检索方向：{draft.searchQueries.join(" · ")}
                </p>
              )}
              {draft.research && <ResearchSources research={draft.research} />}
              {(questions.length > 0 ||
                (busy && draft.phase === "interviewing")) && (
                <div
                  className={`generation-task ${questions.length ? "is-complete" : "is-running"}`}
                >
                  {questions.length ? (
                    <DrawnCheck />
                  ) : (
                    <LoaderCircle size={16} className="creation-spinner" />
                  )}
                  <span>
                    {questions.length
                      ? "已根据主题整理需求问题"
                      : "正在结合资料整理适合你的选择题"}
                  </span>
                </div>
              )}
            </div>
            <div className="generation-question-list">
              {questions.map((question, index) => (
                <ChoiceQuestion
                  key={question.key}
                  index={index}
                  question={question}
                  value={draft.answers[question.key]}
                  disabled={busy || !!draft.courseId}
                  onChange={(value) => choose(question.key, value)}
                />
              ))}
            </div>
            {!!questions.length && (
              <section
                className="generation-learning-preferences"
                aria-label="课程详细度与规模"
              >
                <ChoiceQuestion
                  question={{
                    title: "你希望这门课讲到多详细？",
                    options: learningDepthOptions,
                  }}
                  value={learningPreferences.depth || "recommended"}
                  disabled={busy || !!draft.courseId}
                  onChange={(depth) => updateLearningPreferences({ depth })}
                />
                <label className="generation-scale-input">
                  <span>
                    期望规模或时间安排 <small>选填</small>
                  </span>
                  <Input
                    aria-label="期望规模或时间安排"
                    value={learningPreferences.scale || ""}
                    onChange={(event) =>
                      updateLearningPreferences({ scale: event.target.value })
                    }
                    disabled={busy || !!draft.courseId}
                    maxLength={300}
                    placeholder="例如：约 20 讲；每周 3 小时；不限定讲数，讲清楚为止"
                  />
                </label>
                <p>
                  单元和讲次数量按你的目标与选择规划，可以在蓝图确认前继续调整。
                </p>
                {draft.preferencesChanged && (
                  <div className="generation-preferences-replan">
                    <span>
                      偏好已修改，已有内容已保留。更新蓝图后再继续生成。
                    </span>
                    <Button
                      variant="outline"
                      disabled={!available || !canPlan}
                      onClick={() => planCourse()}
                    >
                      按新偏好更新蓝图
                    </Button>
                  </div>
                )}
              </section>
            )}
            {draft.files.length > 0 && (
              <ul className="generation-files" aria-label="学习资料">
                {draft.files.map((file) => (
                  <li key={file.id}>
                    <FileText size={14} />
                    <span>{file.name}</span>
                    <IconButton
                      icon={X}
                      label={`移除${file.name}`}
                      disabled={busy || !!draft.courseId}
                      onClick={() =>
                        changeFiles(draft.files.filter((f) => f.id !== file.id))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            {!busy && !draft.plan && !questions.length && (
              <Button
                variant="primary"
                disabled={!available}
                onClick={() => researchCourse()}
              >
                {draft.research ? "继续整理需求问题" : "重新调研主题"}
              </Button>
            )}
            {!draft.plan && !!questions.length && (
              <div className="generation-brief-action">
                <MorphingAction
                  status={
                    busy && draft.phase === "planning"
                      ? "loading"
                      : draft.error && draft.phase === "questions"
                        ? "error"
                        : "idle"
                  }
                  idleText="确认方向，生成蓝图"
                  loadingText="正在编排课程蓝图"
                  errorText="重试生成课程蓝图"
                  disabled={!completeAnswers || !available}
                  onClick={() => planCourse()}
                />
                {!completeAnswers && (
                  <small>
                    选好以上 {questions.length} 项，也可以在下方补充想法。
                  </small>
                )}
                <Button
                  variant="ghost"
                  disabled={!available || !!draft.courseId}
                  onClick={() => researchCourse(true)}
                >
                  重新调研并调整问题
                </Button>
              </div>
            )}
          </motion.section>
          {draft.messages.slice(1).map((message, i) => (
            <div className="generation-followup" key={i}>
              <div className="generation-user-message">{message.text}</div>
              {!draft.plan && (
                <p>
                  已记下你的补充，规划时会一起考虑。也可以重新调研，让问题更贴合你的想法。
                </p>
              )}
            </div>
          ))}
          {(draft.plan || draft.phase === "planning") && (
            <section
              className="generation-worklog"
              aria-label="课程生成过程"
              aria-busy={busy}
            >
              <GenerationActivity
                kind={
                  draft.phase === "planning" || !draft.confirmed
                    ? "planning"
                    : "writing"
                }
                active={
                  busy && ["planning", "generating"].includes(draft.phase)
                }
                paused={draft.interrupted}
                failed={!!draft.error}
                stateLabel={
                  draft.courseId
                    ? "课程已就绪"
                    : draft.confirmed
                      ? "等待继续"
                      : "等待确认"
                }
                title={
                  draft.courseId
                    ? "从一个问题，到一门课程"
                    : draft.interrupted
                      ? "当前进度，已为你保留"
                      : draft.error
                        ? "本次生成暂未完成"
                        : draft.phase === "planning"
                          ? "正在调整你的学习路径"
                          : draft.confirmed
                            ? `正在编写：${draft.plan.units[draft.completedUnits.length]?.lessons[draft.partialUnit?.unit.lessons.length || 0]?.title || "整理课程内容"}`
                            : draft.plan && !busy
                              ? "学习路径已铺好，等你确认"
                              : "让知识，连成一条学习路径"
                }
                detail={
                  draft.phase !== "planning" && draft.confirmed
                    ? "板书重点 · 独立讲解 · 随堂练习"
                    : "根据你的目标与资料，组织单元和讲次"
                }
                completed={draft.completedUnits.length}
                total={
                  draft.phase !== "planning" && draft.confirmed
                    ? draft.plan.units.length
                    : 0
                }
              />
              <div className="generation-task is-complete">
                <DrawnCheck />
                <span>学习目标与偏好已记录</span>
              </div>
              <div
                className={`generation-task ${busy && draft.phase === "planning" ? "is-running" : draft.plan ? "is-complete" : ""}`}
              >
                {busy && draft.phase === "planning" ? (
                  <LoaderCircle className="creation-spinner" size={16} />
                ) : draft.plan ? (
                  <DrawnCheck />
                ) : (
                  <Square size={13} />
                )}
                <span>
                  {busy && draft.phase === "planning"
                    ? "正在规划课程蓝图"
                    : draft.plan
                      ? "课程结构已规划"
                      : "课程规划已暂停"}
                </span>
              </div>
              {draft.plan && (
                <Blueprint
                  key={JSON.stringify(draft.plan)}
                  plan={draft.plan}
                  confirmed={draft.confirmed}
                  disabled={!available || !!draft.preferencesChanged}
                  planning={busy && draft.phase === "planning"}
                  open={blueprintOpen}
                  onOpen={() => changeBlueprintOpen(true)}
                  onConfirm={generateCourse}
                  onRevise={revise}
                />
              )}
              {draft.confirmed && (
                <div className="generation-unit-progress">
                  {draft.plan.units.map((unit, i) => {
                    const done = i < draft.completedUnits.length;
                    const running =
                      busy &&
                      draft.phase === "generating" &&
                      i === draft.completedUnits.length;
                    const current = i === draft.completedUnits.length;
                    const status = done
                      ? "success"
                      : running
                        ? "running"
                        : current && draft.error
                          ? "error"
                          : current && draft.interrupted
                            ? "paused"
                            : "pending";
                    return (
                      <AgentActivityItem
                        key={i}
                        status={status}
                        className={
                          done
                            ? "is-complete"
                            : running
                              ? "is-running"
                              : "is-pending"
                        }
                        title={`${done ? "已完成" : running ? "正在编写" : status === "error" ? "待重试" : status === "paused" ? "已暂停" : "待生成"} · 单元 ${i + 1}：${unit.title}`}
                      >
                        <small>
                          {done ? "已生成的讲次" : "单元讲次 · 完成后逐讲保留"}
                        </small>
                        <ul>
                          {(done ? draft.completedUnits[i] : unit).lessons.map(
                            (lesson, j) => (
                              <li key={j}>
                                <BookOpen size={14} />
                                <div>
                                  <strong>
                                    {lesson.title}
                                    {!done &&
                                    ((draft.partialUnit?.index === i &&
                                      j <
                                        draft.partialUnit.unit.lessons
                                          .length) ||
                                      draft.pendingLectures?.[`${i}:${j}`])
                                      ? " · 已生成"
                                      : ""}
                                  </strong>
                                  <p>{lesson.summary}</p>
                                </div>
                              </li>
                            ),
                          )}
                        </ul>
                      </AgentActivityItem>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {draft.interrupted && !busy && !draft.courseId && (
            <p className="generation-interrupted" role="status">
              流程已暂停，已完成的内容会保留。
              {draft.completedUnits.length
                ? `已有 ${draft.completedUnits.length} 个单元，可以接着生成。`
                : "可以继续调整或重新开始。"}
              {!!draft.partialUnit?.unit.lessons.length &&
                `当前单元另有 ${draft.partialUnit.unit.lessons.length} 讲已保留，会从下一讲继续。`}
            </p>
          )}
          {draft.error && (
            <p className="form-error generation-error" role="alert">
              {draft.error}
            </p>
          )}
          {!busy &&
            !draft.courseId &&
            draft.plan &&
            (draft.error || draft.interrupted || draft.confirmed) && (
              <div
                className="generation-recovery-actions"
                aria-label="课程生成恢复操作"
              >
                {(draft.error || draft.interrupted) && (
                  <Button
                    variant="outline"
                    onClick={() => planCourse()}
                    disabled={!available || !canPlan}
                  >
                    重新规划蓝图
                  </Button>
                )}
                {draft.confirmed && (
                  <Button
                    variant="primary"
                    onClick={generateCourse}
                    disabled={!available || !!draft.preferencesChanged}
                  >
                    继续生成课程
                  </Button>
                )}
              </div>
            )}
          {draft.courseId && (
            <motion.section
              className="generation-delivery"
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span>
                <DrawnCheck size={24} />
              </span>
              <div>
                <small>课程已就绪 · 已加入我的课程</small>
                <h2>{draft.plan.title}</h2>
                <p>
                  {draft.plan.units.length} 个单元 ·{" "}
                  {lessonsOf({ units: draft.completedUnits }).length} 讲 ·
                  包含板书、讲解与练习
                </p>
                <div>
                  <ButtonLink
                    variant="primary"
                    iconRight={ArrowRight}
                    to={`/learn/${draft.courseId}/${draft.completedUnits[0].lessons[0].id}`}
                  >
                    开始学习
                  </ButtonLink>
                  <ButtonLink
                    variant="outline"
                    to={`/course/${draft.courseId}`}
                  >
                    查看课程
                  </ButtonLink>
                </div>
              </div>
            </motion.section>
          )}
        </div>
      )}
      {!draft.topic && draft.files.length > 0 && (
        <ul className="generation-files" aria-label="学习资料">
          {draft.files.map((file) => (
            <li key={file.id}>
              <FileText size={14} />
              <span>{file.name}</span>
              <IconButton
                icon={X}
                label={`移除${file.name}`}
                onClick={() =>
                  changeFiles(draft.files.filter((f) => f.id !== file.id))
                }
              />
            </li>
          ))}
        </ul>
      )}
      {!provider.loading && !provider.configured && !draft.courseId && (
        <div className="generation-provider-notice">
          <Sparkles size={16} />
          <span>先记录你的想法，连接 AI 模型后开始联网调研。</span>
          <Link to="/settings#ai">连接模型</Link>
        </div>
      )}
      <div ref={end} className="generation-end" />
      {!draft.courseId && (
        <div ref={composer} className="generation-composer-wrap">
          <SpotlightSurface
            as="form"
            className="generation-composer"
            aria-busy={busy}
            onSubmit={submitMessage}
          >
            <Textarea
              ref={input}
              aria-label="课程生成对话"
              value={text}
              disabled={busy}
              maxLength={2000}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                busy
                  ? "正在整理课程内容，随时可以停止…"
                  : !draft.topic
                    ? "你想学习什么？比如，学习前端 Vue 和 Spring…"
                    : draft.plan
                      ? "想调整哪里？告诉我，我来修改课程蓝图…"
                      : "补充你的学习目标、项目想法，或已有的资料…"
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault();
                  e.currentTarget.form.requestSubmit();
                }
              }}
            />
            <div className="generation-composer-tools">
              <UploadButton
                variant="ghost"
                className="generation-composer-upload"
                disabled={busy}
                onBusyChange={setUploading}
                onFiles={(files) => changeFiles([...draft.files, ...files])}
              >
                <Paperclip size={16} />
                添加资料
              </UploadButton>
              <small>
                {busy ? "正在生成…" : "Enter 发送 · Shift + Enter 换行"}
              </small>
              {busy ? (
                <IconButton icon={Square} label="停止生成" onClick={stop} />
              ) : (
                <IconButton
                  type="submit"
                  icon={ArrowUp}
                  label="发送课程消息"
                  disabled={!text.trim() || uploading}
                />
              )}
            </div>
          </SpotlightSurface>
        </div>
      )}
      {draft.plan && (
        <CourseBlueprintPanel
          key={JSON.stringify(draft.plan)}
          draft={draft}
          open={blueprintOpen}
          onOpenChange={changeBlueprintOpen}
          busy={!available || !!draft.preferencesChanged}
          onConfirm={generateCourse}
          onRevise={revise}
        />
      )}
    </div>
  );
}
