import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CircleAlert, CircleDot, LoaderCircle } from "lucide-react";
import { motionTransitions } from "../../lib/motion";

function InlineStatus({ children, tone = "neutral" }) {
  const reducedMotion = useReducedMotion();
  const Icon =
    tone === "busy"
      ? LoaderCircle
      : tone === "error"
        ? CircleAlert
        : tone === "success"
          ? Check
          : CircleDot;
  return (
    <div
      className="inline-status"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <AnimatePresence initial={false} mode="wait">
        {children && (
          <motion.span
            key={`${tone}-${children}`}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={
              reducedMotion ? { duration: 0 } : motionTransitions.content
            }
          >
            <Icon
              size={14}
              className={tone === "busy" ? "animate-spin" : undefined}
              aria-hidden="true"
            />
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export { InlineStatus };
