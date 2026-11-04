import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

export function LearningBook3D({ active = true }) {
  const host = useRef(null);
  const scene = useRef(null);
  const reducedMotion = useReducedMotion();
  const preferences = useRef({ active, reducedMotion });
  preferences.current = { active, reducedMotion };

  useEffect(() => {
    const element = host.current;
    let disposed = false;
    import("../lib/learning-book-scene")
      .then(({ createLearningBookScene }) => {
        if (disposed) return;
        scene.current = createLearningBookScene(
          element,
          preferences.current,
          (ready) => {
            if (!disposed) element.dataset.ready = String(ready);
          },
        );
      })
      .catch(() => {
        // Keep the original vector book visible if WebGL is unavailable.
      });
    return () => {
      disposed = true;
      scene.current?.dispose();
      scene.current = null;
      delete element.dataset.ready;
    };
  }, []);

  useEffect(() => {
    scene.current?.configure(preferences.current);
  }, [active, reducedMotion]);

  return (
    <span className="learning-book-3d" aria-hidden="true">
      <svg
        className="learning-book-fallback"
        viewBox="0 0 64 64"
        fill="none"
        focusable="false"
      >
        <path
          d="M32 17C23 11 13 12 5 17v34c10-5 18-4 27 1 9-5 17-6 27-1V17c-8-5-18-6-27 0Z"
          fill="#faf8f5"
          stroke="#4a6fa5"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M32 17v35M12 24l12 2m-12 7 12 2m16-9 12-2m-12 11 12-2"
          stroke="#8ba4b5"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M47 37v15l4-3 4 2V36" fill="#e8a87c" />
      </svg>
      <span className="learning-book-renderer" ref={host} />
    </span>
  );
}
