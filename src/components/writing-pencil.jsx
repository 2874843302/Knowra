import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Pencil } from "lucide-react";

// Measure the rendered text rather than estimating character widths: Markdown,
// handwritten fonts, code, wrapping and the whiteboard zoom share one endpoint.
export function WritingPencil({ container, content }) {
  const pencil = useRef(null);
  const place = useCallback(() => {
    const root = container.current;
    const indicator = pencil.current;
    if (!root || !indicator) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.textContent.trim() &&
        !node.parentElement.closest(
          ".writing-pencil, .writing-placeholder, svg, [aria-hidden='true']",
        )
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    let tail;
    while (walker.nextNode()) tail = walker.currentNode;
    indicator.style.visibility = "hidden";
    if (!tail) return;
    const end = tail.textContent.trimEnd().length;
    const range = document.createRange();
    range.setStart(tail, Math.max(0, end - 1));
    range.setEnd(tail, end);
    const rect = range.getBoundingClientRect();
    const bounds = root.getBoundingClientRect();
    const clip = tail.parentElement.closest("pre");
    const clipBounds = clip?.getBoundingClientRect();
    if (!rect.height || (clipBounds && rect.right > clipBounds.right)) return;
    const scale = bounds.width / root.offsetWidth || 1;
    indicator.style.left = `${(rect.right - bounds.left) / scale + 2}px`;
    indicator.style.top = `${(rect.bottom - bounds.top) / scale - 4}px`;
    indicator.style.visibility = "visible";
  }, [container]);

  useLayoutEffect(place, [place, content]);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const observer = new ResizeObserver(place);
    observer.observe(root);
    // Capturing scroll also covers horizontally scrolling code blocks.
    root.addEventListener("scroll", place, true);
    document.fonts.addEventListener("loadingdone", place);
    return () => {
      observer.disconnect();
      root.removeEventListener("scroll", place, true);
      document.fonts.removeEventListener("loadingdone", place);
    };
  }, [container, place]);

  return (
    <span ref={pencil} className="writing-pencil" aria-hidden="true">
      <Pencil size={32} strokeWidth={1.6} />
    </span>
  );
}
