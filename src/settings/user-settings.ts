import type { SQLiteDatabase } from 'expo-sqlite';

export type UserSettings = {
  timezone: string;
  dayCutoffHour: number;
  reduceMotionEnabled: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  notificationTone: NotificationTone;
  morningBriefingEnabled: boolean;
  morningBriefingTime: string;
  eveningCheckinEnabled: boolean;
  eveningCheckinTime: string;
  weeklyReviewEnabled: boolean;
  weeklyReviewDay: number;
  weeklyReviewTime: string;
  recoveryReminderEnabled: boolean;
  recoveryReminderTime: string;
  progressAlertsEnabled: boolean;
};

export type NotificationTone = 'gentle' | 'system' | 'strict';

type UserSettingsRow = Omit<
  UserSettings,
  | 'reduceMotionEnabled'
  | 'soundEnabled'
  | 'hapticsEnabled'
  | 'quietHoursEnabled'
  | 'morningBriefingEnabled'
  | 'eveningCheckinEnabled'
  | 'weeklyReviewEnabled'
  | 'recoveryReminderEnabled'
  | 'progressAlertsEnabled'
> & {
  reduceMotionEnabled: number;
  soundEnabled: number;
  hapticsEnabled: number;
  quietHoursEnabled: number;
  morningBriefingEnabled: number;
  eveningCheckinEnabled: number;
  weeklyReviewEnabled: number;
  recoveryReminderEnabled: number;
  progressAlertsEnabled: number;
};

const defaultSettings: UserSettings = {
  timezone: 'UTC',
  dayCutoffHour: 4,
  reduceMotionEnabled: false,
  soundEnabled: true,
  hapticsEnabled: true,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
  notificationTone: 'gentle',
  morningBriefingEnabled: false,
  morningBriefingTime: '08:00',
  eveningCheckinEnabled: false,
  eveningCheckinTime: '20:00',
  weeklyReviewEnabled: false,
  weeklyReviewDay: 0,
  weeklyReviewTime: '18:00',
  recoveryReminderEnabled: false,
  recoveryReminderTime: '10:00',
  progressAlertsEnabled: false,
};

let runtimeSettings = { ...defaultSettings };
const runtimeListeners = new Set<() => void>();

function updateRuntimeSettings(settings: UserSettings) {
  runtimeSettings = settings;
  runtimeListeners.forEach((listener) => listener());
}

export function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function normalizeTime(value: string, fallback: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeSettings(settings: UserSettings): UserSettings {
  const notificationTone = ['gentle', 'system', 'strict'].includes(settings.notificationTone)
    ? settings.notificationTone
    : defaultSettings.notificationTone;
  return {
    timezone: settings.timezone || getDeviceTimeZone(),
    dayCutoffHour: Math.min(12, Math.max(0, Math.floor(settings.dayCutoffHour))),
    reduceMotionEnabled: Boolean(settings.reduceMotionEnabled),
    soundEnabled: Boolean(settings.soundEnabled),
    hapticsEnabled: Boolean(settings.hapticsEnabled),
    quietHoursEnabled: Boolean(settings.quietHoursEnabled),
    quietStart: normalizeTime(settings.quietStart, defaultSettings.quietStart),
    quietEnd: normalizeTime(settings.quietEnd, defaultSettings.quietEnd),
    notificationTone,
    morningBriefingEnabled: Boolean(settings.morningBriefingEnabled),
    morningBriefingTime: normalizeTime(
      settings.morningBriefingTime,
      defaultSettings.morningBriefingTime,
    ),
    eveningCheckinEnabled: Boolean(settings.eveningCheckinEnabled),
    eveningCheckinTime: normalizeTime(
      settings.eveningCheckinTime,
      defaultSettings.eveningCheckinTime,
    ),
    weeklyReviewEnabled: Boolean(settings.weeklyReviewEnabled),
    weeklyReviewDay: Math.min(6, Math.max(0, Math.floor(settings.weeklyReviewDay))),
    weeklyReviewTime: normalizeTime(
      settings.weeklyReviewTime,
      defaultSettings.weeklyReviewTime,
    ),
    recoveryReminderEnabled: Boolean(settings.recoveryReminderEnabled),
    recoveryReminderTime: normalizeTime(
      settings.recoveryReminderTime,
      defaultSettings.recoveryReminderTime,
    ),
    progressAlertsEnabled: Boolean(settings.progressAlertsEnabled),
  };
}

export function getRuntimeUserSettings() {
  return runtimeSettings;
}

export function subscribeUserSettings(listener: () => void) {
  runtimeListeners.add(listener);
  return () => {
    runtimeListeners.delete(listener);
  };
}

export async function loadUserSettings(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<UserSettingsRow>(
    `SELECT
       timezone,
       day_cutoff_hour AS dayCutoffHour,
       reduce_motion_enabled AS reduceMotionEnabled,
       sound_enabled AS soundEnabled,
       haptics_enabled AS hapticsEnabled,
       quiet_hours_enabled AS quietHoursEnabled,
       quiet_start AS quietStart,
       quiet_end AS quietEnd,
       notification_tone AS notificationTone,
       morning_briefing_enabled AS morningBriefingEnabled,
       morning_briefing_time AS morningBriefingTime,
       evening_checkin_enabled AS eveningCheckinEnabled,
       evening_checkin_time AS eveningCheckinTime,
       weekly_review_enabled AS weeklyReviewEnabled,
       weekly_review_day AS weeklyReviewDay,
       weekly_review_time AS weeklyReviewTime,
       recovery_reminder_enabled AS recoveryReminderEnabled,
       recovery_reminder_time AS recoveryReminderTime,
       progress_alerts_enabled AS progressAlertsEnabled
     FROM user_settings
     WHERE id = 1`,
  );
  const detectedTimezone = getDeviceTimeZone();
  updateRuntimeSettings(normalizeSettings({
    timezone: row?.timezone === 'system' ? detectedTimezone : row?.timezone ?? detectedTimezone,
    dayCutoffHour: row?.dayCutoffHour ?? defaultSettings.dayCutoffHour,
    reduceMotionEnabled: row?.reduceMotionEnabled === 1,
    soundEnabled: row ? row.soundEnabled === 1 : defaultSettings.soundEnabled,
    hapticsEnabled: row ? row.hapticsEnabled === 1 : defaultSettings.hapticsEnabled,
    quietHoursEnabled: row?.quietHoursEnabled === 1,
    quietStart: row?.quietStart ?? defaultSettings.quietStart,
    quietEnd: row?.quietEnd ?? defaultSettings.quietEnd,
    notificationTone: row?.notificationTone ?? defaultSettings.notificationTone,
    morningBriefingEnabled: row?.morningBriefingEnabled === 1,
    morningBriefingTime: row?.morningBriefingTime ?? defaultSettings.morningBriefingTime,
    eveningCheckinEnabled: row?.eveningCheckinEnabled === 1,
    eveningCheckinTime: row?.eveningCheckinTime ?? defaultSettings.eveningCheckinTime,
    weeklyReviewEnabled: row?.weeklyReviewEnabled === 1,
    weeklyReviewDay: row?.weeklyReviewDay ?? defaultSettings.weeklyReviewDay,
    weeklyReviewTime: row?.weeklyReviewTime ?? defaultSettings.weeklyReviewTime,
    recoveryReminderEnabled: row?.recoveryReminderEnabled === 1,
    recoveryReminderTime: row?.recoveryReminderTime ?? defaultSettings.recoveryReminderTime,
    progressAlertsEnabled: row?.progressAlertsEnabled === 1,
  }));

  if (!row || row.timezone === 'system') {
    await db.runAsync(
      `INSERT INTO user_settings (
         id, timezone, day_cutoff_hour, quiet_hours_enabled, quiet_start, quiet_end
       ) VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         timezone = excluded.timezone,
         updated_at = CURRENT_TIMESTAMP`,
      runtimeSettings.timezone,
      runtimeSettings.dayCutoffHour,
      runtimeSettings.quietHoursEnabled ? 1 : 0,
      runtimeSettings.quietStart,
      runtimeSettings.quietEnd,
    );
  }

  return runtimeSettings;
}

export async function saveUserSettings(db: SQLiteDatabase, settings: UserSettings) {
  const normalizedSettings = normalizeSettings(settings);
  await db.runAsync(
    `INSERT INTO user_settings (
       id, timezone, day_cutoff_hour, reduce_motion_enabled, sound_enabled,
       haptics_enabled, quiet_hours_enabled, quiet_start, quiet_end,
       notification_tone, morning_briefing_enabled, morning_briefing_time,
       evening_checkin_enabled, evening_checkin_time, weekly_review_enabled,
       weekly_review_day, weekly_review_time, recovery_reminder_enabled,
       recovery_reminder_time, progress_alerts_enabled
     ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       timezone = excluded.timezone,
       day_cutoff_hour = excluded.day_cutoff_hour,
       reduce_motion_enabled = excluded.reduce_motion_enabled,
       sound_enabled = excluded.sound_enabled,
       haptics_enabled = excluded.haptics_enabled,
       quiet_hours_enabled = excluded.quiet_hours_enabled,
       quiet_start = excluded.quiet_start,
       quiet_end = excluded.quiet_end,
       notification_tone = excluded.notification_tone,
       morning_briefing_enabled = excluded.morning_briefing_enabled,
       morning_briefing_time = excluded.morning_briefing_time,
       evening_checkin_enabled = excluded.evening_checkin_enabled,
       evening_checkin_time = excluded.evening_checkin_time,
       weekly_review_enabled = excluded.weekly_review_enabled,
       weekly_review_day = excluded.weekly_review_day,
       weekly_review_time = excluded.weekly_review_time,
       recovery_reminder_enabled = excluded.recovery_reminder_enabled,
       recovery_reminder_time = excluded.recovery_reminder_time,
       progress_alerts_enabled = excluded.progress_alerts_enabled,
       updated_at = CURRENT_TIMESTAMP`,
    normalizedSettings.timezone,
    normalizedSettings.dayCutoffHour,
    normalizedSettings.reduceMotionEnabled ? 1 : 0,
    normalizedSettings.soundEnabled ? 1 : 0,
    normalizedSettings.hapticsEnabled ? 1 : 0,
    normalizedSettings.quietHoursEnabled ? 1 : 0,
    normalizedSettings.quietStart,
    normalizedSettings.quietEnd,
    normalizedSettings.notificationTone,
    normalizedSettings.morningBriefingEnabled ? 1 : 0,
    normalizedSettings.morningBriefingTime,
    normalizedSettings.eveningCheckinEnabled ? 1 : 0,
    normalizedSettings.eveningCheckinTime,
    normalizedSettings.weeklyReviewEnabled ? 1 : 0,
    normalizedSettings.weeklyReviewDay,
    normalizedSettings.weeklyReviewTime,
    normalizedSettings.recoveryReminderEnabled ? 1 : 0,
    normalizedSettings.recoveryReminderTime,
    normalizedSettings.progressAlertsEnabled ? 1 : 0,
  );
  updateRuntimeSettings(normalizedSettings);
  return runtimeSettings;
}

type ZonedDateParts = { year: number; month: number; day: number; hour: number };

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: 'year' | 'month' | 'day' | 'hour') =>
      Number(parts.find((part) => part.type === type)?.value);
    return {
      year: value('year'),
      month: value('month'),
      day: value('day'),
      hour: value('hour'),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
    };
  }
}

export function getEffectiveDateContext(date = new Date()) {
  const settings = getRuntimeUserSettings();
  const parts = getZonedDateParts(date, settings.timezone);
  const calendarDate = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day - (parts.hour < settings.dayCutoffHour ? 1 : 0),
    ),
  );

  return {
    dateKey: calendarDate.toISOString().slice(0, 10),
    timezone: settings.timezone,
    dayCutoffHour: settings.dayCutoffHour,
  };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function getQuietHoursAdjustedTime(value: string, settings = runtimeSettings) {
  if (!settings.quietHoursEnabled) return { time: value, dayOffset: 0 };

  const time = timeToMinutes(value);
  const start = timeToMinutes(settings.quietStart);
  const end = timeToMinutes(settings.quietEnd);
  if (start === end) return { time: value, dayOffset: 0 };
  const isQuiet = start < end
    ? time >= start && time < end
    : time >= start || time < end;
  if (!isQuiet) return { time: value, dayOffset: 0 };

  return {
    time: settings.quietEnd,
    dayOffset: start > end && time >= start ? 1 : 0,
  };
}

export function applyQuietHoursToTime(value: string, settings = runtimeSettings) {
  return getQuietHoursAdjustedTime(value, settings).time;
}
