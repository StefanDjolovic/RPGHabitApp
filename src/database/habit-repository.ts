import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

export type HabitDifficulty = 'easy' | 'medium' | 'hard';
export type HabitAttribute =
  | 'strength'
  | 'intelligence'
  | 'discipline'
  | 'vitality'
  | 'creativity';

export type Habit = {
  id: number;
  title: string;
  description: string;
  difficulty: HabitDifficulty;
  attribute: HabitAttribute;
  complete: boolean;
};

export type QuestLogHabit = Habit & {
  lastCompletedDate: string | null;
  totalCompletions: number;
};

export type QuestLogStatus = 'active' | 'archived';

export type ActivitySummaryDay = {
  dateKey: string;
  completedCount: number;
  xpEarned: number;
  statXpEarned: number;
  energyEarned: number;
};

export type NewHabit = {
  title: string;
  description: string;
  difficulty: HabitDifficulty;
  attribute: HabitAttribute;
};

type HabitRow = Omit<Habit, 'complete'> & { complete: number };
type QuestLogHabitRow = Omit<QuestLogHabit, 'complete'> & { complete: number };
type ActivitySummaryDayRow = ActivitySummaryDay;

export const rewardByDifficulty = {
  easy: { xp: 10, statXp: 1, energy: 1 },
  medium: { xp: 30, statXp: 3, energy: 2 },
  hard: { xp: 80, statXp: 8, energy: 3 },
} as const;

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getTodayHabits(db: SQLiteDatabase): Promise<Habit[]> {
  const today = getLocalDateKey();
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT
       h.id,
       h.title,
       h.description,
       h.difficulty,
       h.attribute,
       CASE WHEN hc.status = 'complete' THEN 1 ELSE 0 END AS complete
     FROM habits h
     LEFT JOIN habit_completions hc
       ON hc.habit_id = h.id AND hc.completion_date = ?
     WHERE h.is_active = 1 AND h.habit_type = 'daily'
     ORDER BY h.created_at ASC, h.id ASC`,
    today,
  );

  return rows.map((row) => ({ ...row, complete: row.complete === 1 }));
}

export async function getQuestLogHabits(
  db: SQLiteDatabase,
  status: QuestLogStatus = 'active',
): Promise<QuestLogHabit[]> {
  const today = getLocalDateKey();
  const isActive = status === 'active' ? 1 : 0;
  const rows = await db.getAllAsync<QuestLogHabitRow>(
    `SELECT
       h.id,
       h.title,
       h.description,
       h.difficulty,
       h.attribute,
       CASE
         WHEN EXISTS (
           SELECT 1
           FROM habit_completions hc_today
           WHERE hc_today.habit_id = h.id
             AND hc_today.completion_date = ?
             AND hc_today.status = 'complete'
         ) THEN 1
         ELSE 0
       END AS complete,
       (
         SELECT MAX(hc_last.completion_date)
         FROM habit_completions hc_last
         WHERE hc_last.habit_id = h.id
           AND hc_last.status = 'complete'
       ) AS lastCompletedDate,
       (
         SELECT COUNT(*)
         FROM habit_completions hc_total
         WHERE hc_total.habit_id = h.id
           AND hc_total.status = 'complete'
       ) AS totalCompletions
     FROM habits h
     WHERE h.is_active = ?
     ORDER BY h.created_at ASC, h.id ASC`,
    today,
    isActive,
  );

  return rows.map((row) => ({ ...row, complete: row.complete === 1 }));
}

export async function getRecentActivityDays(
  db: SQLiteDatabase,
  limit = 7,
): Promise<ActivitySummaryDay[]> {
  const today = getLocalDateKey();
  const safeLimit = Math.max(1, Math.floor(limit));
  return db.getAllAsync<ActivitySummaryDayRow>(
    `SELECT
       hc.completion_date AS dateKey,
       COUNT(DISTINCT hc.id) AS completedCount,
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
       AND hc.completion_date <= ?
     GROUP BY hc.completion_date
     ORDER BY hc.completion_date DESC
     LIMIT ?`,
    today,
    safeLimit,
  );
}

export async function createHabit(db: SQLiteDatabase, habit: NewHabit) {
  const title = habit.title.trim();
  const description = habit.description.trim();

  if (!title) {
    throw new Error('Habit title is required.');
  }

  await db.runAsync(
    `INSERT INTO habits (title, description, difficulty, attribute)
     VALUES (?, ?, ?, ?)`,
    title,
    description,
    habit.difficulty,
    habit.attribute,
  );
}

export async function archiveHabit(db: SQLiteDatabase, habitId: number) {
  await db.runAsync(
    `UPDATE habits
     SET is_active = 0
     WHERE id = ? AND is_active = 1`,
    habitId,
  );
}

export async function restoreHabit(db: SQLiteDatabase, habitId: number) {
  await db.runAsync(
    `UPDATE habits
     SET is_active = 1
     WHERE id = ? AND is_active = 0`,
    habitId,
  );
}

export async function setHabitCompletion(
  db: SQLiteDatabase,
  habitId: number,
  complete: boolean,
) {
  const today = getLocalDateKey();

  const applyTransition = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<{
      completionId: number | null;
      status: 'complete' | 'undone' | null;
      difficulty: HabitDifficulty;
      attribute: HabitAttribute;
    }>(
      `SELECT
         hc.id AS completionId,
         hc.status,
         h.difficulty,
         h.attribute
       FROM habits h
       LEFT JOIN habit_completions hc
         ON hc.habit_id = h.id AND hc.completion_date = ?
       WHERE h.id = ? AND h.is_active = 1`,
      today,
      habitId,
    );

    if (!row) throw new Error('Habit not found.');
    if ((complete && row.status === 'complete') || (!complete && row.status !== 'complete')) return;

    let completionId = row.completionId;
    if (completionId === null) {
      const result = await txn.runAsync(
        `INSERT INTO habit_completions (habit_id, completion_date, status, updated_at)
         VALUES (?, ?, 'complete', CURRENT_TIMESTAMP)`,
        habitId,
        today,
      );
      completionId = result.lastInsertRowId;
    } else {
      await txn.runAsync(
        `UPDATE habit_completions
         SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        complete ? 'complete' : 'undone',
        completionId,
      );
    }

    const transitionRow = await txn.getFirstAsync<{ nextTransition: number }>(
      `SELECT COALESCE(MAX(transition_number), 0) + 1 AS nextTransition
       FROM xp_events
       WHERE completion_id = ?`,
      completionId,
    );
    const eventIdRow = await txn.getFirstAsync<{ eventId: string }>(
      'SELECT lower(hex(randomblob(16))) AS eventId',
    );
    const transitionNumber = transitionRow?.nextTransition ?? 1;
    const eventId = eventIdRow?.eventId;
    if (!eventId) throw new Error('Could not create reward event.');

    const reward = rewardByDifficulty[row.difficulty];
    const multiplier = complete ? 1 : -1;
    const reason = complete ? 'completion' : 'undo';

    await txn.runAsync(
      `INSERT INTO xp_events
         (client_event_id, completion_id, transition_number, amount, reason)
       VALUES (?, ?, ?, ?, ?)`,
      `${eventId}-xp`,
      completionId,
      transitionNumber,
      reward.xp * multiplier,
      reason,
    );
    await txn.runAsync(
      `INSERT INTO attribute_events
         (client_event_id, completion_id, transition_number, attribute, amount, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      `${eventId}-attribute`,
      completionId,
      transitionNumber,
      row.attribute,
      reward.statXp * multiplier,
      reason,
    );
    await txn.runAsync(
      `INSERT INTO energy_events
         (client_event_id, completion_id, transition_number, amount, reason)
       VALUES (?, ?, ?, ?, ?)`,
      `${eventId}-energy`,
      completionId,
      transitionNumber,
      reward.energy * multiplier,
      reason,
    );
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyTransition(db));
    return;
  }

  await db.withExclusiveTransactionAsync(applyTransition);
}
