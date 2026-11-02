// Only for deterministic model fixtures. Production never fills missing design.
export function directedStep(step) {
  return {
    ...step,
    role: step.role || "example",
    delivery: step.delivery || {
      write: step.narration.slice(0, 8),
      ...(step.visual ? { visual: step.narration.slice(0, 8) } : {}),
    },
  };
}
export function directedTeaching(teaching) {
  return {
    ...teaching,
    design: teaching.design || {
      problem: "如何用具体场景理解当前知识点？",
      approach: "先观察例子，再解释结论与使用边界。",
      representations: ["worked-example"],
      rationale: "用具体操作检验当前结论。",
    },
    steps: teaching.steps.map(directedStep),
  };
}
