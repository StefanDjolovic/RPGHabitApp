import type { SQLiteDatabase } from 'expo-sqlite';

export type UserSettings = {
  timezone: string;
  dayCutoffHour: number;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
};

type UserSettingsRow = Omit<UserSettings, 'quietHoursEnabled'> & {
  quietHoursEnabled: number;
};

const defaultSettings: UserSettings = {
  timezone: 'UTC',
  dayCutoffHour: 4,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
};

let runtimeSettings = { ...defaultSettings };

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
  return {
    timezone: settings.timezone || getDeviceTimeZone(),
    dayCutoffHour: Math.min(12, Math.max(0, Math.floor(settings.dayCutoffHour))),
    quietHoursEnabled: Boolean(settings.quietHoursEnabled),
    quietStart: normalizeTime(settings.quietStart, defaultSettings.quietStart),
    quietEnd: normalizeTime(settings.quietEnd, defaultSettings.quietEnd),
  };
}

export function getRuntimeUserSettings() {
  return runtimeSettings;
}

export async function loadUserSettings(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<UserSettingsRow>(
    `SELECT
       timezone,
       day_cutoff_hour AS dayCutoffHour,
       quiet_hours_enabled AS quietHoursEnabled,
       quiet_start AS quietStart,
       quiet_end AS quietEnd
     FROM user_settings
     WHERE id = 1`,
  );
  const detectedTimezone = getDeviceTimeZone();
  runtimeSettings = normalizeSettings({
    timezone: row?.timezone === 'system' ? detectedTimezone : row?.timezone ?? detectedTimezone,
    dayCutoffHour: row?.dayCutoffHour ?? defaultSettings.dayCutoffHour,
    quietHoursEnabled: row?.quietHoursEnabled === 1,
    quietStart: row?.quietStart ?? defaultSettings.quietStart,
    quietEnd: row?.quietEnd ?? defaultSettings.quietEnd,
  });

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
  runtimeSettings = normalizeSettings(settings);
  await db.runAsync(
    `INSERT INTO user_settings (
       id, timezone, day_cutoff_hour, quiet_hours_enabled, quiet_start, quiet_end
     ) VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       timezone = excluded.timezone,
       day_cutoff_hour = excluded.day_cutoff_hour,
       quiet_hours_enabled = excluded.quiet_hours_enabled,
       quiet_start = excluded.quiet_start,
       quiet_end = excluded.quiet_end,
       updated_at = CURRENT_TIMESTAMP`,
    runtimeSettings.timezone,
    runtimeSettings.dayCutoffHour,
    runtimeSettings.quietHoursEnabled ? 1 : 0,
    runtimeSettings.quietStart,
    runtimeSettings.quietEnd,
  );
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
