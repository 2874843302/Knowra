// Adapted from EasyUI Date Picker (MIT), Copyright (c) 2026 Suraj Maurya.
// Uses Radix positioning/focus management for use inside dialogs.
// Source and license: THIRD_PARTY_NOTICES.md.
import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Calendar, dateKey } from "./calendar";
import { cn } from "../../lib/utils";

export function DatePicker({
  id,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  className,
}) {
  const [open, setOpen] = React.useState(false);
  const reducedMotion = useReducedMotion();
  const valueId = React.useId();
  const trigger = React.useRef(null);
  const content = React.useRef(null);
  const timer = React.useRef(null);
  const selected = value ? new Date(`${value}T12:00:00`) : null;
  const valid = selected && Number.isFinite(selected.getTime());
  const today = new Date(
    `${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })}T12:00:00`,
  );
  const changeOpen = (next) => {
    window.clearTimeout(timer.current);
    setOpen(next);
  };
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const select = (date) => {
    onChange(dateKey(date));
    // Let EasyUI's selection pill land before returning focus to the field.
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setOpen(false),
      reducedMotion ? 0 : 160,
    );
  };

  return (
    <div className={cn("relative w-full", className)}>
      <input
        name={name}
        value={valid ? value : ""}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onInvalid={(event) => {
          event.preventDefault();
          trigger.current?.focus();
          changeOpen(true);
        }}
      />
      <Popover.Root open={open} onOpenChange={changeOpen}>
        <Popover.Trigger asChild>
          <button
            ref={trigger}
            id={id}
            aria-describedby={valueId}
            type="button"
            disabled={disabled}
            className="date-picker-trigger flex h-11 w-full items-center gap-2.5 rounded-lg border border-input bg-card px-3.5 text-left text-[13px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-150 hover:border-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/10 disabled:pointer-events-none disabled:opacity-50"
          >
            <CalendarDays
              size={16}
              className="shrink-0 text-primary"
              aria-hidden="true"
            />
            <span
              id={valueId}
              className={cn(
                "flex-1 tabular-nums",
                !valid && "text-muted-foreground",
              )}
            >
              {valid
                ? selected.toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "选择学习日期"}
            </span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="shrink-0 text-muted-foreground transition-transform duration-200"
              style={{ transform: open ? "rotate(180deg)" : undefined }}
            />
          </button>
        </Popover.Trigger>
        <Popover.Portal forceMount>
          <AnimatePresence>
            {open && (
              <Popover.Content
                forceMount
                asChild
                align="start"
                sideOffset={8}
                collisionPadding={12}
                aria-label="选择学习日期"
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  content.current
                    ?.querySelector('[data-date][tabindex="0"]')
                    ?.focus();
                }}
              >
                <motion.div
                  ref={content}
                  data-slot="date-picker-content"
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.97,
                    transition: { duration: reducedMotion ? 0 : 0.1 },
                  }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 520,
                          damping: 38,
                          mass: 0.7,
                        }
                  }
                  style={{
                    transformOrigin:
                      "var(--radix-popover-content-transform-origin)",
                  }}
                  className="z-[110] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-xl outline-none"
                >
                  <Calendar
                    value={valid ? selected : null}
                    onChange={select}
                    today={today}
                  />
                </motion.div>
              </Popover.Content>
            )}
          </AnimatePresence>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
