import { useLayoutEffect, useRef } from "react";

// Allocate lanes from the space already used, never from the height of the
// block currently being written. Completing a stroke must not move its origin.
export function useBoardLayout(board, active, layoutKey) {
  const arrange = useRef(null);
  useLayoutEffect(() => {
    const surface = board.current;
    if (!active || !surface) return;
    let frame;
    let disposed = false;
    const set = (element, property, value) => {
      if (element.style[property] !== value) element.style[property] = value;
    };
    const layout = () => {
      const gap = 48;
      const document = surface.closest(".board-document");
      const padding = getComputedStyle(document);
      // CSS zoom changes the article's layout width. Lanes belong to the
      // canvas, so zooming must scale them rather than rewrap old writing.
      const available =
        surface.closest(".board-scroll").clientWidth -
        Number.parseFloat(padding.paddingLeft) -
        Number.parseFloat(padding.paddingRight);
      const count = Math.max(1, Math.floor((available + gap) / (440 + gap)));
      const width = Math.min(640, (available - (count - 1) * gap) / count);
      const limit = Number.parseFloat(getComputedStyle(surface).height);
      let lane = 0;
      let top = 0;
      let previous;
      const items = surface.querySelectorAll(
        ":scope > .board-frame > h2, :scope > .board-frame > .teaching-block",
      );
      for (const item of items) {
        const heading = item.tagName === "H2";
        if (heading && previous) top += 24;
        // Leave enough space for a heading and the first lines together.
        // Oversized blocks finish in their original lane; only the next block
        // starts another lane, even when completion toggles data attributes.
        if (previous?.tagName !== "H2" && top > limit - (heading ? 160 : 100)) {
          lane++;
          top = 0;
        }
        set(item, "width", `${width}px`);
        set(item, "left", `${lane * (width + gap)}px`);
        set(item, "top", `${top}px`);
        const style = getComputedStyle(item);
        top +=
          item.offsetHeight +
          Number.parseFloat(style.marginTop || 0) +
          Number.parseFloat(style.marginBottom || 0);
        previous = item;
      }
    };
    const schedule = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    const resize = new ResizeObserver(schedule);
    const observed = new Set([surface]);
    resize.observe(surface);
    const observe = () => {
      for (const item of observed) {
        if (item !== surface && !surface.contains(item)) {
          resize.unobserve(item);
          observed.delete(item);
        }
      }
      surface.querySelectorAll("h2, .teaching-block").forEach((item) => {
        if (!observed.has(item)) {
          observed.add(item);
          resize.observe(item);
        }
      });
      // Synchronous placement keeps a newly mounted block from flashing at 0,0.
      layout();
    };
    arrange.current = observe;
    const mutation = new MutationObserver(observe);
    mutation.observe(surface, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    observe();
    document.fonts.ready.then(schedule);
    window.addEventListener("resize", schedule);
    return () => {
      disposed = true;
      arrange.current = null;
      cancelAnimationFrame(frame);
      mutation.disconnect();
      resize.disconnect();
      observed.forEach((item) => {
        if (item === surface) return;
        item.style.removeProperty("width");
        item.style.removeProperty("left");
        item.style.removeProperty("top");
      });
      window.removeEventListener("resize", schedule);
    };
  }, [board, active, layoutKey]);
  useLayoutEffect(() => {
    // React can flush following effects before MutationObserver delivery.
    // Position each new step before the camera measures it in those effects.
    arrange.current?.();
  });
}
