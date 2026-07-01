import type { SQLiteDatabase } from 'expo-sqlite';

import { getLocalDateKey } from '@/src/database/habit-repository';

type ActivityDateRow = { completionDate: string };

function parseLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getPreviousLocalDateKey(dateKey: string) {
  const date = parseLocalDateKey(dateKey);
  date.setDate(date.getDate() - 1);
  return getLocalDateKey(date);
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
     )
     WHERE completionDate <= ?
     ORDER BY completionDate DESC`,
    today,
  );

  return getConsecutiveActivityStreak(
    rows.map((row) => row.completionDate),
    today,
  );
}
