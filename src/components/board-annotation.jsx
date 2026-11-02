import React, { useEffect, useRef } from "react";
import { annotate } from "rough-notation";

// Each annotation owns its SVG inside an isolated anchor. React owns the text;
// Rough Notation owns the decoration and removes it on replay/unmount.
export function BoardAnnotation({ kind = "circle", children, className = "" }) {
  const target = useRef(null);
  const anchor = useRef(null);
  const Tag = kind === "box" ? "span" : "mark";
  const keepTogether =
    kind !== "box" && React.Children.toArray(children).join("").length <= 12;
  useEffect(() => {
    const element = target.current;
    const container = anchor.current;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const styles = getComputedStyle(container);
    const drawing = annotate(element, {
      type: kind,
      color: styles
        .getPropertyValue(
          kind === "highlight" ? "--board-highlight" : "--board-annotation",
        )
        .trim(),
      strokeWidth: kind === "box" ? 1 : 1.5,
      padding: kind === "circle" ? [3, 5] : kind === "box" ? 0 : 1,
      multiline: kind !== "box",
      iterations: kind === "highlight" ? 1 : 2,
      animate: !media.matches,
      animationDuration: kind === "highlight" ? 420 : 650,
    });
    container.querySelector("svg")?.setAttribute("aria-hidden", "true");
    let cancelled = false;
    let ready = false;
    let frame;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (ready && !cancelled && container.getClientRects().length) {
          // The classroom zoom control uses CSS zoom. Rough Notation measures
          // viewport pixels; map SVG units to those pixels to avoid scaling twice.
          const svg = container.querySelector("svg");
          const bounds = svg.getBoundingClientRect();
          svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
          drawing.show();
        }
      });
    };
    // Wait for Chinese font metrics before measuring strokes. Subsequent font
    // subsets, line wrapping, sidebar changes and browser zoom redraw silently.
    document.fonts.ready.then(() => {
      ready = true;
      if (!cancelled) refresh();
    });
    const observer = new ResizeObserver(refresh);
    observer.observe(
      container.closest(".teaching-writing, .teaching-visual") || container,
    );
    document.fonts.addEventListener("loadingdone", refresh);
    const motionChanged = () => {
      drawing.animate = !media.matches;
      refresh();
    };
    media.addEventListener("change", motionChanged);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", refresh);
      media.removeEventListener("change", motionChanged);
      drawing.remove();
    };
  }, [kind]);
  return (
    <span
      ref={anchor}
      className={`board-annotation-anchor annotation-${kind} ${keepTogether ? "annotation-phrase" : ""}`}
    >
      <Tag ref={target} className={className} data-annotation={kind}>
        {children}
      </Tag>
    </span>
  );
}
