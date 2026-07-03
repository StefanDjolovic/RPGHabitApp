import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getRankTrialState } from '@/src/database/rank-repository';
import { MAX_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';
import { getPlayerProgress } from '@/src/progression/player-progression';
import { getRecoveryQuestStatus } from '@/src/progression/recovery-quest';
import {
  getQuietHoursAdjustedTime,
  getRuntimeUserSettings,
  type NotificationTone,
  type UserSettings,
} from '@/src/settings/user-settings';

const SYSTEM_CHANNEL_ID = 'system-updates';

type SystemNotificationKey =
  | 'morning-briefing'
  | 'evening-checkin'
  | 'weekly-review'
  | 'recovery-quest';

type ProgressNotificationKey = 'energy-full' | 'rank-trial-ready' | `skills-${string}`;
type ProgressNotificationKind = 'energy-full' | 'rank-trial-ready' | 'skills-unlocked';

type ScheduleDefinition = {
  key: SystemNotificationKey;
  time: string;
  weekday?: number;
  url: '/' | '/weekly-review';
};

type SyncOptions = {
  requestPermission?: boolean;
};

export type SystemNotificationSyncResult = {
  permissionGranted: boolean;
  scheduledCount: number;
};

type ProgressNotificationStateRow = {
  isActive: number;
  eventToken: string | null;
};

function parseTime(value: string) {
  const [hourValue, minuteValue] = value.split(':').map(Number);
  return {
    hour: Number.isInteger(hourValue) ? Math.min(23, Math.max(0, hourValue)) : 9,
    minute: Number.isInteger(minuteValue) ? Math.min(59, Math.max(0, minuteValue)) : 0,
  };
}

function getMessage(key: SystemNotificationKey, tone: NotificationTone) {
  const messages = {
    gentle: {
      'morning-briefing': {
        title: 'Your quests are ready',
        body: 'Take a calm look at today and choose where to begin.',
      },
      'evening-checkin': {
        title: 'Evening check-in',
        body: 'A quick check-in can close the day when you are ready.',
      },
      'weekly-review': {
        title: 'Your week in review',
        body: 'See what worked and shape a lighter plan for the next week.',
      },
      'recovery-quest': {
        title: 'A fresh start is available',
        body: 'Your Recovery Quest is waiting. One small step is enough.',
      },
    },
    system: {
      'morning-briefing': {
        title: 'Morning briefing available',
        body: 'Today\'s quest list is ready for review.',
      },
      'evening-checkin': {
        title: 'Daily status check',
        body: 'Review remaining objectives before the day closes.',
      },
      'weekly-review': {
        title: 'Weekly report generated',
        body: 'Performance trends and habit suggestions are ready.',
      },
      'recovery-quest': {
        title: 'Recovery Quest available',
        body: 'A controlled return objective has been activated.',
      },
    },
    strict: {
      'morning-briefing': {
        title: 'Set today\'s direction',
        body: 'Review the quest list and commit to the first objective.',
      },
      'evening-checkin': {
        title: 'Finish the daily check-in',
        body: 'Review what remains and close the day deliberately.',
      },
      'weekly-review': {
        title: 'Review the week',
        body: 'Check the results and adjust weak points before the next cycle.',
      },
      'recovery-quest': {
        title: 'Begin the return',
        body: 'Complete the Recovery Quest and rebuild momentum today.',
      },
    },
  } as const;

  return messages[tone][key];
}

function getProgressMessage(
  kind: ProgressNotificationKind,
  tone: NotificationTone,
  detail = '',
) {
  const messages = {
    gentle: {
      'energy-full': {
        title: 'Dungeon Energy is full',
        body: 'Your stored Energy is ready whenever you want to enter a gate.',
      },
      'rank-trial-ready': {
        title: 'A new rank is within reach',
        body: `${detail} is ready when you choose to face it.`,
      },
      'skills-unlocked': {
        title: 'New class skills unlocked',
        body: `${detail} skills are ready for your loadout.`,
      },
    },
    system: {
      'energy-full': {
        title: 'Dungeon Energy capacity reached',
        body: `${MAX_DUNGEON_ENERGY} Energy available. Gate access is ready.`,
      },
      'rank-trial-ready': {
        title: 'Rank-Up Trial available',
        body: `${detail} requirements complete. Trial access granted.`,
      },
      'skills-unlocked': {
        title: 'Skill set registered',
        body: `${detail} skills added to the active class archive.`,
      },
    },
    strict: {
      'energy-full': {
        title: 'Use your Dungeon Energy',
        body: 'Storage is full. Enter a gate before earning more Energy.',
      },
      'rank-trial-ready': {
        title: 'Face the Rank-Up Trial',
        body: `${detail} is unlocked. Complete the challenge to advance.`,
      },
      'skills-unlocked': {
        title: 'Configure the new skills',
        body: `${detail} skills are unlocked. Review the loadout before battle.`,
      },
    },
  } as const;

  return messages[tone][kind];
}

async function ensureSystemNotificationChannel() {
  if (process.env.EXPO_OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(SYSTEM_CHANNEL_ID, {
    name: 'Briefings and progress',
    description: 'Daily briefings, reviews and recovery reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    vibrationPattern: [0, 160],
    lightColor: '#6DDEFF',
  });
}

async function getPermission(requestPermission: boolean) {
  if (process.env.EXPO_OS === 'web') return false;

  await ensureSystemNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (!requestPermission) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

async function cancelStoredSystemNotifications(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ notificationId: string }>(
    `SELECT notification_id AS notificationId
     FROM system_notification_schedules`,
  );

  if (process.env.EXPO_OS !== 'web') {
    await Promise.allSettled(
      rows.map((row) => Notifications.cancelScheduledNotificationAsync(row.notificationId)),
    );
  }

  await db.runAsync('DELETE FROM system_notification_schedules');
}

async function getScheduleDefinitions(db: SQLiteDatabase, settings: UserSettings) {
  const definitions: ScheduleDefinition[] = [];

  if (settings.morningBriefingEnabled) {
    definitions.push({
      key: 'morning-briefing',
      time: settings.morningBriefingTime,
      url: '/',
    });
  }
  if (settings.eveningCheckinEnabled) {
    definitions.push({
      key: 'evening-checkin',
      time: settings.eveningCheckinTime,
      url: '/',
    });
  }
  if (settings.weeklyReviewEnabled) {
    definitions.push({
      key: 'weekly-review',
      time: settings.weeklyReviewTime,
      weekday: settings.weeklyReviewDay,
      url: '/weekly-review',
    });
  }
  if (settings.recoveryReminderEnabled) {
    const recovery = await getRecoveryQuestStatus(db);
    if (recovery.available && !recovery.completedToday) {
      definitions.push({
        key: 'recovery-quest',
        time: settings.recoveryReminderTime,
        url: '/',
      });
    }
  }

  return definitions;
}

export async function syncSystemNotifications(
  db: SQLiteDatabase,
  options: SyncOptions = {},
): Promise<SystemNotificationSyncResult> {
  const settings = getRuntimeUserSettings();
  await cancelStoredSystemNotifications(db);

  const hasEnabledNotifications =
    settings.morningBriefingEnabled ||
    settings.eveningCheckinEnabled ||
    settings.weeklyReviewEnabled ||
    settings.recoveryReminderEnabled ||
    settings.progressAlertsEnabled;
  if (!hasEnabledNotifications || process.env.EXPO_OS === 'web') {
    await syncProgressNotifications(db);
    return { permissionGranted: false, scheduledCount: 0 };
  }

  const permissionGranted = await getPermission(Boolean(options.requestPermission));
  if (!permissionGranted) return { permissionGranted: false, scheduledCount: 0 };

  const definitions = await getScheduleDefinitions(db, settings);
  const scheduled: { key: SystemNotificationKey; notificationId: string }[] = [];

  try {
    for (const definition of definitions) {
      const adjusted = getQuietHoursAdjustedTime(definition.time, settings);
      const { hour, minute } = parseTime(adjusted.time);
      const message = getMessage(definition.key, settings.notificationTone);
      const trigger = definition.weekday === undefined
        ? ({
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
            channelId: process.env.EXPO_OS === 'android' ? SYSTEM_CHANNEL_ID : undefined,
          } satisfies Notifications.DailyTriggerInput)
        : ({
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: ((definition.weekday + adjusted.dayOffset) % 7) + 1,
            hour,
            minute,
            channelId: process.env.EXPO_OS === 'android' ? SYSTEM_CHANNEL_ID : undefined,
          } satisfies Notifications.WeeklyTriggerInput);
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          ...message,
          data: { url: definition.url, notificationType: definition.key },
          sound: 'default',
        },
        trigger,
      });
      scheduled.push({ key: definition.key, notificationId });
    }

    for (const schedule of scheduled) {
      await db.runAsync(
        `INSERT INTO system_notification_schedules (notification_key, notification_id)
         VALUES (?, ?)`,
        schedule.key,
        schedule.notificationId,
      );
    }
  } catch (error) {
    await Promise.allSettled(
      scheduled.map((schedule) =>
        Notifications.cancelScheduledNotificationAsync(schedule.notificationId),
      ),
    );
    await db.runAsync('DELETE FROM system_notification_schedules');
    throw error;
  }

  await syncProgressNotifications(db);
  return { permissionGranted: true, scheduledCount: scheduled.length };
}

async function getProgressNotificationState(
  db: SQLiteDatabase,
  notificationKey: ProgressNotificationKey,
) {
  return db.getFirstAsync<ProgressNotificationStateRow>(
    `SELECT is_active AS isActive, event_token AS eventToken
     FROM progress_notification_state
     WHERE notification_key = ?`,
    notificationKey,
  );
}

async function saveProgressNotificationState(
  db: SQLiteDatabase,
  notificationKey: ProgressNotificationKey,
  isActive: boolean,
  eventToken: string | null = null,
) {
  await db.runAsync(
    `INSERT INTO progress_notification_state (
       notification_key, is_active, event_token, updated_at
     ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(notification_key) DO UPDATE SET
       is_active = excluded.is_active,
       event_token = excluded.event_token,
       updated_at = CURRENT_TIMESTAMP`,
    notificationKey,
    isActive ? 1 : 0,
    eventToken,
  );
}

async function presentProgressNotification(
  kind: ProgressNotificationKind,
  url: '/dungeon' | '/rank-trial' | '/class-skills',
  tone: NotificationTone,
  detail = '',
) {
  const message = getProgressMessage(kind, tone, detail);
  await Notifications.scheduleNotificationAsync({
    content: {
      ...message,
      data: { url, notificationType: kind },
      sound: 'default',
    },
    trigger: null,
  });
}

async function updateProgressCondition(
  db: SQLiteDatabase,
  notificationKey: ProgressNotificationKey,
  active: boolean,
  kind: ProgressNotificationKind,
  url: '/dungeon' | '/rank-trial',
  tone: NotificationTone,
  detail = '',
) {
  const state = await getProgressNotificationState(db, notificationKey);
  if (!active) {
    if (state?.isActive === 1) {
      await saveProgressNotificationState(db, notificationKey, false);
    }
    return false;
  }
  if (state?.isActive === 1) return false;

  await presentProgressNotification(kind, url, tone, detail);
  await saveProgressNotificationState(db, notificationKey, true);
  return true;
}

export async function syncProgressNotifications(db: SQLiteDatabase) {
  const settings = getRuntimeUserSettings();
  if (!settings.progressAlertsEnabled) {
    await db.runAsync(
      `UPDATE progress_notification_state
       SET is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE notification_key IN ('energy-full', 'rank-trial-ready')`,
    );
    return 0;
  }
  if (process.env.EXPO_OS === 'web') return 0;
  if (!(await getPermission(false))) return 0;

  const [progress, rankTrial] = await Promise.all([
    getPlayerProgress(db),
    getRankTrialState(db),
  ]);
  const results = await Promise.all([
    updateProgressCondition(
      db,
      'energy-full',
      progress.dungeonEnergy >= MAX_DUNGEON_ENERGY,
      'energy-full',
      '/dungeon',
      settings.notificationTone,
    ),
    updateProgressCondition(
      db,
      'rank-trial-ready',
      rankTrial.ready,
      'rank-trial-ready',
      '/rank-trial',
      settings.notificationTone,
      rankTrial.nextRank?.trialName ?? 'Rank-Up Trial',
    ),
  ]);

  return results.filter(Boolean).length;
}

export async function notifySkillsUnlocked(
  db: SQLiteDatabase,
  classKey: string,
  className: string,
  skillCount: number,
) {
  const settings = getRuntimeUserSettings();
  if (
    !settings.progressAlertsEnabled ||
    skillCount <= 0 ||
    process.env.EXPO_OS === 'web' ||
    !(await getPermission(false))
  ) {
    return false;
  }

  const notificationKey: ProgressNotificationKey = `skills-${classKey}`;
  const eventToken = `${classKey}:${skillCount}`;
  const state = await getProgressNotificationState(db, notificationKey);
  if (state?.eventToken === eventToken) return false;

  await presentProgressNotification(
    'skills-unlocked',
    '/class-skills',
    settings.notificationTone,
    `${skillCount} ${className}`,
  );
  await saveProgressNotificationState(db, notificationKey, true, eventToken);
  return true;
}
