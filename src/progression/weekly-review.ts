import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getDayFromDateKey,
  getLocalDateKey,
  type HabitAttribute,
  type HabitCadence,
} from '@/src/database/habit-repository';
import { getHabitInsights } from '@/src/progression/habit-insights';
import {
  addDaysToDateKey,
  getWeekStartFromDateKey,
} from '@/src/progression/habit-streak';

export type WeeklySuggestionType = 'start-small' | 'ease' | 'move' | 'pause' | 'maintain';

export type WeeklyHabitReview = {
  id: number;
  title: string;
  attribute: HabitAttribute;
  cadence: HabitCadence;
  completed: number;
  planned: number;
  rate: number;
  previousCompleted: number;
  previousPlanned: number;
  previousRate: number;
  totalCompletions: number;
};

export type WeeklyReview = {
  weekStart: string;
  weekEnd: string;
  completed: number;
  planned: number;
  rate: number;
  previousRate: number;
  xpEarned: number;
  strongestHabit: WeeklyHabitReview | null;
  focusHabit: WeeklyHabitReview | null;
  suggestionType: WeeklySuggestionType;
  suggestion: string;
  smallGoal: string;
  habits: WeeklyHabitReview[];
};

type HabitRow = {
  id: number;
  title: string;
  attribute: HabitAttribute;
  cadence: HabitCadence;
  scheduleDays: string;
  startDate: string;
  targetCount: number;
};
type CompletionRow = { habitId: number; completionDate: string };
type WeeklyCheckInRow = { habitId: number; weekStart: string; count: number };
type TotalRow = { total: number };

type PeriodProgress = { completed: number; planned: number; rate: number };

function getDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDaysToDateKey(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

export function getWeeklyRoutineProgress(
  habit: Pick<HabitRow, 'cadence' | 'scheduleDays' | 'startDate' | 'targetCount'>,
  completionDates: string[],
  weeklyCheckIns: number,
  periodStart: string,
  periodEnd: string,
): PeriodProgress {
  if (habit.cadence === 'one-time' || habit.startDate > periodEnd) {
    return { completed: 0, planned: 0, rate: 0 };
  }

  if (habit.cadence === 'weekly') {
    const planned = Math.max(1, habit.targetCount);
    const completed = Math.min(planned, Math.max(0, weeklyCheckIns));
    return { completed, planned, rate: completed / planned };
  }

  const startDate = habit.startDate > periodStart ? habit.startDate : periodStart;
  const scheduleDays = new Set(habit.scheduleDays.split(',').map(Number));
  const plannedDates = getDateRange(startDate, periodEnd).filter((dateKey) =>
    scheduleDays.has(getDayFromDateKey(dateKey)),
  );
  const completedDateSet = new Set(completionDates);
  const completed = plannedDates.filter((dateKey) => completedDateSet.has(dateKey)).length;
  const planned = plannedDates.length;
  return { completed, planned, rate: planned > 0 ? completed / planned : 0 };
}

function getSuggestion(
  focusHabit: WeeklyHabitReview | null,
  focusStartDate: string | null,
  weekStart: string,
) {
  if (!focusHabit) {
    return {
      type: 'maintain' as const,
      suggestion: 'No routine needs adjustment this week.',
      smallGoal: 'Keep one realistic quest on the schedule.',
    };
  }

  const nextGoal = Math.min(focusHabit.planned, Math.max(1, focusHabit.completed + 1));
  const smallGoal = `Aim for ${nextGoal} ${focusHabit.title} ${
    nextGoal === 1 ? 'clear' : 'clears'
  } next week.`;

  if (focusStartDate && focusStartDate >= addDaysToDateKey(weekStart, -7)) {
    return {
      type: 'start-small' as const,
      suggestion: 'This routine is new. Give it one full week before changing the plan.',
      smallGoal,
    };
  }
  if (
    focusHabit.completed === 0 &&
    focusHabit.previousRate === 0 &&
    focusHabit.totalCompletions === 0
  ) {
    return {
      type: 'pause' as const,
      suggestion: 'Check whether this quest still fits. Pausing it is a valid reset.',
      smallGoal,
    };
  }
  if (focusHabit.previousRate - focusHabit.rate >= 0.2) {
    return {
      type: 'move' as const,
      suggestion: 'The rhythm changed this week. Try moving its reminder or scheduled days.',
      smallGoal,
    };
  }
  if (focusHabit.rate < 0.6) {
    return {
      type: 'ease' as const,
      suggestion: 'Make this quest lighter for one week by reducing its scheduled days or target.',
      smallGoal,
    };
  }
  return {
    type: 'maintain' as const,
    suggestion: 'This routine is stable. Keep the same plan for another week.',
    smallGoal,
  };
}

export async function getWeeklyReview(db: SQLiteDatabase): Promise<WeeklyReview> {
  const today = getLocalDateKey();
  const weekStart = getWeekStartFromDateKey(today);
  const previousWeekStart = addDaysToDateKey(weekStart, -7);
  const previousWeekEnd = addDaysToDateKey(weekStart, -1);
  const [habits, completions, checkIns, insights, xpRow] = await Promise.all([
    db.getAllAsync<HabitRow>(
      `SELECT
         id,
         title,
         attribute,
         habit_type AS cadence,
         schedule_days AS scheduleDays,
         start_date AS startDate,
         target_count AS targetCount
       FROM habits
       WHERE is_active = 1 AND is_paused = 0
       ORDER BY created_at ASC, id ASC`,
    ),
    db.getAllAsync<CompletionRow>(
      `SELECT habit_id AS habitId, completion_date AS completionDate
       FROM habit_completions
       WHERE status = 'complete' AND completion_date BETWEEN ? AND ?`,
      previousWeekStart,
      today,
    ),
    db.getAllAsync<WeeklyCheckInRow>(
      `SELECT habit_id AS habitId, week_start AS weekStart, COUNT(*) AS count
       FROM habit_weekly_checkins
       WHERE week_start IN (?, ?)
       GROUP BY habit_id, week_start`,
      previousWeekStart,
      weekStart,
    ),
    getHabitInsights(db),
    db.getFirstAsync<TotalRow>(
      `SELECT
         COALESCE((
           SELECT SUM(xe.amount)
           FROM xp_events xe
           JOIN habit_completions hc ON hc.id = xe.completion_id
           WHERE hc.completion_date BETWEEN ? AND ?
         ), 0) +
         COALESCE((
           SELECT SUM(xp_amount)
           FROM boss_quest_reward_events
           WHERE event_date BETWEEN ? AND ?
         ), 0) +
         COALESCE((
           SELECT SUM(xp_amount)
           FROM recovery_quest_events
           WHERE event_date BETWEEN ? AND ?
         ), 0) AS total`,
      weekStart,
      today,
      weekStart,
      today,
      weekStart,
      today,
    ),
  ]);
  const completionsByHabit = new Map<number, string[]>();
  const checkInsByHabitAndWeek = new Map<string, number>();
  const insightsById = new Map(insights.map((insight) => [insight.id, insight]));

  for (const completion of completions) {
    const dates = completionsByHabit.get(completion.habitId) ?? [];
    dates.push(completion.completionDate);
    completionsByHabit.set(completion.habitId, dates);
  }
  for (const checkIn of checkIns) {
    checkInsByHabitAndWeek.set(`${checkIn.habitId}-${checkIn.weekStart}`, checkIn.count);
  }

  const habitStartDates = new Map(habits.map((habit) => [habit.id, habit.startDate]));
  const reviews = habits
    .filter((habit) => habit.cadence !== 'one-time')
    .map<WeeklyHabitReview>((habit) => {
      const completionDates = completionsByHabit.get(habit.id) ?? [];
      const current = getWeeklyRoutineProgress(
        habit,
        completionDates,
        checkInsByHabitAndWeek.get(`${habit.id}-${weekStart}`) ?? 0,
        weekStart,
        today,
      );
      const previous = getWeeklyRoutineProgress(
        habit,
        completionDates,
        checkInsByHabitAndWeek.get(`${habit.id}-${previousWeekStart}`) ?? 0,
        previousWeekStart,
        previousWeekEnd,
      );

      return {
        id: habit.id,
        title: habit.title,
        attribute: habit.attribute,
        cadence: habit.cadence,
        completed: current.completed,
        planned: current.planned,
        rate: current.rate,
        previousCompleted: previous.completed,
        previousPlanned: previous.planned,
        previousRate: previous.rate,
        totalCompletions: insightsById.get(habit.id)?.totalCompletions ?? 0,
      };
    });
  const completed = reviews.reduce((total, habit) => total + habit.completed, 0);
  const planned = reviews.reduce((total, habit) => total + habit.planned, 0);
  const previousCompleted = reviews.reduce(
    (total, habit) => total + habit.previousCompleted,
    0,
  );
  const previousPlanned = reviews.reduce((total, habit) => total + habit.previousPlanned, 0);
  const strongestHabit =
    [...reviews]
      .filter((habit) => habit.planned > 0 && habit.completed > 0)
      .sort((first, second) =>
        second.rate - first.rate ||
        second.totalCompletions - first.totalCompletions ||
        first.title.localeCompare(second.title),
      )[0] ?? null;
  const focusHabit =
    [...reviews]
      .filter((habit) => habit.planned > 0)
      .sort((first, second) =>
        first.rate - second.rate ||
        first.totalCompletions - second.totalCompletions ||
        first.title.localeCompare(second.title),
      )[0] ?? null;
  const suggestion = getSuggestion(
    focusHabit,
    focusHabit ? habitStartDates.get(focusHabit.id) ?? null : null,
    weekStart,
  );

  return {
    weekStart,
    weekEnd: today,
    completed,
    planned,
    rate: planned > 0 ? completed / planned : 0,
    previousRate: previousPlanned > 0 ? previousCompleted / previousPlanned : 0,
    xpEarned: Math.max(0, xpRow?.total ?? 0),
    strongestHabit,
    focusHabit,
    suggestionType: suggestion.type,
    suggestion: suggestion.suggestion,
    smallGoal: suggestion.smallGoal,
    habits: reviews,
  };
}
