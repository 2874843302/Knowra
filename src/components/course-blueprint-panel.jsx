import React, {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Focus,
  GitBranch,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { Button, ButtonLink, IconButton } from "../design/primitives";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const smallScreen = () => window.matchMedia("(max-width: 1439px)").matches;
const watchScreen = (notify) => {
  const query = window.matchMedia("(max-width: 1439px)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

// Geometry follows the confirmed plan. Knowledge nodes are actual model points,
// and completion follows validated unit responses, never a simulated timer.
function layoutPlan(plan, completedUnits, partialUnit) {
  const nodes = [],
    edges = [];
  let cursor = 32;
  const connect = (from, to) => edges.push({ from, to });
  plan.units.forEach((unit, i) => {
    const unitPosition = nodes.length;
    const start = cursor,
      lessonNodes = [];
    unit.lessons.forEach((lesson, j) => {
      const points = lesson.points || [];
      const height = Math.max(104, points.length * 88 - 12);
      const node = {
        id: `lesson-${i}-${j}`,
        type: "lesson",
        label: `讲次 ${String(j + 1).padStart(2, "0")}`,
        title: lesson.title,
        summary: lesson.summary,
        points,
        x: 290,
        y: cursor + (height - 104) / 2,
        width: 220,
        height: 104,
        done: !!(
          completedUnits[i]?.lessons[j] ||
          (partialUnit?.index === i && partialUnit.unit.lessons[j])
        ),
      };
      nodes.push(node);
      lessonNodes.push(node);
      points.forEach((point, k) => {
        const child = {
          id: `point-${i}-${j}-${k}`,
          type: "point",
          label: "知识点",
          title: point,
          summary: lesson.summary,
          x: 570,
          y: cursor + k * 88,
          width: 252,
          height: 76,
          done: node.done,
        };
        nodes.push(child);
        connect(node, child);
      });
      cursor += height + 40;
    });
    const node = {
      id: `unit-${i}`,
      type: "unit",
      label: `单元 ${String(i + 1).padStart(2, "0")}`,
      title: unit.title,
      summary: unit.summary || "",
      x: 24,
      y: (start + cursor - 40) / 2 - 52,
      width: 206,
      height: 104,
      done: !!completedUnits[i],
    };
    nodes.splice(unitPosition, 0, node);
    lessonNodes.forEach((lesson) => connect(node, lesson));
    cursor += 40;
  });
  return { nodes, edges, width: 850, height: cursor };
}

function BlueprintMap({ plan, completedUnits, partialUnit }) {
  const graph = useMemo(
    () => layoutPlan(plan, completedUnits, partialUnit),
    [plan, completedUnits, partialUnit],
  );
  const viewport = useRef(null),
    drag = useRef(null),
    anchor = useRef(null);
  const [zoom, setZoom] = useState(0.8),
    [selected, setSelected] = useState(null);
  const reduced = useReducedMotion();
  const changeZoom = (value, reset = false) => {
    const el = viewport.current;
    anchor.current = reset
      ? { reset: true }
      : {
          x: (el.scrollLeft + el.clientWidth / 2) / zoom,
          y: (el.scrollTop + el.clientHeight / 2) / zoom,
        };
    setZoom(Math.max(0.35, Math.min(1.5, value)));
    if (reset) el.scrollTo({ left: 0, top: 0 });
  };
  useLayoutEffect(() => {
    const el = viewport.current;
    setZoom(Math.max(0.55, Math.min(1, (el.clientWidth - 48) / graph.width)));
  }, [graph.width]);
  useLayoutEffect(() => {
    const point = anchor.current,
      el = viewport.current;
    if (point && !point.reset)
      el.scrollTo({
        left: point.x * zoom - el.clientWidth / 2,
        top: point.y * zoom - el.clientHeight / 2,
      });
    anchor.current = null;
  }, [zoom]);
  return (
    <div className="blueprint-map">
      <div
        className="blueprint-map-viewport"
        ref={viewport}
        role="region"
        aria-label="可缩放的课程结构图"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (["+", "="].includes(event.key)) {
            event.preventDefault();
            changeZoom(zoom + 0.1);
          }
          if (event.key === "-") {
            event.preventDefault();
            changeZoom(zoom - 0.1);
          }
        }}
        onPointerDown={(event) => {
          if (
            event.pointerType !== "mouse" ||
            event.button !== 0 ||
            event.target.closest("button")
          )
            return;
          const el = event.currentTarget;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: el.scrollLeft,
            top: el.scrollTop,
          };
          el.setPointerCapture(event.pointerId);
          el.dataset.dragging = "true";
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          event.currentTarget.scrollLeft =
            drag.current.left - (event.clientX - drag.current.x);
          event.currentTarget.scrollTop =
            drag.current.top - (event.clientY - drag.current.y);
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.dataset.dragging = "false";
        }}
        onPointerCancel={(event) => {
          drag.current = null;
          event.currentTarget.dataset.dragging = "false";
        }}
      >
        <div
          className="blueprint-map-space"
          style={{ width: graph.width * zoom, height: graph.height * zoom }}
        >
          <div
            className="blueprint-map-scene"
            style={{
              width: graph.width,
              height: graph.height,
              transform: `scale(${zoom})`,
            }}
          >
            <svg
              className="blueprint-connections"
              width={graph.width}
              height={graph.height}
              aria-hidden="true"
            >
              {graph.edges.map(({ from, to }) => {
                const x = from.x + from.width,
                  y = from.y + from.height / 2,
                  endY = to.y + to.height / 2,
                  mid = (x + to.x) / 2;
                return (
                  <path
                    key={`${from.id}-${to.id}`}
                    data-complete={to.done}
                    d={`M${x} ${y} C${mid} ${y},${mid} ${endY},${to.x} ${endY}`}
                  />
                );
              })}
            </svg>
            {graph.nodes.map((node, i) => (
              <motion.div
                key={node.id}
                className="blueprint-node-position"
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                }}
                initial={reduced ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay: reduced ? 0 : Math.min(i, 8) * 0.025,
                }}
              >
                <Button
                  variant="surface"
                  size="surface"
                  className={`blueprint-node blueprint-node-${node.type}`}
                  data-complete={node.done}
                  aria-pressed={selected?.id === node.id}
                  onClick={() =>
                    setSelected(selected?.id === node.id ? null : node)
                  }
                >
                  <span>
                    {node.label}
                    {node.done && <Check size={13} aria-label="已生成" />}
                  </span>
                  <strong>{node.title}</strong>
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <div className="blueprint-map-help">拖动画布 · 点击节点查看详情</div>
      <div className="blueprint-map-tools" aria-label="蓝图缩放工具">
        <IconButton
          icon={Minus}
          label="缩小蓝图"
          disabled={zoom <= 0.35}
          onClick={() => changeZoom(zoom - 0.1)}
        />
        <output aria-label="蓝图缩放比例">{Math.round(zoom * 100)}%</output>
        <IconButton
          icon={Plus}
          label="放大蓝图"
          disabled={zoom >= 1.5}
          onClick={() => changeZoom(zoom + 0.1)}
        />
        <IconButton
          icon={Focus}
          label="适应蓝图宽度"
          onClick={() =>
            changeZoom((viewport.current.clientWidth - 48) / graph.width, true)
          }
        />
      </div>
      {selected && (
        <aside className="blueprint-node-detail" aria-label="蓝图节点详情">
          <div>
            <small>{selected.label}</small>
            <IconButton
              icon={X}
              label="关闭节点详情"
              onClick={() => setSelected(null)}
            />
          </div>
          <h3>{selected.title}</h3>
          {selected.summary && <p>{selected.summary}</p>}
          {!!selected.points?.length && (
            <ul>
              {selected.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  );
}

function CoursePreview({ draft }) {
  const { plan, completedUnits, partialUnit, courseId, phase } = draft;
  return (
    <div className="blueprint-course-preview">
      <div className="blueprint-course-intro">
        <span className="blueprint-course-symbol">
          <BookOpen size={30} />
        </span>
        <div>
          <small>{courseId ? "课程已就绪" : "课程预览"}</small>
          <h2>{plan.title}</h2>
          <p>{plan.description}</p>
          <span>
            {courseId
              ? "课程已保存，可在「我的课程」继续学习。"
              : `已生成 ${completedUnits.length} / ${plan.units.length} 个单元，课程内容会在这里逐步补齐。`}
          </span>
        </div>
        {courseId && (
          <ButtonLink variant="primary" to={`/course/${courseId}`}>
            前往课程 <ChevronRight size={15} />
          </ButtonLink>
        )}
      </div>
      {plan.units.map((unit, i) => {
        const generated =
            completedUnits[i] ||
            (partialUnit?.index === i ? partialUnit.unit : null),
          writing =
            phase === "generating" &&
            !draft.interrupted &&
            !draft.error &&
            !draft.preferencesChanged &&
            i === completedUnits.length;
        return (
          <section className="blueprint-preview-unit" key={i}>
            <div className="blueprint-unit-number">
              <small>单元</small>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="blueprint-preview-unit-body">
              <h3>{unit.title}</h3>
              <p>{unit.summary}</p>
              {unit.lessons.map((planned, j) => {
                const lesson = generated?.lessons[j] || planned;
                const lessonDone = !!generated?.lessons[j];
                const lessonWriting =
                  writing && j === (generated?.lessons.length || 0);
                const lessonPaused =
                  phase === "generating" &&
                  draft.interrupted &&
                  i === completedUnits.length &&
                  j === (generated?.lessons.length || 0);
                return (
                  <article className="blueprint-preview-lesson" key={j}>
                    <header>
                      <BookOpen size={16} />
                      <span>讲次 {j + 1}</span>
                      <strong>{lesson.title}</strong>
                      <small data-complete={lessonDone}>
                        {lessonDone ? (
                          <Check size={12} />
                        ) : lessonWriting ? (
                          <LoaderCircle
                            size={12}
                            className="creation-spinner"
                          />
                        ) : null}
                        {lessonDone
                          ? "已生成"
                          : lessonWriting
                            ? "编写中"
                            : lessonPaused
                              ? "已暂停"
                              : "待生成"}
                      </small>
                    </header>
                    <p>{lesson.summary}</p>
                    <footer>
                      <span>白板讲解</span>
                      <span>
                        {lessonDone
                          ? `${lesson.teaching?.steps?.length || 0} 个讲解片段`
                          : "确认蓝图后展开"}
                      </span>
                      {courseId && lessonDone && (
                        <ButtonLink
                          variant="link"
                          size="sm"
                          to={`/learn/${courseId}/${lesson.id}`}
                        >
                          开始学习 <ChevronRight size={12} />
                        </ButtonLink>
                      )}
                    </footer>
                    {generated?.lessons[j]?.quiz && (
                      <div className="blueprint-preview-quiz">
                        <span>随堂练习</span>
                        {lesson.quiz.question}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CourseBlueprintPanel({
  draft,
  open,
  onOpenChange,
  busy,
  onConfirm,
  onRevise,
}) {
  const modal = useSyncExternalStore(watchScreen, smallScreen);
  const reduced = useReducedMotion();
  const [tab, setTab] = useState("map"),
    [fullscreen, setFullscreen] = useState(false);
  const count = draft.plan.units.reduce(
    (n, unit) => n + unit.lessons.length,
    0,
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
      <SheetContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          event.target
            .querySelector('[role="tab"][data-state="active"]')
            ?.focus({ preventScroll: true });
        }}
        onInteractOutside={(event) => {
          if (!modal) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document
            .querySelector(".generation-blueprint-toggle")
            ?.focus({ preventScroll: true });
        }}
      >
        <motion.aside
          className={`blueprint-panel ${fullscreen ? "is-fullscreen" : ""}`}
          initial={reduced ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: reduced ? 0 : 0.28,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <SheetTitle className="sr-only">课程蓝图与课程预览</SheetTitle>
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="blueprint-panel-tabs"
          >
            <header className="blueprint-panel-header">
              <TabsList aria-label="蓝图面板视图">
                <TabsTrigger value="map">课程蓝图</TabsTrigger>
                <TabsTrigger value="course">课程</TabsTrigger>
              </TabsList>
              <div>
                <IconButton
                  icon={fullscreen ? Minimize2 : Maximize2}
                  label={fullscreen ? "退出蓝图全屏" : "展开蓝图全屏"}
                  onClick={() => setFullscreen(!fullscreen)}
                />
                <IconButton
                  icon={X}
                  label="关闭课程蓝图"
                  onClick={() => onOpenChange(false)}
                />
              </div>
            </header>
            <div className="blueprint-panel-context" hidden={tab !== "map"}>
              <div>
                <small>课程讲解结构</small>
                <span>{count} 个讲次</span>
              </div>
              <h2>{draft.plan.title}</h2>
              <p>{draft.plan.description}</p>
              <div className="blueprint-legend">
                <span>单元</span>
                <span>讲次</span>
                <span>知识点</span>
                <small>
                  {draft.completedUnits.length} / {draft.plan.units.length}{" "}
                  单元已生成
                </small>
              </div>
            </div>
            <TabsContent
              value="map"
              forceMount
              className="blueprint-panel-map-tab"
            >
              <BlueprintMap
                plan={draft.plan}
                completedUnits={draft.completedUnits}
                partialUnit={draft.partialUnit}
              />
            </TabsContent>
            <TabsContent
              value="course"
              forceMount
              className="blueprint-panel-course-tab"
            >
              <CoursePreview draft={draft} />
            </TabsContent>
            <footer className="blueprint-panel-footer">
              <span>
                {draft.confirmed ? (
                  <Check size={15} />
                ) : (
                  <GitBranch size={15} />
                )}
                {draft.courseId
                  ? "课程已按这份蓝图生成完成。"
                  : draft.preferencesChanged
                    ? "需求已调整，更新蓝图并确认后再继续生成。"
                    : draft.interrupted
                      ? "生成已暂停，已完成的讲次会保留。"
                      : draft.confirmed
                        ? `蓝图已确认 · 已完成 ${draft.completedUnits.length} / ${draft.plan.units.length} 个单元`
                        : "先确认学习路径，再展开每一讲。"}
              </span>
              {!draft.confirmed && (
                <div>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      onOpenChange(false);
                      setTimeout(onRevise, 200);
                    }}
                  >
                    调整方向
                  </Button>
                  <Button variant="primary" disabled={busy} onClick={onConfirm}>
                    确认并生成课程
                  </Button>
                </div>
              )}
            </footer>
          </Tabs>
        </motion.aside>
      </SheetContent>
    </Sheet>
  );
}
