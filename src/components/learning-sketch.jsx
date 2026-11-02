import { motion, useReducedMotion } from "motion/react";

// Decorative ink illustration. Its geometry never participates in the form layout.
export function LearningSketch() {
  const reducedMotion = useReducedMotion();
  const strokes = [
    "M63 113c-15-12-12-37 5-41 19-6 31 9 22 23-5 7-14 7-13 17m0 10v1",
    "M48 59c17-11 46-10 60 7m-62 76c14 12 39 13 56 2",
    "M111 98c28-23 62-23 93-9",
    "M194 80l12 9-15 4",
    "M793 89c24-19 51-20 76-4",
    "M860 76l11 9-14 4",
    "M897 93l19-27 27 34-20 26z",
    "M916 66l7 60m-26-33 46 7",
    "M891 138c18 5 38 3 53-4",
  ];
  return (
    <svg
      className="learning-sketch"
      viewBox="0 0 1000 210"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {strokes.map((d, i) => (
          <motion.path
            key={d}
            d={d}
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              duration: reducedMotion ? 0 : 0.65,
              delay: reducedMotion ? 0 : i * 0.035,
              ease: "easeOut",
            }}
          />
        ))}
      </g>
      <g className="learning-sketch-notes">
        <text x="42" y="175" transform="rotate(-7 42 175)">
          一个好问题
        </text>
        <text x="878" y="169" transform="rotate(5 878 169)">
          慢慢，懂了。
        </text>
      </g>
      <path
        className="learning-sketch-highlight"
        d="m880 177 81 7"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <g
        className="learning-sketch-spark"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M962 65v12m-6-6h12M30 92v8m-4-4h8" />
      </g>
    </svg>
  );
}
