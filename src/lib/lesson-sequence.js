import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmToMarkdown } from "mdast-util-gfm";
import { boardAnnotations } from "./board-emphasis.js";
import { deliveryStart } from "./teaching-direction.js";
import {
  textUnits,
  narrationTiming,
  narrationActiveTime,
  narrationElapsedAtActive,
} from "./narration-timing.js";
export { textUnits } from "./narration-timing.js";

export function nodeText(node) {
  return node.value ?? node.alt ?? (node.children || []).map(nodeText).join("");
}

export function streamText(text, progress) {
  const units = textUnits(text);
  return units
    .slice(0, Math.floor(units.length * Math.max(0, Math.min(1, progress))))
    .join("");
}

// Clip the parsed tree so emphasis, links and fences stay valid while writing.
export function streamMarkdown(step, progress = 1) {
  if (progress >= 1 || !step.fragment || step.kind === "table")
    return step.content;
  if (step.kind === "code") {
    return toMarkdown({
      type: "root",
      children: [
        {
          ...step.fragment,
          value: step.prefix + streamText(step.text, progress),
        },
      ],
    });
  }
  let remaining = Math.floor(
    textUnits(nodeText(step.fragment)).length * Math.max(0, progress),
  );
  const clip = (node) => {
    if (node.children) {
      const children = node.children.map(clip).filter(Boolean);
      return children.length ? { ...node, children } : null;
    }
    if (typeof node.value === "string") {
      const units = textUnits(node.value);
      const value = units.slice(0, remaining).join("");
      remaining = Math.max(0, remaining - units.length);
      return value ? { ...node, value } : null;
    }
    if (!remaining) return null;
    remaining = Math.max(0, remaining - textUnits(nodeText(node)).length);
    return node;
  };
  const fragment = clip(step.fragment);
  return fragment
    ? toMarkdown(
        {
          type: "root",
          children: [
            ...(fragment.type === "root" ? fragment.children : [fragment]),
            ...step.definitions,
          ],
        },
        { extensions: [gfmToMarkdown()] },
      )
    : "";
}

// Older courses have only a textbook. Extract complete clauses without adding facts.
function extractBoardNote(node) {
  if (!["paragraph", "blockquote"].includes(node.type)) return null;
  const text = nodeText(node);
  if (text.length < 65) return null;
  const clauses = text.match(/[^。！？；\n]+[。！？；]?/gu) || [text];
  const emphasized = [];
  const visit = (part) => {
    if (["strong", "inlineCode"].includes(part.type))
      emphasized.push(nodeText(part));
    else part.children?.forEach(visit);
  };
  visit(node);
  const chosen = [
    clauses[0],
    ...clauses
      .slice(1)
      .filter((clause) => emphasized.some((term) => clause.includes(term))),
  ].slice(0, 2);
  return chosen.map((clause) => `- ${clause.trim()}`).join("\n");
}

function timeStep(step) {
  step.writeStart = deliveryStart(step, "write");
  step.writeDuration = Math.max(700, textUnits(step.text).length * 42);
  step.narrationDuration = narrationTiming(step.narration).duration;
  step.duration = Math.max(
    2400,
    narrationElapsedAtActive(
      step.narration,
      narrationActiveTime(step.narration, step.writeStart) + step.writeDuration,
    ) + 1000,
    step.narrationDuration + 750,
  );
  return step;
}

export function lessonSequence(markdown = "", lesson = {}) {
  const teaching = lesson.teaching?.source === markdown ? lesson.teaching : {};
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const definitions = tree.children.filter((node) =>
    ["definition", "footnoteDefinition"].includes(node.type),
  );
  const serialize = (nodes) =>
    toMarkdown(
      { type: "root", children: [...nodes, ...definitions] },
      { extensions: [gfmToMarkdown()] },
    );
  let pages = [];
  const steps = [];
  for (const node of tree.children) {
    if (definitions.includes(node)) continue;
    if (!pages.length || (node.type === "heading" && node.depth <= 2)) {
      pages.push({
        title:
          node.type === "heading"
            ? nodeText(node)
            : `知识片段 ${pages.length + 1}`,
        nodes: [],
        steps: [],
      });
      if (node.type === "heading") continue;
    }
    pages.at(-1).nodes.push(node);
  }
  pages.forEach((page, pageIndex) => {
    const blocks = page.nodes.length
      ? page.nodes
      : [
          {
            type: "paragraph",
            children: [{ type: "text", value: page.title }],
          },
        ];
    blocks.forEach((node, block) => {
      // Code remains a valid fenced block; each step adds one complete line.
      const fragments =
        node.type === "code"
          ? node.value.split("\n").map((_, i, lines) => ({
              ...node,
              value: lines.slice(0, i + 1).join("\n"),
            }))
          : node.type === "list"
            ? node.children.map((item, i) => ({
                ...node,
                start: node.ordered ? (node.start || 1) + i : null,
                children: [item],
              }))
            : [node];
      fragments.forEach((fragment, part) => {
        const step = {
          index: steps.length,
          page: pageIndex,
          block,
          part,
          title: page.title,
          content: serialize([fragment]),
          text: nodeText(
            node.type === "code"
              ? { ...fragment, value: node.value.split("\n")[part] }
              : fragment,
          ),
          kind: node.type,
          fragment,
          definitions,
          prefix:
            node.type === "code" && part > 0
              ? node.value.split("\n").slice(0, part).join("\n") + "\n"
              : "",
        };
        const authored = teaching.steps?.[step.index];
        step.sourceContent = step.content;
        step.sourceText = step.text;
        step.narration = authored?.narration || step.sourceText;
        const board = authored?.board || extractBoardNote(fragment);
        if (board && node.type !== "code") {
          step.fragment = unified()
            .use(remarkParse)
            .use(remarkGfm)
            .parse(board);
          step.content = serialize(step.fragment.children);
          step.text = nodeText(step.fragment);
          step.kind = "board";
        }
        step.visual = authored?.visual;
        step.delivery = authored?.delivery;
        step.role = authored?.role;
        step.checkpoint = authored?.checkpoint;
        step.annotations = boardAnnotations(
          step.fragment,
          authored?.annotations,
        );
        steps.push(timeStep(step));
        page.steps.push(step);
      });
    });
    page.content = serialize(page.nodes);
  });
  const readingPages = pages.map((page) => ({
    ...page,
    steps: [...page.steps],
  }));
  if (teaching.mode === "script" && teaching.steps?.length) {
    pages = [];
    steps.length = 0;
    teaching.steps.forEach((authored, index) => {
      if (!pages.length || pages.at(-1).title !== authored.title)
        pages.push({ title: authored.title, steps: [], content: "" });
      const fragment = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .parse(authored.board);
      const step = timeStep({
        index,
        page: pages.length - 1,
        block: index,
        part: 0,
        title: authored.title,
        kind: "board",
        fragment,
        definitions: [],
        prefix: "",
        content: authored.board,
        text: nodeText(fragment),
        narration: authored.narration,
        sourceContent: authored.board,
        sourceText: nodeText(fragment),
        annotations: boardAnnotations(fragment, authored.annotations),
        visual: authored.visual,
        delivery: authored.delivery,
        role: authored.role,
        checkpoint: authored.checkpoint,
      });
      steps.push(step);
      pages.at(-1).steps.push(step);
      pages.at(-1).content += `${authored.board}\n\n`;
    });
  }
  const embedded = steps.some((step) => step.checkpoint);
  if (steps.length && (embedded || lesson.quiz)) {
    const after = Number.isInteger(teaching.checkpointAfter)
      ? Math.max(0, Math.min(steps.length - 1, teaching.checkpointAfter))
      : steps.length - 1;
    const withChecks = steps.flatMap((preceding, index) => {
      const quiz =
        preceding.checkpoint ||
        (!embedded && index === after ? lesson.quiz : null);
      if (!quiz) return [preceding];
      return [
        preceding,
        {
          page: preceding.page,
          block: `checkpoint-${index}`,
          part: 0,
          title: preceding.title,
          kind: "checkpoint",
          quiz,
          assessment: preceding.checkpoint ? "understanding" : "lesson",
          content: quiz.question,
          text: quiz.question,
          narration: "先停一下，试着用刚才的思路回答这个问题。",
          duration: 1,
          writeDuration: 1,
          narrationDuration: 1,
        },
      ];
    });
    steps.splice(0, steps.length, ...withChecks);
    steps.forEach((step, index) => {
      step.index = index;
    });
    pages.forEach((page, index) => {
      page.steps = steps.filter((step) => step.page === index);
    });
  }
  let hash = 2166136261;
  for (const char of "board-narration-v3" +
    markdown +
    JSON.stringify([lesson.quiz, teaching]))
    hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return { pages, readingPages, steps, signature: (hash >>> 0).toString(36) };
}

export function visibleSteps(sequence, index) {
  const current = sequence.steps[index];
  if (!current) return [];
  return sequence.steps.filter(
    (step) =>
      step.index <= index &&
      (step.kind !== "code" ||
        step.index === index ||
        sequence.steps[step.index + 1]?.block !== step.block ||
        sequence.steps[step.index + 1]?.page !== step.page),
  );
}
