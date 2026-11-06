import { learningModeBrief } from "./lib/learning-mode";
import { QuestionFields } from "./components/question-fields";
import {
  answerReady,
  evaluateQuestion,
  formatQuestionAnswer,
} from "./lib/questions";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTransitions } from "./lib/motion";
import { requestClassroomAdaptation } from "./lib/adaptive-classroom";
import { VoiceInput } from "./components/voice-input";
import { AIResponse } from "./components/ui/ai-response";
import { appendVoiceText } from "./lib/voice-input";
import { DisclosureContent } from "./components/ui/disclosure";
import { DatePicker } from "./components/ui/date-picker";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  EyeOff,
  FileText,
  Flag,
  GraduationCap,
  Highlighter,
  LayoutPanelLeft,
  ListChecks,
  List,
  Maximize2,
  MessageSquare,
  Minus,
  Upload,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Pencil,
  Plus,
  Printer,
  Save,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import {
  useStore,
  aiRequest,
  aiStream,
  dateLabel,
  download,
  localDate,
} from "./store";
import { streamPreview } from "./lib/stream-text";
import { lessonsOf, progressOf } from "./data";
import {
  Badge,
  Button,
  ButtonLink,
  Cover,
  Empty,
  Field,
  IconButton,
  Input,
  Modal,
  Progress,
  Textarea,
  UploadButton,
} from "./ui";
import { Md } from "./pages";
import {
  CourseDashboard,
  LearningPath,
  ProjectDialog,
  AssessmentDialog,
  mastery,
  masteryLevels,
} from "./courseExtras";
import { CourseEditor } from "./components/course-editor";
import { HoverLesson } from "./components/hover-lesson";
import { ModelSelector } from "./components/model-selector";
import { CourseBookmarkButton } from "./components/course-bookmark-button";
import { downloadOriginal } from "./serverMaterials";
import { ClassroomBoard } from "./classroomBoard";
import { CoursePractice } from "./components/course-practice";
import { streamText } from "./lib/lesson-sequence";

export function Quiz({ lesson, onResult }) {
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    setSelected(null);
    setChecked(false);
  }, [lesson.id]);
  const q = lesson.quiz;
  if (!q) return <Empty icon={ListChecks} title="这节课还没有测验" />;
  return (
    <div className="quiz">
      <span className="quiz-label">
        <ListChecks size={16} />
        知识测验
      </span>
      <h3>{q.question}</h3>
      <QuestionFields
        question={q}
        value={selected}
        onChange={setSelected}
        disabled={checked}
        submitted={checked}
        mode="quiz"
      />
      {checked ? (
        <div
          className={`quiz-feedback ${evaluateQuestion(q, selected)?.correct ? "correct" : ""}`}
          role="status"
        >
          <h4>
            {evaluateQuestion(q, selected)?.correct === null
              ? "对照参考思路复盘"
              : evaluateQuestion(q, selected)?.correct
                ? "理解得很准确"
                : "再看一下这个关键点"}
          </h4>
          <p>{q.explanation}</p>
          <Button
            variant="link"
            size="sm"
            iconRight={ArrowRight}
            onClick={() => {
              setSelected(null);
              setChecked(false);
            }}
          >
            重新作答
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          iconRight={ArrowRight}
          disabled={!answerReady(q, selected)}
          onClick={() => {
            setChecked(true);
            onResult?.(evaluateQuestion(q, selected)?.correct);
          }}
        >
          检查答案
        </Button>
      )}
    </div>
  );
}

function CourseDescription({ children, id, onOverflowChange }) {
  const text = useRef(null);
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const full = text.current.getBoundingClientRect().height;
      const style = getComputedStyle(text.current);
      const line = parseFloat(style.lineHeight);
      const lines =
        Number(style.getPropertyValue("--course-description-lines")) || 3;
      setSize({ full, collapsed: Math.min(full, line * lines) });
      onOverflowChange?.(full > line * lines + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(text.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [children, onOverflowChange]);
  return (
    <motion.div
      id={id}
      className="course-description"
      initial={false}
      animate={{
        height: size ? size.collapsed : "auto",
      }}
      transition={
        reducedMotion ? { duration: 0 } : motionTransitions.disclosure
      }
    >
      <p ref={text}>{children}</p>
    </motion.div>
  );
}

export function CoursePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const {
    state,
    setState,
    courses,
    join,
    notify,
    libraryMine,
    publishCourse,
    unpublishCourse,
  } = useStore();
  const course = courses.find((c) => c.id === id);
  const [tab, setTab] = useState("units");
  const [unitIndex, setUnit] = useState(0);
  const [preview, setPreview] = useState(null);
  const [schedule, setSchedule] = useState(false);
  const [date, setDate] = useState(localDate());
  const [remove, setRemove] = useState(null);
  const [project, setProject] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [masteryFilter, setMasteryFilter] = useState("all");
  const [materialSearch, setMaterialSearch] = useState("");
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const unitHeading = useRef(null);
  const unitNavigationFrame = useRef(null);
  const courseContent = useRef(null);
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    const content = courseContent.current;
    if (!content) return;
    const frame = content.closest(".course-reference");
    const desktop = window.matchMedia("(min-width: 761px)");
    let width = content.clientWidth;
    let minimumHeight = 0;
    let minimumPageHeight = 0;
    const preserveHeight = () => {
      // Desktop details use a bounded right-hand scroller. Only the stacked
      // layout needs to preserve document height across shorter tab views.
      if (desktop.matches) {
        content.style.removeProperty("min-height");
        frame.style.removeProperty("min-height");
        return;
      }
      const panel = content.firstElementChild;
      if (!panel) return;
      // Recalculate for responsive widths, but retain visited views' height
      // while switching tabs so a shorter view cannot clamp window.scrollY.
      if (content.clientWidth !== width) {
        width = content.clientWidth;
        minimumHeight = 0;
        minimumPageHeight = 0;
        content.style.removeProperty("min-height");
        frame.style.removeProperty("min-height");
      }
      minimumHeight = Math.max(
        minimumHeight,
        panel.getBoundingClientRect().height,
      );
      content.style.minHeight = `${minimumHeight}px`;
      // Outline-only navigation can disappear on mobile without shortening
      // the document and clamping the user's current scroll position.
      minimumPageHeight = Math.max(
        minimumPageHeight,
        frame.getBoundingClientRect().height,
      );
      frame.style.minHeight = `${minimumPageHeight}px`;
    };
    preserveHeight();
    const observer = new ResizeObserver(preserveHeight);
    observer.observe(content);
    observer.observe(frame);
    desktop.addEventListener("change", preserveHeight);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", preserveHeight);
      content.style.removeProperty("min-height");
      frame.style.removeProperty("min-height");
    };
  }, [id, Boolean(course)]);
  useLayoutEffect(() => {
    if (window.matchMedia("(min-width: 761px)").matches)
      courseContent.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [id, tab]);
  useEffect(() => {
    setUnit(0);
    setTab("units");
    setDescriptionExpanded(false);
    setMasteryFilter("all");
    setEditing(false);
    return () => cancelAnimationFrame(unitNavigationFrame.current);
  }, [id]);
  const openUnit = (index) => {
    setUnit(index);
    setMasteryFilter("all");
    setTab("units");
    cancelAnimationFrame(unitNavigationFrame.current);
    unitNavigationFrame.current = requestAnimationFrame(() => {
      const heading = unitHeading.current;
      if (!heading) return;
      heading.focus({ preventScroll: true });
      if (window.matchMedia("(min-width: 761px)").matches) {
        courseContent.current?.scrollTo({
          top: 0,
          behavior: reducedMotion ? "instant" : "smooth",
        });
        return;
      }
      heading.closest(".unit-heading").scrollIntoView({
        block: "start",
        behavior: reducedMotion ? "instant" : "smooth",
      });
    });
  };
  if (!course)
    return (
      <main className="page">
        <Empty
          title="没有找到这门课程"
          action={<ButtonLink to="/marketplace">返回课程库</ButtonLink>}
        />
      </main>
    );
  const lessons = lessonsOf(course);
  const enrolled = state.joined.includes(id);
  const isOwn = state.customCourses?.some((item) => item.id === id);
  const publication = libraryMine.find((item) => item.id === id);
  const isLibrary = Boolean(course.library);
  const publish = async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      const result = await publishCourse(id);
      notify(result.version > 1 ? "课程库内容已更新" : "课程已发布到课程库");
    } catch (error) {
      notify(error.message);
    } finally {
      setPublishing(false);
    }
  };
  const unpublish = async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      await unpublishCourse(id);
      setConfirmUnpublish(false);
      notify("课程已下架，已加入的学习者仍可继续学习");
    } catch (error) {
      notify(error.message);
    } finally {
      setPublishing(false);
    }
  };
  const openCourseAssistant = () => {
    const chatId = crypto.randomUUID();
    setState((s) => ({
      ...s,
      conversations: [
        {
          id: chatId,
          title: `课程答疑：${course.title}`,
          messages: [],
          files: [],
          draft: "",
          courseContext: {
            courseId: course.id,
            lessonId: null,
          },
          date: new Date().toISOString(),
        },
        ...s.conversations,
      ],
    }));
    navigate(`/assistant/${chatId}`);
  };
  const current =
    lessons.find((l) => !state.progress[`${id}/${l.id}`]?.completed) ||
    lessons[0];
  const unit = course.units[unitIndex] || course.units[0];
  const completedCount = lessons.filter(
    (l) => state.progress[`${id}/${l.id}`]?.completed,
  ).length;
  const materials = state.materials[id] || [];
  const courseExport = () =>
    download(
      `${course.title}.md`,
      `# ${course.title}\n\n${course.description}\n\n${course.units.map((u) => `# ${u.title}\n\n${u.lessons.map((l) => `## ${l.title}\n\n${l.content}`).join("\n\n")}`).join("\n\n")}`,
    );
  return (
    <main className="page course-detail course-reference">
      <div className="course-detail-toolbar">
        <div className="course-back-row">
          <Link to={enrolled ? "/courses" : "/marketplace"}>
            <ArrowLeft size={16} />
            退出课程
          </Link>
        </div>
        <div className="course-toolbar-actions" aria-label="课程操作">
          {isOwn && (
            <div className="course-library-publish" aria-label="课程库发布">
              {publication?.status === "published" ? (
                <>
                  <span className="course-publication-status">
                    已发布 v{publication.version} · 课程库
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Upload}
                    loading={publishing}
                    onClick={publish}
                  >
                    更新发布
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={EyeOff}
                    disabled={publishing}
                    onClick={() => setConfirmUnpublish(true)}
                  >
                    下架
                  </Button>
                </>
              ) : publication?.status === "hidden" ? (
                <>
                  <span className="course-publication-status is-hidden">
                    已下架 · 已加入者仍可学习
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Upload}
                    loading={publishing}
                    onClick={publish}
                  >
                    重新发布
                  </Button>
                </>
              ) : (
                <>
                  <span className="course-publication-status">
                    默认私有 · 仅自己可见
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Upload}
                    loading={publishing}
                    onClick={publish}
                  >
                    发布到课程库
                  </Button>
                </>
              )}
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={Sparkles}
            className="course-toolbar-ai"
            onClick={openCourseAssistant}
          >
            AI 协助
          </Button>
        </div>
      </div>
      <aside className="course-reference-sidebar">
        <section className="course-identity">
          <div className="course-identity-cover">
            <Cover course={course} showMark={false} />
            <div className="course-cover-actions">
              {isOwn && (
                <IconButton
                  icon={Pencil}
                  label="编辑课程"
                  onClick={() => setEditing(true)}
                />
              )}
              {!["localhost", "127.0.0.1", "::1", "[::1]"].includes(
                window.location.hostname,
              ) && (
                <IconButton
                  icon={Share2}
                  label="复制课程链接"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(location.href);
                      notify("课程链接已复制");
                    } catch {
                      notify("浏览器未允许复制，请从地址栏获取链接");
                    }
                  }}
                />
              )}
              <IconButton
                icon={ArrowDownToLine}
                label="导出课程讲义"
                onClick={courseExport}
              />
              <IconButton
                icon={CalendarPlus}
                label="安排学习"
                onClick={() => setSchedule(true)}
              />
            </div>
          </div>
          <div className="course-reference-copy">
            <div className="course-publisher">
              <span>
                <small>策划自</small>
                <span>{course.source}</span>
              </span>
              <CourseBookmarkButton course={course} compact={false} />
            </div>
            {course.library && (
              <div className="course-library-source">
                <Badge>课程库</Badge>
                <span>
                  {course.library.authorName} · 版本 v{course.library.version}
                  {course.library.hidden
                    ? " · 作者已下架，你仍可学习已加入版本"
                    : ""}
                </span>
              </div>
            )}
            <h1>{course.title}</h1>
            <div className="course-summary">
              <CourseDescription
                id={`course-description-${id}`}
                onOverflowChange={setDescriptionOverflows}
              >
                {course.description}
              </CourseDescription>
              {descriptionOverflows && (
                <Button
                  variant="surface"
                  size="surface"
                  className="course-description-toggle"
                  onClick={() => setDescriptionExpanded(true)}
                  aria-expanded={descriptionExpanded}
                  aria-haspopup="dialog"
                  aria-controls={`course-description-full-${id}`}
                >
                  显示更多
                  <ChevronDown size={12} />
                </Button>
              )}
              <div className="course-stats">
                <span>
                  <BookOpen size={15} />
                  {lessons.length} 讲
                </span>
                <span>
                  <Clock3 size={15} />约 {course.minutes} 分钟
                </span>
              </div>
              <div className="course-enroll-row">
                {enrolled ? (
                  <ButtonLink
                    variant="primary"
                    to={`/learn/${id}/${current.id}`}
                    icon={Play}
                  >
                    {completedCount === lessons.length
                      ? "回顾课程"
                      : state.progress[`${id}/${current.id}`]?.visited
                        ? "继续学习"
                        : "开始学习"}
                  </ButtonLink>
                ) : (
                  <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => join(id)}
                  >
                    加入我的课程
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
        <div className="course-viewbar">
          <div className="course-viewbar-top">
            <Button
              variant="ghost"
              size="sm"
              className="course-dashboard-link"
              aria-label="课程概览"
              title="课程概览"
              aria-pressed={tab === "dashboard"}
              onClick={() => setTab("dashboard")}
            >
              <LayoutPanelLeft size={15} />
            </Button>
          </div>
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="course-detail-tabs"
          >
            <TabsList aria-label="课程视图">
              <TabsTrigger value="units">
                <List size={15} />
                单元
              </TabsTrigger>
              <TabsTrigger value="materials">
                <FileText size={15} />
                资料
              </TabsTrigger>
              <TabsTrigger value="practice">
                <Pencil size={15} />
                练习
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {tab === "units" && (
          <nav className="unit-navigation" aria-label="课程单元">
            {course.units.map((u, i) => (
              <Button
                variant="surface"
                size="surface"
                key={i}
                className={tab === "units" && unitIndex === i ? "active" : ""}
                onClick={() => openUnit(i)}
                aria-current={
                  tab === "units" && unitIndex === i ? "step" : undefined
                }
              >
                <span>{i + 1}</span>
                <strong>{u.title}</strong>
              </Button>
            ))}
          </nav>
        )}
        <div className="unit-progress">
          <div>
            <span>学习进度</span>
            <strong>{progressOf(course, state.progress)}%</strong>
          </div>
          <Progress value={progressOf(course, state.progress)} />
          <p>
            {
              lessons.filter((l) => state.progress[`${id}/${l.id}`]?.completed)
                .length
            }{" "}
            / {lessons.length} 讲已完成
          </p>
        </div>
      </aside>
      <div
        className="course-reference-content"
        data-view={tab}
        ref={courseContent}
      >
        <motion.div
          key={`${id}-${tab}-${tab === "units" ? unitIndex : ""}`}
          className="course-view-panel"
          data-view={tab}
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { ...motionTransitions.content, duration: 0.24 }
          }
        >
          {tab === "dashboard" && (
            <CourseDashboard
              course={course}
              onUnits={openUnit}
              onPractice={() => setTab("practice")}
            />
          )}
          {tab === "units" && (
            <div className="course-units-layout">
              <div className="unit-content">
                <div className="unit-heading">
                  <span className="date-caption">
                    第 {unitIndex + 1} 单元 / 共 {course.units.length} 单元
                  </span>
                  <h2 ref={unitHeading} tabIndex={-1}>
                    单元 {unitIndex + 1}：{unit.title}
                  </h2>
                  <p>{unit.description || unit.lessons[0]?.summary}</p>
                </div>
                <Button
                  variant="surface"
                  size="surface"
                  className="course-extend-entry"
                  onClick={() => setTab("materials")}
                >
                  <FileText size={28} strokeWidth={1.3} />
                  <span>
                    <strong>上传材料，扩展这门课程</strong>
                    <small>上传新的 PDF，或添加更多课程资料</small>
                  </span>
                  <Plus size={17} />
                </Button>
                <LearningPath
                  course={course}
                  unit={unit}
                  filter={masteryFilter}
                  onFilterChange={setMasteryFilter}
                  onProject={() => setProject(unitIndex)}
                  onExam={() => setAssessment(unit)}
                ></LearningPath>
                <div className="course-timeline">
                  <div className="lesson-list">
                    {unit.lessons.map((l, i) => {
                      const done = state.progress[`${id}/${l.id}`]?.completed;
                      if (
                        masteryFilter !== "all" &&
                        mastery(state.progress[`${id}/${l.id}`]) !==
                          masteryFilter
                      )
                        return null;
                      return (
                        <HoverLesson key={l.id} completed={done}>
                          {(expanded, toggle, setSelectOpen) => (
                            <>
                              <span className="lesson-index">
                                {done ? (
                                  <Check size={18} />
                                ) : (
                                  <BookOpen size={15} />
                                )}
                              </span>
                              <div>
                                <div className="lesson-kind">
                                  {done && <Badge color="green">已完成</Badge>}
                                  <div className="mastery-select">
                                    <span
                                      className={`mastery-dot ${mastery(state.progress[`${id}/${l.id}`])}`}
                                    />
                                    <Select
                                      onOpenChange={setSelectOpen}
                                      value={mastery(
                                        state.progress[`${id}/${l.id}`],
                                      )}
                                      onValueChange={(value) =>
                                        setState((s) => ({
                                          ...s,
                                          progress: {
                                            ...s.progress,
                                            [`${id}/${l.id}`]: {
                                              ...s.progress[`${id}/${l.id}`],
                                              mastery: value,
                                            },
                                          },
                                        }))
                                      }
                                    >
                                      <SelectTrigger
                                        size="sm"
                                        className="h-6 w-auto gap-1 border-0 bg-transparent px-1 text-[11px] shadow-none"
                                        aria-label={`${l.title}掌握程度`}
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent align="start">
                                        <div className="mastery-menu-label">
                                          设置自评掌握程度
                                        </div>
                                        {masteryLevels.map(([key, label]) => (
                                          <SelectItem key={key} value={key}>
                                            {label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="lesson-title-row">
                                  <Link to={`/learn/${id}/${l.id}`}>
                                    <h3>
                                      讲次 {i + 1}：{l.title}
                                    </h3>
                                  </Link>
                                  <IconButton
                                    icon={ChevronDown}
                                    label={`${expanded ? "收起" : "展开"}${l.title}`}
                                    size="sm"
                                    aria-expanded={expanded}
                                    aria-controls={`lesson-details-${l.id}`}
                                    onClick={toggle}
                                  />
                                </div>
                                <DisclosureContent
                                  open={expanded}
                                  id={`lesson-details-${l.id}`}
                                >
                                  <p>{l.summary}</p>
                                  <div className="lesson-actions">
                                    <ButtonLink
                                      size="sm"
                                      icon={Play}
                                      to={`/learn/${id}/${l.id}`}
                                    >
                                      {done
                                        ? "重新学习"
                                        : l.id === current.id &&
                                            state.progress[`${id}/${l.id}`]
                                          ? "继续学习"
                                          : "开始学习"}
                                    </ButtonLink>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      icon={Pencil}
                                      onClick={() => setTab("practice")}
                                    >
                                      独立练习
                                    </Button>
                                    <span>
                                      <Clock3 size={12} />约 15 分钟
                                    </span>
                                  </div>
                                </DisclosureContent>
                              </div>
                            </>
                          )}
                        </HoverLesson>
                      );
                    })}
                  </div>
                  {masteryFilter !== "all" &&
                    !unit.lessons.some(
                      (l) =>
                        mastery(state.progress[`${id}/${l.id}`]) ===
                        masteryFilter,
                    ) && (
                      <div className="mastery-empty">
                        <p>
                          本单元还没有“
                          {
                            masteryLevels.find(
                              ([key]) => key === masteryFilter,
                            )?.[1]
                          }
                          ”的小节。
                        </p>
                        <Button
                          variant="link"
                          onClick={() => setMasteryFilter("all")}
                        >
                          查看全部小节
                        </Button>
                      </div>
                    )}
                  <div className="unit-deliverables">
                    {/* Keep the timeline markers outside these cards fixed. */}
                    <Button
                      variant="surface"
                      size="surface"
                      whileHover={{ scale: 1 }}
                      whileTap={{ scale: 1 }}
                      onClick={() => setProject(unitIndex)}
                    >
                      <Flag size={20} />
                      <div>
                        <strong>阶段项目：{unit.title}</strong>
                        <span>
                          {state.projects?.[`${id}/${unitIndex}`]?.submitted
                            ? "已提交 · 查看项目记录"
                            : "整理一个例子，检验自己的理解"}
                        </span>
                      </div>
                      <ChevronRight size={16} />
                    </Button>
                    <Button
                      variant="surface"
                      size="surface"
                      whileHover={{ scale: 1 }}
                      whileTap={{ scale: 1 }}
                      onClick={() => setAssessment(unit)}
                    >
                      <ListChecks size={20} />
                      <div>
                        <strong>单元知识测验</strong>
                        <span>
                          {unit.lessons.filter((l) => l.quiz).length} 道题 ·
                          逐题解析与回顾
                        </span>
                      </div>
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
                <div className="unit-bottom">
                  <span>
                    <CheckCircle2 size={16} />
                    完成本单元后，可进入独立练习继续巩固。
                  </span>
                  {unitIndex < course.units.length - 1 && (
                    <Button
                      variant="surface"
                      size="surface"
                      onClick={() => openUnit(unitIndex + 1)}
                    >
                      下一单元
                      <ArrowRight size={15} />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
          {tab === "materials" && (
            <section className="materials-section">
              <div className="section-heading">
                <div>
                  <h2>课程资料</h2>
                  <span>PDF · PPTX · DOCX · TXT · MD · CSV</span>
                </div>
                <UploadButton
                  onFiles={(files) => {
                    setState((s) => ({
                      ...s,
                      materials: {
                        ...s.materials,
                        [id]: [...(s.materials[id] || []), ...files],
                      },
                    }));
                    notify("资料已导入");
                  }}
                >
                  <Plus size={17} />
                  上传资料
                </UploadButton>
              </div>
              {materials.length > 0 && (
                <div className="material-search">
                  <Input
                    aria-label="搜索课程资料"
                    className="flex-1"
                    placeholder="搜索文件名或资料内容…"
                    value={materialSearch}
                    onChange={(e) => setMaterialSearch(e.target.value)}
                  />
                  <span>
                    {
                      materials.filter((f) =>
                        (f.name + f.text)
                          .toLowerCase()
                          .includes(materialSearch.toLowerCase()),
                      ).length
                    }{" "}
                    份资料
                  </span>
                </div>
              )}
              {materials.length ? (
                <div className="material-list">
                  {materials
                    .filter((f) =>
                      (f.name + f.text)
                        .toLowerCase()
                        .includes(materialSearch.toLowerCase()),
                    )
                    .map((f) => (
                      <div className="material-row" key={f.id}>
                        <span className="file-icon">
                          <FileText size={22} />
                        </span>
                        <Button
                          variant="surface"
                          size="surface"
                          onClick={() => setPreview(f)}
                        >
                          <strong>{f.name}</strong>
                          <small>
                            {(f.size / 1024).toFixed(1)} KB ·{" "}
                            {dateLabel(f.date)} · {f.text.length} 字符
                          </small>
                        </Button>
                        {f.original && (
                          <IconButton
                            icon={Save}
                            label={`下载${f.name}原文件`}
                            onClick={() =>
                              downloadOriginal(f).catch((e) =>
                                notify(e.message),
                              )
                            }
                          />
                        )}
                        <IconButton
                          icon={ArrowDownToLine}
                          label={`导出${f.name}文字`}
                          onClick={() =>
                            download(
                              `${f.name}.txt`,
                              f.text,
                              "text/plain;charset=utf-8",
                            )
                          }
                        />
                        <IconButton
                          icon={Trash2}
                          label={`删除${f.name}`}
                          onClick={() => setRemove(f)}
                        />
                      </div>
                    ))}
                </div>
              ) : (
                <Empty icon={FileText} title="把课程资料放在这里" />
              )}
            </section>
          )}
          {tab === "practice" && (
            <CoursePractice course={course} initialUnit={unitIndex} />
          )}
        </motion.div>
      </div>
      {project !== null && (
        <ProjectDialog
          course={course}
          index={project}
          onClose={() => setProject(null)}
        />
      )}
      {assessment && (
        <AssessmentDialog
          course={course}
          unit={assessment === "all" ? null : assessment}
          QuizView={Quiz}
          onClose={() => setAssessment(null)}
        />
      )}
      {editing && (
        <CourseEditor course={course} onClose={() => setEditing(false)} />
      )}
      {descriptionExpanded && (
        <Modal title="课程简介" onClose={() => setDescriptionExpanded(false)}>
          <div
            className="modal-body course-description-detail"
            id={`course-description-full-${id}`}
          >
            <h3>{course.title}</h3>
            <p>{course.description}</p>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal title={preview.name} wide onClose={() => setPreview(null)}>
          <div className="modal-body material-preview">
            {/\.md$/i.test(preview.name) ? (
              <Md>{preview.text}</Md>
            ) : (
              <pre>{preview.text}</pre>
            )}
          </div>
        </Modal>
      )}
      {schedule && (
        <Modal title="安排一次学习" onClose={() => setSchedule(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setState((s) => ({
                ...s,
                tasks: [
                  ...s.tasks,
                  {
                    id: crypto.randomUUID(),
                    title: `学习：${current.title}`,
                    date,
                    done: false,
                  },
                ],
              }));
              setSchedule(false);
              notify("已加入学习日历");
            }}
          >
            <div className="modal-body">
              <p className="schedule-course">
                {course.title}
                <br />
                <strong>{current.title}</strong>
              </p>
              <Field label="学习日期" htmlFor="schedule-date" required>
                <DatePicker
                  id="schedule-date"
                  required
                  value={date}
                  onChange={setDate}
                />
              </Field>
            </div>
            <div className="modal-footer">
              <Button type="button" onClick={() => setSchedule(false)}>
                取消
              </Button>
              <Button variant="primary" type="submit" icon={CalendarPlus}>
                加入日历
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal title="删除这份资料？" onClose={() => setRemove(null)}>
          <div className="modal-body">{remove.name}</div>
          <div className="modal-footer">
            <Button onClick={() => setRemove(null)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                setState((s) => ({
                  ...s,
                  materials: {
                    ...s.materials,
                    [id]: (s.materials[id] || []).filter(
                      (f) => f.id !== remove.id,
                    ),
                  },
                }));
                setRemove(null);
                notify("资料已删除");
              }}
            >
              删除资料
            </Button>
          </div>
        </Modal>
      )}
      {confirmUnpublish && (
        <Modal
          title="从课程库下架？"
          onClose={() => {
            if (!publishing) setConfirmUnpublish(false);
          }}
        >
          <div className="modal-body">
            <p>
              下架后课程会从课程库搜索结果中移除，其他人不能再加入；已经加入的学习者仍可继续学习。
            </p>
          </div>
          <div className="modal-footer">
            <Button
              disabled={publishing}
              onClick={() => setConfirmUnpublish(false)}
            >
              取消
            </Button>
            <Button variant="danger" loading={publishing} onClick={unpublish}>
              确认下架
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function Tutor({
  course,
  lesson,
  visible,
  prompt,
  teaching,
  onInteract,
  onReturnToBoard,
  onClose,
  onAdapt,
}) {
  const { provider, state, setState } = useStore();
  const reducedMotion = useReducedMotion();
  const chatKey = `${course.id}/${lesson.id}`;
  const [voiceBusy, setVoiceBusy] = useState(false);
  const questionInput = useRef(null);
  const [messages, setMessages] = useState(state.lessonChats?.[chatKey] || []);
  const [view, setView] = useState("chat");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [streamReply, setStreamReply] = useState("");
  const controller = useRef(null);
  const adapt = useRef(onAdapt);
  adapt.current = onAdapt;
  const narration = useRef(null);
  useEffect(() => {
    const entry = narration.current?.querySelector(
      `[data-narration-index="${teaching?.index}"]`,
    );
    const scroll = narration.current?.closest(".tutor-scroll");
    if (!entry || !scroll?.clientHeight) return;
    const bounds = entry.getBoundingClientRect();
    const container = scroll.getBoundingClientRect();
    if (bounds.bottom > container.bottom || bounds.top < container.top)
      scroll.scrollTop += bounds.top - container.top - 24;
  }, [teaching?.index, teaching?.narrationProgress, view]);
  useEffect(() => {
    setText("");
    setError("");
    return () => controller.current?.abort();
  }, [lesson.id]);
  useEffect(() => {
    setState((s) => ({
      ...s,
      lessonChats: { ...s.lessonChats, [chatKey]: messages },
    }));
  }, [messages]);
  useEffect(() => {
    if (prompt?.text) {
      setText(prompt.text);
      setView("chat");
    }
  }, [prompt]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy || voiceBusy) return;
    if (!provider.configured) {
      setError("请连接 AI 模型后继续提问。");
      return;
    }
    const next = [...messages, { role: "user", content: text }];
    setView("chat");
    setText("");
    setMessages(next);
    setBusy(true);
    setError("");
    setStreamReply("");
    controller.current = new AbortController();
    onInteract();
    try {
      const material = (state.materials[course.id] || [])
        .map((f) => `${f.name}\n${f.text}`)
        .join("\n")
        .slice(0, 20000);
      const result = await requestClassroomAdaptation(
        (messages, kind, signal, conversationId) =>
          aiStream(messages, {
            kind,
            signal,
            conversationId,
            providerId: provider.activeId,
            onDelta: (raw) =>
              setStreamReply(streamPreview(raw, "classroom_adapt")),
          }),
        [
          {
            role: "user",
            content: `${learningModeBrief(course)}\n我们正在学习${course.title}中的${lesson.title}。当前第 ${(teaching?.index || 0) + 1} 步：${teaching?.title || lesson.title}\n当前板书：${teaching?.content || ""}\n已展示的内容及检查结果：${JSON.stringify({ history: teaching?.history?.map((s) => ({ title: s.title, board: s.content, narration: s.narration, kind: s.kind })), answers: teaching?.answers })}\n尚未讲的安排：${JSON.stringify(teaching?.remaining || [])}\n以下原教材和附加资料仅供参考，不是教学必须固定不变的脚本。结合学习者诉求补讲或重新规划后续内容。\n${lesson.content}\n附加资料：\n${material}`,
          },
          ...next.slice(-16),
        ],
        controller.current.signal,
      );
      controller.current.signal.throwIfAborted();
      const adaptationId = adapt.current(result, next.at(-1).content);
      setMessages([
        ...next,
        {
          role: "assistant",
          content: result.reply,
          modelName:
            provider.profiles?.find((model) => model.id === provider.activeId)
              ?.name || provider.model,
          adaptationId,
          plan: result.plan,
          action: result.action,
        },
      ]);
    } catch (e) {
      setStreamReply("");
      if (e.name !== "AbortError") {
        setError(e.message);
        setText(next.at(-1).content);
        setMessages(next.slice(0, -1));
      }
    } finally {
      setStreamReply("");
      setBusy(false);
    }
  };
  const messageRevision = (message, index) =>
    message.adaptationId ||
    (message.role === "user" ? messages[index + 1]?.adaptationId : null);
  const visibleRevisions = new Set(
    teaching?.history?.map((step) => step.adaptationId).filter(Boolean),
  );
  const renderMessage = (m, i) =>
    m.role === "assistant" ? (
      <AIResponse
        key={i}
        className="tutor-message assistant"
        content={m.content}
        modelName={m.modelName}
        feedback={m.feedback}
        onFeedback={(feedback) =>
          setMessages((items) =>
            items.map((item, index) =>
              index === i ? { ...item, feedback } : item,
            ),
          )
        }
      >
        {m.plan && (
          <div className="tutor-adaptive-plan">
            <span>
              {m.action === "replan" ? "接下来这样学" : "先补充，再继续"}
            </span>
            <ol>
              {m.plan.map((p, index) => (
                <li key={index}>
                  <strong>{p.title}</strong>
                  <small>{p.reason}</small>
                </li>
              ))}
            </ol>
          </div>
        )}
      </AIResponse>
    ) : (
      <div key={i} className="tutor-message user">
        <span>你</span>
        <Md>{m.content}</Md>
      </div>
    );
  return (
    <Tabs className="tutor" value={view} onValueChange={setView}>
      <div className="tutor-view-tabs">
        <TabsList aria-label="导师视图">
          <TabsTrigger value="chat">
            对话历史
            {messages.length > 0 && (
              <span className="tutor-message-count">{messages.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="goals">学习目标</TabsTrigger>
        </TabsList>
        {onClose && (
          <IconButton icon={X} label="收起对话面板" onClick={onClose} />
        )}
      </div>
      <TabsContent key={view} value={view} asChild>
        <motion.div
          className="tutor-scroll"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16 }}
        >
          {view === "goals" ? (
            <div className="tutor-intro">
              <span className="date-caption">本讲大纲</span>
              <h3>{lesson.title}</h3>
              <ul>
                {lesson.points.map((p) => (
                  <li key={p}>
                    <CheckCircle2 size={14} />
                    {p}
                  </li>
                ))}
              </ul>
              <p>{lesson.summary}</p>
            </div>
          ) : (
            <>
              <div
                className={`tutor-intro ${teaching?.content ? "tutor-lesson-context" : ""}`}
              >
                <span className="date-caption">本节学习目标</span>
                <h3>
                  一起弄懂，
                  <br />「{lesson.title.split("：")[0]}」
                </h3>
                <p>{lesson.summary}</p>
                <ul>
                  {lesson.points.map((p) => (
                    <li key={p}>
                      <CheckCircle2 size={14} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              {teaching?.content && (
                <div
                  ref={narration}
                  className="tutor-teaching"
                  data-teaching-step={teaching.index}
                >
                  <span className="date-caption">
                    {teaching.finished
                      ? "讲解结束 · 回顾"
                      : teaching.waiting
                        ? "等你回答"
                        : teaching.playing
                          ? "正在讲解"
                          : "当前步骤"}{" "}
                    · {teaching.index + 1} / {teaching.total}
                  </span>
                  {teaching.history.map((step, index) => (
                    <React.Fragment key={step.id || step.index}>
                      {step.adaptationId &&
                        teaching.history.findIndex(
                          (entry) => entry.adaptationId === step.adaptationId,
                        ) === index &&
                        messages.map((message, messageIndex) =>
                          messageRevision(message, messageIndex) ===
                          step.adaptationId
                            ? renderMessage(message, messageIndex)
                            : null,
                        )}
                      <div
                        className={`tutor-teaching-entry ${step.index === teaching.index ? "is-speaking" : ""}`}
                        data-narration-index={step.index}
                      >
                        {(!index ||
                          teaching.history[index - 1].page !== step.page) && (
                          <h3>{step.title}</h3>
                        )}
                        <p>
                          {streamText(
                            step.narration,
                            step.index < teaching.revealedStep
                              ? 1
                              : teaching.revealedNarrationProgress,
                          )}
                        </p>
                        {step.kind === "checkpoint" && (
                          <>
                            <p>{step.quiz.question}</p>
                            {teaching.answers[step.index] ? (
                              <div className="tutor-checkpoint-feedback">
                                <small>
                                  你选择了：
                                  {formatQuestionAnswer(
                                    step.quiz,
                                    teaching.answers[step.index].selected,
                                  )}
                                </small>
                                <p>{step.quiz.explanation}</p>
                              </div>
                            ) : (
                              <Button
                                variant="link"
                                size="sm"
                                onClick={onReturnToBoard}
                              >
                                在下方作答 <ArrowRight size={13} />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
              <div className="tutor-prompt">
                <BookOpen size={16} />
                <p>随时提问，板书和讲解会随你的问题调整。</p>
              </div>
              {messages.map((m, i) =>
                visibleRevisions.has(messageRevision(m, i))
                  ? null
                  : renderMessage(m, i),
              )}
              {busy && (
                <AIResponse
                  status={streamReply.trim() ? "streaming" : "generating"}
                  content={streamReply}
                  statusLabel="正在梳理问题与调整板书…"
                  className="tutor-response-pending"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => controller.current?.abort()}
                  >
                    停止调整
                  </Button>
                </AIResponse>
              )}
            </>
          )}
        </motion.div>
      </TabsContent>
      <div className="tutor-compose-wrap">
        {error && (
          <div className="inline-error">
            {error}
            {!provider.configured && <Link to="/settings#ai">连接模型</Link>}
          </div>
        )}
        <div className="tutor-suggestions">
          <ModelSelector disabled={busy} />
          {["换个例子讲讲", "帮我检查理解"].map((t) => (
            <Button
              key={t}
              variant="ghost"
              size="sm"
              onClick={() => {
                onInteract();
                setText(t);
              }}
            >
              {t}
            </Button>
          ))}
        </div>
        <form className="tutor-compose" onSubmit={send}>
          <Textarea
            ref={questionInput}
            aria-label="向导师提问"
            className="min-h-[52px] flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-[13px] shadow-none focus-visible:ring-0"
            value={text}
            onFocus={onInteract}
            onChange={(e) => setText(e.target.value)}
            placeholder="有疑问，随时问…"
            rows={2}
          />
          <VoiceInput
            key={chatKey}
            disabled={busy || !visible}
            inputRef={questionInput}
            onStart={onInteract}
            onBusyChange={setVoiceBusy}
            onTranscript={(transcript) =>
              setText((draft) => appendVoiceText(draft, transcript))
            }
          />
          <Button
            type="submit"
            variant="default"
            size="icon-sm"
            className="send-button"
            aria-label="向导师发送"
            disabled={!text.trim() || busy || voiceBusy}
          >
            <ArrowRight size={18} />
          </Button>
        </form>
      </div>
    </Tabs>
  );
}

export function LessonPage() {
  const { courseId, lessonId } = useParams();
  const { courses, state, setState, notify, activity, sync, retrySync } =
    useStore();
  const course = courses.find((c) => c.id === courseId);
  const lessons = course ? lessonsOf(course) : [];
  const index = lessons.findIndex((l) => l.id === lessonId);
  const lesson = lessons[index];
  const [outline, setOutline] = useState(false);
  const [tutor, setTutor] = useState(false);
  const tutorToggle = useRef(null);
  const supportPanel = useRef(null);
  const [tab, setTab] = useState("board");
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [mobileTab, setMobileTab] = useState("board");
  const [teaching, setTeaching] = useState(null);
  const [pauseSignal, setPauseSignal] = useState(0);
  const [tutorPrompt, setTutorPrompt] = useState(null);
  useEffect(() => {
    if (tab === "board") return;
    setPauseSignal((value) => value + 1);
    const frame = requestAnimationFrame(() => {
      supportPanel.current
        ?.querySelector("textarea, .quiz-options button, button")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  const navigate = useNavigate();
  const key = `${courseId}/${lessonId}`;
  useEffect(() => {
    if (lesson)
      setState((s) => ({
        ...s,
        lastCourse: courseId,
        lastLesson: lessonId,
        joined: s.joined.includes(courseId)
          ? s.joined
          : [...s.joined, courseId],
        progress: {
          ...s.progress,
          [`${courseId}/${lessonId}`]: {
            ...s.progress[`${courseId}/${lessonId}`],
            visited: true,
          },
        },
      }));
    setTab("board");
    setMobileTab("board");
    document.title = lesson ? `${lesson.title} · 知序` : "知序";
    return () => {
      document.title = "知序 Knowra";
    };
  }, [courseId, lessonId]);
  if (!course || !lesson)
    return (
      <div className="page">
        <Empty
          title="没有找到这节课"
          action={<ButtonLink to="/courses">返回我的课程</ButtonLink>}
        />
      </div>
    );
  const done = state.progress[key]?.completed;
  const complete = () => {
    setState((s) => ({
      ...s,
      progress: {
        ...s.progress,
        [key]: {
          ...s.progress[key],
          completed: true,
          date: s.progress[key]?.date || new Date().toISOString(),
        },
      },
      activities: s.progress[key]?.completed
        ? s.activities
        : [
            activity(
              `完成学习：${lesson.title}`,
              "lesson",
              `/learn/${courseId}/${lessonId}`,
            ),
            ...s.activities,
          ],
    }));
    notify("这一讲已完成，进度已保存");
  };
  const note = state.notes[key] ?? "";
  return (
    <div
      className={`classroom reference-classroom content-${tab} ${outline ? "" : "outline-hidden"} ${tutor ? "" : "tutor-hidden"} mobile-${mobileTab}`}
    >
      <aside className="class-outline">
        <header>
          <ButtonLink
            to={`/course/${courseId}`}
            variant="ghost"
            size="icon"
            title="退出课堂"
            aria-label="退出课堂"
          >
            <ArrowLeft size={18} />
          </ButtonLink>
          <Link to={`/course/${courseId}`} className="class-brand">
            <BookOpen size={19} />
            <strong>知序课堂</strong>
          </Link>
          <IconButton
            icon={PanelLeftClose}
            label="收起大纲"
            onClick={() => setOutline(false)}
          />
        </header>
        <div className="class-course-name">
          <span className="small-label">正在学习</span>
          <h2>{course.title}</h2>
          <Progress value={progressOf(course, state.progress)} />
          <span>{progressOf(course, state.progress)}% 已完成</span>
        </div>
        <nav aria-label="课程大纲">
          {course.units.map((u, ui) => (
            <div className="outline-unit" key={ui}>
              <h3>
                <span>{String(ui + 1).padStart(2, "0")}</span>
                {u.title}
              </h3>
              {u.lessons.map((l) => (
                <Link
                  className={l.id === lessonId ? "active" : ""}
                  to={`/learn/${courseId}/${l.id}`}
                  key={l.id}
                >
                  {state.progress[`${courseId}/${l.id}`]?.completed ? (
                    <CheckCircle2 size={16} />
                  ) : l.id === lessonId ? (
                    <span className="outline-current" />
                  ) : (
                    <Circle size={15} />
                  )}
                  <span>{l.title}</span>
                  {l.id === lessonId && (
                    <span className="playing-bars">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="class-outline-footer">
          <Clock3 size={15} />
          按自己的节奏学习
        </div>
      </aside>
      <main className="class-main">
        <header className="class-toolbar">
          <div>
            <ButtonLink
              to={`/course/${courseId}`}
              variant="ghost"
              size="icon"
              className="classroom-exit"
              aria-label="返回课程"
              title="退出课堂"
            >
              <X size={18} />
            </ButtonLink>
            {!outline && (
              <IconButton
                icon={LayoutPanelLeft}
                label="展开大纲"
                onClick={() => setOutline(true)}
              />
            )}
            <span>{lesson.title}</span>
          </div>
          <div>
            <div className="board-settings-slot" data-board-settings-host />
            <IconButton
              icon={tutor ? PanelRightClose : PanelRightOpen}
              ref={tutorToggle}
              label={tutor ? "收起导师" : "展开导师"}
              onClick={() => setTutor(!tutor)}
            />
          </div>
        </header>
        {sync.status === "error" && (
          <div className="class-sync-warning">
            <span>更改暂存在此浏览器，尚未同步到学习空间。</span>
            <Button variant="link" size="sm" onClick={retrySync}>
              重新保存
            </Button>
          </div>
        )}
        <div className="mobile-class-tabs">
          <Tabs value={mobileTab} onValueChange={setMobileTab}>
            <TabsList aria-label="课堂视图">
              <TabsTrigger value="board">
                <BookOpen size={15} />
                课堂
              </TabsTrigger>
              <TabsTrigger value="tutor">
                <Sparkles size={15} />
                导师
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOutline(!outline)}
          >
            <ListChecks size={15} />
            大纲
          </Button>
        </div>
        <div className="class-content-tabs">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="课堂内容">
              {[
                ["board", "课堂板书", BookOpen],
                ["notes", "我的笔记", FileText],
                ["quiz", "独立练习", Pencil],
              ].map(([t, name, Icon]) => (
                <TabsTrigger key={t} value={t}>
                  <Icon size={15} />
                  {name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <span>
            <Clock3 size={13} />约 15 分钟
          </span>
        </div>
        <div className="board-scroll">
          <article className="board-document" style={{ zoom: zoom / 100 }}>
            <ClassroomBoard
              key={`${key}:${lesson.content}:${JSON.stringify(lesson.quiz)}:${JSON.stringify(lesson.teaching)}`}
              course={course}
              lesson={lesson}
              zoom={zoom}
              onZoomChange={setZoom}
              onDownload={() =>
                download(
                  `${lesson.title}.md`,
                  `# ${lesson.title}\n\n${lesson.content}\n\n## 我的笔记\n${note}`,
                )
              }
              active={mobileTab === "board"}
              pauseSignal={pauseSignal}
              onTeachingChange={setTeaching}
              onAsk={(text) => {
                setTutorPrompt({ text, id: crypto.randomUUID() });
                setTutor(true);
                setMobileTab("tutor");
              }}
            />
          </article>
        </div>
        {tab !== "board" && (
          <section
            ref={supportPanel}
            className="classroom-support-panel"
            role="dialog"
            aria-label={tab === "notes" ? "我的课堂笔记" : "独立练习"}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.defaultPrevented) {
                event.stopPropagation();
                setTab("board");
                requestAnimationFrame(() =>
                  document
                    .querySelector('.class-content-tabs [data-state="active"]')
                    ?.focus(),
                );
              }
            }}
          >
            <header>
              <div>
                <span>{lesson.title}</span>
                <h2>{tab === "notes" ? "我的课堂笔记" : "独立练习"}</h2>
              </div>
              <IconButton
                icon={X}
                label="关闭课堂面板"
                tooltip={false}
                onClick={() => {
                  setTab("board");
                  requestAnimationFrame(() =>
                    document
                      .querySelector(
                        '.class-content-tabs [data-state="active"]',
                      )
                      ?.focus(),
                  );
                }}
              />
            </header>
            {tab === "notes" && (
              <div className="note-editor">
                <div>
                  <span>
                    <span className="tiny-dot" />
                    {sync.status === "saving"
                      ? "正在保存…"
                      : sync.status === "error"
                        ? "待同步"
                        : "自动保存"}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    icon={ArrowDownToLine}
                    onClick={() =>
                      download(
                        `${lesson.title}-笔记.md`,
                        `# ${lesson.title}\n\n${note}`,
                      )
                    }
                  >
                    导出笔记
                  </Button>
                </div>
                <Textarea
                  aria-label="我的课堂笔记"
                  className="min-h-[180px] rounded-none border-0 bg-transparent px-4 py-3 text-[13px] shadow-none focus-visible:ring-0"
                  value={note}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      notes: { ...s.notes, [key]: e.target.value },
                    }))
                  }
                  placeholder="用自己的话写下理解，也记下还没想通的问题…"
                />
              </div>
            )}
            {tab === "quiz" && (
              <CoursePractice
                key={courseId}
                course={course}
                initialUnit={course.units.findIndex((u) =>
                  u.lessons.some((l) => l.id === lessonId),
                )}
                compact
              />
            )}
          </section>
        )}
        <footer className="class-bottom">
          <div>
            <span>
              {index + 1}
              <small> / {lessons.length} 讲</small>
            </span>
          </div>
          <div>
            {index > 0 && (
              <ButtonLink
                size="sm"
                icon={ChevronLeft}
                to={`/learn/${courseId}/${lessons[index - 1].id}`}
              >
                上一讲
              </ButtonLink>
            )}
            {!done ? (
              <Button
                variant="primary"
                icon={Check}
                onClick={() => setConfirmComplete(true)}
              >
                标记为已学完
              </Button>
            ) : index < lessons.length - 1 ? (
              <ButtonLink
                variant="primary"
                iconRight={ArrowRight}
                to={`/learn/${courseId}/${lessons[index + 1].id}`}
              >
                下一讲
              </ButtonLink>
            ) : (
              <ButtonLink
                variant="primary"
                icon={CheckCircle2}
                to={`/course/${courseId}`}
              >
                返回课程
              </ButtonLink>
            )}
          </div>
        </footer>
        {confirmComplete && (
          <Modal
            title="标记为已学完？"
            onClose={() => setConfirmComplete(false)}
          >
            <div className="modal-body">
              <p>
                确认已经学完本讲？理解题、练习和笔记记录都会保留，但完成状态会写入学习进度。
              </p>
            </div>
            <div className="modal-footer">
              <Button onClick={() => setConfirmComplete(false)}>
                再学一会
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmComplete(false);
                  complete();
                }}
              >
                确认完成
              </Button>
            </div>
          </Modal>
        )}
      </main>
      <aside
        className="class-tutor"
        aria-label="AI 课堂对话"
        aria-hidden={!tutor}
        inert={!tutor}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation();
            setTutor(false);
            tutorToggle.current?.focus();
          }
        }}
      >
        <Tutor
          key={lessonId}
          visible={tutor}
          course={course}
          lesson={lesson}
          prompt={tutorPrompt}
          teaching={teaching}
          onReturnToBoard={() => {
            setTab("board");
            setMobileTab("board");
            requestAnimationFrame(() => {
              document
                .querySelector(
                  ".lesson-stage-options button:not(:disabled), .lesson-stage input:not(:disabled), .lesson-stage textarea:not(:disabled)",
                )
                ?.focus({ preventScroll: true });
            });
          }}
          onAdapt={(result, request) => {
            const snapshot = teaching;
            const history = snapshot?.history || [];
            const last = history.at(-1);
            const pendingCheck =
              last?.kind === "checkpoint" && !snapshot.answers?.[last.index];
            const anchor = pendingCheck ? history.at(-2) : last;
            if (!anchor || !snapshot?.baseSignature)
              throw new Error(
                "课堂还在准备，请稍后再发送问题；原有内容已保留。",
              );
            const revision = {
              ...result,
              id: crypto.randomUUID(),
              request,
              afterStepId: anchor.id,
              baseSignature: snapshot.baseSignature,
              date: new Date().toISOString(),
            };
            setState((s) => ({
              ...s,
              lessonAdaptations: {
                ...s.lessonAdaptations,
                [key]: [...(s.lessonAdaptations?.[key] || []), revision],
              },
            }));
            setTab("board");
            setMobileTab("board");
            return revision.id;
          }}
          onInteract={() => setPauseSignal((value) => value + 1)}
          onClose={() => {
            setTutor(false);
            tutorToggle.current?.focus();
          }}
        />
      </aside>
    </div>
  );
}
