// Native webpage sessions are serial. Ordinary remote APIs can prepare two
// independent lectures at once; never fan out to an unknown/local adapter.
export function courseGenerationConcurrency(provider) {
  if (/deepseek-web/i.test(provider?.model || "")) return 1;
  try {
    const url = new URL(provider.baseUrl);
    return /^(localhost|127\..*|\[?::1\]?)$/.test(url.hostname) ? 1 : 2;
  } catch {
    return 1;
  }
}

// Store out-of-order successes too. A failed earlier lecture must not cause an
// already validated later lecture to be generated (and charged) again.
export async function generateCourseCurriculum({
  plan,
  completedUnits = [],
  partialUnit,
  pendingLectures = {},
  concurrency = 1,
  signal,
  generate,
  onProgress,
}) {
  const slots = plan.units.map((unit, i) =>
    unit.lessons.map(
      (_, j) =>
        completedUnits[i]?.lessons[j] ||
        (partialUnit?.index === i ? partialUnit.unit.lessons[j] : null) ||
        pendingLectures[`${i}:${j}`] ||
        null,
    ),
  );
  const tasks = slots.flatMap((lessons, i) =>
    lessons.flatMap((lesson, j) => (lesson ? [] : [{ i, j }])),
  );
  const progress = () => {
    const completed = [];
    let partial = null;
    const pending = {};
    let contiguous = true;
    slots.forEach((lessons, i) => {
      if (contiguous && lessons.every(Boolean)) {
        completed.push({ ...plan.units[i], lessons: [...lessons] });
        return;
      }
      let prefix = 0;
      if (contiguous) {
        while (lessons[prefix]) prefix++;
        if (prefix)
          partial = {
            index: i,
            unit: { ...plan.units[i], lessons: lessons.slice(0, prefix) },
          };
      }
      lessons.forEach((lesson, j) => {
        if (lesson && (!contiguous || j >= prefix))
          pending[`${i}:${j}`] = lesson;
      });
      contiguous = false;
    });
    return {
      completedUnits: completed,
      partialUnit: partial,
      pendingLectures: pending,
    };
  };
  let next = 0;
  let failure;
  const worker = async () => {
    while (!failure && next < tasks.length) {
      signal?.throwIfAborted();
      const { i, j } = tasks[next++];
      try {
        const lesson = await generate(i, j);
        signal?.throwIfAborted();
        slots[i][j] = { ...lesson, id: `lesson-${i}-${j}` };
        onProgress?.(progress());
      } catch (error) {
        failure ??= error;
      }
    }
  };
  const workers = await Promise.allSettled(
    Array.from(
      { length: Math.min(tasks.length, Math.max(1, Math.min(2, concurrency))) },
      worker,
    ),
  );
  signal?.throwIfAborted();
  if (failure) throw failure;
  const rejected = workers.find((result) => result.status === "rejected");
  if (rejected) throw rejected.reason;
  return progress().completedUnits;
}
