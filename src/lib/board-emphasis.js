const annotationKinds = new Set(["highlight", "underline", "circle"]);

// Decorations are optional presentation metadata, never a reason to reject an
// otherwise complete lecture. Keep the board selective and ignore bad entries.
export function normalizeBoardAnnotations(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .filter((item) => {
      if (!annotationKinds.has(item?.kind) || typeof item?.snippet !== "string")
        return false;
      const snippet = item.snippet.trim();
      if (!snippet || snippet.length > 120 || seen.has(snippet)) return false;
      seen.add(snippet);
      return true;
    })
    .slice(0, 3)
    .map(({ kind, snippet }) => ({ kind, snippet: snippet.trim() }));
}

export function boardAnnotations(fragment, authored) {
  const leaves = [];
  const conclusions = [];
  const visit = (node) => {
    if (typeof node.value === "string") leaves.push(node.value);
    // Older lessons already mark standalone conclusions with **...**. Use
    // that authored structure rather than guessing important words by regex.
    if (
      node.type === "paragraph" &&
      node.children?.length === 1 &&
      node.children[0].type === "strong" &&
      node.children[0].children?.length === 1 &&
      node.children[0].children[0].type === "text"
    ) {
      const snippet = node.children[0].children[0].value.trim();
      if (snippet.length >= 8 && snippet.length <= 80)
        conclusions.push({ kind: "highlight", snippet });
    }
    node.children?.forEach(visit);
  };
  visit(fragment);
  const annotations = normalizeBoardAnnotations(authored).filter(
    ({ snippet }) => leaves.some((text) => text.includes(snippet)),
  );
  return annotations.length
    ? annotations
    : normalizeBoardAnnotations(conclusions).slice(0, 2);
}
