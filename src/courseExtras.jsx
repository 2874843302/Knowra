import { isObjectiveQuestion } from "./lib/questions";
import { coursePractices, practiceComplete } from "./lib/course-practice";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Flag,
  ListChecks,
  Pencil,
  Plus,
  Target,
  Trophy,
} from "lucide-react";
import { useStore, dateLabel } from "./store";
import { lessonsOf, progressOf } from "./data";
import {
  Badge,
  Button,
  ButtonLink,
  Field,
  Input,
  Modal,
  Progress,
  Textarea,
} from "./ui";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Checkbox } from "./components/ui/checkbox";
import {
  mastery,
  masteryLevels,
  masteryDescriptions,
  countLessonMastery,
} from "./lib/lesson-mastery";
export { mastery, masteryLevels } from "./lib/lesson-mastery";

export function LearningPath({
  course,
  unit,
  onProject,
  onExam,
  filter = "all",
  onFilterChange,
  children,
}) {
  const { state } = useStore();
  const counts = countLessonMastery(unit.lessons, state.progress, course.id);
  const projectIndex = course.units.indexOf(unit);
  const projectDone =
    state.projects?.[`${course.id}/${projectIndex}`]?.submitted;
  const questions = unit.lessons.filter((lesson) => lesson.quiz);
  const assessed = questions.filter((lesson) => {
    const progress = state.progress[`${course.id}/${lesson.id}`];
    return typeof progress?.quizCorrect === "boolean" || progress?.quizReviewed;
  }).length;
  return (
    <div className="learning-path-wrap">
      <div
        className="mastery-legend"
        role="group"
        aria-label="按掌握程度筛选小节"
      >
        <Button
          variant="surface"
          size="surface"
          aria-pressed={filter === "all"}
          onClick={() => onFilterChange?.("all")}
        >
          全部 <b>{unit.lessons.length}</b>
        </Button>
        {masteryLevels.map(([key, label]) => (
          <Button
            variant="surface"
            size="surface"
            key={key}
            aria-pressed={filter === key}
            title={masteryDescriptions[key]}
            onClick={() => onFilterChange?.(filter === key ? "all" : key)}
          >
            <i className={`mastery-dot ${key}`}>
              {key === "mastered" && <Check size={12} />}
            </i>
            {label} <b>{counts[key]}</b>
          </Button>
        ))}
      </div>
      <div className="mastery-overview">
        <span>
          {filter === "all"
            ? "测验记录自动更新，也可以在小节中自评。"
            : masteryDescriptions[filter]}
        </span>
        <div>
          <Button variant="surface" size="surface" onClick={onProject}>
            <Flag size={12} />
            项目 · {projectDone ? "已提交" : "待完成"}
          </Button>
          <Button variant="surface" size="surface" onClick={onExam}>
            <ListChecks size={12} />
            测验 · {assessed}/{questions.length}
          </Button>
        </div>
      </div>
      <div className="learning-path-row">
        <div className="learning-path" aria-label="单元学习路径">
          {unit.lessons.map((lesson, index) => (
            <Link
              key={lesson.id}
              to={`/learn/${course.id}/${lesson.id}`}
              title={lesson.title}
              aria-label={`学习${lesson.title}`}
              className={mastery(state.progress[`${course.id}/${lesson.id}`])}
            >
              <span>
                {state.progress[`${course.id}/${lesson.id}`]?.completed ? (
                  <Check size={17} />
                ) : (
                  index + 1
                )}
              </span>
              <small>{lesson.title.split("：")[0]}</small>
            </Link>
          ))}
          <Button
            variant="surface"
            size="surface"
            onClick={onProject}
            title="打开单元项目"
            aria-label="打开单元项目"
          >
            <span>
              <Flag size={18} />
            </span>
            <small>阶段项目</small>
          </Button>
          <Button
            variant="surface"
            size="surface"
            onClick={onExam}
            title="开始单元测验"
            aria-label="开始单元测验"
          >
            <span>
              <ListChecks size={18} />
            </span>
            <small>单元测验</small>
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CourseDashboard({ course, onUnits, onPractice }) {
  const { state } = useStore();
  const lessons = lessonsOf(course);
  const completed = lessons.filter(
    (l) => state.progress[`${course.id}/${l.id}`]?.completed,
  ).length;
  const practices = coursePractices(course, state);
  const practiced = practices.filter((p) =>
    practiceComplete(state.practiceAttempts?.[`${course.id}/${p.id}`]),
  ).length;
  const current =
    lessons.find((l) => !state.progress[`${course.id}/${l.id}`]?.completed) ||
    lessons[0];
  const activity = state.activities
    .filter((a) => a.url?.includes(`/${course.id}`))
    .slice(0, 4);
  return (
    <section className="course-dashboard">
      <div className="course-metrics">
        {[
          [
            BookOpen,
            "课程进度",
            `${completed} / ${lessons.length}`,
            "讲已完成",
          ],
          [
            Target,
            "独立练习",
            `${practiced} / ${practices.length}`,
            "项练习已完成",
          ],
          [
            Pencil,
            "学习笔记",
            Object.keys(state.notes).filter(
              (k) => k.startsWith(`${course.id}/`) && state.notes[k].trim(),
            ).length,
            "篇课堂记录",
          ],
          [
            Flag,
            "阶段项目",
            Object.entries(state.projects || {}).filter(
              ([k, v]) => k.startsWith(`${course.id}/`) && v.submitted,
            ).length,
            "份项目已提交",
          ],
        ].map(([Icon, label, value, unit]) => (
          <div key={label}>
            <span>
              <Icon size={17} />
              {label}
            </span>
            <strong>
              {value}
              <small>{unit}</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <div>
          <div className="dashboard-section-title">
            <h2>你的学习路线</h2>
            <Button
              variant="link"
              size="sm"
              iconRight={ArrowRight}
              onClick={() => onUnits(0)}
            >
              查看全部
            </Button>
          </div>
          <div className="unit-roadmap">
            {course.units.map((unit, i) => {
              const done = unit.lessons.filter(
                (l) => state.progress[`${course.id}/${l.id}`]?.completed,
              ).length;
              return (
                <Button
                  variant="surface"
                  size="surface"
                  key={i}
                  onClick={() => onUnits(i)}
                >
                  <span className={done === unit.lessons.length ? "done" : ""}>
                    {done === unit.lessons.length ? (
                      <Check size={18} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <div>
                    <small>第 {i + 1} 单元</small>
                    <h3>{unit.title}</h3>
                    <p>
                      {unit.lessons
                        .map((l) => l.title.split("：")[0])
                        .join(" · ")}
                    </p>
                    <Progress value={(done / unit.lessons.length) * 100} />
                  </div>
                  <small>
                    {done}/{unit.lessons.length}
                    <ArrowRight size={16} />
                  </small>
                </Button>
              );
            })}
          </div>
          <div className="dashboard-section-title">
            <h2>学习目标</h2>
          </div>
          <div className="course-goals">
            {course.units
              .flatMap((u) => u.lessons.flatMap((l) => l.points))
              .slice(0, 6)
              .map((p) => (
                <p key={p}>
                  <CheckCircle2 size={16} />
                  {p}
                </p>
              ))}
          </div>
        </div>
        <aside className="dashboard-side">
          <div className="dashboard-section-title">
            <h2>接下来学习</h2>
            <BookOpen size={17} />
          </div>
          <div className="next-lesson-block">
            <span className="small-label">
              第 {lessons.indexOf(current) + 1} 讲
            </span>
            <h3>{current.title}</h3>
            <p>{current.summary}</p>
            <ButtonLink
              variant="primary"
              iconRight={ArrowRight}
              to={`/learn/${course.id}/${current.id}`}
            >
              进入课堂
            </ButtonLink>
          </div>
          <div className="dashboard-section-title">
            <h2>最近学习记录</h2>
          </div>
          {activity.length ? (
            <div className="course-activity">
              {activity.map((a) => (
                <Link key={a.id} to={a.url}>
                  <i />
                  <div>
                    <strong>{a.title}</strong>
                    <small>{dateLabel(a.date)}</small>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted-line">开始第一讲，记录就会出现在这里。</p>
          )}
          {(practiced < practices.length || !practices.length) && (
            <Button
              variant="link"
              size="sm"
              icon={ListChecks}
              iconRight={ArrowRight}
              onClick={onPractice}
            >
              去巩固知识
            </Button>
          )}
        </aside>
      </div>
    </section>
  );
}

export function ProjectDialog({ course, index, onClose }) {
  const { state, setState, notify } = useStore();
  const unit = course.units[index];
  const key = `${course.id}/${index}`;
  const saved = state.projects?.[key] || {};
  const [text, setText] = useState(saved.text || "");
  const [checks, setChecks] = useState(saved.checks || []);
  const criteria = unit.lessons.flatMap((l) => l.points.slice(0, 1));
  const update = (submitted) => {
    setState((s) => ({
      ...s,
      projects: {
        ...s.projects,
        [key]: { text, checks, submitted, date: new Date().toISOString() },
      },
    }));
    notify(submitted ? "项目已提交，反思记录已保存" : "项目草稿已保存");
    onClose();
  };
  return (
    <Modal title={`阶段项目 · ${unit.title}`} wide onClose={onClose}>
      <div className="modal-body project-editor">
        <Badge color="green">
          <Flag size={12} />第 {index + 1} 单元
        </Badge>
        <h3>用自己的例子，讲清这个单元</h3>
        <p>选一个真实问题，写下你的分析、具体例子和验证过程。</p>
        <div className="project-rubric">
          {criteria.map((p, i) => (
            <label key={p}>
              <Checkbox
                checked={checks.includes(i)}
                onCheckedChange={() =>
                  setChecks((c) =>
                    c.includes(i) ? c.filter((v) => v !== i) : [...c, i],
                  )
                }
              />
              <span>我能解释：{p}</span>
            </label>
          ))}
        </div>
        <Field label="项目记录" htmlFor="project-record">
          <Textarea
            id="project-record"
            aria-label="阶段项目记录"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="问题与背景 / 我的思路 / 一个具体例子 / 验证与反思"
            rows={8}
          />
        </Field>
        <small>自评记录，不计入自动评分。</small>
      </div>
      <div className="modal-footer">
        <Button onClick={() => update(false)}>保存草稿</Button>
        <Button
          variant="primary"
          icon={Check}
          disabled={!text.trim() || checks.length < criteria.length}
          onClick={() => update(true)}
        >
          提交项目
        </Button>
      </div>
    </Modal>
  );
}

export function AssessmentDialog({ course, unit, QuizView, onClose }) {
  const { state, setState } = useStore();
  const questions = (unit ? unit.lessons : lessonsOf(course)).filter(
    (l) => l.quiz,
  );
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [finished, setFinished] = useState(false);
  if (!questions.length)
    return (
      <Modal title="单元测验" onClose={onClose}>
        <div className="modal-body">这个单元还没有测验题。</div>
      </Modal>
    );
  const lesson = questions[index];
  return (
    <Modal
      title={unit ? `单元测验 · ${unit.title}` : "课程综合测验"}
      wide
      onClose={onClose}
    >
      <div className="modal-body assessment-body">
        {finished ? (
          <div className="assessment-result">
            <Trophy size={36} />
            <h2>
              {Object.values(answers).filter(Boolean).length} /{" "}
              {questions.filter((q) => isObjectiveQuestion(q.quiz)).length}
            </h2>
            <p>
              道客观题回答正确
              {Object.values(answers).some((a) => a === null)
                ? ` · ${Object.values(answers).filter((a) => a === null).length} 道简答已复盘`
                : ""}
            </p>
            <div>
              {questions.map((l, i) => (
                <p key={l.id}>
                  {answers[i] ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Circle size={16} />
                  )}
                  <span>{l.title}</span>
                  <Badge color={answers[i] ? "green" : ""}>
                    {answers[i] === null
                      ? "已对照参考"
                      : answers[i]
                        ? "已掌握"
                        : "待巩固"}
                  </Badge>
                </p>
              ))}
            </div>
            <Button
              onClick={() => {
                setIndex(0);
                setAnswers({});
                setFinished(false);
              }}
            >
              重新测验
            </Button>
          </div>
        ) : (
          <>
            <div className="assessment-progress">
              <span>
                第 {index + 1} 题 / 共 {questions.length} 题
              </span>
              <Progress value={(index / questions.length) * 100} />
            </div>
            <QuizView
              key={lesson.id}
              lesson={lesson}
              onResult={(correct) => {
                setAnswers((s) => ({ ...s, [index]: correct }));
                setState((s) => ({
                  ...s,
                  progress: {
                    ...s.progress,
                    [`${course.id}/${lesson.id}`]: {
                      ...s.progress[`${course.id}/${lesson.id}`],
                      ...(correct === null
                        ? { quizReviewed: true }
                        : { quizCorrect: correct }),
                    },
                  },
                }));
              }}
            />
          </>
        )}
      </div>
      {!finished && (
        <div className="modal-footer">
          <Button
            variant="primary"
            iconRight={ArrowRight}
            disabled={answers[index] === undefined}
            onClick={() =>
              index < questions.length - 1
                ? setIndex(index + 1)
                : setFinished(true)
            }
          >
            {index < questions.length - 1 ? "下一题" : "查看结果"}
          </Button>
        </div>
      )}
    </Modal>
  );
}

export function CourseEditor({ course, onClose }) {
  const { setState, notify } = useStore();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [units, setUnits] = useState(structuredClone(course.units));
  const [tab, setTab] = useState("info");
  const updateLesson = (ui, li, change) =>
    setUnits((items) =>
      items.map((unit, i) =>
        i === ui
          ? {
              ...unit,
              lessons: unit.lessons.map((lesson, j) =>
                j === li ? { ...lesson, ...change } : lesson,
              ),
            }
          : unit,
      ),
    );
  return (
    <Modal title="编辑课程" wide onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setState((s) => ({
            ...s,
            courseEdits: {
              ...s.courseEdits,
              [course.id]: {
                ...s.courseEdits?.[course.id],
                title: title.trim(),
                description,
                units: units.map((u) => ({
                  ...u,
                  title: u.title.trim(),
                })),
              },
            },
          }));
          notify("课程信息已保存");
          onClose();
        }}
      >
        <div className="modal-body">
          <div className="course-editor-tabs">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList aria-label="课程编辑">
                <TabsTrigger type="button" value="info">
                  课程信息
                </TabsTrigger>
                <TabsTrigger type="button" value="outline">
                  单元与讲义
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {tab === "info" ? (
            <>
              <Field label="课程名称" htmlFor="course-name" required>
                <Input
                  id="course-name"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="课程简介" htmlFor="course-description">
                <Textarea
                  id="course-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </Field>
            </>
          ) : (
            <>
              {units.map((u, i) => (
                <section className="course-outline-editor" key={i}>
                  <Field label={`单元 ${i + 1}`} key={i} required>
                    <Input
                      required
                      value={u.title}
                      aria-label={`单元 ${i + 1} 名称`}
                      onChange={(e) =>
                        setUnits((a) =>
                          a.map((v, k) =>
                            k === i ? { ...v, title: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </Field>
                  {u.lessons.map((lesson, li) => (
                    <details className="lesson-edit" key={lesson.id}>
                      <summary>
                        <BookOpen size={15} />
                        <span>{lesson.title}</span>
                        <Pencil size={13} />
                      </summary>
                      <Field
                        label="讲次名称"
                        htmlFor={`lesson-title-${i}-${li}`}
                        required
                      >
                        <Input
                          id={`lesson-title-${i}-${li}`}
                          required
                          value={lesson.title}
                          onChange={(e) =>
                            updateLesson(i, li, { title: e.target.value })
                          }
                        />
                      </Field>
                      <Field
                        label="学习目标"
                        htmlFor={`lesson-summary-${i}-${li}`}
                      >
                        <Input
                          id={`lesson-summary-${i}-${li}`}
                          value={lesson.summary}
                          onChange={(e) =>
                            updateLesson(i, li, { summary: e.target.value })
                          }
                        />
                      </Field>
                      <Field
                        label="关键点"
                        htmlFor={`lesson-points-${i}-${li}`}
                        hint="每行一个关键点"
                      >
                        <Textarea
                          id={`lesson-points-${i}-${li}`}
                          rows={3}
                          value={lesson.points.join("\n")}
                          onChange={(e) =>
                            updateLesson(i, li, {
                              points: e.target.value.split("\n"),
                            })
                          }
                        />
                      </Field>
                      <Field
                        label="Markdown 讲义"
                        htmlFor={`lesson-content-${i}-${li}`}
                      >
                        <Textarea
                          id={`lesson-content-${i}-${li}`}
                          className="lesson-content-editor min-h-[260px] font-mono text-xs leading-relaxed"
                          rows={12}
                          value={lesson.content}
                          onChange={(e) =>
                            updateLesson(i, li, { content: e.target.value })
                          }
                        />
                      </Field>
                    </details>
                  ))}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    icon={Plus}
                    onClick={() =>
                      setUnits((items) =>
                        items.map((unit, ui) =>
                          ui === i
                            ? {
                                ...unit,
                                lessons: [
                                  ...unit.lessons,
                                  {
                                    id: crypto.randomUUID(),
                                    title: "新讲次",
                                    summary: "",
                                    points: [],
                                    content: "",
                                    quiz: null,
                                  },
                                ],
                              }
                            : unit,
                        ),
                      )
                    }
                  >
                    添加讲次
                  </Button>
                </section>
              ))}
              <Button
                type="button"
                icon={Plus}
                onClick={() =>
                  setUnits((items) => [
                    ...items,
                    {
                      title: `单元 ${items.length + 1}`,
                      lessons: [
                        {
                          id: crypto.randomUUID(),
                          title: "新讲次",
                          summary: "",
                          points: [],
                          content: "",
                          quiz: null,
                        },
                      ],
                    },
                  ])
                }
              >
                添加单元
              </Button>
            </>
          )}
        </div>
        <div className="modal-footer">
          <Button
            type="submit"
            variant="primary"
            icon={Check}
            disabled={
              !title.trim() ||
              units.some(
                (u) =>
                  !u.title.trim() || u.lessons.some((l) => !l.title.trim()),
              )
            }
          >
            保存修改
          </Button>
        </div>
      </form>
    </Modal>
  );
}
