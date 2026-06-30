import type { SQLiteDatabase } from 'expo-sqlite';

import { getLocalDateKey } from '@/src/database/habit-repository';

export type RecoveryQuestStatus = {
  available: boolean;
  completedToday: boolean;
  lastActiveDate: string | null;
  missedDays: number;
};

type ActivityDateRow = { completionDate: string };

const dayInMs = 24 * 60 * 60 * 1000;

function localDateKeyToUtcMs(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function getMissedDays(previousDateKey: string | null, todayKey: string) {
  if (!previousDateKey) return 0;
  const elapsedDays = Math.round(
    (localDateKeyToUtcMs(todayKey) - localDateKeyToUtcMs(previousDateKey)) / dayInMs,
  );
  return Math.max(0, elapsedDays - 1);
}

export async function getRecoveryQuestStatus(
  db: SQLiteDatabase,
): Promise<RecoveryQuestStatus> {
  const today = getLocalDateKey();
  const rows = await db.getAllAsync<ActivityDateRow>(
    `SELECT DISTINCT completion_date AS completionDate
     FROM habit_completions
     WHERE status = 'complete' AND completion_date <= ?
     ORDER BY completion_date DESC
     LIMIT 2`,
    today,
  );
  const latestDate = rows[0]?.completionDate ?? null;
  const hasActivityToday = latestDate === today;
  const previousActiveDate = hasActivityToday
    ? rows[1]?.completionDate ?? null
    : latestDate;
  const missedDays = getMissedDays(previousActiveDate, today);

  return {
    available: !hasActivityToday && previousActiveDate !== null && missedDays > 0,
    completedToday: hasActivityToday && previousActiveDate !== null && missedDays > 0,
    lastActiveDate: previousActiveDate,
    missedDays,
  };
}
