import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import { motionTransitions } from "../../lib/motion";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "shrink-0 outline-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-out focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        surface: "",
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/25",
        outline:
          "border border-border bg-card text-foreground shadow-xs hover:border-[var(--border-strong)] hover:bg-muted",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground shadow-xs hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        surface: "",
        default: "h-9 gap-2 rounded-md px-4 py-2 text-[13px] has-[>svg]:px-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-10 gap-2 rounded-md px-6 text-sm",
        icon: "size-9 rounded-md",
        "icon-sm": "size-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
    compoundVariants: [
      {
        variant: [
          "default",
          "destructive",
          "outline",
          "secondary",
          "ghost",
          "link",
        ],
        className:
          "inline-flex items-center justify-center whitespace-nowrap font-medium [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      },
    ],
  },
);

// EasyUI button spring feedback, with the existing Slot API retained.
function Button({
  className,
  variant,
  size,
  asChild = false,
  disabled,
  type = "button",
  ...props
}) {
  const reducedMotion = useReducedMotion();
  const Comp = asChild ? Slot : motion.button;
  const feedback = asChild
    ? {}
    : {
        whileHover:
          disabled || reducedMotion || props.role === "radio"
            ? undefined
            : { scale: 1.02 },
        whileTap:
          disabled || reducedMotion || props.role === "radio"
            ? undefined
            : { scale: 0.98 },
        transition: motionTransitions.springSnappy,
      };
  return (
    <Comp
      data-slot="button"
      data-ui="shadcn"
      data-variant={variant || "default"}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled}
      {...feedback}
      {...props}
    />
  );
}

export { Button, buttonVariants };
