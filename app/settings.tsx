import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { syncAllHabitReminders } from '@/src/notifications/habit-reminders';
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
