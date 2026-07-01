import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getDayFromDateKey,
  getLocalDateKey,
  type HabitAttribute,
  type HabitCadence,
} from '@/src/database/habit-repository';
import {
  addDaysToDateKey,
  getHabitStreaksById,
  getWeekStartFromDateKey,
} from '@/src/progression/habit-streak';

export type HabitTrend = 'up' | 'steady' | 'down';

export type HabitInsight = {
  id: number;
  title: string;
  attribute: HabitAttribute;
  cadence: HabitCadence;
  successRate: number;
  currentStreak: number;
  totalCompletions: number;
  attributeXp: number;
  trend: HabitTrend;
};

type HabitInsightRow = {
  id: number;
  title: string;
  attribute: HabitAttribute;
  cadence: HabitCadence;
  scheduleDays: string;
  startDate: string;
};

type CompletionRow = { habitId: number; completionDate: string };
type AttributeXpRow = { habitId: number; attributeXp: number };

function getDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDaysToDateKey(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function getPeriodRate(
  cadence: HabitCadence,
  scheduleDaysValue: string,
  habitStartDate: string,
  completedDateKeys: string[],
  periodStart: string,
  periodEnd: string,
) {
  const startDate = habitStartDate > periodStart ? habitStartDate : periodStart;
  if (startDate > periodEnd) return { completed: 0, opportunities: 0, rate: 0 };
  const completedDates = new Set(completedDateKeys);

  if (cadence === 'one-time') {
    const completed = completedDateKeys.some((dateKey) => dateKey <= periodEnd) ? 1 : 0;
    return { completed, opportunities: 1, rate: completed };
  }

  if (cadence === 'weekly') {
    const opportunityWeeks = new Set(
      getDateRange(startDate, periodEnd).map(getWeekStartFromDateKey),
    );
    const completedWeeks = new Set(
      completedDateKeys
        .filter((dateKey) => dateKey <= periodEnd)
        .map(getWeekStartFromDateKey),
    );
    const completed = [...opportunityWeeks].filter((week) => completedWeeks.has(week)).length;
    const opportunities = opportunityWeeks.size;
    return {
      completed,
      opportunities,
      rate: opportunities > 0 ? completed / opportunities : 0,
    };
  }

  const scheduleDays = new Set(scheduleDaysValue.split(',').map(Number));
  const opportunities = getDateRange(startDate, periodEnd).filter((dateKey) =>
    scheduleDays.has(getDayFromDateKey(dateKey)),
  );
  const completed = opportunities.filter((dateKey) => completedDates.has(dateKey)).length;
  return {
    completed,
    opportunities: opportunities.length,
    rate: opportunities.length > 0 ? completed / opportunities.length : 0,
  };
}

function getTrend(currentRate: number, previousRate: number, currentCompleted: number) {
  if (currentRate - previousRate >= 0.1) return 'up' as const;
  if (previousRate - currentRate >= 0.1) return 'down' as const;
  if (currentCompleted > 0 && previousRate === 0) return 'up' as const;
  return 'steady' as const;
}

export async function getHabitInsights(db: SQLiteDatabase): Promise<HabitInsight[]> {
  const today = getLocalDateKey();
  const currentPeriodStart = addDaysToDateKey(today, -6);
  const previousPeriodStart = addDaysToDateKey(today, -13);
  const previousPeriodEnd = addDaysToDateKey(today, -7);
  const insightPeriodStart = addDaysToDateKey(today, -27);
  const [habits, completions, attributeXpRows, streaksById] = await Promise.all([
    db.getAllAsync<HabitInsightRow>(
      `SELECT
         id,
         title,
         attribute,
         habit_type AS cadence,
         schedule_days AS scheduleDays,
         start_date AS startDate
       FROM habits
       WHERE is_active = 1 AND is_paused = 0
       ORDER BY created_at ASC, id ASC`,
    ),
    db.getAllAsync<CompletionRow>(
      `SELECT habit_id AS habitId, completion_date AS completionDate
       FROM habit_completions
       WHERE status = 'complete' AND completion_date <= ?`,
      today,
    ),
    db.getAllAsync<AttributeXpRow>(
      `SELECT hc.habit_id AS habitId, COALESCE(SUM(ae.amount), 0) AS attributeXp
       FROM attribute_events ae
       JOIN habit_completions hc ON hc.id = ae.completion_id
       GROUP BY hc.habit_id`,
    ),
    getHabitStreaksById(db),
  ]);
  const completionsByHabit = new Map<number, string[]>();
  const attributeXpByHabit = new Map(
    attributeXpRows.map((row) => [row.habitId, Math.max(0, row.attributeXp)]),
  );

  for (const completion of completions) {
    const dates = completionsByHabit.get(completion.habitId) ?? [];
    dates.push(completion.completionDate);
    completionsByHabit.set(completion.habitId, dates);
  }

  return habits.map((habit) => {
    const completionDates = completionsByHabit.get(habit.id) ?? [];
    const insightPeriod = getPeriodRate(
      habit.cadence,
      habit.scheduleDays,
      habit.startDate,
      completionDates,
      insightPeriodStart,
      today,
    );
    const currentPeriod = getPeriodRate(
      habit.cadence,
      habit.scheduleDays,
      habit.startDate,
      completionDates,
      currentPeriodStart,
      today,
    );
    const previousPeriod = getPeriodRate(
      habit.cadence,
      habit.scheduleDays,
      habit.startDate,
      completionDates,
      previousPeriodStart,
      previousPeriodEnd,
    );

    return {
      id: habit.id,
      title: habit.title,
      attribute: habit.attribute,
      cadence: habit.cadence,
      successRate: insightPeriod.rate,
      currentStreak: streaksById.get(habit.id) ?? 0,
      totalCompletions: completionDates.length,
      attributeXp: attributeXpByHabit.get(habit.id) ?? 0,
      trend: getTrend(currentPeriod.rate, previousPeriod.rate, currentPeriod.completed),
    };
  });
}
