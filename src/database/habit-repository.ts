import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { MAX_DAILY_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';

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

export type DailyClearStatus = {
  dateKey: string;
  completed: number;
  required: number;
  eligible: boolean;
  claimed: boolean;
  earnedAt: string | null;
  claimedAt: string | null;
};

export type NewHabit = {
  title: string;
  description: string;
  difficulty: HabitDifficulty;
  attribute: HabitAttribute;
};

export type EditableHabit = NewHabit & { id: number };

type HabitRow = Omit<Habit, 'complete'> & { complete: number };
type QuestLogHabitRow = Omit<QuestLogHabit, 'complete'> & { complete: number };
type ActivitySummaryDayRow = ActivitySummaryDay;
type AttributeEventTotalRow = { attribute: HabitAttribute; total: number };
type DailyClearChestRow = {
  status: 'earned' | 'claimed';
  earnedAt: string;
  claimedAt: string | null;
};
type DailyClearProgressRow = { required: number; completed: number };

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

async function getDailyClearProgress(
  db: SQLiteDatabase,
  dateKey: string,
): Promise<DailyClearProgressRow> {
  const row = await db.getFirstAsync<DailyClearProgressRow>(
    `SELECT
       COUNT(h.id) AS required,
       COALESCE(
         SUM(CASE WHEN hc.status = 'complete' THEN 1 ELSE 0 END),
         0
       ) AS completed
     FROM habits h
     LEFT JOIN habit_completions hc
       ON hc.habit_id = h.id AND hc.completion_date = ?
     WHERE h.is_active = 1 AND h.habit_type = 'daily'`,
    dateKey,
  );

  return {
    required: row?.required ?? 0,
    completed: row?.completed ?? 0,
  };
}

export async function getDailyClearStatus(db: SQLiteDatabase): Promise<DailyClearStatus> {
  const today = getLocalDateKey();
  const [progress, chest] = await Promise.all([
    getDailyClearProgress(db, today),
    db.getFirstAsync<DailyClearChestRow>(
      `SELECT
         status,
         earned_at AS earnedAt,
         claimed_at AS claimedAt
       FROM daily_clear_chests
       WHERE clear_date = ?
       LIMIT 1`,
      today,
    ),
  ]);
  const eligible = progress.required > 0 && progress.completed >= progress.required;

  return {
    dateKey: today,
    ...progress,
    eligible,
    claimed: eligible && chest?.status === 'claimed',
    earnedAt: chest?.earnedAt ?? null,
    claimedAt: eligible ? chest?.claimedAt ?? null : null,
  };
}

export async function claimDailyClearChest(db: SQLiteDatabase): Promise<DailyClearStatus> {
  const today = getLocalDateKey();

  const applyClaim = async (txn: SQLiteDatabase) => {
    const progress = await getDailyClearProgress(txn, today);
    const eligible = progress.required > 0 && progress.completed >= progress.required;

    if (!eligible) {
      throw new Error('Daily Clear is not ready.');
    }

    await txn.runAsync(
      `INSERT OR IGNORE INTO daily_clear_chests (clear_date, status, earned_at)
       VALUES (?, 'earned', CURRENT_TIMESTAMP)`,
      today,
    );
    await txn.runAsync(
      `UPDATE daily_clear_chests
       SET status = 'claimed',
           claimed_at = COALESCE(claimed_at, CURRENT_TIMESTAMP)
       WHERE clear_date = ?`,
      today,
    );
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyClaim(db));
  } else {
    await db.withExclusiveTransactionAsync(applyClaim);
  }

  return getDailyClearStatus(db);
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

export async function getHabitForEdit(
  db: SQLiteDatabase,
  habitId: number,
): Promise<EditableHabit | null> {
  const row = await db.getFirstAsync<EditableHabit>(
    `SELECT id, title, description, difficulty, attribute
     FROM habits
     WHERE id = ?
     LIMIT 1`,
    habitId,
  );

  return row ?? null;
}

export async function updateHabit(db: SQLiteDatabase, habitId: number, habit: NewHabit) {
  const title = habit.title.trim();
  const description = habit.description.trim();

  if (!title) {
    throw new Error('Habit title is required.');
  }

  await db.runAsync(
    `UPDATE habits
     SET title = ?, description = ?, difficulty = ?, attribute = ?
     WHERE id = ?`,
    title,
    description,
    habit.difficulty,
    habit.attribute,
    habitId,
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
    const reason = complete ? 'completion' : 'undo';

    if (complete) {
      const dailyEnergyRow = await txn.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(ee.amount), 0) AS total
         FROM energy_events ee
         JOIN habit_completions hc ON hc.id = ee.completion_id
         WHERE hc.completion_date = ? AND hc.status = 'complete'`,
        today,
      );
      const remainingDailyEnergy = Math.max(
        0,
        MAX_DAILY_DUNGEON_ENERGY - Math.max(0, dailyEnergyRow?.total ?? 0),
      );
      const energyAmount = Math.min(reward.energy, remainingDailyEnergy);

      await txn.runAsync(
        `INSERT INTO xp_events
           (client_event_id, completion_id, transition_number, amount, reason)
         VALUES (?, ?, ?, ?, ?)`,
        `${eventId}-xp`,
        completionId,
        transitionNumber,
        reward.xp,
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
        reward.statXp,
        reason,
      );

      if (energyAmount > 0) {
        await txn.runAsync(
          `INSERT INTO energy_events
             (client_event_id, completion_id, transition_number, amount, reason)
           VALUES (?, ?, ?, ?, ?)`,
          `${eventId}-energy`,
          completionId,
          transitionNumber,
          energyAmount,
          reason,
        );
      }

      return;
    }

    const [xpTotalRow, attributeTotalRow, energyTotalRow] = await Promise.all([
      txn.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM xp_events
         WHERE completion_id = ?`,
        completionId,
      ),
      txn.getFirstAsync<AttributeEventTotalRow>(
        `SELECT attribute, COALESCE(SUM(amount), 0) AS total
         FROM attribute_events
         WHERE completion_id = ?
         GROUP BY attribute
         HAVING total > 0
         ORDER BY total DESC
         LIMIT 1`,
        completionId,
      ),
      txn.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM energy_events
         WHERE completion_id = ?`,
        completionId,
      ),
    ]);
    const xpAmount = Math.max(0, xpTotalRow?.total ?? 0);
    const attributeAmount = Math.max(0, attributeTotalRow?.total ?? 0);
    const energyAmount = Math.max(0, energyTotalRow?.total ?? 0);

    if (xpAmount > 0) {
      await txn.runAsync(
        `INSERT INTO xp_events
           (client_event_id, completion_id, transition_number, amount, reason)
         VALUES (?, ?, ?, ?, ?)`,
        `${eventId}-xp`,
        completionId,
        transitionNumber,
        -xpAmount,
        reason,
      );
    }

    if (attributeTotalRow && attributeAmount > 0) {
      await txn.runAsync(
        `INSERT INTO attribute_events
           (client_event_id, completion_id, transition_number, attribute, amount, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        `${eventId}-attribute`,
        completionId,
        transitionNumber,
        attributeTotalRow.attribute,
        -attributeAmount,
        reason,
      );
    }

    if (energyAmount > 0) {
      await txn.runAsync(
        `INSERT INTO energy_events
           (client_event_id, completion_id, transition_number, amount, reason)
         VALUES (?, ?, ?, ?, ?)`,
        `${eventId}-energy`,
        completionId,
        transitionNumber,
        -energyAmount,
        reason,
      );
    }
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyTransition(db));
    return;
  }

  await db.withExclusiveTransactionAsync(applyTransition);
}
