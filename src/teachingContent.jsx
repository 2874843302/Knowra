import React, { createContext, memo, useContext, useMemo, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight } from "lucide-react";

import { streamMarkdown } from "./lib/lesson-sequence";
import { BoardAnnotation } from "./components/board-annotation";
import { WritingPencil } from "./components/writing-pencil";
import { VectorLab } from "./components/vector-lab";
import { TeachingDiagram } from "./components/teaching-diagram";

const noAnnotations = [];
const AnnotationContext = createContext(noAnnotations);

// Stable renderers keep completed strokes mounted while the lesson clock ticks.
const markdownComponents = {
  mark: ({ children, ...props }) => (
    <BoardAnnotation kind={props["data-annotation"]}>
      {children}
    </BoardAnnotation>
  ),
  code: function AnnotatedCode({ children, node, ...props }) {
    const annotations = useContext(AnnotationContext);
    return (
      <code {...props}>
        {splitAnnotations(String(children), annotations).map((part, i) =>
          part.kind ? (
            <BoardAnnotation key={i} kind={part.kind}>
              {part.text}
            </BoardAnnotation>
          ) : (
            part.text
          ),
        )}
      </code>
    );
  },
};

function splitAnnotations(text, annotations) {
  const parts = [];
  let offset = 0;
  while (offset < text.length) {
    const match = annotations
      .map((annotation) => ({
        ...annotation,
        at: text.indexOf(annotation.snippet, offset),
      }))
      .filter((annotation) => annotation.snippet && annotation.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (!match) {
      parts.push({ text: text.slice(offset) });
      break;
    }
    if (match.at > offset) parts.push({ text: text.slice(offset, match.at) });
    parts.push({ text: match.snippet, kind: match.kind });
    offset = match.at + match.snippet.length;
  }
  return parts;
}

function annotationPlugin(annotations) {
  return () => (tree) => {
    const visit = (node) => {
      if (!node.children || node.type === "code" || node.type === "inlineCode")
        return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") {
          visit(child);
          return child;
        }
        return splitAnnotations(child.value, annotations).map((part) =>
          part.kind
            ? {
                type: "emphasis",
                data: {
                  hName: "mark",
                  hProperties: { "data-annotation": part.kind },
                },
                children: [{ type: "text", value: part.text }],
              }
            : { type: "text", value: part.text },
        );
      });
    };
    visit(tree);
  };
}

export const TeachingMarkdown = memo(function TeachingMarkdown({
  step,
  progress,
  writing,
  annotationReady = true,
}) {
  const content = streamMarkdown(step, progress);
  const container = useRef(null);
  const isWriting =
    writing && progress > 0 && progress < 1 && step.kind !== "table";
  const annotations =
    progress >= 1 && annotationReady
      ? step.annotations || noAnnotations
      : noAnnotations;
  const plugins = useMemo(
    () => [remarkGfm, annotationPlugin(annotations)],
    [annotations],
  );
  return (
    <div
      ref={container}
      className={`markdown teaching-writing ${isWriting ? "is-writing" : ""}`}
      data-write-progress={progress.toFixed(3)}
    >
      <AnnotationContext.Provider value={annotations}>
        <Markdown remarkPlugins={plugins} components={markdownComponents}>
          {content}
        </Markdown>
      </AnnotationContext.Provider>
      {isWriting && <WritingPencil container={container} content={content} />}
      {progress === 0 && (
        <span className="writing-placeholder">
          {step.index === 0 ? "准备好了，就开始讲解" : "接着看这里"}
        </span>
      )}
    </div>
  );
});

export const TeachingVisual = memo(function TeachingVisual({
  visual,
  progress,
  previous,
  playing,
  onInteract,
}) {
  if (!visual || (progress <= 0 && !previous?.rows?.length)) return null;
  if (visual.type === "diagram")
    return (
      <TeachingDiagram
        visual={visual}
        progress={progress}
        onInteract={onInteract}
      />
    );
  if (visual.type === "vector-transform")
    return (
      <VectorLab
        visual={visual}
        progress={progress}
        playing={playing}
        onInteract={onInteract}
      />
    );
  const items = visual.items || visual.rows || [];
  const retained = visual.type === "trace" ? previous?.rows?.length || 0 : 0;
  const count = Math.min(
    items.length,
    retained + Math.ceil(progress * (items.length - retained)),
  );
  if (!["bindings", "comparison", "trace"].includes(visual.type)) return null;
  return (
    <figure
      className={`teaching-visual visual-${visual.type}`}
      aria-label={visual.title}
    >
      <figcaption>{visual.title}</figcaption>
      {items.slice(0, count).map((item, i) =>
        visual.type === "bindings" ? (
          <div className="binding-row" key={i}>
            <code>{item.name}</code>
            <ArrowRight size={22} aria-label="指向" />
            <BoardAnnotation kind="box" className="binding-value">
              <strong>{item.value}</strong>
              <small>{item.type}</small>
            </BoardAnnotation>
          </div>
        ) : visual.type === "comparison" ? (
          <div className="comparison-row" key={i}>
            <small>{item.label}</small>
            <div>
              <code>{item.expression}</code>
              <ArrowRight size={17} aria-hidden="true" />
              <strong>{item.result}</strong>
            </div>
            <small>{item.detail}</small>
          </div>
        ) : (
          <div
            className={`trace-row ${i === count - 1 ? "is-latest" : ""}`}
            key={item.name}
          >
            <code>{item.name}</code>
            <span>{item.value}</span>
          </div>
        ),
      )}
      {visual.output && progress >= 0.7 && (
        <div className="trace-output">
          <small>格式化输出</small>
          <samp>{visual.output}</samp>
        </div>
      )}
      {visual.type === "trace" && (
        <small className="trace-caption">按示例推演</small>
      )}
    </figure>
  );
});
