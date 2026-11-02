import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion, useReducedMotion } from "motion/react";
import { motionTransitions } from "../../lib/motion";

import { cn } from "../../lib/utils";

const TabsMotion = React.createContext(null);

function Tabs({ className, value, defaultValue, onValueChange, ...props }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const id = React.useId();
  const selected = value === undefined ? internalValue : value;
  return (
    <TabsMotion.Provider value={{ selected, id }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn("flex flex-col gap-2", className)}
        value={selected}
        onValueChange={(next) => {
          setInternalValue(next);
          onValueChange?.(next);
        }}
        {...props}
      />
    </TabsMotion.Provider>
  );
}

function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

// EasyUI's shared layout indicator, composed with Radix roving keyboard focus.
function TabsTrigger({ className, value, children, ...props }) {
  const context = React.useContext(TabsMotion);
  const reducedMotion = useReducedMotion();
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-ui="shadcn"
      value={value}
      className={cn(
        "relative isolate inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {context?.selected === value && (
        <motion.span
          aria-hidden="true"
          className="tab-indicator"
          layoutId={`tab-${context.id}`}
          transition={
            reducedMotion ? { duration: 0 } : motionTransitions.indicator
          }
        />
      )}
      <span className="tab-label">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
