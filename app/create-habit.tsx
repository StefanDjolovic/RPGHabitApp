import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createHabit,
  getHabitForEdit,
  HabitAttribute,
  HabitCadence,
  HabitDifficulty,
  HabitGoalType,
  ReminderTone,
  rewardByDifficulty,
  updateHabit,
} from '@/src/database/habit-repository';
import {
  habitColorOptions,
  habitIconOptions,
  type HabitColorKey,
  type HabitIconKey,
} from '@/src/habits/habit-appearance';
import {
  disableHabitReminder,
  getHabitReminderSnoozeCount,
  requestHabitReminderPermission,
  syncHabitReminderFromDatabase,
} from '@/src/notifications/habit-reminders';
import { syncSystemNotifications } from '@/src/notifications/system-notifications';
import { getSecondaryAttributeXp } from '@/src/progression/attribute-rewards';

const difficultyOptions: { value: HabitDifficulty; label: string; color: string }[] = [
  { value: 'easy', label: 'Easy', color: '#68E1A8' },
  { value: 'medium', label: 'Medium', color: '#61D4FF' },
  { value: 'hard', label: 'Hard', color: '#C68CFF' },
];

const attributeOptions: {
  value: HabitAttribute;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { value: 'strength', label: 'Strength', icon: 'dumbbell' },
  { value: 'intelligence', label: 'Intelligence', icon: 'brain' },
  { value: 'discipline', label: 'Discipline', icon: 'shield-check' },
  { value: 'vitality', label: 'Vitality', icon: 'heart-pulse' },
  { value: 'creativity', label: 'Creativity', icon: 'palette' },
];

const attributeShortLabels: Record<HabitAttribute, string> = {
  strength: 'STR',
  intelligence: 'INT',
  discipline: 'DIS',
  vitality: 'VIT',
  creativity: 'CRE',
};

const weekdayOptions = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const everyDaySchedule = weekdayOptions.map((day) => day.value);
const reminderToneOptions: { value: ReminderTone; label: string }[] = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'system', label: 'System' },
  { value: 'strict', label: 'Strict' },
];

export default function CreateHabitScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams();
  const rawHabitId = Array.isArray(params.id) ? params.id[0] : params.id;
  const habitId = useMemo(() => {
    const parsedId = Number(rawHabitId);
    return Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
  }, [rawHabitId]);
  const editing = habitId !== null;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [iconKey, setIconKey] = useState<HabitIconKey | null>(null);
  const [colorKey, setColorKey] = useState<HabitColorKey | null>(null);
  const [difficulty, setDifficulty] = useState<HabitDifficulty>('medium');
  const [attribute, setAttribute] = useState<HabitAttribute>('discipline');
  const [secondaryAttribute, setSecondaryAttribute] = useState<HabitAttribute | null>(null);
  const [cadence, setCadence] = useState<HabitCadence>('daily');
  const [goalType, setGoalType] = useState<HabitGoalType>('single');
  const [targetCount, setTargetCount] = useState(3);
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(20);
  const [scheduleDays, setScheduleDays] = useState<number[]>(everyDaySchedule);
  const [isRequired, setIsRequired] = useState(true);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(9);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [reminderTone, setReminderTone] = useState<ReminderTone>('gentle');
  const [reminderSnoozeCount, setReminderSnoozeCount] = useState(0);
  const [loadingHabit, setLoadingHabit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const reward = useMemo(() => rewardByDifficulty[difficulty], [difficulty]);

  useEffect(() => {
    if (!habitId) return;

    let active = true;
    const loadHabit = async () => {
      try {
        setLoadingHabit(true);
        setError('');
        const [habit, snoozeCount] = await Promise.all([
          getHabitForEdit(db, habitId),
          getHabitReminderSnoozeCount(db, habitId),
        ]);
        if (!active) return;

        if (!habit) {
          setError('This quest could not be found.');
          return;
        }

        setTitle(habit.title);
        setDescription(habit.description);
        setIconKey(habit.iconKey ?? null);
        setColorKey(habit.colorKey ?? null);
        setDifficulty(habit.difficulty);
        setAttribute(habit.attribute);
        setSecondaryAttribute(habit.secondaryAttribute);
        setCadence(habit.cadence);
        setGoalType(habit.goalType);
        setTargetCount(habit.targetCount);
        setTargetDurationMinutes(habit.targetDurationMinutes);
        setScheduleDays(habit.scheduleDays);
        setIsRequired(habit.isRequired);
        setReminderEnabled(habit.reminderEnabled);
        const [hour, minute] = habit.reminderTime.split(':').map(Number);
        setReminderHour(Number.isInteger(hour) ? hour : 9);
        setReminderMinute(Number.isInteger(minute) ? minute : 0);
        setReminderTone(habit.reminderTone);
        setReminderSnoozeCount(snoozeCount);
      } catch {
        if (active) setError('The quest could not be loaded. Please try again.');
      } finally {
        if (active) setLoadingHabit(false);
      }
    };

    void loadHabit();

    return () => {
      active = false;
    };
  }, [db, habitId]);

  const saveHabit = async () => {
    if (!title.trim()) {
      setError('Enter a name for your habit.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      if (reminderEnabled) {
        const permissionGranted = await requestHabitReminderPermission();
        if (!permissionGranted) {
          setError('Notification permission is required for this reminder.');
          setSaving(false);
          return;
        }
      }

      const reminderTime = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`;
      const habitPayload = {
        title,
        description,
        iconKey,
        colorKey,
        difficulty,
        attribute,
        secondaryAttribute,
        cadence,
        goalType,
        targetCount,
        targetDurationMinutes,
        scheduleDays,
        isRequired,
        reminderEnabled,
        reminderTime,
        reminderTone,
      };
      let savedHabitId: number;
      if (editing && habitId) {
        await updateHabit(db, habitId, habitPayload);
        savedHabitId = habitId;
      } else {
        savedHabitId = await createHabit(db, habitPayload);
      }

      try {
        await syncHabitReminderFromDatabase(db, savedHabitId);
      } catch {
        await disableHabitReminder(db, savedHabitId);
        Alert.alert(
          'Quest saved',
          'The reminder could not be scheduled. The quest was saved with reminders turned off.',
        );
      }
      await syncSystemNotifications(db).catch(() => ({
        permissionGranted: false,
        scheduledCount: 0,
      }));
      router.back();
    } catch {
      setError('The habit could not be saved. Please try again.');
      setSaving(false);
    }
  };

  const toggleScheduleDay = (day: number) => {
    setScheduleDays((current) => {
      let nextSchedule: number[];
      if (current.includes(day)) {
        nextSchedule = current.length > 1 ? current.filter((item) => item !== day) : current;
      } else {
        nextSchedule = [...current, day].sort((first, second) => first - second);
      }

      if (cadence === 'weekly') {
        setTargetCount((target) => Math.min(target, nextSchedule.length));
      }
      return nextSchedule;
    });
  };

  const selectCadence = (nextCadence: HabitCadence) => {
    setCadence(nextCadence);
    if (nextCadence !== 'daily') {
      setGoalType('single');
      setIsRequired(false);
    }
    if (nextCadence === 'weekly') {
      setTargetCount((current) =>
        Math.min(scheduleDays.length, current <= 1 ? 3 : current),
      );
    }
    if (nextCadence === 'one-time') {
      setScheduleDays(everyDaySchedule);
    }
  };

  const adjustReminderTime = (minutes: number) => {
    const currentTotal = reminderHour * 60 + reminderMinute;
    const nextTotal = (currentTotal + minutes + 24 * 60) % (24 * 60);
    setReminderHour(Math.floor(nextTotal / 60));
    setReminderMinute(nextTotal % 60);
  };
  const suggestedReminderTime = useMemo(() => {
    const nextTotal = (reminderHour * 60 + reminderMinute + 60) % (24 * 60);
    return `${String(Math.floor(nextTotal / 60)).padStart(2, '0')}:${String(
      nextTotal % 60,
    ).padStart(2, '0')}`;
  }, [reminderHour, reminderMinute]);

  const applySuggestedReminderTime = () => {
    const [hour, minute] = suggestedReminderTime.split(':').map(Number);
    setReminderHour(hour);
    setReminderMinute(minute);
    setReminderSnoozeCount(0);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" color="#BFC5DB" size={23} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>{editing ? 'EDIT QUEST' : 'NEW QUEST'}</Text>
              <Text style={styles.title}>{editing ? 'Edit habit' : 'Create habit'}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <Text style={styles.label}>HABIT NAME</Text>
          <TextInput
            autoFocus={!editing}
            maxLength={60}
            onChangeText={setTitle}
            placeholder="e.g. Morning workout"
            placeholderTextColor="#555E7A"
            style={styles.input}
            value={title}
          />

          <Text style={styles.label}>DESCRIPTION · OPTIONAL</Text>
          <TextInput
            maxLength={120}
            multiline
            onChangeText={setDescription}
            placeholder="What counts as completing this habit?"
            placeholderTextColor="#555E7A"
            style={[styles.input, styles.descriptionInput]}
            textAlignVertical="top"
            value={description}
          />

          <View style={styles.appearanceBlock}>
            <Text style={styles.label}>QUEST ICON</Text>
            <ScrollView
              contentContainerStyle={styles.appearanceScrollContent}
              horizontal
              showsHorizontalScrollIndicator={false}>
              <Pressable
                accessibilityLabel="Automatic quest icon"
                accessibilityRole="radio"
                accessibilityState={{ checked: iconKey === null }}
                onPress={() => setIconKey(null)}
                style={[styles.iconOption, iconKey === null && styles.iconOptionSelected]}>
                <MaterialCommunityIcons
                  color={iconKey === null ? '#7EE7FF' : '#707894'}
                  name="auto-fix"
                  size={21}
                />
              </Pressable>
              {habitIconOptions.map((option) => {
                const selected = iconKey === option.key;
                return (
                  <Pressable
                    accessibilityLabel={`${option.label} quest icon`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={option.key}
                    onPress={() => setIconKey(option.key)}
                    style={[styles.iconOption, selected && styles.iconOptionSelected]}>
                    <MaterialCommunityIcons
                      color={selected ? '#7EE7FF' : '#707894'}
                      name={option.key}
                      size={21}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>QUEST COLOR</Text>
            <View style={styles.colorRow}>
              <Pressable
                accessibilityLabel="Automatic quest color"
                accessibilityRole="radio"
                accessibilityState={{ checked: colorKey === null }}
                onPress={() => setColorKey(null)}
                style={[styles.colorOption, colorKey === null && styles.colorOptionSelected]}>
                <MaterialCommunityIcons
                  color={colorKey === null ? '#7EE7FF' : '#707894'}
                  name="format-color-fill"
                  size={18}
                />
              </Pressable>
              {habitColorOptions.map((option) => {
                const selected = colorKey === option.key;
                return (
                  <Pressable
                    accessibilityLabel={`${option.label} quest color`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={option.key}
                    onPress={() => setColorKey(option.key)}
                    style={[styles.colorOption, selected && styles.colorOptionSelected]}>
                    <View
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: option.color },
                        selected && { borderColor: '#F3F0FF' },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Text style={styles.label}>CADENCE</Text>
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: cadence === 'daily' }}
              onPress={() => selectCadence('daily')}
              style={[styles.modeOption, cadence === 'daily' && styles.modeOptionSelected]}>
              <MaterialCommunityIcons
                color={cadence === 'daily' ? '#7EE7FF' : '#707894'}
                name="calendar-today"
                size={18}
              />
              <Text style={[styles.modeText, cadence === 'daily' && styles.modeTextSelected]}>
                Daily
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: cadence === 'weekly' }}
              onPress={() => selectCadence('weekly')}
              style={[styles.modeOption, cadence === 'weekly' && styles.modeOptionSelected]}>
              <MaterialCommunityIcons
                color={cadence === 'weekly' ? '#7EE7FF' : '#707894'}
                name="calendar-week"
                size={18}
              />
              <Text style={[styles.modeText, cadence === 'weekly' && styles.modeTextSelected]}>
                Weekly
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: cadence === 'one-time' }}
              onPress={() => selectCadence('one-time')}
              style={[styles.modeOption, cadence === 'one-time' && styles.modeOptionSelected]}>
              <MaterialCommunityIcons
                color={cadence === 'one-time' ? '#7EE7FF' : '#707894'}
                name="calendar-check-outline"
                size={18}
              />
              <Text style={[styles.modeText, cadence === 'one-time' && styles.modeTextSelected]}>
                One-time
              </Text>
            </Pressable>
          </View>

          {cadence === 'daily' ? (
            <>
              <Text style={styles.label}>QUEST MODE</Text>
              <View style={styles.modeRow}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isRequired }}
                  onPress={() => setIsRequired(true)}
                  style={[styles.modeOption, isRequired && styles.modeOptionSelected]}>
                  <MaterialCommunityIcons
                    color={isRequired ? '#7EE7FF' : '#707894'}
                    name="checkbox-marked-circle-outline"
                    size={18}
                  />
                  <Text style={[styles.modeText, isRequired && styles.modeTextSelected]}>
                    Required
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: !isRequired }}
                  onPress={() => setIsRequired(false)}
                  style={[styles.modeOption, !isRequired && styles.modeOptionSelected]}>
                  <MaterialCommunityIcons
                    color={!isRequired ? '#7EE7FF' : '#707894'}
                    name="star-outline"
                    size={18}
                  />
                  <Text style={[styles.modeText, !isRequired && styles.modeTextSelected]}>
                    Optional
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.label}>GOAL TYPE</Text>
              <View style={styles.modeRow}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: goalType === 'single' }}
                  onPress={() => setGoalType('single')}
                  style={[styles.modeOption, goalType === 'single' && styles.modeOptionSelected]}>
                  <MaterialCommunityIcons
                    color={goalType === 'single' ? '#7EE7FF' : '#707894'}
                    name="check-circle-outline"
                    size={18}
                  />
                  <Text
                    style={[styles.modeText, goalType === 'single' && styles.modeTextSelected]}>
                    Check-in
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: goalType === 'counter' }}
                  onPress={() => setGoalType('counter')}
                  style={[styles.modeOption, goalType === 'counter' && styles.modeOptionSelected]}>
                  <MaterialCommunityIcons
                    color={goalType === 'counter' ? '#7EE7FF' : '#707894'}
                    name="counter"
                    size={19}
                  />
                  <Text
                    style={[styles.modeText, goalType === 'counter' && styles.modeTextSelected]}>
                    Counter
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: goalType === 'timer' }}
                  onPress={() => setGoalType('timer')}
                  style={[styles.modeOption, goalType === 'timer' && styles.modeOptionSelected]}>
                  <MaterialCommunityIcons
                    color={goalType === 'timer' ? '#7EE7FF' : '#707894'}
                    name="timer-outline"
                    size={19}
                  />
                  <Text
                    style={[styles.modeText, goalType === 'timer' && styles.modeTextSelected]}>
                    Timer
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {cadence === 'daily' && goalType === 'counter' ? (
            <>
              <Text style={styles.label}>DAILY TARGET</Text>
              <View style={styles.targetRow}>
                <MaterialCommunityIcons name="target" size={20} color="#8E72FF" />
                <Text style={styles.targetLabel}>Completions</Text>
                <View style={styles.targetStepper}>
                  <Pressable
                    accessibilityLabel="Decrease daily target"
                    disabled={targetCount <= 2}
                    onPress={() => setTargetCount((current) => Math.max(2, current - 1))}
                    style={({ pressed }) => [
                      styles.targetButton,
                      targetCount <= 2 && styles.targetButtonDisabled,
                      pressed && styles.targetButtonPressed,
                    ]}>
                    <MaterialCommunityIcons name="minus" size={18} color="#AEB6CF" />
                  </Pressable>
                  <Text style={styles.targetValue}>{targetCount}</Text>
                  <Pressable
                    accessibilityLabel="Increase daily target"
                    disabled={targetCount >= 99}
                    onPress={() => setTargetCount((current) => Math.min(99, current + 1))}
                    style={({ pressed }) => [
                      styles.targetButton,
                      targetCount >= 99 && styles.targetButtonDisabled,
                      pressed && styles.targetButtonPressed,
                    ]}>
                    <MaterialCommunityIcons name="plus" size={18} color="#7EE7FF" />
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}

          {cadence === 'daily' && goalType === 'timer' ? (
            <>
              <Text style={styles.label}>DURATION TARGET</Text>
              <View style={styles.targetRow}>
                <MaterialCommunityIcons name="timer-sand" size={20} color="#8E72FF" />
                <Text style={styles.targetLabel}>Minutes</Text>
                <View style={styles.targetStepper}>
                  <Pressable
                    accessibilityLabel="Decrease duration target"
                    disabled={targetDurationMinutes <= 5}
                    onPress={() =>
                      setTargetDurationMinutes((current) => Math.max(5, current - 5))
                    }
                    style={({ pressed }) => [
                      styles.targetButton,
                      targetDurationMinutes <= 5 && styles.targetButtonDisabled,
                      pressed && styles.targetButtonPressed,
                    ]}>
                    <MaterialCommunityIcons name="minus" size={18} color="#AEB6CF" />
                  </Pressable>
                  <Text style={styles.targetValue}>{targetDurationMinutes}</Text>
                  <Pressable
                    accessibilityLabel="Increase duration target"
                    disabled={targetDurationMinutes >= 180}
                    onPress={() =>
                      setTargetDurationMinutes((current) => Math.min(180, current + 5))
                    }
                    style={({ pressed }) => [
                      styles.targetButton,
                      targetDurationMinutes >= 180 && styles.targetButtonDisabled,
                      pressed && styles.targetButtonPressed,
                    ]}>
                    <MaterialCommunityIcons name="plus" size={18} color="#7EE7FF" />
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}

          {cadence === 'weekly' ? (
            <>
              <Text style={styles.label}>WEEKLY TARGET</Text>
              <View style={styles.targetRow}>
                <MaterialCommunityIcons name="calendar-check" size={20} color="#8E72FF" />
                <Text style={styles.targetLabel}>Check-ins</Text>
                <View style={styles.targetStepper}>
                  <Pressable
                    accessibilityLabel="Decrease weekly target"
                    disabled={targetCount <= 1}
                    onPress={() => setTargetCount((current) => Math.max(1, current - 1))}
                    style={({ pressed }) => [
                      styles.targetButton,
                      targetCount <= 1 && styles.targetButtonDisabled,
                      pressed && styles.targetButtonPressed,
                    ]}>
                    <MaterialCommunityIcons name="minus" size={18} color="#AEB6CF" />
                  </Pressable>
                  <Text style={styles.targetValue}>{targetCount}</Text>
                  <Pressable
                    accessibilityLabel="Increase weekly target"
                    disabled={targetCount >= scheduleDays.length}
                    onPress={() =>
                      setTargetCount((current) => Math.min(scheduleDays.length, current + 1))
                    }
                    style={({ pressed }) => [
                      styles.targetButton,
                      targetCount >= scheduleDays.length && styles.targetButtonDisabled,
                      pressed && styles.targetButtonPressed,
                    ]}>
                    <MaterialCommunityIcons name="plus" size={18} color="#7EE7FF" />
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}

          {cadence !== 'one-time' ? (
            <>
              <Text style={styles.label}>{cadence === 'weekly' ? 'CHECK-IN DAYS' : 'SCHEDULE'}</Text>
              <View style={styles.weekdayRow}>
                {weekdayOptions.map((day) => {
                  const selected = scheduleDays.includes(day.value);

                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      key={day.value}
                      onPress={() => toggleScheduleDay(day.value)}
                      style={[styles.weekdayButton, selected && styles.weekdayButtonSelected]}>
                      <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.label}>HABIT REMINDER</Text>
          <View style={[styles.reminderHeader, !reminderEnabled && styles.reminderHeaderOff]}>
            <View style={styles.reminderHeaderIcon}>
              <MaterialCommunityIcons name="bell-outline" size={21} color="#7EE7FF" />
            </View>
            <View style={styles.reminderHeaderText}>
              <Text style={styles.reminderTitle}>Local reminder</Text>
              <Text style={styles.reminderStatus}>
                {reminderEnabled
                  ? `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`
                  : 'Off'}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Habit reminder"
              disabled={process.env.EXPO_OS === 'web'}
              ios_backgroundColor="#303652"
              onValueChange={setReminderEnabled}
              thumbColor={reminderEnabled ? '#EAFBFF' : '#8A91AA'}
              trackColor={{ false: '#303652', true: '#2E8FA5' }}
              value={reminderEnabled}
            />
          </View>

          {reminderEnabled ? (
            <View style={styles.reminderSettings}>
              <Text style={styles.reminderSettingLabel}>TIME</Text>
              <View style={styles.timePickerRow}>
                <Pressable
                  accessibilityLabel="One hour earlier"
                  onPress={() => adjustReminderTime(-60)}
                  style={({ pressed }) => [styles.timeButton, pressed && styles.timeButtonPressed]}>
                  <MaterialCommunityIcons name="chevron-double-left" size={18} color="#AEB6CF" />
                </Pressable>
                <Pressable
                  accessibilityLabel="Fifteen minutes earlier"
                  onPress={() => adjustReminderTime(-15)}
                  style={({ pressed }) => [styles.timeButton, pressed && styles.timeButtonPressed]}>
                  <MaterialCommunityIcons name="chevron-left" size={19} color="#AEB6CF" />
                </Pressable>
                <Text style={styles.timeValue}>
                  {String(reminderHour).padStart(2, '0')}:{String(reminderMinute).padStart(2, '0')}
                </Text>
                <Pressable
                  accessibilityLabel="Fifteen minutes later"
                  onPress={() => adjustReminderTime(15)}
                  style={({ pressed }) => [styles.timeButton, pressed && styles.timeButtonPressed]}>
                  <MaterialCommunityIcons name="chevron-right" size={19} color="#7EE7FF" />
                </Pressable>
                <Pressable
                  accessibilityLabel="One hour later"
                  onPress={() => adjustReminderTime(60)}
                  style={({ pressed }) => [styles.timeButton, pressed && styles.timeButtonPressed]}>
                  <MaterialCommunityIcons name="chevron-double-right" size={18} color="#7EE7FF" />
                </Pressable>
              </View>

              {reminderSnoozeCount >= 3 ? (
                <View style={styles.reminderSuggestion}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={20} color="#FFD27A" />
                  <View style={styles.reminderSuggestionText}>
                    <Text style={styles.reminderSuggestionTitle}>Try a later reminder</Text>
                    <Text style={styles.reminderSuggestionBody}>
                      Snoozed {reminderSnoozeCount} times recently
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Use suggested reminder time ${suggestedReminderTime}`}
                    onPress={applySuggestedReminderTime}
                    style={({ pressed }) => [
                      styles.reminderSuggestionButton,
                      pressed && styles.timeButtonPressed,
                    ]}>
                    <Text style={styles.reminderSuggestionButtonText}>{suggestedReminderTime}</Text>
                  </Pressable>
                </View>
              ) : null}

              <Text style={styles.reminderSettingLabel}>TONE</Text>
              <View style={styles.reminderToneRow}>
                {reminderToneOptions.map((option) => {
                  const selected = reminderTone === option.value;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={option.value}
                      onPress={() => setReminderTone(option.value)}
                      style={[styles.reminderToneOption, selected && styles.reminderToneOptionSelected]}>
                      <Text
                        style={[
                          styles.reminderToneText,
                          selected && styles.reminderToneTextSelected,
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>DIFFICULTY</Text>
          <View style={styles.optionRow}>
            {difficultyOptions.map((option) => {
              const selected = difficulty === option.value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option.value}
                  onPress={() => setDifficulty(option.value)}
                  style={[
                    styles.difficultyOption,
                    selected && { borderColor: option.color, backgroundColor: `${option.color}16` },
                  ]}>
                  <View style={[styles.optionDot, { backgroundColor: option.color }]} />
                  <Text style={[styles.optionText, selected && { color: option.color }]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>PRIMARY ATTRIBUTE</Text>
          <View style={styles.attributeGrid}>
            {attributeOptions.map((option) => {
              const selected = attribute === option.value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option.value}
                  onPress={() => {
                    setAttribute(option.value);
                    setSecondaryAttribute((current) =>
                      current === option.value ? null : current,
                    );
                  }}
                  style={[styles.attributeOption, selected && styles.attributeOptionSelected]}>
                  <MaterialCommunityIcons
                    color={selected ? '#7EE7FF' : '#707894'}
                    name={option.icon}
                    size={20}
                  />
                  <Text style={[styles.attributeText, selected && styles.attributeTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>SECONDARY ATTRIBUTE (OPTIONAL)</Text>
          <View style={styles.attributeGrid}>
            {[
              {
                value: null,
                label: 'None',
                icon: 'minus-circle-outline' as const,
              },
              ...attributeOptions.filter((option) => option.value !== attribute),
            ].map((option) => {
              const selected = secondaryAttribute === option.value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option.value ?? 'none'}
                  onPress={() => setSecondaryAttribute(option.value)}
                  style={[styles.attributeOption, selected && styles.attributeOptionSelected]}>
                  <MaterialCommunityIcons
                    color={selected ? '#F08ABD' : '#707894'}
                    name={option.icon}
                    size={20}
                  />
                  <Text
                    style={[
                      styles.attributeText,
                      selected && styles.secondaryAttributeTextSelected,
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <LinearGradient colors={['#171633', '#0B1826']} style={styles.rewardCard}>
            <View style={styles.rewardHeader}>
              <MaterialCommunityIcons name="creation" color="#B898FF" size={20} />
              <Text style={styles.rewardTitle}>
                {editing ? 'Future quest reward' : 'Quest reward'}
              </Text>
            </View>
            <View style={styles.rewardValues}>
              <View style={styles.rewardItem}>
                <Text style={styles.rewardValue}>+{reward.xp}</Text>
                <Text style={styles.rewardLabel}>PLAYER EXP</Text>
              </View>
              <View style={styles.rewardDivider} />
              <View style={styles.rewardItem}>
                <Text style={styles.rewardValue}>
                  +{reward.statXp}
                  {secondaryAttribute
                    ? ` / +${getSecondaryAttributeXp(reward.statXp)}`
                    : ''}
                </Text>
                <Text style={styles.rewardLabel}>
                  {attributeShortLabels[attribute]}
                  {secondaryAttribute
                    ? ` / ${attributeShortLabels[secondaryAttribute]}`
                    : ''}{' '}
                  STAT XP
                </Text>
              </View>
              <View style={styles.rewardDivider} />
              <View style={styles.rewardItem}>
                <Text style={styles.rewardValue}>+{reward.energy}</Text>
                <Text style={styles.rewardLabel}>ENERGY</Text>
              </View>
            </View>
          </LinearGradient>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={saving || loadingHabit}
            onPress={saveHabit}
            style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}>
            <LinearGradient colors={['#744DFF', '#27C9EF']} style={styles.saveGradient}>
              {saving || loadingHabit ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name={editing ? 'content-save' : 'plus-circle'}
                    color="#FFFFFF"
                    size={21}
                  />
                  <Text style={styles.saveText}>
                    {editing ? 'Save quest' : 'Create quest'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  keyboardView: { flex: 1 },
  content: { paddingHorizontal: 19, paddingTop: 12, paddingBottom: 38 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101426',
    borderWidth: 1,
    borderColor: '#292E48',
  },
  headerText: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 42 },
  eyebrow: { color: '#8A74EA', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: '#F3F0FF', fontSize: 23, fontWeight: '900', marginTop: 3 },
  label: { color: '#8B91AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  input: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: '#0D1121',
    borderWidth: 1,
    borderColor: '#272D48',
    color: '#EDF0FF',
    fontSize: 14,
    paddingHorizontal: 15,
    marginBottom: 22,
  },
  descriptionInput: { height: 88, paddingTop: 14 },
  appearanceBlock: { marginBottom: 22, gap: 10 },
  appearanceScrollContent: { gap: 8, paddingRight: 4 },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionSelected: { borderColor: '#3DAFCB', backgroundColor: '#0C202C' },
  colorRow: { height: 42, flexDirection: 'row', gap: 6 },
  colorOption: {
    flex: 1,
    minWidth: 0,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOptionSelected: { borderColor: '#8B9BC7', backgroundColor: '#171D30' },
  colorSwatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  modeOption: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modeOptionSelected: { borderColor: '#3DAFCB', backgroundColor: '#0C202C' },
  modeText: { color: '#747C97', fontSize: 11, fontWeight: '800' },
  modeTextSelected: { color: '#9BEAFF' },
  targetRow: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 9,
    marginBottom: 22,
  },
  targetLabel: { color: '#B6BDD3', fontSize: 12, fontWeight: '800', flex: 1 },
  targetStepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#343B59',
    backgroundColor: '#141A30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetButtonDisabled: { opacity: 0.35 },
  targetButtonPressed: { opacity: 0.72 },
  targetValue: {
    color: '#F0EEFF',
    fontSize: 17,
    fontWeight: '900',
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  weekdayRow: { flexDirection: 'row', gap: 6, marginBottom: 23 },
  weekdayButton: {
    flex: 1,
    height: 38,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayButtonSelected: { borderColor: '#3DAFCB', backgroundColor: '#0C202C' },
  weekdayText: { color: '#747C97', fontSize: 10, fontWeight: '900' },
  weekdayTextSelected: { color: '#9BEAFF' },
  reminderHeader: {
    minHeight: 62,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 10,
  },
  reminderHeaderOff: { marginBottom: 23 },
  reminderHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121A2D',
  },
  reminderHeaderText: { flex: 1, minWidth: 0, paddingHorizontal: 11 },
  reminderTitle: { color: '#E8E9F4', fontSize: 12, fontWeight: '900' },
  reminderStatus: { color: '#737B98', fontSize: 10, fontWeight: '700', paddingTop: 3 },
  reminderSettings: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0A0E1D',
    padding: 13,
    marginBottom: 23,
  },
  reminderSettingLabel: { color: '#777F99', fontSize: 8, fontWeight: '900', paddingBottom: 8 },
  timePickerRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 16,
  },
  timeButton: {
    width: 35,
    height: 35,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#303652',
    backgroundColor: '#141A30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeButtonPressed: { opacity: 0.7 },
  timeValue: {
    flex: 1,
    minWidth: 66,
    color: '#F0EEFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  reminderSuggestion: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#574C32',
    backgroundColor: '#17140E',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 11,
    marginBottom: 16,
  },
  reminderSuggestionText: { flex: 1, minWidth: 0 },
  reminderSuggestionTitle: { color: '#F2E7C8', fontSize: 11, fontWeight: '900' },
  reminderSuggestionBody: { color: '#9D927A', fontSize: 9, fontWeight: '700', paddingTop: 3 },
  reminderSuggestionButton: {
    minWidth: 58,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#8A7138',
    backgroundColor: '#2A2414',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  reminderSuggestionButtonText: {
    color: '#FFD27A',
    fontSize: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  reminderToneRow: { flexDirection: 'row', gap: 7 },
  reminderToneOption: {
    flex: 1,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderToneOptionSelected: { borderColor: '#3DAFCB', backgroundColor: '#0C202C' },
  reminderToneText: { color: '#747C97', fontSize: 9, fontWeight: '900' },
  reminderToneTextSelected: { color: '#9BEAFF' },
  optionRow: { flexDirection: 'row', gap: 8, marginBottom: 23 },
  difficultyOption: {
    flex: 1,
    height: 45,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  optionDot: { width: 6, height: 6, borderRadius: 3 },
  optionText: { color: '#8A91AA', fontSize: 11, fontWeight: '800' },
  attributeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 23 },
  attributeOption: {
    width: '48.7%',
    height: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 9,
  },
  attributeOptionSelected: { borderColor: '#3DAFCB', backgroundColor: '#0C202C' },
  attributeText: { color: '#747C97', fontSize: 11, fontWeight: '700' },
  attributeTextSelected: { color: '#9BEAFF' },
  secondaryAttributeTextSelected: { color: '#FFABD3' },
  rewardCard: { borderRadius: 18, borderWidth: 1, borderColor: '#38345D', padding: 15 },
  rewardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  rewardTitle: { color: '#DCD7F4', fontSize: 13, fontWeight: '800' },
  rewardValues: { flexDirection: 'row', alignItems: 'center' },
  rewardItem: { flex: 1, alignItems: 'center' },
  rewardValue: { color: '#75E5FF', fontSize: 18, fontWeight: '900' },
  rewardLabel: { color: '#737B98', fontSize: 7, fontWeight: '900', marginTop: 3, textAlign: 'center' },
  rewardDivider: { width: 1, height: 28, backgroundColor: '#333851' },
  errorText: { color: '#FF7694', fontSize: 12, textAlign: 'center', marginTop: 14 },
  saveButton: { height: 54, borderRadius: 16, overflow: 'hidden', marginTop: 20 },
  saveButtonPressed: { opacity: 0.78 },
  saveGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
