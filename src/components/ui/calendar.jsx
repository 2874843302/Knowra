// Adapted from EasyUI Calendar (MIT), Copyright (c) 2026 Suraj Maurya.
// Source and license: THIRD_PARTY_NOTICES.md.
import * as React from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

const spring = { type: "spring", stiffness: 460, damping: 38, mass: 0.7 };
const slide = {
  enter: (direction) => ({ x: direction * 24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({ x: direction * -24, opacity: 0 }),
};
export const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const sameMonth = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const addDays = (date, count) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12);
const addMonths = (date, count) => {
  const first = new Date(date.getFullYear(), date.getMonth() + count, 1, 12);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(
    first.getFullYear(),
    first.getMonth(),
    Math.min(date.getDate(), last),
    12,
  );
};

function MonthGrid({ children, direction, reducedMotion, monthKey }) {
  const present = useIsPresent();
  return (
    <motion.div
      data-calendar-month={monthKey}
      aria-hidden={!present || undefined}
      inert={!present}
      custom={direction}
      variants={slide}
      initial={reducedMotion ? false : "enter"}
      animate="center"
      exit={reducedMotion ? undefined : "exit"}
      transition={reducedMotion ? { duration: 0 } : spring}
      className="absolute inset-0"
    >
      {children}
    </motion.div>
  );
}

export function Calendar({
  value,
  onChange,
  className,
  locale = "zh-CN",
  today = new Date(),
}) {
  const reducedMotion = useReducedMotion();
  const uid = React.useId();
  const [view, setView] = React.useState(() => value ?? today);
  const [focus, setFocus] = React.useState(() => value ?? today);
  const [direction, setDirection] = React.useState(1);
  const focusRequested = React.useRef(false);
  const grid = React.useRef(null);
  const monthKey = `${view.getFullYear()}-${view.getMonth()}`;
  const monthFormat = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }),
    [locale],
  );
  const dayFormat = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
    [locale],
  );
  const focusedDay = sameMonth(focus, view)
    ? focus
    : new Date(view.getFullYear(), view.getMonth(), 1, 12);
  const first = new Date(view.getFullYear(), view.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(
    view.getFullYear(),
    view.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = i - offset + 1;
    return day < 1 || day > daysInMonth
      ? null
      : new Date(view.getFullYear(), view.getMonth(), day, 12);
  });
  const go = (next) => {
    setDirection(next > view ? 1 : -1);
    setView(next);
  };
  React.useLayoutEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    grid.current
      ?.querySelector(
        `[data-calendar-month="${monthKey}"] [data-date="${dateKey(focus)}"]`,
      )
      ?.focus();
  }, [focus, monthKey]);

  const onKeyDown = (event) => {
    const target = event.target.closest("[data-date]");
    if (!target) return;
    const current = new Date(`${target.dataset.date}T12:00:00`);
    const column = (current.getDay() + 6) % 7;
    const next = {
      ArrowLeft: () => addDays(current, -1),
      ArrowRight: () => addDays(current, 1),
      ArrowUp: () => addDays(current, -7),
      ArrowDown: () => addDays(current, 7),
      Home: () => addDays(current, -column),
      End: () => addDays(current, 6 - column),
      PageUp: () => addMonths(current, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(current, event.shiftKey ? 12 : 1),
    }[event.key]?.();
    if (!next) return;
    event.preventDefault();
    focusRequested.current = true;
    setFocus(next);
    if (!sameMonth(next, view)) go(next);
  };

  return (
    <div
      className={cn("w-fit select-none p-3", className)}
      data-slot="calendar"
    >
      <div className="mb-2 flex h-8 items-center gap-1">
        <NavButton label="上个月" onClick={() => go(addMonths(first, -1))}>
          <ChevronLeft size={16} />
        </NavButton>
        <div
          className="relative h-6 flex-1 overflow-hidden text-center text-sm font-semibold text-foreground"
          aria-live="polite"
          aria-atomic="true"
        >
          <AnimatePresence initial={false} custom={direction}>
            <motion.span
              key={monthKey}
              custom={direction}
              variants={slide}
              initial={reducedMotion ? false : "enter"}
              animate="center"
              exit={reducedMotion ? undefined : "exit"}
              transition={reducedMotion ? { duration: 0 } : spring}
              className="absolute inset-0"
            >
              {monthFormat.format(view)}
            </motion.span>
          </AnimatePresence>
        </div>
        <NavButton label="下个月" onClick={() => go(addMonths(first, 1))}>
          <ChevronRight size={16} />
        </NavButton>
      </div>
      <div className="flex" aria-hidden="true">
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
          <span
            key={day}
            className="grid h-7 w-9 place-items-center text-xs text-muted-foreground"
          >
            {day}
          </span>
        ))}
      </div>
      <div className="-m-1 overflow-hidden p-1">
        <div
          ref={grid}
          role="grid"
          aria-label={monthFormat.format(view)}
          onKeyDown={onKeyDown}
          className="relative h-[216px]"
        >
          <AnimatePresence initial={false} custom={direction}>
            <MonthGrid
              key={monthKey}
              monthKey={monthKey}
              direction={direction}
              reducedMotion={reducedMotion}
            >
              {Array.from({ length: 6 }, (_, row) => (
                <div role="row" key={row} className="flex">
                  {cells.slice(row * 7, row * 7 + 7).map((day, column) => {
                    if (!day)
                      return (
                        <div role="gridcell" key={column} className="h-9 w-9" />
                      );
                    const selected = value && dateKey(day) === dateKey(value);
                    const isToday = dateKey(day) === dateKey(today);
                    return (
                      <div
                        role="gridcell"
                        aria-selected={!!selected}
                        key={column}
                        className="relative h-9 w-9"
                      >
                        <button
                          type="button"
                          data-date={dateKey(day)}
                          tabIndex={
                            dateKey(day) === dateKey(focusedDay) ? 0 : -1
                          }
                          aria-label={dayFormat.format(day)}
                          aria-current={isToday ? "date" : undefined}
                          onFocus={() => setFocus(day)}
                          onClick={() => onChange(day)}
                          className={cn(
                            "group relative grid size-9 place-items-center rounded-lg text-[13px] tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            selected
                              ? "text-primary-foreground"
                              : "text-foreground hover:bg-accent",
                          )}
                        >
                          {selected && (
                            <motion.span
                              layoutId={`${uid}-selection`}
                              transition={
                                reducedMotion ? { duration: 0 } : spring
                              }
                              className="absolute inset-1 rounded-lg bg-primary shadow-xs"
                            />
                          )}
                          <span className="relative font-medium transition-transform duration-150 group-active:scale-90">
                            {day.getDate()}
                          </span>
                          {isToday && !selected && (
                            <span className="absolute bottom-1 size-1 rounded-full bg-primary" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </MonthGrid>
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border px-1 pt-2">
        <span className="text-[11px] text-muted-foreground">
          周一开始 · 按方向键选择
        </span>
        <button
          type="button"
          onClick={() => {
            go(today);
            setFocus(today);
            onChange(today);
          }}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-primary outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          今天
        </button>
      </div>
    </div>
  );
}

function NavButton({ label, children, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
    >
      {children}
    </button>
  );
}
