import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  setHabitCompletion,
  type HabitCadence,
  type HabitGoalType,
  type ReminderTone,
} from '@/src/database/habit-repository';
import { syncSystemNotifications } from '@/src/notifications/system-notifications';
import {
  getQuietHoursAdjustedTime,
  getRuntimeUserSettings,
} from '@/src/settings/user-settings';

const REMINDER_CHANNEL_ID = 'habit-reminders';
const SILENT_REMINDER_CHANNEL_ID = 'habit-reminders-silent';
const HABIT_REMINDER_CATEGORY_ID = 'habitReminderActions';
const HABIT_REMINDER_SNOOZE_CATEGORY_ID = 'habitReminderSnooze';
const COMPLETE_HABIT_ACTION_ID = 'completeHabit';
const SNOOZE_HABIT_ACTION_ID = 'snoozeHabit';
const SNOOZE_MINUTES = 15;

function getReminderChannelId(soundEnabled: boolean) {
  return soundEnabled ? REMINDER_CHANNEL_ID : SILENT_REMINDER_CHANNEL_ID;
}

type ReminderHabitRow = {
  title: string;
  cadence: HabitCadence;
  goalType: HabitGoalType;
  scheduleDays: string;
  reminderEnabled: number;
  reminderTime: string;
  reminderTone: ReminderTone;
  isActive: number;
  isPaused: number;
  isCompleted: number;
};

export type HabitReminderResponseResult = 'completed' | 'snoozed' | null;

if (process.env.EXPO_OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: process.env.EXPO_OS === 'android'
        ? true
        : getRuntimeUserSettings().soundEnabled,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidReminderChannel(soundEnabled = getRuntimeUserSettings().soundEnabled) {
  if (process.env.EXPO_OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(getReminderChannelId(soundEnabled), {
    name: soundEnabled ? 'Habit reminders' : 'Silent habit reminders',
    description: 'Reminders for scheduled real-life quests',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: soundEnabled ? 'default' : null,
    vibrationPattern: [0, 180],
    lightColor: '#6DDEFF',
  });
}

export async function configureHabitReminderActions() {
  if (process.env.EXPO_OS === 'web') return;

  const snoozeAction: Notifications.NotificationAction = {
    identifier: SNOOZE_HABIT_ACTION_ID,
    buttonTitle: `Snooze ${SNOOZE_MINUTES} min`,
    options: { opensAppToForeground: true },
  };
  await Promise.all([
    Notifications.setNotificationCategoryAsync(HABIT_REMINDER_CATEGORY_ID, [
      {
        identifier: COMPLETE_HABIT_ACTION_ID,
        buttonTitle: 'Complete quest',
        options: { opensAppToForeground: true },
      },
      snoozeAction,
    ]),
    Notifications.setNotificationCategoryAsync(HABIT_REMINDER_SNOOZE_CATEGORY_ID, [
      snoozeAction,
    ]),
  ]);
}

export async function requestHabitReminderPermission() {
  if (process.env.EXPO_OS === 'web') return false;

  await ensureAndroidReminderChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

function getReminderMessage(title: string, tone: ReminderTone) {
  if (tone === 'system') {
    return {
      title: 'Quest reminder',
      body: `Objective available: ${title}`,
    };
  }

  if (tone === 'strict') {
    return {
      title: 'Quest pending',
      body: `Complete "${title}" and keep today's plan on track.`,
    };
  }

  return {
    title: 'A small quest is ready',
    body: `"${title}" is here when you are ready.`,
  };
}

function parseReminderTime(value: string) {
  const [hourValue, minuteValue] = value.split(':').map(Number);
  return {
    hour: Number.isInteger(hourValue) ? Math.min(23, Math.max(0, hourValue)) : 9,
    minute: Number.isInteger(minuteValue) ? Math.min(59, Math.max(0, minuteValue)) : 0,
  };
}

function parseScheduleDays(value: string) {
  return [...new Set(value.split(',').map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((first, second) => first - second);
}

function getSnoozeDeliveryDate() {
  const settings = getRuntimeUserSettings();
  const deliveryDate = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);
  const originalTime = `${String(deliveryDate.getHours()).padStart(2, '0')}:${String(
    deliveryDate.getMinutes(),
  ).padStart(2, '0')}`;
  const adjusted = getQuietHoursAdjustedTime(originalTime, settings);
  const { hour, minute } = parseReminderTime(adjusted.time);
  deliveryDate.setHours(hour, minute, 0, 0);
  deliveryDate.setDate(deliveryDate.getDate() + adjusted.dayOffset);
  return deliveryDate;
}

async function recordHabitReminderSnooze(
  db: SQLiteDatabase,
  habitId: number,
  reminderTime: string,
  notificationId: string,
) {
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO habit_reminder_snoozes (
       client_event_id, habit_id, reminder_time
     ) VALUES (?, ?, ?)`,
    `${notificationId}:snooze`,
    habitId,
    reminderTime,
  );
  return result.changes > 0;
}

export async function getHabitReminderSnoozeCount(
  db: SQLiteDatabase,
  habitId: number,
) {
  const row = await db.getFirstAsync<{ snoozeCount: number }>(
    `SELECT COUNT(*) AS snoozeCount
     FROM habit_reminder_snoozes hrs
     JOIN habits h ON h.id = hrs.habit_id
     WHERE hrs.habit_id = ?
       AND hrs.reminder_time = h.reminder_time
       AND hrs.snoozed_at >= datetime('now', '-30 days')`,
    habitId,
  );
  return row?.snoozeCount ?? 0;
}

async function scheduleSnoozedHabitReminder(notification: Notifications.Notification) {
  const settings = getRuntimeUserSettings();
  const content = notification.request.content;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title ?? 'Quest reminder',
      body: content.body ?? 'Your quest is ready when you are.',
      data: content.data,
      categoryIdentifier: content.categoryIdentifier ?? HABIT_REMINDER_SNOOZE_CATEGORY_ID,
      sound: settings.soundEnabled ? 'default' : false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: getSnoozeDeliveryDate(),
      channelId: process.env.EXPO_OS === 'android'
        ? getReminderChannelId(settings.soundEnabled)
        : undefined,
    },
  });
}

export async function handleHabitReminderResponse(
  db: SQLiteDatabase,
  response: Notifications.NotificationResponse,
): Promise<HabitReminderResponseResult> {
  const data = response.notification.request.content.data;
  const habitId = Number(data?.habitId);
  if (!Number.isInteger(habitId) || habitId <= 0) return null;

  if (response.actionIdentifier === SNOOZE_HABIT_ACTION_ID) {
    const reminderTime = typeof data?.reminderTime === 'string' ? data.reminderTime : '09:00';
    const recorded = await recordHabitReminderSnooze(
      db,
      habitId,
      reminderTime,
      response.notification.request.identifier,
    );
    if (recorded) await scheduleSnoozedHabitReminder(response.notification);
    return 'snoozed';
  }

  if (response.actionIdentifier !== COMPLETE_HABIT_ACTION_ID) return null;
  const cadence = data?.habitCadence === 'one-time' ? 'one-time' : 'daily';
  await setHabitCompletion(db, habitId, true, cadence);
  await syncHabitReminderFromDatabase(db, habitId);
  await syncSystemNotifications(db);
  return 'completed';
}

export async function cancelHabitReminderNotifications(
  db: SQLiteDatabase,
  habitId: number,
) {
  const rows = await db.getAllAsync<{ notificationId: string }>(
    `SELECT notification_id AS notificationId
     FROM habit_reminder_notifications
     WHERE habit_id = ?`,
    habitId,
  );

  if (process.env.EXPO_OS !== 'web') {
    await Promise.allSettled(
      rows.map((row) => Notifications.cancelScheduledNotificationAsync(row.notificationId)),
    );
  }

  await db.runAsync(
    'DELETE FROM habit_reminder_notifications WHERE habit_id = ?',
    habitId,
  );
}

export async function syncHabitReminderFromDatabase(
  db: SQLiteDatabase,
  habitId: number,
) {
  const habit = await db.getFirstAsync<ReminderHabitRow>(
    `SELECT
       title,
       habit_type AS cadence,
       CASE
         WHEN target_duration_minutes > 0 THEN 'timer'
         ELSE goal_type
       END AS goalType,
       schedule_days AS scheduleDays,
       reminder_enabled AS reminderEnabled,
       reminder_time AS reminderTime,
       reminder_tone AS reminderTone,
       is_active AS isActive,
       is_paused AS isPaused,
       CASE WHEN habit_type = 'one-time' AND EXISTS (
         SELECT 1
         FROM habit_completions hc
         WHERE hc.habit_id = habits.id
           AND hc.status = 'complete'
       ) THEN 1 ELSE 0 END AS isCompleted
     FROM habits
     WHERE id = ?`,
    habitId,
  );

  await cancelHabitReminderNotifications(db, habitId);

  if (
    !habit ||
    habit.reminderEnabled !== 1 ||
    habit.isActive !== 1 ||
    habit.isPaused === 1 ||
    habit.isCompleted === 1 ||
    process.env.EXPO_OS === 'web'
  ) {
    return false;
  }

  const settings = getRuntimeUserSettings();
  await ensureAndroidReminderChannel(settings.soundEnabled);
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;

  const scheduledTime = getQuietHoursAdjustedTime(
    habit.reminderTime,
    settings,
  );
  const { hour, minute } = parseReminderTime(scheduledTime.time);
  const message = getReminderMessage(habit.title, habit.reminderTone);
  const canComplete =
    habit.goalType === 'single' &&
    (habit.cadence === 'daily' || habit.cadence === 'one-time');
  const scheduled: { notificationId: string; weekday: number }[] = [];

  try {
    for (const scheduleDay of parseScheduleDays(habit.scheduleDays)) {
      const weekday = ((scheduleDay + scheduledTime.dayOffset) % 7) + 1;
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          ...message,
          data: {
            url: '/',
            habitId,
            habitCadence: habit.cadence,
            reminderTime: habit.reminderTime,
          },
          categoryIdentifier: canComplete
            ? HABIT_REMINDER_CATEGORY_ID
            : HABIT_REMINDER_SNOOZE_CATEGORY_ID,
          sound: settings.soundEnabled ? 'default' : false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
          channelId: process.env.EXPO_OS === 'android'
            ? getReminderChannelId(settings.soundEnabled)
            : undefined,
        },
      });
      scheduled.push({ notificationId, weekday });
    }

    for (const reminder of scheduled) {
      await db.runAsync(
        `INSERT INTO habit_reminder_notifications (notification_id, habit_id, weekday)
         VALUES (?, ?, ?)`,
        reminder.notificationId,
        habitId,
        reminder.weekday,
      );
    }
  } catch (error) {
    await Promise.allSettled(
      scheduled.map((reminder) =>
        Notifications.cancelScheduledNotificationAsync(reminder.notificationId),
      ),
    );
    await db.runAsync(
      'DELETE FROM habit_reminder_notifications WHERE habit_id = ?',
      habitId,
    );
    throw error;
  }

  return scheduled.length > 0;
}

export async function syncAllHabitReminders(db: SQLiteDatabase) {
  const habits = await db.getAllAsync<{ id: number }>(
    `SELECT id
     FROM habits
     WHERE reminder_enabled = 1
     ORDER BY id ASC`,
  );

  for (const habit of habits) {
    await syncHabitReminderFromDatabase(db, habit.id).catch(() => false);
  }
}

export async function disableHabitReminder(db: SQLiteDatabase, habitId: number) {
  await db.runAsync(
    'UPDATE habits SET reminder_enabled = 0 WHERE id = ?',
    habitId,
  );
  await cancelHabitReminderNotifications(db, habitId);
}
