import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import { motionTransitions } from "../../lib/motion";

function DisclosurePanel({ children, className, ...props }) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      data-slot="disclosure-content"
      aria-hidden={!present || undefined}
      inert={!present ? true : undefined}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={
        reducedMotion ? { duration: 0 } : motionTransitions.disclosure
      }
      style={{ overflow: "hidden" }}
      {...props}
    >
      <div className={className}>{children}</div>
    </motion.div>
  );
}

function DisclosureContent({ open, ...props }) {
  return (
    <AnimatePresence initial={false}>
      {open && <DisclosurePanel {...props} />}
    </AnimatePresence>
  );
}

export { DisclosureContent };
