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

type LifetimeRow = {
  firstDate: string | null;
  activeDays: number;
  totalCompletions: number;
  totalXp: number;
  totalStatXp: number;
  totalEnergy: number;
};

type HistoryEntryRow = HabitHistoryEntry;

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

export async function getLifetimeHabitHistory(
  db: SQLiteDatabase,
): Promise<LifetimeHabitHistory> {
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
     WHERE hc.status = 'complete'`,
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
): Promise<HabitHistoryMonth> {
  const { start, end } = getMonthRange(monthKey);
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
       GROUP BY hc.completion_date
       ORDER BY hc.completion_date ASC`,
      start,
      end,
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
       ORDER BY hc.completion_date DESC, hc.id DESC`,
      start,
      end,
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
