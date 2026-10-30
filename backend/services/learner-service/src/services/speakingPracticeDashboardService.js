import pool from "../config/db.js";
import { countPracticeDays } from "../utils/practiceDayCounts.js";
import { createPracticeActivityReader } from '../utils/practiceActivityRead.js';

const activityReader=createPracticeActivityReader(pool);

const DAY_MS = 86_400_000;
const TIME_ZONE = "Asia/Ho_Chi_Minh";
const unassessed = {
  assessment_status: "not_assessed",
  assessment_reason: "score_provenance_unavailable"
};

function dayKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

function weekWindow(now = new Date()) {
  const todayKey = dayKey(now);
  const weekday = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const elapsedDays = weekday === 0 ? 7 : weekday;
  const start = new Date(new Date(`${todayKey}T00:00:00+07:00`).getTime() - (elapsedDays - 1) * DAY_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS), elapsedDays };
}

// A calendar of actual practice activity. Unverified scores are never converted
// into zeroes or combined across speaking practice and scenario assessments.
export async function getRecentActivities(learnerId, limit = 10) {
  const now = new Date();
  const { start,end } = weekWindow(now);
  const result = await activityReader.dailyCounts(learnerId,start,end,now);
  const activityByDay = new Map(result.rows.map(row => [row.practice_day, Number(row.total_sessions)]));
  const today = dayKey(now);
  return Array.from({ length: 7 }, (_, index) => {
    const key = dayKey(new Date(start.getTime() + (6 - index) * DAY_MS));
    return {
      practice_day: key,
      total_sessions: activityByDay.get(key) || 0,
      max_score: null,
      is_future: key > today,
      ...unassessed
    };
  });
}

// practice_history contains neither assessment provenance nor a common scoring
// rubric. Its raw averages cannot establish a defensible competition ranking.
export async function getTopRatings(limit = 10) {
  return [];
}

export async function getCurrentCompetitionScore(learnerId) {
  const now = new Date();
  const { start, elapsedDays } = weekWindow(now);
  const practicedDays = await countPracticeDays(pool, [learnerId], start, now);
  return {
    total_days: practicedDays.get(Number(learnerId)) || 0,
    elapsed_days: elapsedDays,
    total_score: null,
    average_score: null,
    rank: null,
    daily_scores: Array.from({ length: elapsedDays }, (_, index) => ({
      day: dayKey(new Date(start.getTime() + index * DAY_MS)),
      max_score: null,
      ...unassessed
    })),
    ...unassessed
  };
}

export async function getWeeklyHistory(learnerId, offsetWeeks = 0, limitWeeks = 1) {
  const now = new Date();
  const { start } = weekWindow(now);
  const targetStart = new Date(start.getTime() - offsetWeeks * 7 * DAY_MS);
  const targetEnd = new Date(targetStart.getTime() + 7 * DAY_MS);
  const result = await activityReader.history(learnerId,targetStart,targetEnd,now);

  if (!result.rows.length) return [];
  return [{
    week_start: dayKey(targetStart),
    total_sessions: result.rows.length,
    average_score: null,
    ...unassessed,
    activities: result.rows.map(row => ({
      ...row,
      total_score: null,
      average_score: null,
      ...unassessed
    }))
  }].slice(0, limitWeeks);
}

