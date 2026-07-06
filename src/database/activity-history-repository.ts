import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  ActivitySummaryDay,
  HabitAttribute,
  HabitDifficulty,
} from '@/src/database/habit-repository';

export type LifetimeHabitHistory = {
  firstDate: string | null;
  activeDays: number;
  totalCompletions: number;
  totalXp: number;
  totalStatXp: number;
  totalEnergy: number;
};

export type HabitHistoryEntry = {
  completionId: number;
  habitId: number;
  dateKey: string;
  title: string;
  difficulty: HabitDifficulty;
  attribute: HabitAttribute;
  xpEarned: number;
  statXpEarned: number;
  energyEarned: number;
};

export type HabitHistoryMonth = {
  monthKey: string;
  days: ActivitySummaryDay[];
  entries: HabitHistoryEntry[];
  activeDays: number;
  totalCompletions: number;
  totalXp: number;
  totalStatXp: number;
  totalEnergy: number;
};

export type HabitHistoryFilter = {
  habitId: number;
  title: string;
  totalCompletions: number;
};

export type HabitHistoryYearMonth = {
  monthKey: string;
  activeDays: number;
  totalCompletions: number;
};

export type HabitHistoryTopHabit = {
  habitId: number;
  title: string;
  totalCompletions: number;
};

export type HabitHistoryYear = {
  year: number;
  days: ActivitySummaryDay[];
  months: HabitHistoryYearMonth[];
  activeDays: number;
  totalCompletions: number;
  totalXp: number;
  totalStatXp: number;
  totalEnergy: number;
  activeDayRate: number;
  longestStreak: number;
  bestMonthKey: string | null;
  bestWeekday: string | null;
  topHabits: HabitHistoryTopHabit[];
};

type LifetimeRow = {
  firstDate: string | null;
  activeDays: number;
  totalCompletions: number;
  totalXp: number;
  totalStatXp: number;
  totalEnergy: number;
};

type HistoryEntryRow = HabitHistoryEntry;
type TopHabitRow = HabitHistoryTopHabit;

function getMonthRange(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error('Invalid history month.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error('Invalid history month.');

  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = new Date(Date.UTC(year, month, 1));
  const end = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { start, end };
}

function getYearRange(year: number) {
  const safeYear = Math.floor(year);
  if (safeYear < 1970 || safeYear > 9999) throw new Error('Invalid history year.');
  return {
    start: `${safeYear}-01-01`,
    end: `${safeYear + 1}-01-01`,
  };
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getLongestDayStreak(days: ActivitySummaryDay[]) {
  let longest = 0;
  let current = 0;
  let previous: Date | null = null;

  for (const day of days) {
    const date = parseDateKey(day.dateKey);
    const gap = previous ? Math.round((date.getTime() - previous.getTime()) / 86_400_000) : 0;
    current = previous && gap === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

export async function getLifetimeHabitHistory(
  db: SQLiteDatabase,
  habitId: number | null = null,
): Promise<LifetimeHabitHistory> {
  const habitFilter = habitId === null ? '' : 'AND hc.habit_id = ?';
  const row = await db.getFirstAsync<LifetimeRow>(
    `SELECT
       MIN(hc.completion_date) AS firstDate,
       COUNT(DISTINCT hc.completion_date) AS activeDays,
       COUNT(*) AS totalCompletions,
       COALESCE(SUM(xp.total), 0) AS totalXp,
       COALESCE(SUM(attribute.total), 0) AS totalStatXp,
       COALESCE(SUM(energy.total), 0) AS totalEnergy
     FROM habit_completions hc
     LEFT JOIN (
       SELECT completion_id, SUM(amount) AS total
       FROM xp_events
       GROUP BY completion_id
     ) xp ON xp.completion_id = hc.id
     LEFT JOIN (
       SELECT completion_id, SUM(amount) AS total
       FROM attribute_events
       GROUP BY completion_id
     ) attribute ON attribute.completion_id = hc.id
     LEFT JOIN (
       SELECT completion_id, SUM(amount) AS total
       FROM energy_events
       GROUP BY completion_id
     ) energy ON energy.completion_id = hc.id
     WHERE hc.status = 'complete'
       ${habitFilter}`,
    ...(habitId === null ? [] : [habitId]),
  );

  return {
    firstDate: row?.firstDate ?? null,
    activeDays: row?.activeDays ?? 0,
    totalCompletions: row?.totalCompletions ?? 0,
    totalXp: row?.totalXp ?? 0,
    totalStatXp: row?.totalStatXp ?? 0,
    totalEnergy: row?.totalEnergy ?? 0,
  };
}

export async function getHabitHistoryMonth(
  db: SQLiteDatabase,
  monthKey: string,
  habitId: number | null = null,
): Promise<HabitHistoryMonth> {
  const { start, end } = getMonthRange(monthKey);
  const habitFilter = habitId === null ? '' : 'AND hc.habit_id = ?';
  const parameters = habitId === null ? [start, end] : [start, end, habitId];
  const [days, entries] = await Promise.all([
    db.getAllAsync<ActivitySummaryDay>(
      `SELECT
         hc.completion_date AS dateKey,
         COUNT(*) AS completedCount,
         COALESCE(SUM(xp.total), 0) AS xpEarned,
         COALESCE(SUM(attribute.total), 0) AS statXpEarned,
         COALESCE(SUM(energy.total), 0) AS energyEarned
       FROM habit_completions hc
       LEFT JOIN (
         SELECT completion_id, SUM(amount) AS total
         FROM xp_events
         GROUP BY completion_id
       ) xp ON xp.completion_id = hc.id
       LEFT JOIN (
         SELECT completion_id, SUM(amount) AS total
         FROM attribute_events
         GROUP BY completion_id
       ) attribute ON attribute.completion_id = hc.id
       LEFT JOIN (
         SELECT completion_id, SUM(amount) AS total
         FROM energy_events
         GROUP BY completion_id
       ) energy ON energy.completion_id = hc.id
       WHERE hc.status = 'complete'
         AND hc.completion_date >= ?
         AND hc.completion_date < ?
         ${habitFilter}
       GROUP BY hc.completion_date
       ORDER BY hc.completion_date ASC`,
      ...parameters,
    ),
    db.getAllAsync<HistoryEntryRow>(
      `SELECT
         hc.id AS completionId,
         hc.habit_id AS habitId,
         hc.completion_date AS dateKey,
         COALESCE(hc.habit_title, h.title) AS title,
         COALESCE(hc.habit_difficulty, h.difficulty) AS difficulty,
         COALESCE(hc.habit_attribute, h.attribute) AS attribute,
         COALESCE(xp.total, 0) AS xpEarned,
         COALESCE(attribute.total, 0) AS statXpEarned,
         COALESCE(energy.total, 0) AS energyEarned
       FROM habit_completions hc
       JOIN habits h ON h.id = hc.habit_id
       LEFT JOIN (
         SELECT completion_id, SUM(amount) AS total
         FROM xp_events
         GROUP BY completion_id
       ) xp ON xp.completion_id = hc.id
       LEFT JOIN (
         SELECT completion_id, SUM(amount) AS total
         FROM attribute_events
         GROUP BY completion_id
       ) attribute ON attribute.completion_id = hc.id
       LEFT JOIN (
         SELECT completion_id, SUM(amount) AS total
         FROM energy_events
         GROUP BY completion_id
       ) energy ON energy.completion_id = hc.id
       WHERE hc.status = 'complete'
         AND hc.completion_date >= ?
         AND hc.completion_date < ?
         ${habitFilter}
       ORDER BY hc.completion_date DESC, hc.id DESC`,
      ...parameters,
    ),
  ]);

  return {
    monthKey,
    days,
    entries,
    activeDays: days.length,
    totalCompletions: days.reduce((total, day) => total + day.completedCount, 0),
    totalXp: days.reduce((total, day) => total + day.xpEarned, 0),
    totalStatXp: days.reduce((total, day) => total + day.statXpEarned, 0),
    totalEnergy: days.reduce((total, day) => total + day.energyEarned, 0),
  };
}

export async function getHabitHistoryFilters(db: SQLiteDatabase): Promise<HabitHistoryFilter[]> {
  return db.getAllAsync<HabitHistoryFilter>(
    `SELECT
       h.id AS habitId,
       h.title,
       COUNT(CASE WHEN hc.status = 'complete' THEN 1 END) AS totalCompletions
     FROM habits h
     LEFT JOIN habit_completions hc ON hc.habit_id = h.id
     GROUP BY h.id, h.title, h.deleted_at
     HAVING h.deleted_at IS NULL OR COUNT(CASE WHEN hc.status = 'complete' THEN 1 END) > 0
     ORDER BY totalCompletions DESC, h.title COLLATE NOCASE ASC`,
  );
}

export async function getHabitHistoryYear(
  db: SQLiteDatabase,
  year: number,
  todayKey: string,
  habitId: number | null = null,
): Promise<HabitHistoryYear> {
  const { start, end } = getYearRange(year);
  const habitFilter = habitId === null ? '' : 'AND hc.habit_id = ?';
  const parameters = habitId === null ? [start, end] : [start, end, habitId];
  const [days, topHabits] = await Promise.all([
    db.getAllAsync<ActivitySummaryDay>(
      `SELECT
         hc.completion_date AS dateKey,
         COUNT(*) AS completedCount,
         COALESCE(SUM(xp.total), 0) AS xpEarned,
         COALESCE(SUM(attribute.total), 0) AS statXpEarned,
         COALESCE(SUM(energy.total), 0) AS energyEarned
       FROM habit_completions hc
       LEFT JOIN (
         SELECT completion_id, SUM(amount) AS total
         FROM xp_events
         GROUP BY completion_id
       ) xp ON xp.completion_id = hc.id
       LEFT JOIN (
         SELECT completion_id, SUM(amount) AS total
         FROM attribute_events
         GROUP BY completion_id
       ) attribute ON attribute.completion_id = hc.id
       LEFT JOIN (
         SELECT completion_id, SUM(amount) AS total
         FROM energy_events
         GROUP BY completion_id
       ) energy ON energy.completion_id = hc.id
       WHERE hc.status = 'complete'
         AND hc.completion_date >= ?
         AND hc.completion_date < ?
         ${habitFilter}
       GROUP BY hc.completion_date
       ORDER BY hc.completion_date ASC`,
      ...parameters,
    ),
    db.getAllAsync<TopHabitRow>(
      `SELECT
         hc.habit_id AS habitId,
         MAX(COALESCE(h.title, hc.habit_title, 'Deleted habit')) AS title,
         COUNT(*) AS totalCompletions
       FROM habit_completions hc
       LEFT JOIN habits h ON h.id = hc.habit_id
       WHERE hc.status = 'complete'
         AND hc.completion_date >= ?
         AND hc.completion_date < ?
         ${habitFilter}
       GROUP BY hc.habit_id
       ORDER BY totalCompletions DESC, title COLLATE NOCASE ASC
       LIMIT 5`,
      ...parameters,
    ),
  ]);

  const monthTotals = new Map<string, { activeDays: number; totalCompletions: number }>();
  const weekdayTotals = new Map<number, number>();
  for (const day of days) {
    const monthKey = day.dateKey.slice(0, 7);
    const month = monthTotals.get(monthKey) ?? { activeDays: 0, totalCompletions: 0 };
    month.activeDays += 1;
    month.totalCompletions += day.completedCount;
    monthTotals.set(monthKey, month);
    const weekday = parseDateKey(day.dateKey).getUTCDay();
    weekdayTotals.set(weekday, (weekdayTotals.get(weekday) ?? 0) + day.completedCount);
  }
  const months = Array.from({ length: 12 }, (_, index) => {
    const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`;
    const totals = monthTotals.get(monthKey);
    return {
      monthKey,
      activeDays: totals?.activeDays ?? 0,
      totalCompletions: totals?.totalCompletions ?? 0,
    };
  });
  const bestMonth = [...months].sort(
    (first, second) => second.totalCompletions - first.totalCompletions,
  )[0];
  const bestWeekdayEntry = [...weekdayTotals.entries()].sort(
    (first, second) => second[1] - first[1],
  )[0];
  const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const finalDateKey = todayKey < start ? null : todayKey >= end ? end : todayKey;
  const elapsedDays = finalDateKey === null
    ? 0
    : Math.max(1, Math.round((parseDateKey(finalDateKey).getTime() - parseDateKey(start).getTime()) / 86_400_000) + (finalDateKey === end ? 0 : 1));

  return {
    year,
    days,
    months,
    activeDays: days.length,
    totalCompletions: days.reduce((total, day) => total + day.completedCount, 0),
    totalXp: days.reduce((total, day) => total + day.xpEarned, 0),
    totalStatXp: days.reduce((total, day) => total + day.statXpEarned, 0),
    totalEnergy: days.reduce((total, day) => total + day.energyEarned, 0),
    activeDayRate: elapsedDays > 0 ? Math.round((days.length / elapsedDays) * 100) : 0,
    longestStreak: getLongestDayStreak(days),
    bestMonthKey: bestMonth && bestMonth.totalCompletions > 0 ? bestMonth.monthKey : null,
    bestWeekday: bestWeekdayEntry ? weekdayLabels[bestWeekdayEntry[0]] : null,
    topHabits,
  };
}
