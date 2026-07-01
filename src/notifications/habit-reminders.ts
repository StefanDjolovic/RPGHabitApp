import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ReminderTone } from '@/src/database/habit-repository';
import {
  getQuietHoursAdjustedTime,
  getRuntimeUserSettings,
} from '@/src/settings/user-settings';

const REMINDER_CHANNEL_ID = 'habit-reminders';

type ReminderHabitRow = {
  title: string;
  cadence: 'daily' | 'weekly' | 'one-time';
  scheduleDays: string;
  reminderEnabled: number;
  reminderTime: string;
  reminderTone: ReminderTone;
  isActive: number;
  isPaused: number;
  isCompleted: number;
};

if (process.env.EXPO_OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidReminderChannel() {
  if (process.env.EXPO_OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Habit reminders',
    description: 'Reminders for scheduled real-life quests',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    vibrationPattern: [0, 180],
    lightColor: '#6DDEFF',
  });
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

  await ensureAndroidReminderChannel();
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;

  const scheduledTime = getQuietHoursAdjustedTime(
    habit.reminderTime,
    getRuntimeUserSettings(),
  );
  const { hour, minute } = parseReminderTime(scheduledTime.time);
  const message = getReminderMessage(habit.title, habit.reminderTone);
  const scheduled: { notificationId: string; weekday: number }[] = [];

  try {
    for (const scheduleDay of parseScheduleDays(habit.scheduleDays)) {
      const weekday = ((scheduleDay + scheduledTime.dayOffset) % 7) + 1;
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          ...message,
          data: { url: '/', habitId },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
          channelId: process.env.EXPO_OS === 'android' ? REMINDER_CHANNEL_ID : undefined,
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
