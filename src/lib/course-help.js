import { learningContext } from "./learning-mode.js";

// Keep the complete outline and a bounded selection of actual lesson material.
// Relevance is resolved afresh for every question, including a changed unit.
export function courseHelpContext(course, unit, question, lessonId = null) {
  const terms =
    question.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]{2}/g) || [];
  const lessons = course.units.flatMap((u) =>
    u.lessons.map((lesson) => ({ unit: u.title, lesson, current: u === unit })),
  );
  const ranked = lessons
    .filter(({ lesson }) => !lessonId || lesson.id === lessonId)
    .map((entry, index) => {
      const text =
        `${entry.lesson.title} ${entry.lesson.summary} ${(entry.lesson.points || []).join(" ")}`.toLowerCase();
      return {
        ...entry,
        index,
        score:
          terms.reduce((sum, term) => sum + (text.includes(term) ? 3 : 0), 0) +
          (entry.current ? 1 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return JSON.stringify({
    title: course.title,
    ...learningContext(course),
    description: course.description,
    currentUnit: unit?.title || null,
    scope: lessonId ? "lesson" : "course",
    currentLesson: lessonId || null,
    outline: course.units.map((u) => ({
      title: u.title,
      lessons: u.lessons.map((l) => ({
        title: l.title,
        summary: l.summary,
        points: l.points,
      })),
    })),
    material: ranked.slice(0, 3).map(({ unit: title, lesson }) => ({
      unit: title,
      title: lesson.title,
      content: (lesson.content || "").slice(0, 7000),
      narration: (lesson.teaching?.steps || [])
        .map((s) => s.narration)
        .join("\n")
        .slice(0, 3000),
    })),
  });
}
