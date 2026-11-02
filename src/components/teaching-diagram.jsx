import React, { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

// Short labels wrap in SVG without foreignObject or model-authored markup.
const lines = (text, width = 8) => {
  const chars = Array.from(text);
  return Array.from({ length: Math.ceil(chars.length / width) }, (_, i) =>
    chars.slice(i * width, (i + 1) * width).join(""),
  );
};
function Label({ text, x, y, width = 8 }) {
  const rows = lines(text, width);
  return (
    <text x={x} y={y - (rows.length - 1) * 13} textAnchor="middle">
      {rows.map((row, index) => (
        <tspan x={x} dy={index ? 26 : 0} key={index}>
          {row}
        </tspan>
      ))}
    </text>
  );
}

export function TeachingDiagram({ visual, progress, onInteract }) {
  const marker = `diagram-${useId().replace(/:/g, "")}`;
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState(null);
  const count = visual.nodes.length;
  const revealed = Math.max(1, Math.min(count, Math.ceil(progress * count)));
  const active =
    selected == null ? revealed - 1 : Math.min(selected, revealed - 1);
  const venn = visual.layout === "venn";
  const rows = Math.ceil(count / 3);
  const columns = Math.min(3, count);
  const height = venn ? 340 : rows * 160 + 16;
  const position = (i) => {
    const row = Math.floor(i / 3);
    const col = row % 2 ? columns - 1 - (i % 3) : i % 3;
    return [106 + col * 214, 80 + row * 160];
  };
  const choose = (index) => {
    setSelected(index);
    onInteract?.();
  };
  const transition = { duration: reduced ? 0 : 0.55, ease: "easeOut" };
  return (
    <figure
      className={`teaching-visual teaching-diagram diagram-${visual.layout}`}
      aria-label={visual.title}
      data-revealed={revealed}
    >
      <figcaption>{visual.title}</figcaption>
      <svg
        viewBox={`0 0 ${venn ? 640 : columns * 214} ${height}`}
        role="img"
        aria-label={visual.title}
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth="9"
            markerHeight="9"
            orient="auto-start-reverse"
          >
            <path
              d="M2 2 L10 6 L2 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>
        {venn ? (
          <>
            {visual.nodes.slice(0, revealed).map((node, index) => (
              <motion.g
                key={index}
                className={`diagram-shape diagram-tone-${index}`}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={transition}
              >
                <motion.circle
                  cx={index ? 414 : 226}
                  cy="150"
                  r="127"
                  initial={reduced ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={transition}
                />
                <Label
                  text={node.label}
                  x={index ? 468 : 172}
                  y={153}
                  width={6}
                />
              </motion.g>
            ))}
            {revealed === 2 && (
              <motion.g
                className="diagram-intersection"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={transition}
              >
                <path
                  d="M320 192 Q326 229 320 286"
                  fill="none"
                  markerEnd={`url(#${marker})`}
                />
                <Label text={visual.intersection} x={320} y={317} width={22} />
              </motion.g>
            )}
          </>
        ) : (
          visual.nodes.slice(0, revealed).map((node, index) => {
            const [x, y] = position(index);
            const [px, py] = position(Math.max(0, index - 1));
            const down = py !== y;
            const sign = x > px ? 1 : -1;
            const line = down
              ? `M${px} ${py + 48} Q${px + 14} ${py + 78} ${x} ${y - 50}`
              : `M${px + sign * 84} ${py} Q${(px + x) / 2} ${py - 9} ${x - sign * 86} ${y}`;
            return (
              <motion.g
                className={`diagram-shape diagram-tone-${index % 2} ${active === index ? "is-focused" : ""}`}
                key={index}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={transition}
              >
                {index > 0 && (
                  <motion.path
                    className="diagram-connector"
                    d={line}
                    fill="none"
                    markerEnd={`url(#${marker})`}
                    initial={reduced ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={transition}
                  />
                )}
                <motion.rect
                  x={x - 80}
                  y={y - 46}
                  width="160"
                  height="92"
                  rx="22"
                  initial={reduced ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={transition}
                />
                <Label text={node.label} x={x} y={y + 6} />
              </motion.g>
            );
          })
        )}
      </svg>
      <div className="diagram-explore" role="group" aria-label="查看图解说明">
        {visual.nodes.map((node, index) => (
          <button
            type="button"
            key={index}
            style={index >= revealed ? { visibility: "hidden" } : undefined}
            disabled={index >= revealed}
            aria-pressed={active === index}
            onClick={() => choose(index)}
          >
            {node.label}
          </button>
        ))}
      </div>
      <div className="diagram-explanation" aria-live="polite">
        {visual.nodes.map((node, i) => (
          <span className="diagram-detail-reserve" aria-hidden="true" key={i}>
            {node.detail || node.label}
          </span>
        ))}
        <p>{visual.nodes[active]?.detail || visual.nodes[active]?.label}</p>
      </div>
      {visual.caption && <p className="diagram-caption">{visual.caption}</p>}
    </figure>
  );
}
