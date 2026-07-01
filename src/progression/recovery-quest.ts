import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getDayFromDateKey,
  getLocalDateKey,
  type HabitAttribute,
} from '@/src/database/habit-repository';
import { MAX_DAILY_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';
import { getRuntimeUserSettings } from '@/src/settings/user-settings';

export const RECOVERY_QUEST_REWARD = {
  xp: 10,
  statXp: 1,
  energy: 1,
  attribute: 'discipline' as HabitAttribute,
} as const;

export type RecoveryQuestStatus = {
  available: boolean;
  completedToday: boolean;
  lastActiveDate: string | null;
  triggerDate: string | null;
  missedDays: number;
};

type ActivityDateRow = { completionDate: string | null };
type PlannedHabitRow = { scheduleDays: string; startDate: string };
type RecoveryEventRow = {
  triggerDate: string;
  lastActiveDate: string;
  missedDays: number;
};

const emptyStatus: RecoveryQuestStatus = {
  available: false,
  completedToday: false,
  lastActiveDate: null,
  triggerDate: null,
  missedDays: 0,
};

function parseScheduleDays(value: string) {
  return new Set(
    value
      .split(',')
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );
}

function getNextDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

export function getMissedRecoveryDates(
  lastActiveDate: string,
  today: string,
  plannedHabits: PlannedHabitRow[],
) {
  const habits = plannedHabits.map((habit) => ({
    ...habit,
    scheduleDays: parseScheduleDays(habit.scheduleDays),
  }));
  const missedDates: string[] = [];

  for (let dateKey = getNextDateKey(lastActiveDate); dateKey < today; dateKey = getNextDateKey(dateKey)) {
    const weekday = getDayFromDateKey(dateKey);
    const hadPlannedQuest = habits.some(
      (habit) => habit.startDate <= dateKey && habit.scheduleDays.has(weekday),
    );
    if (hadPlannedQuest) missedDates.push(dateKey);
  }

  return missedDates;
}

async function getLastActivityBefore(db: SQLiteDatabase, dateKey: string) {
  const row = await db.getFirstAsync<ActivityDateRow>(
    `SELECT MAX(completionDate) AS completionDate
     FROM (
       SELECT completion_date AS completionDate
       FROM habit_completions
       WHERE status = 'complete'
       UNION ALL
       SELECT event_date AS completionDate
       FROM boss_quest_reward_events
       WHERE reason = 'milestone'
       UNION ALL
       SELECT event_date AS completionDate
       FROM recovery_quest_events
     )
     WHERE completionDate < ?`,
    dateKey,
  );
  return row?.completionDate ?? null;
}

export async function getRecoveryQuestStatus(
  db: SQLiteDatabase,
): Promise<RecoveryQuestStatus> {
  const today = getLocalDateKey();
  const completedEvent = await db.getFirstAsync<RecoveryEventRow>(
    `SELECT
       trigger_date AS triggerDate,
       last_active_date AS lastActiveDate,
       missed_days AS missedDays
     FROM recovery_quest_events
     WHERE event_date = ?
     ORDER BY completed_at DESC
     LIMIT 1`,
    today,
  );

  if (completedEvent) {
    return {
      available: false,
      completedToday: true,
      lastActiveDate: completedEvent.lastActiveDate,
      triggerDate: completedEvent.triggerDate,
      missedDays: completedEvent.missedDays,
    };
  }

  const lastActiveDate = await getLastActivityBefore(db, today);
  if (!lastActiveDate) return emptyStatus;

  const plannedHabits = await db.getAllAsync<PlannedHabitRow>(
    `SELECT schedule_days AS scheduleDays, start_date AS startDate
     FROM habits
     WHERE is_active = 1
       AND is_paused = 0
       AND is_required = 1
       AND habit_type = 'daily'`,
  );
  const missedDates = getMissedRecoveryDates(lastActiveDate, today, plannedHabits);
  const triggerDate = missedDates.at(-1) ?? null;

  return {
    available: triggerDate !== null,
    completedToday: false,
    lastActiveDate,
    triggerDate,
    missedDays: missedDates.length,
  };
}

export async function completeRecoveryQuest(db: SQLiteDatabase) {
  let unlockedSecondWind = false;

  const applyCompletion = async (txn: SQLiteDatabase) => {
    const status = await getRecoveryQuestStatus(txn);
    if (!status.available || !status.triggerDate || !status.lastActiveDate) return;

    const today = getLocalDateKey();
    const settings = getRuntimeUserSettings();
    const [energyRow, recoveryCountRow] = await Promise.all([
      txn.getFirstAsync<{ total: number }>(
        `SELECT
         COALESCE((
           SELECT SUM(ee.amount)
           FROM energy_events ee
           JOIN habit_completions hc ON hc.id = ee.completion_id
           WHERE hc.completion_date = ? AND hc.status = 'complete'
         ), 0) +
         COALESCE((
           SELECT SUM(energy_amount)
           FROM boss_quest_reward_events
           WHERE event_date = ?
         ), 0) +
         COALESCE((
           SELECT SUM(energy_amount)
           FROM recovery_quest_events
           WHERE event_date = ?
         ), 0) AS total`,
        today,
        today,
        today,
      ),
      txn.getFirstAsync<{ total: number }>(
        'SELECT COUNT(*) AS total FROM recovery_quest_events',
      ),
    ]);
    const energyAmount = Math.min(
      RECOVERY_QUEST_REWARD.energy,
      Math.max(0, MAX_DAILY_DUNGEON_ENERGY - Math.max(0, energyRow?.total ?? 0)),
    );

    const eventResult = await txn.runAsync(
      `INSERT OR IGNORE INTO recovery_quest_events (
         client_event_id,
         trigger_date,
         event_date,
         last_active_date,
         missed_days,
         xp_amount,
         attribute,
         stat_xp_amount,
         energy_amount,
         local_timezone,
         day_cutoff_hour
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `recovery-${status.triggerDate}`,
      status.triggerDate,
      today,
      status.lastActiveDate,
      status.missedDays,
      RECOVERY_QUEST_REWARD.xp,
      RECOVERY_QUEST_REWARD.attribute,
      RECOVERY_QUEST_REWARD.statXp,
      energyAmount,
      settings.timezone,
      settings.dayCutoffHour,
    );
    unlockedSecondWind = eventResult.changes > 0 && (recoveryCountRow?.total ?? 0) === 0;
  };

  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => applyCompletion(db));
  } else {
    await db.withExclusiveTransactionAsync(applyCompletion);
  }

  return {
    status: await getRecoveryQuestStatus(db),
    unlockedSecondWind,
  };
}
