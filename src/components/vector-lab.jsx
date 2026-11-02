import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { Slider } from "./ui/slider";

const number = (value) => Number(value.toFixed(1)).toString();

export function VectorLab({
  visual,
  progress = 1,
  playing = false,
  onInteract,
}) {
  const reducedMotion = useReducedMotion();
  const uid = useId().replaceAll(":", "");
  const [manual, setManual] = useState(null);
  useEffect(() => {
    if (playing) setManual(null);
  }, [playing]);
  const scalar = visual.mode === "scalar";
  const vector = visual.vector;
  const factors =
    manual || visual.factors.map((value) => 1 + (value - 1) * progress);
  const result = [vector[0] * factors[0], vector[1] * factors[1]];
  const determinant = factors[0] * factors[1];
  const unit = Math.min(
    28,
    105 /
      (Math.max(1, ...vector.map(Math.abs)) *
        Math.max(3, ...visual.factors.map(Math.abs))),
  );
  const [cx, cy] = [160, 130];
  const transition = reducedMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 180, damping: 26 };
  const change = (axis, value) => {
    onInteract?.();
    setManual(
      scalar
        ? [value, value]
        : factors.map((current, i) => (i === axis ? value : current)),
    );
  };
  return (
    <figure
      className="teaching-visual vector-lab"
      aria-label={visual.title}
      data-vector-mode={visual.mode}
      data-demo-state={manual ? "manual" : "following"}
    >
      <figcaption className="lab-heading">
        <span>{visual.title}</span>
        <button
          type="button"
          aria-label="回到讲解示例"
          title="回到讲解示例"
          onClick={() => setManual(null)}
        >
          <RotateCcw size={14} />
        </button>
      </figcaption>
      <svg
        viewBox="0 0 340 260"
        role="img"
        aria-label={`原始向量 (${vector.map(number).join(", ")})，变换后 (${result.map(number).join(", ")})`}
      >
        <defs>
          {["original", "result"].map((kind) => (
            <marker
              key={kind}
              id={`${uid}-${kind}`}
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path
                d="M0 0 L7 3.5 L0 7"
                fill={
                  kind === "original"
                    ? "var(--feedback-success)"
                    : "var(--action-primary)"
                }
              />
            </marker>
          ))}
        </defs>
        {Array.from({ length: 11 }, (_, i) => (
          <g key={i}>
            <line
              x1={30 + i * 26}
              x2={30 + i * 26}
              y1="20"
              y2="240"
              stroke="var(--border-subtle)"
            />
            <line
              x1="25"
              x2="320"
              y1={20 + i * 22}
              y2={20 + i * 22}
              stroke="var(--border-subtle)"
            />
          </g>
        ))}
        <line x1="25" x2="320" y1={cy} y2={cy} stroke="var(--border-strong)" />
        <line x1={cx} x2={cx} y1="20" y2="240" stroke="var(--border-strong)" />
        {!scalar && (
          <motion.path
            animate={{
              d: `M${cx} ${cy} L${cx + unit * factors[0]} ${cy} L${cx + unit * factors[0]} ${cy - unit * factors[1]} L${cx} ${cy - unit * factors[1]}Z`,
            }}
            transition={transition}
            fill="var(--surface-selected)"
            stroke="var(--brand-300)"
            strokeDasharray="4 4"
          />
        )}
        <line
          x1={cx}
          y1={cy}
          x2={cx + unit * vector[0]}
          y2={cy - unit * vector[1]}
          stroke="var(--feedback-success)"
          strokeWidth="2"
          markerEnd={`url(#${uid}-original)`}
        />
        <motion.line
          initial={false}
          x1={cx}
          y1={cy}
          animate={{ x2: cx + unit * result[0], y2: cy - unit * result[1] }}
          transition={transition}
          stroke="var(--action-primary)"
          strokeWidth="2.5"
          markerEnd={`url(#${uid}-result)`}
        />
        <circle cx={cx} cy={cy} r="2.5" fill="var(--text-primary)" />
        <text x="324" y={cy + 4} fill="var(--text-tertiary)" fontSize="11">
          x
        </text>
        <text x={cx - 5} y="15" fill="var(--text-tertiary)" fontSize="11">
          y
        </text>
      </svg>
      <div className="vector-legend">
        <span>
          <i />
          原始向量
        </span>
        <span>
          <i />
          变换后
        </span>
      </div>
      <p className="vector-formula" aria-live="polite">
        {scalar ? `${number(factors[0])} × ` : "A × "}(
        {vector.map(number).join(", ")}) ={" "}
        <strong>({result.map(number).join(", ")})</strong>
      </p>
      <div className="lab-sliders" data-scalar={scalar}>
        {(scalar ? ["数乘系数 k"] : ["横向缩放", "纵向缩放"]).map(
          (label, axis) => (
            <label key={label}>
              <span>
                {label}
                <strong>{number(factors[axis])}</strong>
              </span>
              <Slider
                aria-label={label}
                value={[factors[axis]]}
                min={-3}
                max={3}
                step={0.1}
                onValueChange={([value]) => change(axis, value)}
              />
            </label>
          ),
        )}
      </div>
      <div className="lab-result">
        {scalar
          ? factors[0] === 0
            ? "零向量：没有确定方向"
            : `${factors[0] < 0 ? "方向相反" : "方向相同"} · 长度 ×${number(Math.abs(factors[0]))}`
          : `面积 ×${number(Math.abs(determinant))} · ${Math.abs(determinant) < 0.001 ? "空间被压扁" : determinant < 0 ? "定向翻转" : "定向保持"}`}
      </div>
      <p className="vector-demo-hint">
        {manual
          ? "正在自行调整，点击右上角重置可恢复讲解示例。"
          : "随当前讲解演示，也可以拖动滑杆自己试一试。"}
      </p>
    </figure>
  );
}
