import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "../../design/primitives";
import { cn } from "../../lib/utils";

// Adapted from EasyUI MorphingButton (MIT), composed with our shared button.
export function MorphingAction({
  status = "idle",
  idleText,
  loadingText,
  successText = "已完成",
  errorText = "重试",
  idleIcon: IdleIcon = ArrowRight,
  disabled,
  className,
  ...props
}) {
  const reduced = useReducedMotion();
  const labels = {
    idle: idleText,
    loading: loadingText,
    success: successText,
    error: errorText,
  };
  const Icon =
    status === "loading"
      ? LoaderCircle
      : status === "success"
        ? Check
        : status === "error"
          ? CircleAlert
          : IdleIcon;
  return (
    <Button
      variant="primary"
      disabled={disabled || status === "loading" || status === "success"}
      aria-label={status === "success" ? successText : idleText}
      aria-busy={status === "loading" || undefined}
      data-status={status}
      className={cn("morphing-action", className)}
      {...props}
    >
      <span className="morphing-action-stack" aria-hidden="true">
        {Object.entries(labels).map(([key, label]) => (
          <span key={key} className="morphing-action-reserve">
            <span className="morphing-action-icon" />
            {label}
          </span>
        ))}
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            className="morphing-action-label"
            key={status}
            initial={reduced ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -5 }}
            transition={{
              duration: reduced ? 0 : 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <Icon
              size={16}
              className={status === "loading" ? "creation-spinner" : ""}
            />
            {labels[status]}
          </motion.span>
        </AnimatePresence>
      </span>
    </Button>
  );
}
