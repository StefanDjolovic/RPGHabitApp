import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { grantDailyClearReward } from '@/src/database/inventory-repository';
import { MAX_DAILY_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';

export type HabitDifficulty = 'easy' | 'medium' | 'hard';
export type HabitGoalType = 'single' | 'counter';
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
  goalType: HabitGoalType;
  targetCount: number;
  currentCount: number;
  scheduleDays: number[];
  isRequired: boolean;
  complete: boolean;
};

export type QuestLogHabit = Habit & {
  isPaused: boolean;
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
  rewardItemKey: string | null;
  rewardQuantity: number | null;
};

export type NewHabit = {
  title: string;
  description: string;
  difficulty: HabitDifficulty;
  attribute: HabitAttribute;
  goalType: HabitGoalType;
  targetCount: number;
  scheduleDays: number[];
  isRequired: boolean;
};

export type EditableHabit = NewHabit & { id: number };

type HabitRow = Omit<Habit, 'complete' | 'scheduleDays' | 'isRequired'> & {
  scheduleDays: string;
  isRequired: number;
  complete: number;
};
type QuestLogHabitRow = Omit<
  QuestLogHabit,
  'complete' | 'scheduleDays' | 'isRequired' | 'isPaused'
> & {
  scheduleDays: string;
  isRequired: number;
  isPaused: number;
  complete: number;
};
type EditableHabitRow = Omit<EditableHabit, 'scheduleDays' | 'isRequired'> & {
  scheduleDays: string;
  isRequired: number;
};
type ActivitySummaryDayRow = ActivitySummaryDay;
type AttributeEventTotalRow = { attribute: HabitAttribute; total: number };
type DailyClearChestRow = {
  status: 'earned' | 'claimed';
  earnedAt: string;
  claimedAt: string | null;
  rewardItemKey: string | null;
  rewardQuantity: number | null;
};
type DailyClearProgressRow = { required: number; completed: number };

export const rewardByDifficulty = {
  easy: { xp: 10, statXp: 1, energy: 1 },
  medium: { xp: 30, statXp: 3, energy: 2 },
  hard: { xp: 80, statXp: 8, energy: 3 },
} as const;

const allScheduleDays = [0, 1, 2, 3, 4, 5, 6];

export function normalizeScheduleDays(days: number[]) {
  const scheduleDays = [...new Set(days)]
    .map((day) => Math.floor(day))
    .filter((day) => day >= 0 && day <= 6)
    .sort((first, second) => first - second);

  return scheduleDays.length > 0 ? scheduleDays : allScheduleDays;
}

function serializeScheduleDays(days: number[]) {
  return normalizeScheduleDays(days).join(',');
}

function parseScheduleDays(value: string | null) {
  if (!value) return allScheduleDays;
  return normalizeScheduleDays(value.split(',').map(Number));
}

function normalizeTargetCount(goalType: HabitGoalType, targetCount: number) {
  if (goalType === 'single') return 1;
  if (!Number.isFinite(targetCount)) return 2;
  return Math.max(2, Math.floor(targetCount));
}

function toHabit(row: HabitRow): Habit {
  return {
    ...row,
    scheduleDays: parseScheduleDays(row.scheduleDays),
    isRequired: Boolean(row.isRequired),
    complete: row.complete === 1,
  };
}

function toQuestLogHabit(row: QuestLogHabitRow): QuestLogHabit {
  return {
    ...row,
    scheduleDays: parseScheduleDays(row.scheduleDays),
    isRequired: Boolean(row.isRequired),
    isPaused: Boolean(row.isPaused),
    complete: row.complete === 1,
  };
}

function getDayFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getTodayHabits(db: SQLiteDatabase): Promise<Habit[]> {
  const today = getLocalDateKey();
  const todayDay = new Date().getDay();
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT
       h.id,
       h.title,
       h.description,
       h.difficulty,
       h.attribute,
       h.goal_type AS goalType,
       h.target_count AS targetCount,
       CASE
         WHEN h.goal_type = 'counter' AND hc.status = 'complete'
           THEN h.target_count
         ELSE COALESCE(hcp.count, 0)
       END AS currentCount,
       h.schedule_days AS scheduleDays,
       h.is_required AS isRequired,
       CASE WHEN hc.status = 'complete' THEN 1 ELSE 0 END AS complete
     FROM habits h
     LEFT JOIN habit_completions hc
       ON hc.habit_id = h.id AND hc.completion_date = ?
     LEFT JOIN habit_counter_progress hcp
       ON hcp.habit_id = h.id AND hcp.progress_date = ?
     WHERE h.is_active = 1 AND h.habit_type = 'daily'
       AND h.is_paused = 0
       AND (',' || h.schedule_days || ',') LIKE ?
     ORDER BY h.created_at ASC, h.id ASC`,
    today,
    today,
    `%,${todayDay},%`,
  );

  return rows.map(toHabit);
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
       h.goal_type AS goalType,
       h.target_count AS targetCount,
       CASE
         WHEN h.goal_type = 'counter' AND hc_today.status = 'complete'
           THEN h.target_count
         ELSE COALESCE(hcp.count, 0)
       END AS currentCount,
       h.schedule_days AS scheduleDays,
       h.is_required AS isRequired,
       h.is_paused AS isPaused,
       CASE WHEN hc_today.status = 'complete' THEN 1 ELSE 0 END AS complete,
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
     LEFT JOIN habit_counter_progress hcp
       ON hcp.habit_id = h.id AND hcp.progress_date = ?
     LEFT JOIN habit_completions hc_today
       ON hc_today.habit_id = h.id AND hc_today.completion_date = ?
     WHERE h.is_active = ?
     ORDER BY h.created_at ASC, h.id ASC`,
    today,
    today,
    isActive,
  );

  return rows.map(toQuestLogHabit);
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

export async function getActivityCalendarDays(
  db: SQLiteDatabase,
  dayCount = 28,
): Promise<ActivitySummaryDay[]> {
  const safeDayCount = Math.max(7, Math.min(84, Math.floor(dayCount)));
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - safeDayCount + 1);
  const startDateKey = getLocalDateKey(startDate);
  const todayKey = getLocalDateKey(today);
  const activityRows = await db.getAllAsync<ActivitySummaryDayRow>(
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
       AND hc.completion_date BETWEEN ? AND ?
     GROUP BY hc.completion_date`,
    startDateKey,
    todayKey,
  );
  const activityByDate = new Map(activityRows.map((day) => [day.dateKey, day]));

  return Array.from({ length: safeDayCount }, (_, index) => {
    const date = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + index,
    );
    const dateKey = getLocalDateKey(date);
    return (
      activityByDate.get(dateKey) ?? {
        dateKey,
        completedCount: 0,
        xpEarned: 0,
        statXpEarned: 0,
        energyEarned: 0,
      }
    );
  });
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
     WHERE h.is_active = 1
       AND h.is_paused = 0
       AND h.habit_type = 'daily'
       AND h.is_required = 1
       AND (',' || h.schedule_days || ',') LIKE ?`,
    dateKey,
    `%,${getDayFromDateKey(dateKey)},%`,
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
         claimed_at AS claimedAt,
         reward_item_key AS rewardItemKey,
         reward_quantity AS rewardQuantity
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
    rewardItemKey: eligible ? chest?.rewardItemKey ?? null : null,
    rewardQuantity: eligible ? chest?.rewardQuantity ?? null : null,
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

    const chest = await txn.getFirstAsync<{
      status: 'earned' | 'claimed';
      rewardItemKey: string | null;
      rewardQuantity: number | null;
    }>(
      `SELECT
         status,
         reward_item_key AS rewardItemKey,
         reward_quantity AS rewardQuantity
       FROM daily_clear_chests
       WHERE clear_date = ?
       LIMIT 1`,
      today,
    );
    const reward =
      chest?.status === 'claimed' ? null : await grantDailyClearReward(txn, today);

    await txn.runAsync(
      `UPDATE daily_clear_chests
       SET status = 'claimed',
           claimed_at = COALESCE(claimed_at, CURRENT_TIMESTAMP),
           reward_item_key = COALESCE(reward_item_key, ?),
           reward_quantity = COALESCE(reward_quantity, ?)
       WHERE clear_date = ?`,
      reward?.itemKey ?? chest?.rewardItemKey ?? null,
      reward?.quantity ?? chest?.rewardQuantity ?? null,
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
  const scheduleDays = serializeScheduleDays(habit.scheduleDays);
  const targetCount = normalizeTargetCount(habit.goalType, habit.targetCount);

  if (!title) {
    throw new Error('Habit title is required.');
  }

  await db.runAsync(
    `INSERT INTO habits (
       title,
       description,
       difficulty,
       attribute,
       goal_type,
       target_count,
       schedule_days,
       is_required
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    title,
    description,
    habit.difficulty,
    habit.attribute,
    habit.goalType,
    targetCount,
    scheduleDays,
    habit.isRequired ? 1 : 0,
  );
}

export async function getHabitForEdit(
  db: SQLiteDatabase,
  habitId: number,
): Promise<EditableHabit | null> {
  const row = await db.getFirstAsync<EditableHabitRow>(
    `SELECT
       id,
       title,
       description,
       difficulty,
       attribute,
       goal_type AS goalType,
       target_count AS targetCount,
       schedule_days AS scheduleDays,
       is_required AS isRequired
     FROM habits
     WHERE id = ?
     LIMIT 1`,
    habitId,
  );

  if (!row) return null;

  return {
    ...row,
    scheduleDays: parseScheduleDays(row.scheduleDays),
    isRequired: row.isRequired === 1,
  };
}

export async function updateHabit(db: SQLiteDatabase, habitId: number, habit: NewHabit) {
  const title = habit.title.trim();
  const description = habit.description.trim();
  const scheduleDays = serializeScheduleDays(habit.scheduleDays);
  const targetCount = normalizeTargetCount(habit.goalType, habit.targetCount);

  if (!title) {
    throw new Error('Habit title is required.');
  }

  await db.runAsync(
    `UPDATE habits
     SET
       title = ?,
       description = ?,
       difficulty = ?,
       attribute = ?,
       goal_type = ?,
       target_count = ?,
       schedule_days = ?,
       is_required = ?
     WHERE id = ?`,
    title,
    description,
    habit.difficulty,
    habit.attribute,
    habit.goalType,
    targetCount,
    scheduleDays,
    habit.isRequired ? 1 : 0,
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

export async function pauseHabit(db: SQLiteDatabase, habitId: number) {
  await db.runAsync(
    `UPDATE habits
     SET is_paused = 1
     WHERE id = ? AND is_active = 1 AND is_paused = 0`,
    habitId,
  );
}

export async function resumeHabit(db: SQLiteDatabase, habitId: number) {
  await db.runAsync(
    `UPDATE habits
     SET is_paused = 0
     WHERE id = ? AND is_active = 1 AND is_paused = 1`,
    habitId,
  );
}

export async function restoreHabit(db: SQLiteDatabase, habitId: number) {
  await db.runAsync(
    `UPDATE habits
     SET is_active = 1, is_paused = 0
     WHERE id = ? AND is_active = 0`,
    habitId,
  );
}

async function applyHabitCompletionTransition(
  txn: SQLiteDatabase,
  habitId: number,
  complete: boolean,
  today: string,
  todayDay: number,
  expectedGoalType: HabitGoalType,
) {
  const row = await txn.getFirstAsync<{
      completionId: number | null;
      status: 'complete' | 'undone' | null;
      difficulty: HabitDifficulty;
      attribute: HabitAttribute;
      goalType: HabitGoalType;
    }>(
      `SELECT
         hc.id AS completionId,
         hc.status,
         h.difficulty,
         h.attribute,
         h.goal_type AS goalType
       FROM habits h
       LEFT JOIN habit_completions hc
         ON hc.habit_id = h.id AND hc.completion_date = ?
       WHERE h.id = ?
         AND h.is_active = 1
         AND h.is_paused = 0
         AND (',' || h.schedule_days || ',') LIKE ?`,
      today,
      habitId,
      `%,${todayDay},%`,
    );

    if (!row || row.goalType !== expectedGoalType) throw new Error('Habit not found.');
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
}

export async function setHabitCompletion(
  db: SQLiteDatabase,
  habitId: number,
  complete: boolean,
) {
  const today = getLocalDateKey();
  const todayDay = new Date().getDay();
  const applyTransition = (txn: SQLiteDatabase) =>
    applyHabitCompletionTransition(txn, habitId, complete, today, todayDay, 'single');

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyTransition(db));
    return;
  }

  await db.withExclusiveTransactionAsync(applyTransition);
}

export async function changeHabitCounter(
  db: SQLiteDatabase,
  habitId: number,
  delta: number,
) {
  const today = getLocalDateKey();
  const todayDay = new Date().getDay();
  const increment = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  let nextCount = 0;

  const applyChange = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<{
      targetCount: number;
      currentCount: number;
      status: 'complete' | 'undone' | null;
    }>(
      `SELECT
         h.target_count AS targetCount,
         COALESCE(hcp.count, 0) AS currentCount,
         hc.status
       FROM habits h
       LEFT JOIN habit_counter_progress hcp
         ON hcp.habit_id = h.id AND hcp.progress_date = ?
       LEFT JOIN habit_completions hc
         ON hc.habit_id = h.id AND hc.completion_date = ?
       WHERE h.id = ?
         AND h.goal_type = 'counter'
         AND h.is_active = 1
         AND h.is_paused = 0
         AND (',' || h.schedule_days || ',') LIKE ?`,
      today,
      today,
      habitId,
      `%,${todayDay},%`,
    );

    if (!row) throw new Error('Counter habit not found.');

    const wasComplete = row.status === 'complete';
    const effectiveCurrentCount = wasComplete
      ? row.targetCount
      : Math.min(row.currentCount, row.targetCount);
    nextCount = Math.min(row.targetCount, Math.max(0, effectiveCurrentCount + increment));
    const isComplete = nextCount >= row.targetCount;

    if (nextCount !== row.currentCount) {
      await txn.runAsync(
        `INSERT INTO habit_counter_progress (habit_id, progress_date, count, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(habit_id, progress_date) DO UPDATE SET
           count = excluded.count,
           updated_at = CURRENT_TIMESTAMP`,
        habitId,
        today,
        nextCount,
      );
    }

    if (wasComplete !== isComplete) {
      await applyHabitCompletionTransition(
        txn,
        habitId,
        isComplete,
        today,
        todayDay,
        'counter',
      );
    }
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyChange(db));
  } else {
    await db.withExclusiveTransactionAsync(applyChange);
  }

  return nextCount;
}
