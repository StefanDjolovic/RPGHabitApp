import type { SQLiteDatabase } from 'expo-sqlite';

import { getLocalDateKey } from '@/src/database/habit-repository';

type HabitCompletionDateRow = {
  habitId: number;
  completionDate: string;
};

function parseLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getPreviousLocalDateKey(dateKey: string) {
  const date = parseLocalDateKey(dateKey);
  date.setDate(date.getDate() - 1);
  return getLocalDateKey(date);
}

export function getConsecutiveHabitStreak(
  completedDateKeys: string[],
  todayKey = getLocalDateKey(),
) {
  const completedDates = new Set(completedDateKeys);
  let streak = 0;
  let currentDateKey = completedDates.has(todayKey)
    ? todayKey
    : getPreviousLocalDateKey(todayKey);

  while (completedDates.has(currentDateKey)) {
    streak += 1;
    currentDateKey = getPreviousLocalDateKey(currentDateKey);
  }

  return streak;
}

export async function getHabitStreaksById(db: SQLiteDatabase) {
  const today = getLocalDateKey();
  const rows = await db.getAllAsync<HabitCompletionDateRow>(
    `SELECT habit_id AS habitId, completion_date AS completionDate
     FROM habit_completions
     WHERE status = 'complete' AND completion_date <= ?
     ORDER BY habit_id ASC, completion_date DESC`,
    today,
  );
  const completionsByHabit = new Map<number, string[]>();

  for (const row of rows) {
    const dates = completionsByHabit.get(row.habitId) ?? [];
    dates.push(row.completionDate);
    completionsByHabit.set(row.habitId, dates);
  }

  const streaksByHabit = new Map<number, number>();
  for (const [habitId, completionDates] of completionsByHabit) {
    streaksByHabit.set(habitId, getConsecutiveHabitStreak(completionDates, today));
  }

  return streaksByHabit;
}
