import React, { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Pause,
} from "lucide-react";
import { Button } from "../../design/primitives";
import { DisclosureContent } from "./disclosure";
import { cn } from "../../lib/utils";

// Adapted from EasyUI AIAgentActivity (MIT). Details expose actual course output.
export function AgentActivityItem({ status, title, children, className }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const id = useId();
  const Icon = {
    success: Check,
    running: LoaderCircle,
    error: CircleAlert,
    paused: Pause,
  }[status];
  return (
    <motion.div
      className={cn("agent-activity-item", className)}
      data-status={status}
      initial={reduced ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.25 }}
    >
      <span className="agent-activity-node" aria-hidden="true">
        {Icon ? (
          <Icon
            size={13}
            className={status === "running" ? "creation-spinner" : ""}
          />
        ) : (
          <i />
        )}
      </span>
      <div className="agent-activity-body">
        <Button
          variant="surface"
          size="surface"
          className="agent-activity-trigger"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{title}</span>
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            <ChevronDown size={14} />
          </motion.span>
        </Button>
        <DisclosureContent open={open} id={id}>
          <div className="agent-activity-details">{children}</div>
        </DisclosureContent>
      </div>
    </motion.div>
  );
}
