import React, { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { cn } from "../../lib/utils";

// Adapted from EasyUI SpotlightCard (MIT). Keep the host's layout and semantics.
export function SpotlightSurface({
  as: Component = "div",
  children,
  className,
  onPointerMove,
  onPointerLeave,
  ...props
}) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(-1000),
    y = useMotionValue(-1000);
  const ambient = useMotionTemplate`radial-gradient(300px circle at ${x}px ${y}px, var(--spotlight-ambient), transparent 75%)`;
  const border = useMotionTemplate`radial-gradient(220px circle at ${x}px ${y}px, var(--spotlight-border), transparent 80%)`;
  const leave = () => {
    x.set(-1000);
    y.set(-1000);
  };
  return (
    <Component
      ref={ref}
      className={cn("spotlight-surface", className)}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (
          reduced ||
          event.pointerType !== "mouse" ||
          !matchMedia("(hover: hover) and (pointer: fine)").matches
        )
          return;
        const rect = ref.current.getBoundingClientRect();
        x.set(event.clientX - rect.left);
        y.set(event.clientY - rect.top);
      }}
      onPointerLeave={(event) => {
        leave();
        onPointerLeave?.(event);
      }}
      {...props}
    >
      <motion.div
        aria-hidden="true"
        data-slot="spotlight-glow"
        style={{ background: ambient }}
      />
      <motion.div
        aria-hidden="true"
        data-slot="spotlight-border"
        style={{ background: border }}
      />
      {children}
    </Component>
  );
}
