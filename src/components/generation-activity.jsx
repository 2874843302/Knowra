import React, { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

export function DrawnCheck({ size = 16 }) {
  const reduced = useReducedMotion();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <motion.path
        d="m5 12 4 4L19 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduced ? 0 : 0.36, ease: "easeOut" }}
      />
    </svg>
  );
}

function ActivityDrawing({ kind }) {
  return (
    <svg viewBox="0 0 144 104" fill="none" aria-hidden="true" focusable="false">
      <g
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "research" ? (
          <>
            <path
              className="activity-trace"
              d="M35 27C70 27 43 52 73 52M31 77C63 77 48 52 73 52M119 30C91 30 105 52 83 52"
            />
            <g className="activity-paper activity-paper-one">
              <rect x="17" y="14" width="25" height="30" rx="5" />
              <path d="M23 23h13m-13 6h9m-9 6h11" />
            </g>
            <g className="activity-paper activity-paper-two">
              <rect x="13" y="62" width="27" height="25" rx="5" />
              <path d="M19 70h15m-15 7h10" />
            </g>
            <g className="activity-paper activity-paper-three">
              <rect x="106" y="17" width="24" height="28" rx="5" />
              <path d="M112 25h12m-12 7h8m-8 6h10" />
            </g>
            <circle className="activity-halo" cx="78" cy="53" r="23" />
            <circle className="activity-center" cx="78" cy="53" r="16" />
            <path d="M69 48q5-3 9 0 4-3 9 0v12q-5-3-9 0-4-3-9 0Zm9 0v12" />
            <path
              className="activity-spark"
              d="M110 71v8m-4-4h8M52 10v5m-2.5-2.5h5"
            />
          </>
        ) : kind === "planning" ? (
          <>
            <path
              className="activity-trace"
              d="M36 52h25m16 0h21M69 52V24h29m-29 28v28h29"
            />
            <rect
              className="activity-center"
              x="14"
              y="37"
              width="30"
              height="30"
              rx="8"
            />
            <path d="M22 46h14m-14 6h10m-10 6h6" />
            {[14, 42, 70].map((y, i) => (
              <g key={y} className={`activity-branch activity-branch-${i}`}>
                <rect x="96" y={y} width="35" height="20" rx="5" />
                <path d={`M103 ${y + 7}h21m-21 6h13`} />
              </g>
            ))}
            <circle className="activity-center" cx="69" cy="52" r="5" />
          </>
        ) : (
          <>
            <rect
              className="activity-paper"
              x="30"
              y="13"
              width="68"
              height="78"
              rx="8"
            />
            <path d="M43 29h19" />
            {[43, 55, 67].map((y, i) => (
              <path
                className={`activity-writing-line activity-writing-line-${i}`}
                key={y}
                pathLength="1"
                d={`M43 ${y}h${i === 2 ? 27 : 41}`}
              />
            ))}
            <g className="activity-pencil">
              <path
                className="activity-pencil-fill"
                d="m79 62 22-31 7 5-22 31-9 5Z"
              />
              <path d="m99 34 7 5M79 62l7 5m-9 5 2-10" />
            </g>
            <path
              className="activity-spark"
              d="M113 66v9m-4.5-4.5h9M19 37v6m-3-3h6"
            />
          </>
        )}
      </g>
    </svg>
  );
}

// Motion describes a real request, never an invented percentage or task completion.
export function GenerationActivity({
  kind,
  active,
  title,
  detail,
  stateLabel,
  paused = false,
  failed = false,
  completed,
  total,
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "40px" });
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const running = !!(
    active &&
    !paused &&
    !failed &&
    inView &&
    visible &&
    !reduced
  );
  return (
    <div
      ref={ref}
      className="generation-activity"
      data-kind={kind}
      data-active={!!active}
      data-running={running}
      data-state={
        failed ? "error" : paused ? "paused" : active ? "working" : "settled"
      }
    >
      <div className="generation-activity-drawing">
        <ActivityDrawing kind={kind} />
      </div>
      <div className="generation-activity-copy">
        <span className="generation-activity-eyebrow">
          <i aria-hidden="true" />
          {failed
            ? "暂未完成"
            : paused
              ? "已暂停"
              : active
                ? "正在进行"
                : stateLabel}
        </span>
        <strong>{title}</strong>
        <p>{detail}</p>
        {total > 0 && (
          <div
            className="generation-activity-units"
            aria-label={`已完成 ${completed} / ${total} 个单元`}
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                data-complete={i < completed}
                data-current={active && i === completed}
              />
            ))}
            <small>
              {completed} / {total} 单元
            </small>
          </div>
        )}
      </div>
    </div>
  );
}
