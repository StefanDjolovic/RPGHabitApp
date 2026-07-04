import type { SQLiteDatabase } from 'expo-sqlite';

import { getLocalDateKey } from '@/src/database/habit-repository';

type ActivityDateRow = { completionDate: string };

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getPreviousLocalDateKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function getActivityDateKeys(db: SQLiteDatabase, throughDateKey: string) {
  const rows = await db.getAllAsync<ActivityDateRow>(
    `SELECT DISTINCT completionDate
     FROM (
       SELECT completion_date AS completionDate
       FROM habit_completions
       WHERE status = 'complete'
       UNION ALL
       SELECT event_date AS completionDate
       FROM boss_quest_reward_events
       WHERE reason = 'milestone'
       UNION ALL
       SELECT event_date AS completionDate
       FROM recovery_quest_events
     )
     WHERE completionDate <= ?
     ORDER BY completionDate DESC`,
    throughDateKey,
  );

  return rows.map((row) => row.completionDate);
}

export function getConsecutiveActivityStreak(activeDateKeys: string[], todayKey = getLocalDateKey()) {
  const activeDates = new Set(activeDateKeys);
  let streak = 0;
  let currentDateKey = todayKey;

  while (activeDates.has(currentDateKey)) {
    streak += 1;
    currentDateKey = getPreviousLocalDateKey(currentDateKey);
  }

  return streak;
}

export async function getActivityStreak(db: SQLiteDatabase) {
  const today = getLocalDateKey();
  return getConsecutiveActivityStreak(await getActivityDateKeys(db, today), today);
}

export async function isActivityStreakAtRisk(db: SQLiteDatabase) {
  const today = getLocalDateKey();
  const activityDateKeys = await getActivityDateKeys(db, today);
  if (activityDateKeys.includes(today)) return false;

  const yesterday = getPreviousLocalDateKey(today);
  return getConsecutiveActivityStreak(activityDateKeys, yesterday) > 0;
}
