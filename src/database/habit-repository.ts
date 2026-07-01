import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { grantDailyClearReward } from '@/src/database/inventory-repository';
import { MAX_DAILY_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';

export type HabitDifficulty = 'easy' | 'medium' | 'hard';
export type HabitGoalType = 'single' | 'counter' | 'timer';
export type HabitCadence = 'daily' | 'weekly' | 'one-time';
export type ReminderTone = 'gentle' | 'system' | 'strict';
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
  cadence: HabitCadence;
  goalType: HabitGoalType;
  targetCount: number;
  currentCount: number;
  targetDurationMinutes: number;
  elapsedSeconds: number;
  timerStartedAtEpoch: number | null;
  reminderEnabled: boolean;
  reminderTime: string;
  reminderTone: ReminderTone;
  scheduleDays: number[];
  isRequired: boolean;
  checkedToday: boolean;
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

export type TimedHabitProgress = {
  elapsedSeconds: number;
  timerStartedAtEpoch: number | null;
  complete: boolean;
};

export type NewHabit = {
  title: string;
  description: string;
  difficulty: HabitDifficulty;
  attribute: HabitAttribute;
  cadence: HabitCadence;
  goalType: HabitGoalType;
  targetCount: number;
  targetDurationMinutes: number;
  reminderEnabled: boolean;
  reminderTime: string;
  reminderTone: ReminderTone;
  scheduleDays: number[];
  isRequired: boolean;
};

export type EditableHabit = NewHabit & { id: number };

type HabitRow = Omit<
  Habit,
  'complete' | 'checkedToday' | 'scheduleDays' | 'isRequired' | 'reminderEnabled'
> & {
  scheduleDays: string;
  isRequired: number;
  reminderEnabled: number;
  checkedToday: number;
  complete: number;
};
type QuestLogHabitRow = Omit<
  QuestLogHabit,
  | 'complete'
  | 'checkedToday'
  | 'scheduleDays'
  | 'isRequired'
  | 'isPaused'
  | 'reminderEnabled'
> & {
  scheduleDays: string;
  isRequired: number;
  isPaused: number;
  reminderEnabled: number;
  checkedToday: number;
  complete: number;
};
type EditableHabitRow = Omit<
  EditableHabit,
  'scheduleDays' | 'isRequired' | 'reminderEnabled'
> & {
  scheduleDays: string;
  isRequired: number;
  reminderEnabled: number;
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

function normalizeTargetCount(
  cadence: HabitCadence,
  goalType: HabitGoalType,
  targetCount: number,
  scheduledDayCount: number,
) {
  if (cadence === 'weekly') {
    if (!Number.isFinite(targetCount)) return Math.min(3, scheduledDayCount);
    return Math.min(scheduledDayCount, Math.max(1, Math.floor(targetCount)));
  }
  if (goalType !== 'counter') return 1;
  if (!Number.isFinite(targetCount)) return 2;
  return Math.max(2, Math.floor(targetCount));
}

function normalizeTargetDuration(goalType: HabitGoalType, targetDurationMinutes: number) {
  if (goalType !== 'timer') return 0;
  if (!Number.isFinite(targetDurationMinutes)) return 20;
  return Math.min(180, Math.max(5, Math.floor(targetDurationMinutes)));
}

function normalizeReminderTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '09:00';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '09:00';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function toHabit(row: HabitRow): Habit {
  return {
    ...row,
    scheduleDays: parseScheduleDays(row.scheduleDays),
    isRequired: Boolean(row.isRequired),
    reminderEnabled: Boolean(row.reminderEnabled),
    checkedToday: row.checkedToday === 1,
    complete: row.complete === 1,
  };
}

function toQuestLogHabit(row: QuestLogHabitRow): QuestLogHabit {
  return {
    ...row,
    scheduleDays: parseScheduleDays(row.scheduleDays),
    isRequired: Boolean(row.isRequired),
    isPaused: Boolean(row.isPaused),
    reminderEnabled: Boolean(row.reminderEnabled),
    checkedToday: row.checkedToday === 1,
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

export function getWeekStartDateKey(date = new Date()) {
  const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  return getLocalDateKey(weekStart);
}

export async function getTodayHabits(db: SQLiteDatabase): Promise<Habit[]> {
  const today = getLocalDateKey();
  const todayDay = new Date().getDay();
  const weekStart = getWeekStartDateKey();
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT
       h.id,
       h.title,
       h.description,
       h.difficulty,
       h.attribute,
       h.habit_type AS cadence,
       CASE
         WHEN h.target_duration_minutes > 0 THEN 'timer'
         ELSE h.goal_type
       END AS goalType,
       h.target_count AS targetCount,
       h.target_duration_minutes AS targetDurationMinutes,
       COALESCE(htp.accumulated_seconds, 0) AS elapsedSeconds,
       CAST(strftime('%s', htp.started_at) AS INTEGER) AS timerStartedAtEpoch,
       h.reminder_enabled AS reminderEnabled,
       h.reminder_time AS reminderTime,
       h.reminder_tone AS reminderTone,
       CASE
         WHEN h.habit_type = 'weekly' THEN COALESCE(weekly_checkins.count, 0)
         WHEN h.goal_type = 'counter' AND hc_today.status = 'complete'
           THEN h.target_count
         ELSE COALESCE(hcp.count, 0)
       END AS currentCount,
       h.schedule_days AS scheduleDays,
       h.is_required AS isRequired,
       CASE
         WHEN h.habit_type = 'weekly' AND weekly_today.habit_id IS NOT NULL THEN 1
         ELSE 0
       END AS checkedToday,
       CASE
         WHEN h.habit_type = 'weekly' THEN CASE WHEN EXISTS (
           SELECT 1
           FROM habit_completions hc_week
           WHERE hc_week.habit_id = h.id
             AND hc_week.status = 'complete'
             AND hc_week.completion_date >= ?
           AND hc_week.completion_date < date(?, '+7 days')
         ) THEN 1 ELSE 0 END
         WHEN h.habit_type = 'one-time' THEN CASE WHEN EXISTS (
           SELECT 1
           FROM habit_completions hc_once
           WHERE hc_once.habit_id = h.id
             AND hc_once.status = 'complete'
         ) THEN 1 ELSE 0 END
         WHEN hc_today.status = 'complete' THEN 1
         ELSE 0
       END AS complete
     FROM habits h
     LEFT JOIN habit_completions hc_today
       ON hc_today.habit_id = h.id AND hc_today.completion_date = ?
     LEFT JOIN habit_counter_progress hcp
       ON hcp.habit_id = h.id AND hcp.progress_date = ?
     LEFT JOIN habit_timer_progress htp
       ON htp.habit_id = h.id AND htp.progress_date = ?
     LEFT JOIN habit_weekly_checkins weekly_today
       ON weekly_today.habit_id = h.id AND weekly_today.checkin_date = ?
     LEFT JOIN (
       SELECT habit_id, COUNT(*) AS count
       FROM habit_weekly_checkins
       WHERE week_start = ?
       GROUP BY habit_id
     ) weekly_checkins ON weekly_checkins.habit_id = h.id
     WHERE (
         h.is_active = 1
         OR (h.habit_type = 'one-time' AND hc_today.status = 'complete')
       )
       AND h.is_paused = 0
       AND (
         (
           h.habit_type IN ('daily', 'weekly')
           AND (',' || h.schedule_days || ',') LIKE ?
         )
         OR (
           h.habit_type = 'one-time'
           AND (
             hc_today.status = 'complete'
             OR NOT EXISTS (
               SELECT 1
               FROM habit_completions hc_once
               WHERE hc_once.habit_id = h.id
                 AND hc_once.status = 'complete'
             )
           )
         )
       )
     ORDER BY h.created_at ASC, h.id ASC`,
    weekStart,
    weekStart,
    today,
    today,
    today,
    today,
    weekStart,
    `%,${todayDay},%`,
  );

  return rows.map(toHabit);
}

export async function getQuestLogHabits(
  db: SQLiteDatabase,
  status: QuestLogStatus = 'active',
): Promise<QuestLogHabit[]> {
  const today = getLocalDateKey();
  const weekStart = getWeekStartDateKey();
  const isActive = status === 'active' ? 1 : 0;
  const rows = await db.getAllAsync<QuestLogHabitRow>(
    `SELECT
       h.id,
       h.title,
       h.description,
       h.difficulty,
       h.attribute,
       h.habit_type AS cadence,
       CASE
         WHEN h.target_duration_minutes > 0 THEN 'timer'
         ELSE h.goal_type
       END AS goalType,
       h.target_count AS targetCount,
       h.target_duration_minutes AS targetDurationMinutes,
       COALESCE(htp.accumulated_seconds, 0) AS elapsedSeconds,
       CAST(strftime('%s', htp.started_at) AS INTEGER) AS timerStartedAtEpoch,
       h.reminder_enabled AS reminderEnabled,
       h.reminder_time AS reminderTime,
       h.reminder_tone AS reminderTone,
       CASE
         WHEN h.habit_type = 'weekly' THEN COALESCE(weekly_checkins.count, 0)
         WHEN h.goal_type = 'counter' AND hc_today.status = 'complete'
           THEN h.target_count
         ELSE COALESCE(hcp.count, 0)
       END AS currentCount,
       h.schedule_days AS scheduleDays,
       h.is_required AS isRequired,
       h.is_paused AS isPaused,
       CASE
         WHEN h.habit_type = 'weekly' AND weekly_today.habit_id IS NOT NULL THEN 1
         ELSE 0
       END AS checkedToday,
       CASE
         WHEN h.habit_type = 'weekly' THEN CASE WHEN EXISTS (
           SELECT 1
           FROM habit_completions hc_week
           WHERE hc_week.habit_id = h.id
             AND hc_week.status = 'complete'
             AND hc_week.completion_date >= ?
           AND hc_week.completion_date < date(?, '+7 days')
         ) THEN 1 ELSE 0 END
         WHEN h.habit_type = 'one-time' THEN CASE WHEN EXISTS (
           SELECT 1
           FROM habit_completions hc_once
           WHERE hc_once.habit_id = h.id
             AND hc_once.status = 'complete'
         ) THEN 1 ELSE 0 END
         WHEN hc_today.status = 'complete' THEN 1
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
     LEFT JOIN habit_counter_progress hcp
       ON hcp.habit_id = h.id AND hcp.progress_date = ?
     LEFT JOIN habit_timer_progress htp
       ON htp.habit_id = h.id AND htp.progress_date = ?
     LEFT JOIN habit_completions hc_today
       ON hc_today.habit_id = h.id AND hc_today.completion_date = ?
     LEFT JOIN habit_weekly_checkins weekly_today
       ON weekly_today.habit_id = h.id AND weekly_today.checkin_date = ?
     LEFT JOIN (
       SELECT habit_id, COUNT(*) AS count
       FROM habit_weekly_checkins
       WHERE week_start = ?
       GROUP BY habit_id
     ) weekly_checkins ON weekly_checkins.habit_id = h.id
     WHERE h.is_active = ?
     ORDER BY h.created_at ASC, h.id ASC`,
    weekStart,
    weekStart,
    today,
    today,
    today,
    today,
    weekStart,
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
    `WITH activity AS (
       SELECT
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
       GROUP BY hc.completion_date

       UNION ALL

       SELECT
         event_date AS dateKey,
         COUNT(DISTINCT milestone_id) AS completedCount,
         SUM(xp_amount) AS xpEarned,
         SUM(stat_xp_amount) AS statXpEarned,
         SUM(energy_amount) AS energyEarned
       FROM boss_quest_reward_events
       GROUP BY event_date
     )
     SELECT
       dateKey,
       SUM(completedCount) AS completedCount,
       SUM(xpEarned) AS xpEarned,
       SUM(statXpEarned) AS statXpEarned,
       SUM(energyEarned) AS energyEarned
     FROM activity
     WHERE dateKey <= ?
     GROUP BY dateKey
     ORDER BY dateKey DESC
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
    `WITH activity AS (
       SELECT
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
       GROUP BY hc.completion_date

       UNION ALL

       SELECT
         event_date AS dateKey,
         COUNT(DISTINCT milestone_id) AS completedCount,
         SUM(xp_amount) AS xpEarned,
         SUM(stat_xp_amount) AS statXpEarned,
         SUM(energy_amount) AS energyEarned
       FROM boss_quest_reward_events
       GROUP BY event_date
     )
     SELECT
       dateKey,
       SUM(completedCount) AS completedCount,
       SUM(xpEarned) AS xpEarned,
       SUM(statXpEarned) AS statXpEarned,
       SUM(energyEarned) AS energyEarned
     FROM activity
     WHERE dateKey BETWEEN ? AND ?
     GROUP BY dateKey`,
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
  const normalizedScheduleDays = normalizeScheduleDays(habit.scheduleDays);
  const scheduleDays = serializeScheduleDays(normalizedScheduleDays);
  const goalType = habit.cadence === 'daily' ? habit.goalType : 'single';
  const storedGoalType = goalType === 'timer' ? 'single' : goalType;
  const targetCount = normalizeTargetCount(
    habit.cadence,
    goalType,
    habit.targetCount,
    normalizedScheduleDays.length,
  );
  const targetDurationMinutes = normalizeTargetDuration(
    goalType,
    habit.targetDurationMinutes,
  );
  const reminderTime = normalizeReminderTime(habit.reminderTime);

  if (!title) {
    throw new Error('Habit title is required.');
  }

  const result = await db.runAsync(
    `INSERT INTO habits (
       title,
       description,
       habit_type,
       difficulty,
       attribute,
       goal_type,
       target_count,
       target_duration_minutes,
       reminder_enabled,
       reminder_time,
       reminder_tone,
       schedule_days,
       is_required
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    title,
    description,
    habit.cadence,
    habit.difficulty,
    habit.attribute,
    storedGoalType,
    targetCount,
    targetDurationMinutes,
    habit.reminderEnabled ? 1 : 0,
    reminderTime,
    habit.reminderTone,
    scheduleDays,
    habit.cadence === 'daily' && habit.isRequired ? 1 : 0,
  );

  return result.lastInsertRowId;
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
       habit_type AS cadence,
       difficulty,
       attribute,
       CASE
         WHEN target_duration_minutes > 0 THEN 'timer'
         ELSE goal_type
       END AS goalType,
       target_count AS targetCount,
       target_duration_minutes AS targetDurationMinutes,
       reminder_enabled AS reminderEnabled,
       reminder_time AS reminderTime,
       reminder_tone AS reminderTone,
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
    reminderEnabled: row.reminderEnabled === 1,
  };
}

export async function updateHabit(db: SQLiteDatabase, habitId: number, habit: NewHabit) {
  const title = habit.title.trim();
  const description = habit.description.trim();
  const normalizedScheduleDays = normalizeScheduleDays(habit.scheduleDays);
  const scheduleDays = serializeScheduleDays(normalizedScheduleDays);
  const goalType = habit.cadence === 'daily' ? habit.goalType : 'single';
  const storedGoalType = goalType === 'timer' ? 'single' : goalType;
  const targetCount = normalizeTargetCount(
    habit.cadence,
    goalType,
    habit.targetCount,
    normalizedScheduleDays.length,
  );
  const targetDurationMinutes = normalizeTargetDuration(
    goalType,
    habit.targetDurationMinutes,
  );
  const reminderTime = normalizeReminderTime(habit.reminderTime);

  if (!title) {
    throw new Error('Habit title is required.');
  }

  await stopActiveTimerProgress(db, habitId);

  await db.runAsync(
    `UPDATE habits
     SET
       title = ?,
       description = ?,
       habit_type = ?,
       difficulty = ?,
       attribute = ?,
       goal_type = ?,
       target_count = ?,
       target_duration_minutes = ?,
       reminder_enabled = ?,
       reminder_time = ?,
       reminder_tone = ?,
       schedule_days = ?,
       is_required = ?
     WHERE id = ?`,
    title,
    description,
    habit.cadence,
    habit.difficulty,
    habit.attribute,
    storedGoalType,
    targetCount,
    targetDurationMinutes,
    habit.reminderEnabled ? 1 : 0,
    reminderTime,
    habit.reminderTone,
    scheduleDays,
    habit.cadence === 'daily' && habit.isRequired ? 1 : 0,
    habitId,
  );
}

async function stopActiveTimerProgress(db: SQLiteDatabase, habitId: number) {
  const today = getLocalDateKey();
  await db.runAsync(
    `UPDATE habit_timer_progress
     SET accumulated_seconds = MIN(
           COALESCE((
             SELECT target_duration_minutes * 60
             FROM habits
             WHERE id = ?
           ), accumulated_seconds),
           accumulated_seconds + MAX(
             0,
             CAST(strftime('%s', 'now') AS INTEGER) -
               CAST(strftime('%s', started_at) AS INTEGER)
           )
         ),
         started_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE habit_id = ?
       AND progress_date = ?
       AND started_at IS NOT NULL`,
    habitId,
    habitId,
    today,
  );
}

export async function archiveHabit(db: SQLiteDatabase, habitId: number) {
  await stopActiveTimerProgress(db, habitId);
  await db.runAsync(
    `UPDATE habits
     SET is_active = 0
     WHERE id = ? AND is_active = 1`,
    habitId,
  );
}

export async function pauseHabit(db: SQLiteDatabase, habitId: number) {
  await stopActiveTimerProgress(db, habitId);
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
  completionDate: string,
  todayDay: number,
  expectedGoalType: HabitGoalType,
  expectedCadence: HabitCadence,
) {
  const row = await txn.getFirstAsync<{
      completionId: number | null;
      status: 'complete' | 'undone' | null;
      difficulty: HabitDifficulty;
      attribute: HabitAttribute;
      goalType: HabitGoalType;
      cadence: HabitCadence;
    }>(
      `SELECT
         hc.id AS completionId,
         hc.status,
         h.difficulty,
         h.attribute,
         CASE
           WHEN h.target_duration_minutes > 0 THEN 'timer'
           ELSE h.goal_type
         END AS goalType,
         h.habit_type AS cadence
       FROM habits h
       LEFT JOIN habit_completions hc
         ON hc.habit_id = h.id AND hc.completion_date = ?
       WHERE h.id = ?
         AND h.is_active = 1
         AND h.is_paused = 0
         AND (',' || h.schedule_days || ',') LIKE ?`,
      completionDate,
      habitId,
      `%,${todayDay},%`,
    );

    if (
      !row ||
      row.goalType !== expectedGoalType ||
      row.cadence !== expectedCadence
    ) {
      throw new Error('Habit not found.');
    }
    if ((complete && row.status === 'complete') || (!complete && row.status !== 'complete')) return;

    let completionId = row.completionId;
    if (completionId === null) {
      const result = await txn.runAsync(
        `INSERT INTO habit_completions (habit_id, completion_date, status, updated_at)
         VALUES (?, ?, 'complete', CURRENT_TIMESTAMP)`,
        habitId,
        completionDate,
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
        completionDate,
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
  cadence: 'daily' | 'one-time' = 'daily',
) {
  const today = getLocalDateKey();
  const todayDay = new Date().getDay();
  const applyTransition = async (txn: SQLiteDatabase) => {
    if (cadence === 'one-time' && !complete) {
      await txn.runAsync(
        `UPDATE habits
         SET is_active = 1, is_paused = 0
         WHERE id = ?`,
        habitId,
      );
    }

    await applyHabitCompletionTransition(
      txn,
      habitId,
      complete,
      today,
      todayDay,
      'single',
      cadence,
    );

    if (cadence === 'one-time' && complete) {
      await txn.runAsync(
        `UPDATE habits
         SET is_active = 0
         WHERE id = ?`,
        habitId,
      );
    }
  };

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
        'daily',
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

export async function setTimedHabitRunning(
  db: SQLiteDatabase,
  habitId: number,
  running: boolean,
): Promise<TimedHabitProgress> {
  const today = getLocalDateKey();
  const todayDay = new Date().getDay();
  let result: TimedHabitProgress = {
    elapsedSeconds: 0,
    timerStartedAtEpoch: null,
    complete: false,
  };

  const applyChange = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<{
      targetDurationMinutes: number;
      accumulatedSeconds: number;
      timerStartedAtEpoch: number | null;
      nowEpoch: number;
      status: 'complete' | 'undone' | null;
    }>(
      `SELECT
         h.target_duration_minutes AS targetDurationMinutes,
         COALESCE(htp.accumulated_seconds, 0) AS accumulatedSeconds,
         CAST(strftime('%s', htp.started_at) AS INTEGER) AS timerStartedAtEpoch,
         CAST(strftime('%s', 'now') AS INTEGER) AS nowEpoch,
         hc.status
       FROM habits h
       LEFT JOIN habit_timer_progress htp
         ON htp.habit_id = h.id AND htp.progress_date = ?
       LEFT JOIN habit_completions hc
         ON hc.habit_id = h.id AND hc.completion_date = ?
       WHERE h.id = ?
         AND h.habit_type = 'daily'
         AND h.target_duration_minutes > 0
         AND h.is_active = 1
         AND h.is_paused = 0
         AND (',' || h.schedule_days || ',') LIKE ?`,
      today,
      today,
      habitId,
      `%,${todayDay},%`,
    );

    if (!row) throw new Error('Timed habit not found.');

    const targetSeconds = row.targetDurationMinutes * 60;
    const activeSeconds = row.timerStartedAtEpoch
      ? Math.max(0, row.nowEpoch - row.timerStartedAtEpoch)
      : 0;
    const elapsedSeconds = Math.min(
      targetSeconds,
      row.accumulatedSeconds + activeSeconds,
    );
    const wasComplete = row.status === 'complete';

    if (wasComplete) {
      result = {
        elapsedSeconds: targetSeconds,
        timerStartedAtEpoch: null,
        complete: true,
      };
      return;
    }

    if (elapsedSeconds >= targetSeconds) {
      await txn.runAsync(
        `INSERT INTO habit_timer_progress (
           habit_id, progress_date, accumulated_seconds, started_at, updated_at
         ) VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT(habit_id, progress_date) DO UPDATE SET
           accumulated_seconds = excluded.accumulated_seconds,
           started_at = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        habitId,
        today,
        targetSeconds,
      );
      await applyHabitCompletionTransition(
        txn,
        habitId,
        true,
        today,
        todayDay,
        'timer',
        'daily',
      );
      result = {
        elapsedSeconds: targetSeconds,
        timerStartedAtEpoch: null,
        complete: true,
      };
      return;
    }

    if (running && row.timerStartedAtEpoch !== null) {
      result = {
        elapsedSeconds: row.accumulatedSeconds,
        timerStartedAtEpoch: row.timerStartedAtEpoch,
        complete: false,
      };
      return;
    }

    if (running) {
      await txn.runAsync(
        `INSERT INTO habit_timer_progress (
           habit_id, progress_date, accumulated_seconds, started_at, updated_at
         ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(habit_id, progress_date) DO UPDATE SET
           accumulated_seconds = excluded.accumulated_seconds,
           started_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP`,
        habitId,
        today,
        elapsedSeconds,
      );
      result = {
        elapsedSeconds,
        timerStartedAtEpoch: row.nowEpoch,
        complete: false,
      };
      return;
    }

    await txn.runAsync(
      `INSERT INTO habit_timer_progress (
         habit_id, progress_date, accumulated_seconds, started_at, updated_at
       ) VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(habit_id, progress_date) DO UPDATE SET
         accumulated_seconds = excluded.accumulated_seconds,
         started_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      habitId,
      today,
      elapsedSeconds,
    );
    result = {
      elapsedSeconds,
      timerStartedAtEpoch: null,
      complete: false,
    };
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyChange(db));
  } else {
    await db.withExclusiveTransactionAsync(applyChange);
  }

  return result;
}

export async function resetTimedHabitForToday(db: SQLiteDatabase, habitId: number) {
  const today = getLocalDateKey();
  const todayDay = new Date().getDay();

  const applyReset = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<{ status: 'complete' | 'undone' | null }>(
      `SELECT hc.status
       FROM habits h
       LEFT JOIN habit_completions hc
         ON hc.habit_id = h.id AND hc.completion_date = ?
       WHERE h.id = ?
         AND h.habit_type = 'daily'
         AND h.target_duration_minutes > 0
         AND h.is_active = 1
         AND h.is_paused = 0
         AND (',' || h.schedule_days || ',') LIKE ?`,
      today,
      habitId,
      `%,${todayDay},%`,
    );

    if (!row) throw new Error('Timed habit not found.');

    await txn.runAsync(
      `INSERT INTO habit_timer_progress (
         habit_id, progress_date, accumulated_seconds, started_at, updated_at
       ) VALUES (?, ?, 0, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(habit_id, progress_date) DO UPDATE SET
         accumulated_seconds = 0,
         started_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      habitId,
      today,
    );

    if (row.status === 'complete') {
      await applyHabitCompletionTransition(
        txn,
        habitId,
        false,
        today,
        todayDay,
        'timer',
        'daily',
      );
    }
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyReset(db));
  } else {
    await db.withExclusiveTransactionAsync(applyReset);
  }
}

export async function setWeeklyHabitCheckIn(
  db: SQLiteDatabase,
  habitId: number,
  checked: boolean,
) {
  const today = getLocalDateKey();
  const todayDay = new Date().getDay();
  const weekStart = getWeekStartDateKey();
  let nextCount = 0;

  const applyChange = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<{
      targetCount: number;
      currentCount: number;
      checkedToday: number;
      completionDate: string | null;
    }>(
      `SELECT
         h.target_count AS targetCount,
         COALESCE(weekly_checkins.count, 0) AS currentCount,
         CASE WHEN weekly_today.habit_id IS NOT NULL THEN 1 ELSE 0 END AS checkedToday,
         hc_week.completion_date AS completionDate
       FROM habits h
       LEFT JOIN habit_weekly_checkins weekly_today
         ON weekly_today.habit_id = h.id AND weekly_today.checkin_date = ?
       LEFT JOIN (
         SELECT habit_id, COUNT(*) AS count
         FROM habit_weekly_checkins
         WHERE week_start = ?
         GROUP BY habit_id
       ) weekly_checkins ON weekly_checkins.habit_id = h.id
       LEFT JOIN habit_completions hc_week ON hc_week.id = (
         SELECT hc.id
         FROM habit_completions hc
         WHERE hc.habit_id = h.id
           AND hc.status = 'complete'
           AND hc.completion_date >= ?
           AND hc.completion_date < date(?, '+7 days')
         ORDER BY hc.completion_date DESC
         LIMIT 1
       )
       WHERE h.id = ?
         AND h.habit_type = 'weekly'
         AND h.is_active = 1
         AND h.is_paused = 0
         AND (',' || h.schedule_days || ',') LIKE ?`,
      today,
      weekStart,
      weekStart,
      weekStart,
      habitId,
      `%,${todayDay},%`,
    );

    if (!row) throw new Error('Weekly habit not found.');

    const wasChecked = row.checkedToday === 1;
    nextCount = row.currentCount;
    if (wasChecked === checked) return;

    if (checked) {
      await txn.runAsync(
        `INSERT OR IGNORE INTO habit_weekly_checkins
           (habit_id, checkin_date, week_start)
         VALUES (?, ?, ?)`,
        habitId,
        today,
        weekStart,
      );
      nextCount += 1;
    } else {
      await txn.runAsync(
        `DELETE FROM habit_weekly_checkins
         WHERE habit_id = ? AND checkin_date = ?`,
        habitId,
        today,
      );
      nextCount = Math.max(0, nextCount - 1);
    }

    const wasComplete = row.completionDate !== null;
    const isComplete = nextCount >= row.targetCount;
    if (wasComplete === isComplete) return;

    const rewardDate = isComplete ? today : row.completionDate;
    if (!rewardDate) throw new Error('Weekly completion could not be found.');
    await applyHabitCompletionTransition(
      txn,
      habitId,
      isComplete,
      rewardDate,
      todayDay,
      'single',
      'weekly',
    );
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyChange(db));
  } else {
    await db.withExclusiveTransactionAsync(applyChange);
  }

  return nextCount;
}
