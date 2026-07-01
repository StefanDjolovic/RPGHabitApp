import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getDayFromDateKey,
  getLocalDateKey,
  type HabitCadence,
} from '@/src/database/habit-repository';

type HabitCompletionDateRow = {
  habitId: number;
  completionDate: string;
};

type HabitScheduleRow = {
  id: number;
  cadence: HabitCadence;
  scheduleDays: string;
  startDate: string;
};

export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function getWeekStartFromDateKey(dateKey: string) {
  const daysSinceMonday = (getDayFromDateKey(dateKey) + 6) % 7;
  return addDaysToDateKey(dateKey, -daysSinceMonday);
}

function parseScheduleDays(value: string | number[]) {
  const days = Array.isArray(value) ? value : value.split(',').map(Number);
  return new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
}

function getDailyStreak(
  completedDates: Set<string>,
  scheduleDays: Set<number>,
  startDate: string,
  today: string,
) {
  let cursor = today;

  if (scheduleDays.has(getDayFromDateKey(cursor)) && !completedDates.has(cursor)) {
    cursor = addDaysToDateKey(cursor, -1);
  }
  while (cursor >= startDate && !scheduleDays.has(getDayFromDateKey(cursor))) {
    cursor = addDaysToDateKey(cursor, -1);
  }

  let streak = 0;
  while (cursor >= startDate) {
    if (!completedDates.has(cursor)) break;
    streak += 1;
    do {
      cursor = addDaysToDateKey(cursor, -1);
    } while (cursor >= startDate && !scheduleDays.has(getDayFromDateKey(cursor)));
  }
  return streak;
}

function getWeeklyStreak(completedDates: Set<string>, startDate: string, today: string) {
  const completedWeeks = new Set([...completedDates].map(getWeekStartFromDateKey));
  const startWeek = getWeekStartFromDateKey(startDate);
  let cursor = getWeekStartFromDateKey(today);
  if (!completedWeeks.has(cursor)) cursor = addDaysToDateKey(cursor, -7);

  let streak = 0;
  while (cursor >= startWeek && completedWeeks.has(cursor)) {
    streak += 1;
    cursor = addDaysToDateKey(cursor, -7);
  }
  return streak;
}

export function getScheduledHabitStreak(
  completedDateKeys: string[],
  cadence: HabitCadence,
  scheduleDays: string | number[],
  startDate: string,
  today = getLocalDateKey(),
) {
  const completedDates = new Set(completedDateKeys.filter((dateKey) => dateKey <= today));
  if (cadence === 'one-time') return completedDates.size > 0 ? 1 : 0;
  if (cadence === 'weekly') return getWeeklyStreak(completedDates, startDate, today);
  return getDailyStreak(completedDates, parseScheduleDays(scheduleDays), startDate, today);
}

export function getConsecutiveHabitStreak(
  completedDateKeys: string[],
  todayKey = getLocalDateKey(),
) {
  return getScheduledHabitStreak(
    completedDateKeys,
    'daily',
    [0, 1, 2, 3, 4, 5, 6],
    '1970-01-01',
    todayKey,
  );
}

export async function getHabitStreaksById(db: SQLiteDatabase) {
  const today = getLocalDateKey();
  const [habits, rows] = await Promise.all([
    db.getAllAsync<HabitScheduleRow>(
      `SELECT
         id,
         habit_type AS cadence,
         schedule_days AS scheduleDays,
         start_date AS startDate
       FROM habits`,
    ),
    db.getAllAsync<HabitCompletionDateRow>(
      `SELECT habit_id AS habitId, completion_date AS completionDate
       FROM habit_completions
       WHERE status = 'complete' AND completion_date <= ?
       ORDER BY habit_id ASC, completion_date DESC`,
      today,
    ),
  ]);
  const completionsByHabit = new Map<number, string[]>();

  for (const row of rows) {
    const dates = completionsByHabit.get(row.habitId) ?? [];
    dates.push(row.completionDate);
    completionsByHabit.set(row.habitId, dates);
  }

  return new Map(
    habits.map((habit) => [
      habit.id,
      getScheduledHabitStreak(
        completionsByHabit.get(habit.id) ?? [],
        habit.cadence,
        habit.scheduleDays,
        habit.startDate,
        today,
      ),
    ]),
  );
}
