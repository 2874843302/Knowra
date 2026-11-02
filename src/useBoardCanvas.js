import { useEffect, useLayoutEffect, useRef, useState } from "react";

const interactive =
  "button,a,input,textarea,select,[role=button],[role=slider],[contenteditable=true],.board-modebar,.vector-lab";

export function boardFocusTarget(element) {
  // Lane items remain whole before and after completion. Use the same bounds
  // throughout so the camera doesn't switch targets on the final character.
  if (element?.getClientRects().length > 1)
    return (
      element.querySelector(
        element.dataset.writingComplete === "true"
          ? ".teaching-visual"
          : ".teaching-writing",
      ) || element
    );
  return element;
}

export function boardFocusBounds(element) {
  const target = boardFocusTarget(element);
  const visual = element?.querySelector(".teaching-visual");
  if (!visual) return target.getBoundingClientRect();
  // Frame every generated representation together with its explanation.
  // Comparisons/traces can grow during narration just like diagrams do.
  const parts = [visual, element.querySelector(".teaching-writing")].filter(
    Boolean,
  );
  const section = element.closest(".board-frame");
  const heading = section?.querySelector("h2");
  if (
    section?.querySelector(".teaching-block") === element &&
    heading &&
    Math.abs(
      heading.getBoundingClientRect().left -
        parts[1].getBoundingClientRect().left,
    ) < 40
  )
    parts.push(heading);
  const boxes = parts.map((part) => part.getBoundingClientRect());
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  return new DOMRect(
    left,
    top,
    Math.max(...boxes.map((box) => box.right)) - left,
    Math.max(...boxes.map((box) => box.bottom)) - top,
  );
}

export function useBoardCanvas({
  board,
  active,
  zoom,
  onZoomChange,
  step,
  playing,
}) {
  const [tool, setTool] = useState("pan");
  const manual = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef(null);
  const zoomAnchor = useRef(null);
  const wheelZoom = useRef(null);
  const returnTimer = useRef(null);
  const returnAnimation = useRef(null);
  const recenter = useRef(null);
  const settings = useRef({ active, playing, tool, zoom, onZoomChange });
  settings.current = { active, playing, tool, zoom, onZoomChange };
  const cancelReturn = () => {
    clearTimeout(returnTimer.current);
    returnTimer.current = null;
    const animation = returnAnimation.current;
    if (animation?.playState === "running" && board.current) {
      const position = new DOMMatrixReadOnly(
        getComputedStyle(board.current).transform,
      );
      offset.current = { x: position.m41, y: position.m42 };
      board.current.style.transform = `translate3d(${position.m41}px, ${position.m42}px, 0)`;
    }
    animation?.cancel();
    returnAnimation.current = null;
  };
  const interact = () => {
    if (!settings.current.active) return;
    cancelReturn();
    manual.current = true;
    if (!settings.current.playing) return;
    returnTimer.current = setTimeout(() => {
      returnTimer.current = null;
      if (settings.current.active && settings.current.playing)
        recenter.current?.(true);
    }, 2000);
  };
  const apply = (x, y) => {
    offset.current = { x, y };
    if (board.current)
      board.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const reset = () => {
    cancelReturn();
    manual.current = false;
    apply(0, 0);
    const viewport = board.current?.closest(".board-scroll");
    if (viewport) viewport.scrollLeft = 0;
  };
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const surface = board.current;
    if (!anchor || !surface) return;
    zoomAnchor.current = null;
    const bounds = surface.getBoundingClientRect();
    const scale = zoom / 100;
    // Compensate after CSS zoom and scroll clamping have changed the origin.
    apply(
      offset.current.x +
        (anchor.x - bounds.left - anchor.localX * scale) / scale,
      offset.current.y +
        (anchor.y - bounds.top - anchor.localY * scale) / scale,
    );
  }, [zoom]);
  const reveal = (element, centerY = false, centerX = false) => {
    const viewport = board.current?.closest(".board-scroll");
    if (!viewport || !element || manual.current) return;
    // Idle return already owns the camera until its animation has settled.
    // Measuring an interpolated transform here would add its remaining delta
    // to the destination repeatedly as subtitles or writing resize.
    if (returnAnimation.current?.playState === "running") return;
    const area = viewport.getBoundingClientRect();
    const panel = viewport.closest(".classroom")?.querySelector(".class-tutor");
    const floating =
      panel &&
      !panel.inert &&
      getComputedStyle(panel).visibility === "visible" &&
      getComputedStyle(panel).display !== "none";
    const right = floating
      ? Math.min(area.right, panel.getBoundingClientRect().left - 16)
      : area.right - 20;
    const left = area.left + 20;
    const bounds = boardFocusBounds(element);
    const shift = centerX
      ? Math.max(left, left + (right - left - bounds.width) / 2) - bounds.left
      : bounds.left < left
        ? left - bounds.left
        : bounds.right > right
          ? Math.max(left, right - bounds.width) - bounds.left
          : 0;
    const topInset =
      Number.parseFloat(
        getComputedStyle(viewport).getPropertyValue("--canvas-safe-top"),
      ) || 72;
    let shiftY = 0;
    {
      const stageTop = viewport
        .closest(".class-main")
        ?.querySelector(".lesson-stage")
        ?.getBoundingClientRect().top;
      const bottom = Math.min(area.bottom, stageTop ?? area.bottom) - 16;
      const top = area.top + topInset;
      if (centerY) shiftY = top - bounds.top;
      // One camera owns both axes. For a tall block follow its growing bottom;
      // never oscillate between correcting its top and bottom.
      if (bounds.bottom + shiftY > bottom) shiftY = bottom - bounds.bottom;
      if (bounds.height <= bottom - top && bounds.top + shiftY < top)
        shiftY = top - bounds.top;
    }
    if (shift || shiftY)
      apply(
        offset.current.x + shift / (settings.current.zoom / 100),
        offset.current.y + shiftY / (settings.current.zoom / 100),
      );
  };
  recenter.current = (smooth = false) => {
    if (!active) return;
    cancelReturn();
    manual.current = false;
    const surface = board.current;
    const before = surface?.style.transform || "none";
    // Measure the current fragment once, rather than resetting and measuring
    // a stale multi-column rectangle. Keep the learner's zoom level.
    reveal(surface?.querySelector(".teaching-block.is-current"), true, true);
    if (
      smooth &&
      surface &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const animation = surface.animate(
        [{ transform: before }, { transform: surface.style.transform }],
        { duration: 360, easing: "cubic-bezier(.2,.7,.2,1)" },
      );
      returnAnimation.current = animation;
      animation.onfinish = () => {
        if (returnAnimation.current !== animation) return;
        returnAnimation.current = null;
        if (settings.current.active && settings.current.playing)
          reveal(surface.querySelector(".teaching-block.is-current"));
      };
    }
  };
  useEffect(() => {
    if (!manual.current) reset();
  }, [active]);
  useEffect(() => {
    if (playing && !manual.current)
      reveal(board.current?.querySelector(".teaching-block.is-current"));
  }, [step]);
  useEffect(() => {
    if (!playing) cancelReturn();
    else if (manual.current && !drag.current) interact();
    if (playing && !manual.current) {
      reveal(board.current?.querySelector(".teaching-block.is-current"));
    }
  }, [playing]);
  useEffect(() => {
    if (!active) {
      cancelReturn();
      manual.current = false;
    }
    return cancelReturn;
  }, [active]);

  useEffect(() => {
    const surface = board.current;
    const viewport = surface?.closest(".board-scroll");
    if (!active || !viewport) return;
    viewport.dataset.canvasMode = tool;
    viewport.setAttribute("tabindex", "0");
    viewport.setAttribute(
      "aria-label",
      "学习画布，方向键平移，空格拖动，Ctrl 加滚轮缩放",
    );
    let space = false,
      selecting = false,
      frame;
    const render = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        apply(offset.current.x, offset.current.y),
      );
    };
    const finish = (schedule = true) => {
      const pointer = drag.current?.id;
      drag.current = null;
      delete viewport.dataset.dragging;
      if (pointer != null && viewport.hasPointerCapture(pointer))
        viewport.releasePointerCapture(pointer);
      if ((pointer != null || selecting) && schedule !== false) interact();
      selecting = false;
    };
    const move = (event) => {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      if (event.pointerType === "mouse" && !event.buttons) {
        finish();
        return;
      }
      const scale = settings.current.zoom / 100;
      offset.current = {
        x: start.x + (event.clientX - start.clientX) / scale,
        y: start.y + (event.clientY - start.clientY) / scale,
      };
      manual.current = true;
      render();
    };
    const down = (event) => {
      if (!event.isPrimary) {
        finish();
        return;
      }
      if (event.target.closest(interactive) || ![0, 1].includes(event.button))
        return;
      if (settings.current.tool !== "pan" && !space && event.button !== 1) {
        cancelReturn();
        manual.current = true;
        selecting = true;
        return;
      }
      event.preventDefault();
      cancelReturn();
      manual.current = true;
      viewport.focus({ preventScroll: true });
      drag.current = {
        id: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        ...offset.current,
      };
      viewport.dataset.dragging = "true";
      viewport.setPointerCapture(event.pointerId);
    };
    const wheel = (event) => {
      const unit =
        event.deltaMode === 1
          ? 18
          : event.deltaMode === 2
            ? viewport.clientHeight
            : 1;
      if (event.ctrlKey || event.metaKey) {
        if (!settings.current.onZoomChange) return;
        event.preventDefault();
        const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
        const previous =
          wheelZoom.current?.rounded === settings.current.zoom
            ? wheelZoom.current.value
            : settings.current.zoom;
        const target = Math.max(
          70,
          Math.min(140, previous * Math.pow(1.1, -delta / 100)),
        );
        const nextZoom = Math.round(target);
        wheelZoom.current = { value: target, rounded: nextZoom };
        finish();
        interact();
        if (nextZoom === settings.current.zoom) return;
        cancelAnimationFrame(frame);
        const bounds = surface.getBoundingClientRect();
        const scale = settings.current.zoom / 100;
        zoomAnchor.current ??= {
          x: event.clientX,
          y: event.clientY,
          localX: (event.clientX - bounds.left) / scale,
          localY: (event.clientY - bounds.top) / scale,
        };
        settings.current.zoom = nextZoom;
        settings.current.onZoomChange(nextZoom);
        return;
      }
      if (event.target.closest(`${interactive},pre`)) return;
      interact();
      if (settings.current.tool !== "pan") return;
      event.preventDefault();
      const scale = settings.current.zoom / 100;
      offset.current = {
        x: offset.current.x - (event.deltaX * unit) / scale,
        y: offset.current.y - (event.deltaY * unit) / scale,
      };
      render();
    };
    const keydown = (event) => {
      if (
        event.target.closest(interactive) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        space = true;
        viewport.dataset.spacePan = "true";
      }
      const direction = {
        ArrowLeft: [1, 0],
        ArrowRight: [-1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      }[event.key];
      if (direction) {
        event.preventDefault();
        interact();
        const distance = event.shiftKey ? 160 : 48;
        offset.current = {
          x: offset.current.x + direction[0] * distance,
          y: offset.current.y + direction[1] * distance,
        };
        render();
      }
      if (event.key === "Escape") finish();
    };
    const releaseSpace = (event) => {
      if (event.type === "blur" || event.code === "Space") {
        space = false;
        delete viewport.dataset.spacePan;
        finish();
      }
    };
    viewport.addEventListener("pointerdown", down);
    viewport.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    viewport.addEventListener("pointercancel", finish);
    viewport.addEventListener("lostpointercapture", finish);
    viewport.addEventListener("wheel", wheel, { passive: false });
    viewport.addEventListener("keydown", keydown);
    window.addEventListener("keyup", releaseSpace);
    window.addEventListener("blur", releaseSpace);
    return () => {
      finish(false);
      cancelAnimationFrame(frame);
      delete viewport.dataset.canvasMode;
      delete viewport.dataset.spacePan;
      viewport.removeAttribute("tabindex");
      viewport.removeAttribute("aria-label");
      viewport.removeEventListener("pointerdown", down);
      viewport.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      viewport.removeEventListener("pointercancel", finish);
      viewport.removeEventListener("lostpointercapture", finish);
      viewport.removeEventListener("wheel", wheel);
      viewport.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", releaseSpace);
      window.removeEventListener("blur", releaseSpace);
    };
  }, [active, tool]);

  return {
    tool,
    setTool,
    manual,
    reveal,
    interact,
    center: () => recenter.current?.(),
  };
}
