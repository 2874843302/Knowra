import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { motion, useReducedMotion } from "motion/react";
import { motionTransitions } from "../../lib/motion";

import { cn } from "../../lib/utils";

function Progress({ className, value, ...props }) {
  const reducedMotion = useReducedMotion();
  const percentage = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={percentage}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator asChild>
        <motion.span
          data-slot="progress-indicator"
          className="block h-full w-full rounded-full bg-primary"
          initial={false}
          animate={{ x: `${percentage - 100}%` }}
          transition={
            reducedMotion ? { duration: 0 } : motionTransitions.springGentle
          }
        />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
