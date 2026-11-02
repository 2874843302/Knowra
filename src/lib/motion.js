// Adapted from EasyUI's MIT-licensed motion-tokens.ts.
export const motionTransitions = {
  springSnappy: { type: "spring", stiffness: 380, damping: 30, mass: 0.5 },
  springMorph: { type: "spring", stiffness: 220, damping: 32, mass: 1 },
  springGentle: { type: "spring", stiffness: 170, damping: 26, mass: 0.9 },
  easeFast: { duration: 0.2, ease: [0.2, 0, 0, 1] },
  indicator: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  content: { duration: 0.18, ease: [0.2, 0, 0, 1] },
  disclosure: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
};
