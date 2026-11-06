import { lessonsOf, progressOf } from "../data.js";
import { studiedSeconds } from "./study-session.js";

const DAY = 86400000;
const REVIEW_INTERVALS = {
  shaky: [1, 3, 7],
  steady: [3, 7, 14],
};

function wrongAnswers(state, courseId, lessonId) {
  const saved = state.lessonPlayback?.[`${courseId}/${lessonId}`];
  const answers = saved?.answers;
  if (answers && typeof answers === "object")
    if (Object.values(answers).some((answer) => answer?.correct === false))
      return true;
  return state.progress?.[`${courseId}/${lessonId}`]?.quizCorrect === false;
}

export function dueReviews(state, courses) {
  const now = Date.now();
  const due = [];
  for (const course of courses) {
    if (!state.joined.includes(course.id)) continue;
    for (const lesson of lessonsOf(course)) {
      const key = `${course.id}/${lesson.id}`;
      const progress = state.progress?.[key];
      if (!progress?.completed) continue;
      const shaky = wrongAnswers(state, course.id, lesson.id);
      const intervals = shaky ? REVIEW_INTERVALS.shaky : REVIEW_INTERVALS.steady;
      const reviewed = progress.reviewCount || 0;
      if (reviewed >= intervals.length) continue;
      const anchor = progress.reviewedAt || progress.date;
      if (!anchor) continue;
      const dueAt = new Date(anchor).getTime() + intervals[reviewed] * DAY;
      if (dueAt > now) continue;
      due.push({
        course,
        lesson,
        key,
        shaky,
        daysAgo: Math.max(0, Math.floor((now - dueAt) / DAY)),
      });
    }
  }
  return due
    .sort((a, b) => b.daysAgo - a.daysAgo)
    .slice(0, 6);
}

export function buildLearningOverview(state, courses, today) {
  const joined = courses.filter((course) => state.joined.includes(course.id));
  const current =
    joined.find((course) => course.id === state.lastCourse) || joined[0];
  const lessons = current ? lessonsOf(current) : [];
  const nextLesson =
    lessons.find(
      (lesson) => !state.progress?.[`${current.id}/${lesson.id}`]?.completed,
    ) || lessons[0];
  const completedCount = lessons.filter(
    (lesson) => state.progress?.[`${current.id}/${lesson.id}`]?.completed,
  ).length;
  const studiedMinutes = Math.floor(studiedSeconds(state.studyLog, today) / 60);
  const goal = Math.max(5, Number(state.dailyGoal) || 30);
  const reviews = dueReviews(state, courses);
  return {
    current,
    nextLesson,
    progress: current ? progressOf(current, state.progress) : 0,
    remaining: Math.max(0, lessons.length - completedCount),
    minutesRemaining: Math.max(0, lessons.length - completedCount) * 15,
    studiedMinutes,
    goal,
    goalPercent: Math.min(100, Math.round((studiedMinutes / goal) * 100)),
    reviews,
  };
}