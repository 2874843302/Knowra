import test from "node:test";
import assert from "node:assert/strict";
import {
  FLUSH_SECONDS,
  IDLE_WINDOW_MS,
  addStudySeconds,
  isStudying,
  studiedSeconds,
} from "../src/lib/study-session.js";
import { buildLearningOverview } from "../src/lib/learning-overview.js";

const TODAY = "2026-11-05";
const course = {
  id: "c1",
  title: "人工智能如何工作",
  units: [
    {
      id: "u1",
      lessons: [{ id: "l1", title: "语言如何变成数字" }, { id: "l2", title: "第二讲" }],
    },
  ],
};
const baseState = (extra) => ({
  joined: ["c1"],
  lastCourse: "c1",
  progress: {},
  lessonPlayback: {},
  studyLog: {},
  ...extra,
});

test("hidden pages never accumulate, playing does not need interaction", () => {
  assert.equal(isStudying({ visible: false, playing: true, idleMs: 0 }), false);
  assert.equal(
    isStudying({ visible: true, playing: true, idleMs: IDLE_WINDOW_MS * 9 }),
    true,
  );
});

test("reading mode counts while recent, stops once idle past the window", () => {
  assert.equal(
    isStudying({ visible: true, playing: false, idleMs: IDLE_WINDOW_MS }),
    true,
  );
  assert.equal(
    isStudying({ visible: true, playing: false, idleMs: IDLE_WINDOW_MS + 1 }),
    false,
  );
});

test("study log accumulates per day and keeps other days intact", () => {
  let log = addStudySeconds({}, TODAY, 40);
  log = addStudySeconds(log, TODAY, FLUSH_SECONDS);
  assert.equal(studiedSeconds(log, TODAY), 70);
  log = addStudySeconds(log, "2026-11-06", 60);
  assert.equal(studiedSeconds(log, TODAY), 70);
  assert.equal(studiedSeconds(log, "2026-11-06"), 60);
  assert.equal(addStudySeconds(log, TODAY, 0), log);
});

test("missing days read as zero rather than undefined", () => {
  assert.equal(studiedSeconds(undefined, TODAY), 0);
  assert.equal(studiedSeconds({ [TODAY]: "nope" }, TODAY), 0);
});

test("today goal reports real elapsed minutes instead of completion estimates", () => {
  const overview = buildLearningOverview(
    baseState({ studyLog: { [TODAY]: 13 * 60 + 59 }, dailyGoal: 30 }),
    [course],
    TODAY,
  );
  assert.equal(overview.studiedMinutes, 13);
  assert.equal(overview.goal, 30);
  assert.equal(overview.goalPercent, 43);
});

test("completing a lesson without study time no longer inflates the goal", () => {
  const overview = buildLearningOverview(
    baseState({
      progress: { "c1/l1": { completed: true, date: `${TODAY}T01:00:00.000Z` } },
    }),
    [course],
    TODAY,
  );
  assert.equal(overview.studiedMinutes, 0);
  assert.equal(overview.goalPercent, 0);
});

test("goal falls back to 30 and percentage caps at 100", () => {
  const overview = buildLearningOverview(
    baseState({ studyLog: { [TODAY]: 45 * 60 }, dailyGoal: 0 }),
    [course],
    TODAY,
  );
  assert.equal(overview.goal, 30);
  assert.equal(overview.goalPercent, 100);
});
