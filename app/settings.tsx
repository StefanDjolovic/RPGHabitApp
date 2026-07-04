import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { syncAllHabitReminders } from '@/src/notifications/habit-reminders';
import { syncSystemNotifications } from '@/src/notifications/system-notifications';
import {
  getDeviceTimeZone,
  getRuntimeUserSettings,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from '@/src/settings/user-settings';

function shiftTime(value: string, minutes: number) {
  const [hour, minute] = value.split(':').map(Number);
  const totalMinutes = (hour * 60 + minute + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(
    totalMinutes % 60,
  ).padStart(2, '0')}`;
}

type TimeStepperProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const notificationTones: UserSettings['notificationTone'][] = ['gentle', 'system', 'strict'];
const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function TimeStepper({ label, value, onChange }: TimeStepperProps) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityLabel={`Earlier ${label.toLowerCase()}`}
          hitSlop={8}
          onPress={() => onChange(shiftTime(value, -30))}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.buttonPressed]}>
          <MaterialCommunityIcons name="minus" size={19} color="#AAB3CD" />
        </Pressable>
        <Text style={styles.timeValue}>{value}</Text>
        <Pressable
          accessibilityLabel={`Later ${label.toLowerCase()}`}
          hitSlop={8}
          onPress={() => onChange(shiftTime(value, 30))}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.buttonPressed]}>
          <MaterialCommunityIcons name="plus" size={19} color="#AAB3CD" />
        </Pressable>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<UserSettings>(() => ({
    ...getRuntimeUserSettings(),
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void loadUserSettings(db)
      .then((loadedSettings) => {
        if (active) setSettings({ ...loadedSettings });
      })
      .catch(() => {
        if (active) setError('Settings could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [db]);

  const updateSettings = (changes: Partial<UserSettings>) => {
    setSettings((current) => ({ ...current, ...changes }));
    setError('');
  };

  const save = async () => {
    try {
      setSaving(true);
      setError('');
      await saveUserSettings(db, settings);
      await syncAllHabitReminders(db);
      const notificationResult = await syncSystemNotifications(db, {
        requestPermission: true,
      });
      const systemNotificationsEnabled =
        settings.morningBriefingEnabled ||
        settings.eveningCheckinEnabled ||
        settings.weeklyReviewEnabled ||
        settings.recoveryReminderEnabled ||
        settings.progressAlertsEnabled;
      if (systemNotificationsEnabled && !notificationResult.permissionGranted) {
        setError('Settings saved. Allow notifications in phone settings to receive briefings.');
        setSaving(false);
        return;
      }
      router.back();
    } catch {
      setError('Settings could not be saved.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingState}>
          <ActivityIndicator color="#6DDEFF" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close settings"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}>
            <MaterialCommunityIcons name="close" size={22} color="#BFC5DB" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>SYSTEM CONFIG</Text>
            <Text style={styles.heading}>Settings</Text>
          </View>
          <Pressable
            accessibilityLabel="Save settings"
            disabled={saving}
            onPress={() => void save()}
            style={({ pressed }) => [styles.saveButton, pressed && styles.buttonPressed]}>
            {saving ? (
              <ActivityIndicator color="#061019" size="small" />
            ) : (
              <MaterialCommunityIcons name="check" size={22} color="#061019" />
            )}
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="human-handsup" size={18} color="#68E1A8" />
          <Text style={styles.sectionTitle}>ACCESSIBILITY & COMFORT</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.notificationRow}>
            <View style={styles.notificationIdentity}>
              <MaterialCommunityIcons name="motion-pause-outline" size={20} color="#7EE7FF" />
              <Text style={styles.notificationLabel}>Reduce Motion</Text>
            </View>
            <Switch
              accessibilityLabel="Reduce Motion"
              onValueChange={(reduceMotionEnabled) => updateSettings({ reduceMotionEnabled })}
              thumbColor={settings.reduceMotionEnabled ? '#F5F2FF' : '#8A91A8'}
              trackColor={{ false: '#282D40', true: '#2D7486' }}
              value={settings.reduceMotionEnabled}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationIdentity}>
              <MaterialCommunityIcons name="volume-high" size={20} color="#FFD166" />
              <Text style={styles.notificationLabel}>Sound</Text>
            </View>
            <Switch
              accessibilityLabel="Sound"
              onValueChange={(soundEnabled) => updateSettings({ soundEnabled })}
              thumbColor={settings.soundEnabled ? '#F5F2FF' : '#8A91A8'}
              trackColor={{ false: '#282D40', true: '#8A6A2D' }}
              value={settings.soundEnabled}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationIdentity}>
              <MaterialCommunityIcons name="vibrate" size={20} color="#C79CFF" />
              <Text style={styles.notificationLabel}>Haptics</Text>
            </View>
            <Switch
              accessibilityLabel="Haptics"
              onValueChange={(hapticsEnabled) => updateSettings({ hapticsEnabled })}
              thumbColor={settings.hapticsEnabled ? '#F5F2FF' : '#8A91A8'}
              trackColor={{ false: '#282D40', true: '#7652A8' }}
              value={settings.hapticsEnabled}
            />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="bell-outline" size={18} color="#FFD166" />
          <Text style={styles.sectionTitle}>BRIEFINGS & REMINDERS</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.toneBlock}>
            <Text style={styles.settingLabel}>MESSAGE TONE</Text>
            <View style={styles.segmentedControl}>
              {notificationTones.map((tone) => {
                const selected = settings.notificationTone === tone;
                return (
                  <Pressable
                    accessibilityLabel={`${tone} notification tone`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={tone}
                    onPress={() => updateSettings({ notificationTone: tone })}
                    style={({ pressed }) => [
                      styles.segmentButton,
                      selected && styles.segmentButtonSelected,
                      pressed && styles.buttonPressed,
                    ]}>
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {tone.charAt(0).toUpperCase() + tone.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationIdentity}>
              <MaterialCommunityIcons name="weather-sunset-up" size={20} color="#7EE7FF" />
              <Text style={styles.notificationLabel}>Morning Briefing</Text>
            </View>
            <Switch
              accessibilityLabel="Morning Briefing"
              onValueChange={(morningBriefingEnabled) =>
                updateSettings({ morningBriefingEnabled })
              }
              thumbColor={settings.morningBriefingEnabled ? '#F5F2FF' : '#8A91A8'}
              trackColor={{ false: '#282D40', true: '#2D7486' }}
              value={settings.morningBriefingEnabled}
            />
          </View>
          {settings.morningBriefingEnabled ? (
            <TimeStepper
              label="DELIVERY"
              onChange={(morningBriefingTime) => updateSettings({ morningBriefingTime })}
              value={settings.morningBriefingTime}
            />
          ) : null}

          <View style={styles.divider} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationIdentity}>
              <MaterialCommunityIcons name="weather-sunset-down" size={20} color="#C79CFF" />
              <Text style={styles.notificationLabel}>Evening Check-in</Text>
            </View>
            <Switch
              accessibilityLabel="Evening Check-in"
              onValueChange={(eveningCheckinEnabled) =>
                updateSettings({ eveningCheckinEnabled })
              }
              thumbColor={settings.eveningCheckinEnabled ? '#F5F2FF' : '#8A91A8'}
              trackColor={{ false: '#282D40', true: '#7652A8' }}
              value={settings.eveningCheckinEnabled}
            />
          </View>
          {settings.eveningCheckinEnabled ? (
            <TimeStepper
              label="DELIVERY"
              onChange={(eveningCheckinTime) => updateSettings({ eveningCheckinTime })}
              value={settings.eveningCheckinTime}
            />
          ) : null}

          <View style={styles.divider} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationIdentity}>
              <MaterialCommunityIcons name="calendar-week" size={20} color="#68E1A8" />
              <Text style={styles.notificationLabel}>Weekly Review</Text>
            </View>
            <Switch
              accessibilityLabel="Weekly Review reminder"
              onValueChange={(weeklyReviewEnabled) => updateSettings({ weeklyReviewEnabled })}
              thumbColor={settings.weeklyReviewEnabled ? '#F5F2FF' : '#8A91A8'}
              trackColor={{ false: '#282D40', true: '#34745B' }}
              value={settings.weeklyReviewEnabled}
            />
          </View>
          {settings.weeklyReviewEnabled ? (
            <View style={styles.weeklyControls}>
              <View style={styles.weekdaySelector}>
                {weekdayLabels.map((label, day) => {
                  const selected = settings.weeklyReviewDay === day;
                  return (
                    <Pressable
                      accessibilityLabel={`Weekly Review day ${day + 1}`}
                      accessibilityState={{ selected }}
                      key={`${label}-${day}`}
                      onPress={() => updateSettings({ weeklyReviewDay: day })}
                      style={({ pressed }) => [
                        styles.weekdayButton,
                        selected && styles.weekdayButtonSelected,
                        pressed && styles.buttonPressed,
                      ]}>
                      <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TimeStepper
                label="DELIVERY"
                onChange={(weeklyReviewTime) => updateSettings({ weeklyReviewTime })}
                value={settings.weeklyReviewTime}
              />
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationIdentity}>
              <MaterialCommunityIcons name="heart-pulse" size={20} color="#FF9BCB" />
              <Text style={styles.notificationLabel}>Recovery Quest</Text>
            </View>
            <Switch
              accessibilityLabel="Recovery Quest reminder"
              onValueChange={(recoveryReminderEnabled) =>
                updateSettings({ recoveryReminderEnabled })
              }
              thumbColor={settings.recoveryReminderEnabled ? '#F5F2FF' : '#8A91A8'}
              trackColor={{ false: '#282D40', true: '#8B466F' }}
              value={settings.recoveryReminderEnabled}
            />
          </View>
          {settings.recoveryReminderEnabled ? (
            <TimeStepper
              label="DELIVERY"
              onChange={(recoveryReminderTime) => updateSettings({ recoveryReminderTime })}
              value={settings.recoveryReminderTime}
            />
          ) : null}

          <View style={styles.divider} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationIdentity}>
              <MaterialCommunityIcons name="star-four-points-outline" size={20} color="#FFD166" />
              <Text style={styles.notificationLabel}>Dungeon & Progress</Text>
            </View>
            <Switch
              accessibilityLabel="Dungeon and progress alerts"
              onValueChange={(progressAlertsEnabled) =>
                updateSettings({ progressAlertsEnabled })
              }
              thumbColor={settings.progressAlertsEnabled ? '#F5F2FF' : '#8A91A8'}
              trackColor={{ false: '#282D40', true: '#8A6A2D' }}
              value={settings.progressAlertsEnabled}
            />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="earth" size={18} color="#6DDEFF" />
          <Text style={styles.sectionTitle}>TIME & DAY</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.timezoneRow}>
            <View style={styles.timezoneText}>
              <Text style={styles.settingLabel}>TIMEZONE</Text>
              <Text numberOfLines={1} style={styles.timezoneValue}>
                {settings.timezone}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Use device timezone"
              onPress={() => updateSettings({ timezone: getDeviceTimeZone() })}
              style={({ pressed }) => [styles.refreshButton, pressed && styles.buttonPressed]}>
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#6DDEFF" />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>DAY CUTOFF</Text>
            <View style={styles.stepper}>
              <Pressable
                accessibilityLabel="Earlier day cutoff"
                hitSlop={8}
                onPress={() =>
                  updateSettings({ dayCutoffHour: Math.max(0, settings.dayCutoffHour - 1) })
                }
                style={({ pressed }) => [styles.stepperButton, pressed && styles.buttonPressed]}>
                <MaterialCommunityIcons name="minus" size={19} color="#AAB3CD" />
              </Pressable>
              <Text style={styles.timeValue}>
                {String(settings.dayCutoffHour).padStart(2, '0')}:00
              </Text>
              <Pressable
                accessibilityLabel="Later day cutoff"
                hitSlop={8}
                onPress={() =>
                  updateSettings({ dayCutoffHour: Math.min(12, settings.dayCutoffHour + 1) })
                }
                style={({ pressed }) => [styles.stepperButton, pressed && styles.buttonPressed]}>
                <MaterialCommunityIcons name="plus" size={19} color="#AAB3CD" />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="weather-night" size={18} color="#C79CFF" />
          <Text style={styles.sectionTitle}>QUIET HOURS</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>ENABLED</Text>
            <Switch
              accessibilityLabel="Quiet hours"
              onValueChange={(quietHoursEnabled) => updateSettings({ quietHoursEnabled })}
              thumbColor={settings.quietHoursEnabled ? '#F5F2FF' : '#8A91A8'}
              trackColor={{ false: '#282D40', true: '#7652A8' }}
              value={settings.quietHoursEnabled}
            />
          </View>

          {settings.quietHoursEnabled ? (
            <>
              <View style={styles.divider} />
              <TimeStepper
                label="START"
                onChange={(quietStart) => updateSettings({ quietStart })}
                value={settings.quietStart}
              />
              <View style={styles.divider} />
              <TimeStepper
                label="END"
                onChange={(quietEnd) => updateSettings({ quietEnd })}
                value={settings.quietEnd}
              />
            </>
          ) : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 36 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  headerText: { flex: 1, marginHorizontal: 14 },
  eyebrow: { color: '#6DDEFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heading: { color: '#F5F2FF', fontSize: 28, fontWeight: '800', marginTop: 2 },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#292E44',
    backgroundColor: '#101421',
  },
  saveButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#6DDEFF',
  },
  buttonPressed: { opacity: 0.65 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: { color: '#AAB3CD', fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  panel: {
    borderWidth: 1,
    borderColor: '#252B42',
    borderRadius: 8,
    backgroundColor: '#0C101C',
    paddingHorizontal: 15,
    marginBottom: 24,
  },
  settingRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingLabel: { color: '#8F98B3', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  timezoneRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timezoneText: { flex: 1, minWidth: 0, gap: 5 },
  timezoneValue: { color: '#F1EFFF', fontSize: 16, fontWeight: '700' },
  refreshButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#111D29',
    borderWidth: 1,
    borderColor: '#244557',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#252B42' },
  toneBlock: { minHeight: 76, justifyContent: 'center', gap: 10 },
  segmentedControl: {
    height: 38,
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
    gap: 3,
    backgroundColor: '#080B14',
    borderWidth: 1,
    borderColor: '#292F45',
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentButtonSelected: { backgroundColor: '#233846' },
  segmentText: { color: '#78819B', fontSize: 10, fontWeight: '800' },
  segmentTextSelected: { color: '#DDF8FF' },
  notificationRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  notificationIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  notificationLabel: { color: '#E5E8F3', fontSize: 13, fontWeight: '800' },
  weeklyControls: { paddingBottom: 4 },
  weekdaySelector: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  weekdayButton: {
    flex: 1,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#111625',
    borderWidth: 1,
    borderColor: '#292F45',
  },
  weekdayButtonSelected: { backgroundColor: '#254D40', borderColor: '#3E8E70' },
  weekdayText: { color: '#7D86A1', fontSize: 10, fontWeight: '900' },
  weekdayTextSelected: { color: '#A8F0CF' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#292F45',
    overflow: 'hidden',
  },
  stepperButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121625',
  },
  timeValue: {
    width: 64,
    textAlign: 'center',
    color: '#F1EFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: { color: '#FF8297', fontSize: 13, textAlign: 'center' },
});
