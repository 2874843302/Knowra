import { useState } from "react";

export function HoverLesson({ completed, children }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [manual, setManual] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const expanded =
    selectOpen || (!suppressed && (hovered || focused || manual));
  return (
    <article
      className={`lesson-row ${completed ? "completed" : ""} ${expanded ? "is-expanded" : ""}`}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") {
          setHovered(true);
          setSuppressed(false);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") {
          setHovered(false);
          setManual(false);
          setSuppressed(false);
        }
      }}
      onPointerDownCapture={() => setFocused(false)}
      onFocusCapture={(event) => {
        if (event.target.matches(":focus-visible")) setFocused(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          setManual(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !selectOpen) {
          setSuppressed(true);
          setManual(false);
        }
      }}
    >
      {children(
        expanded,
        () => {
          setSuppressed(expanded);
          setManual(!expanded);
        },
        setSelectOpen,
      )}
    </article>
  );
}
