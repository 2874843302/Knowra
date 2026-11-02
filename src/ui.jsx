import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { motionTransitions } from "./lib/motion";
import CreateCourse from "./courseCreation";
import { newCourseDraft } from "./lib/course-generation";
import { CourseBookmarkButton } from "./components/course-bookmark-button";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  ExternalLink,
  GraduationCap,
  History,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useStore, dateLabel, localDate } from "./store";
import { lessonsOf, progressOf } from "./data";
import { parseMaterial } from "./serverMaterials";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Textarea,
} from "./design/primitives";
import { Badge as UiBadge } from "./components/ui/badge";
import { Progress as UiProgress } from "./components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Toaster } from "./components/ui/sonner";
import { Sheet, SheetContent, SheetTitle } from "./components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "./components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

export { Button, IconButton } from "./design/primitives";
export {
  ButtonLink,
  Callout,
  DataTable,
  EmptyState,
  Field,
  Input,
  Kpi,
  PageHeader,
  Skeleton,
  Status,
  Textarea,
  Toolbar,
} from "./design/primitives";
export const Empty = ({ icon: Icon = BookOpen, title, children, action }) => (
  <EmptyState
    icon={Icon}
    title={title}
    description={children}
    action={action}
  />
);
export const Progress = ({ value }) => (
  <UiProgress
    className="progress"
    value={value}
    aria-label={`完成 ${value}%`}
  />
);
const badgeTone = {
  green: "success",
  blue: "info",
  warning: "warning",
  danger: "destructive",
};
export const Badge = ({ children, color = "" }) => (
  <UiBadge
    variant={badgeTone[color] || "secondary"}
    className={`badge ${color}`}
  >
    {children}
  </UiBadge>
);
export const Cover = ({ course, className = "", showMark = true }) => (
  <div
    className={`course-cover ${className}`}
    style={{ backgroundColor: course.color }}
  >
    <img
      src={courseImage(course)}
      alt={course.subtitle || course.title}
      loading="lazy"
    />
    <span className="cover-category">{course.category}</span>
    {showMark && (
      <span className="cover-mark">
        <BookOpen size={15} />
      </span>
    )}
  </div>
);

export const courseImage = (course) => {
  const artwork = {
    "linear-algebra": "math",
    "how-ai-works": "ai",
    python: "python",
    cognitive: "cognitive",
    "ai-practice": "machine-learning",
    "study-science": "cognitive",
  }[course.id];
  return artwork
    ? `/reference/${artwork}.png`
    : `/images/${course.cover || "library"}.jpg`;
};

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
  onCloseAutoFocus,
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        aria-describedby={undefined}
        className={`modal gap-0 p-0 ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} ${className}`}
      >
        <DialogHeader className="modal-header sticky top-0 z-10 flex-row items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <IconButton icon={X} label="关闭" tooltip={false} onClick={onClose} />
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const navItems = [
  ["/", Home, "首页", "home"],
  ["/courses", GraduationCap, "我的课程", "courses"],
  ["/favorites", Bookmark, "我的收藏"],
  ["/feed", CalendarDays, "学习动态", "feed"],
  ["/history", History, "历史记录", "history"],
  ["/marketplace", Compass, "课程集市", "market"],
];
export function Shell({ children }) {
  const reducedMotion = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 1050px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1050px)");
    const update = () => {
      setCompact(query.matches);
      setMobileOpen(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const {
    state,
    courses,
    setState,
    setCreate,
    setSearchOpen,
    storageError,
    sync,
    retrySync,
  } = useStore();
  const sidebarCollapsed = !!state.appearance?.sidebarCollapsed;
  const setSidebarCollapsed = (collapsed) => {
    setState((s) => ({
      ...s,
      appearance: { ...s.appearance, sidebarCollapsed: collapsed },
    }));
    requestAnimationFrame(() =>
      document
        .querySelector(
          collapsed ? ".desktop-menu" : '.sidebar [aria-label="收起侧栏"]',
        )
        ?.focus({ preventScroll: true }),
    );
  };
  const location = useLocation();
  useLayoutEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const current = courses.find((c) => c.id === state.lastCourse) || courses[0];
  const lesson =
    lessonsOf(current).find((l) => l.id === state.lastLesson) ||
    lessonsOf(current)[0];
  const navigation = (
    <aside
      id="workspace-navigation"
      className={`sidebar ${mobileOpen ? "open" : ""}`}
      inert={!compact && sidebarCollapsed ? true : undefined}
      aria-hidden={!compact && sidebarCollapsed ? true : undefined}
    >
      {compact && <SheetTitle className="sr-only">学习导航</SheetTitle>}
      {compact && (
        <IconButton
          icon={X}
          label="关闭导航"
          tooltip={false}
          size="sm"
          className="absolute top-3 right-3"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="sidebar-brand-row">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <BookOpen size={23} strokeWidth={1.7} />
          </span>
          <strong>
            Knowra<span>知序</span>
          </strong>
        </Link>
        {!compact && (
          <IconButton
            icon={PanelLeftClose}
            label="收起侧栏"
            size="sm"
            aria-expanded="true"
            aria-controls="workspace-navigation"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}
      </div>
      <nav aria-label="主导航">
        {navItems.map(([url, Icon, name, asset]) => (
          <NavLink key={url} to={url} end={url === "/"}>
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    className="nav-active-surface"
                    layoutId="sidebar-active"
                    aria-hidden="true"
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : motionTransitions.indicator
                    }
                  />
                )}
                {asset ? (
                  <img
                    className="navigation-icon"
                    src={`/reference/${asset}.svg`}
                    alt=""
                  />
                ) : (
                  <Icon
                    className="navigation-icon"
                    size={20}
                    strokeWidth={1.7}
                  />
                )}
                <span>{name}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <Link className="sidebar-more" to="/settings">
        <MoreHorizontal size={18} />
        更多选项
      </Link>
      <div className="sidebar-label">
        <span>继续学习</span>
        <IconButton
          icon={Plus}
          label="创建课程"
          onClick={() => setCreate({})}
        />
      </div>
      {state.joined.includes(current.id) && (
        <Link
          className="sidebar-continue"
          to={`/learn/${current.id}/${lesson.id}`}
        >
          <span>
            <strong>
              <em>讲座</em>
              {lesson.title}
            </strong>
            <small>{current.title}</small>
          </span>
          <ChevronRight size={14} />
        </Link>
      )}
      <div className="sidebar-recent">
        <div className="sidebar-label">近期活动</div>
        {state.activities.slice(0, 3).map((item) => (
          <Link key={item.id} to={item.url}>
            {item.title}
          </Link>
        ))}
        {!state.activities.length && <span>还没有学习记录</span>}
      </div>
      <div className="sidebar-bottom">
        <NavLink to="/settings" className="settings-link">
          <Settings size={18} />
          <span>设置与偏好</span>
        </NavLink>
        <div className="workspace-dot">
          <i />
          {sync.status === "saving"
            ? "正在保存…"
            : sync.status === "error"
              ? "保存待重试"
              : "学习空间已保存"}
          <span>v2.0</span>
        </div>
      </div>
    </aside>
  );
  return (
    <div
      className="app-shell"
      data-sidebar-collapsed={!compact && sidebarCollapsed}
      style={{
        "--app-sidebar-width": !compact && sidebarCollapsed ? "0px" : undefined,
      }}
    >
      {compact ? (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.querySelector(".mobile-menu")?.focus();
            }}
          >
            {navigation}
          </SheetContent>
        </Sheet>
      ) : (
        navigation
      )}
      <div className="main-shell">
        {!reducedMotion && (
          <motion.div
            key={`route-progress-${location.pathname}`}
            className="navigation-progress"
            aria-hidden="true"
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: [0, 0.8, 1], opacity: [1, 1, 0] }}
            transition={{ duration: 0.32, times: [0, 0.7, 1], ease: "easeOut" }}
          />
        )}
        <Header
          compact={compact}
          expanded={compact ? mobileOpen : !sidebarCollapsed}
          onMenu={() =>
            compact ? setMobileOpen(!mobileOpen) : setSidebarCollapsed(false)
          }
        />
        {sync.status === "error" && (
          <div className="storage-error">
            {sync.error}。更改暂存在此浏览器。
            <Button variant="link" size="sm" onClick={retrySync}>
              重新保存
            </Button>
          </div>
        )}
        {storageError && (
          <div className="storage-error">
            存储空间不足，最近的更改暂未保存。请导出笔记并删除不需要的资料。
          </div>
        )}
        <motion.div
          key={location.pathname}
          className="page-transition"
          data-navigation={location.pathname}
          initial={reducedMotion ? false : { opacity: 0.55 }}
          animate={{ opacity: 1 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { ...motionTransitions.content, duration: 0.24 }
          }
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

export function Header({ onMenu, expanded, compact }) {
  const { state, provider, setSearchOpen } = useStore();
  const [notifications, setNotifications] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    setNotifications(false);
  }, [pathname]);
  return (
    <header className="app-header">
      <div className="breadcrumb">
        {(compact || !expanded) && (
          <IconButton
            icon={compact ? Menu : PanelLeftOpen}
            label={compact ? "展开导航" : "展开侧栏"}
            className={compact ? "mobile-menu" : "desktop-menu"}
            aria-expanded={expanded}
            aria-controls="workspace-navigation"
            onClick={onMenu}
          />
        )}
      </div>
      <div className="header-actions">
        <span
          className={`model-status ${provider.configured ? "connected" : ""}`}
        >
          <i />
          {provider.configured ? "AI 已连接" : "本地模式"}
        </span>
        <IconButton
          icon={Search}
          label="搜索"
          onClick={() => setSearchOpen(true)}
        />
        <DropdownMenu open={notifications} onOpenChange={setNotifications}>
          <DropdownMenuTrigger asChild>
            <IconButton icon={Bell} label="学习通知" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-72 max-w-[calc(100vw-2rem)]"
          >
            <DropdownMenuLabel>学习通知</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {state.activities.length ? (
              state.activities.slice(0, 4).map((a) => (
                <DropdownMenuItem key={a.id} asChild>
                  <Link to={a.url} className="items-start">
                    <Check size={15} />
                    <span className="min-w-0 whitespace-normal">
                      {a.title}
                      <small className="block text-xs text-muted-foreground">
                        {dateLabel(a.date)}
                      </small>
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))
            ) : (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                暂时没有新通知
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Link className="avatar" to="/settings" title={state.name}>
          <img src="/reference/avatar.svg" alt={state.name} />
        </Link>
      </div>
    </header>
  );
}

export function CourseCard({ course }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.article
      className="course-card"
      whileHover={reducedMotion ? undefined : { y: -4 }}
      whileTap={reducedMotion ? undefined : { scale: 0.995, y: -1 }}
      transition={motionTransitions.springGentle}
    >
      <Link to={`/course/${course.id}`} className="cover-link">
        <Cover course={course} />
      </Link>
      <div className="course-card-body">
        <div className="course-byline">
          <span>
            <GraduationCap size={15} />
            {course.source}
          </span>
          <CourseBookmarkButton course={course} />
        </div>
        <Link to={`/course/${course.id}`}>
          <h3>{course.title}</h3>
        </Link>
        <p>{course.description}</p>
        <div className="course-card-meta">
          <Badge>{course.level}</Badge>
          <span>
            <BookOpen size={13} />
            {lessonsOf(course).length} 讲
          </span>
          <span>
            <Clock3 size={13} />
            {course.minutes} 分钟
          </span>
        </div>
        <div className="course-card-stub">
          <span className="course-card-category">{course.category}</span>
          <Link
            to={`/course/${course.id}`}
            className="card-arrow"
            title="查看课程"
            aria-label={`查看${course.title}`}
          >
            <span>查看课程</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

export function GlobalOverlays() {
  const {
    create,
    setCreate,
    setState,
    searchOpen,
    setSearchOpen,
    courses,
    state,
  } = useStore();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const launched = useRef(null);
  useEffect(() => {
    if (!create || create.method || launched.current === create) return;
    launched.current = create;
    const draft = newCourseDraft(create);
    setState((s) => ({
      ...s,
      courseDrafts: { ...s.courseDrafts, [draft.id]: draft },
      activities: [
        {
          id: crypto.randomUUID(),
          title: `课程对话：${draft.topic || "新的学习计划"}`,
          type: "course",
          url: `/create/${draft.id}`,
          date: draft.date,
        },
        ...s.activities,
      ],
    }));
    setCreate(null);
    navigate(`/create/${draft.id}`);
  }, [create, navigate, setCreate, setState]);
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <>
      <Toaster
        richColors
        closeButton
        offset={24}
        mobileOffset={{ top: 16, right: 16, bottom: 80, left: 16 }}
      />
      {create?.method && (
        <CreateCourse initial={create} onClose={() => setCreate(null)} />
      )}
      {searchOpen && (
        <Modal
          title="搜索学习内容"
          onClose={() => {
            setSearchOpen(false);
            setSearch("");
          }}
        >
          <div className="modal-body">
            <div className="search-field">
              <Search size={18} />
              <Input
                autoFocus
                className="h-auto flex-1 border-0 bg-transparent px-0 py-0 text-[13px] shadow-none focus-visible:ring-0"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索课程、章节或主题"
              />
            </div>
            <div className="search-results">
              {courses
                .filter((c) =>
                  `${c.title} ${c.category} ${lessonsOf(c)
                    .map((l) => l.title)
                    .join(" ")}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((c) => (
                  <Button
                    variant="surface"
                    size="surface"
                    key={c.id}
                    onClick={() => {
                      setSearchOpen(false);
                      setSearch("");
                      navigate(`/course/${c.id}`);
                    }}
                  >
                    <BookOpen size={19} />
                    <span>
                      <strong>{c.title}</strong>
                      <small>
                        {c.category} · {lessonsOf(c).length} 讲
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </Button>
                ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function UploadButton({
  onFiles,
  children,
  className = "",
  variant = "outline",
  size = "default",
  disabled = false,
  onBusyChange,
  label = "上传学习资料",
}) {
  const { notify } = useStore();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        disabled={disabled || busy}
        accept=".pdf,.pptx,.docx,.txt,.md,.csv"
        hidden
        onChange={async (e) => {
          setBusy(true);
          onBusyChange?.(true);
          const parsed = [];
          for (const file of [...e.target.files].slice(0, 5)) {
            try {
              parsed.push(await parseMaterial(file));
            } catch (error) {
              notify(`${file.name}：${error.message}`);
            }
          }
          if (parsed.length) onFiles(parsed);
          e.target.value = "";
          setBusy(false);
          onBusyChange?.(false);
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        title={label}
        aria-label={label}
        className={className}
        onClick={() => input.current.click()}
        disabled={disabled || busy}
      >
        {children || <Plus size={18} />}
      </Button>
    </>
  );
}
