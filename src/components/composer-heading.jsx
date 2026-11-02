import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { GraduationCap } from "lucide-react";

const courseLines = ["使用 Knowra 打造你的专属课程"];
const assistLines = [
  "把不明白的地方，慢慢讲明白",
  "换个角度，理解眼前的难题",
  "带着问题来，带着思路走",
  "一个概念，一个例子，一起弄懂",
  "让复杂的知识，变得清楚一点",
];

function HeadingText({ text, branded }) {
  if (!branded) return text;
  const prefix = text.slice(0, 3);
  const name = text.slice(3, 9);
  return (
    <>
      {prefix}
      {name && (
        <span className="home-wordmark">
          <GraduationCap size={27} aria-hidden="true" />
          {name}
        </span>
      )}
      {text.slice(9)}
    </>
  );
}

export function ComposerHeading({ mode, active }) {
  const reduced = useReducedMotion();
  const lines = mode === "course" ? courseLines : assistLines;
  const [frame, setFrame] = useState({ index: 0, count: 0, phase: "typing" });
  const [visible, setVisible] = useState(() => !document.hidden);
  const wasActive = useRef(false);
  const lastAssist = useRef(-1);
  useLayoutEffect(() => {
    if (!active) {
      wasActive.current = false;
      return;
    }
    if (wasActive.current) return;
    wasActive.current = true;
    let index = 0;
    if (mode === "assist") {
      let previous = lastAssist.current;
      try {
        const stored = sessionStorage.getItem("knowra-assist-heading");
        if (stored !== null && /^\d+$/.test(stored)) previous = Number(stored);
      } catch {}
      index = (previous + 1) % lines.length;
      lastAssist.current = index;
      try {
        sessionStorage.setItem("knowra-assist-heading", String(index));
      } catch {}
    }
    setFrame({ index, count: 0, phase: "typing" });
  }, [active, mode, lines]);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    if (!active || reduced || !visible || frame.phase !== "typing") return;
    const length = Array.from(lines[frame.index]).length;
    const timer = setTimeout(() => {
      setFrame({
        ...frame,
        count: frame.count + 1,
        phase: frame.count + 1 >= length ? "hold" : "typing",
      });
    }, 70);
    return () => clearTimeout(timer);
  }, [active, reduced, visible, frame, lines]);
  const full = lines[frame.index];
  const text = reduced ? full : Array.from(full).slice(0, frame.count).join("");
  return (
    <h1
      className="composer-typed-heading"
      data-active={active}
      aria-hidden={!active}
      aria-label={full}
      data-phase={reduced ? "static" : frame.phase}
      data-phrase={frame.index}
      data-count={reduced ? Array.from(full).length : frame.count}
    >
      <span className="composer-heading-reserve" aria-hidden="true">
        {lines.map((line) => (
          <span key={line}>
            <HeadingText text={line} branded={mode === "course"} />
          </span>
        ))}
      </span>
      <span className="composer-heading-typed" aria-hidden="true">
        <HeadingText text={text} branded={mode === "course"} />
        {!reduced && active && frame.phase === "typing" && (
          <span className="composer-heading-caret" />
        )}
      </span>
    </h1>
  );
}
