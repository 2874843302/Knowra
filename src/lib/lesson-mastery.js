export const masteryLevels = [
  ["mastered", "已掌握"],
  ["proficient", "熟练"],
  ["familiar", "熟悉"],
  ["attempted", "已尝试"],
  ["new", "未开始"],
];
export const masteryDescriptions = {
  mastered: "测验答对，或自评已掌握。",
  proficient: "自评能熟练、独立地应用。",
  familiar: "已完成讲次，尚未通过测验，或自评熟悉。",
  attempted: "已进入学习、复盘简答或测验待巩固，或自评已尝试。",
  new: "尚无学习记录，或自行重设为未开始。",
};
export function mastery(progress = {}) {
  if (masteryLevels.some(([key]) => key === progress.mastery))
    return progress.mastery;
  if (progress.quizCorrect === true) return "mastered";
  if (progress.quizCorrect === false) return "attempted";
  if (progress.completed) return "familiar";
  return progress.visited || progress.quizReviewed ? "attempted" : "new";
}
export function countLessonMastery(lessons, progress, courseId) {
  const counts = Object.fromEntries(masteryLevels.map(([key]) => [key, 0]));
  for (const lesson of lessons)
    counts[mastery(progress[`${courseId}/${lesson.id}`])]++;
  return counts;
}
