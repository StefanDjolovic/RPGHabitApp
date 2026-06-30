import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createHabit,
  getHabitForEdit,
  HabitAttribute,
  HabitDifficulty,
  HabitGoalType,
  rewardByDifficulty,
  updateHabit,
} from '@/src/database/habit-repository';

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
  const [difficulty, setDifficulty] = useState<HabitDifficulty>('medium');
  const [attribute, setAttribute] = useState<HabitAttribute>('discipline');
  const [goalType, setGoalType] = useState<HabitGoalType>('single');
  const [targetCount, setTargetCount] = useState(3);
  const [scheduleDays, setScheduleDays] = useState<number[]>(everyDaySchedule);
  const [isRequired, setIsRequired] = useState(true);
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
        const habit = await getHabitForEdit(db, habitId);
        if (!active) return;

        if (!habit) {
          setError('This quest could not be found.');
          return;
        }

        setTitle(habit.title);
        setDescription(habit.description);
        setDifficulty(habit.difficulty);
        setAttribute(habit.attribute);
        setGoalType(habit.goalType);
        setTargetCount(habit.targetCount);
        setScheduleDays(habit.scheduleDays);
        setIsRequired(habit.isRequired);
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
      const habitPayload = {
        title,
        description,
        difficulty,
        attribute,
        goalType,
        targetCount,
        scheduleDays,
        isRequired,
      };
      if (editing && habitId) {
        await updateHabit(db, habitId, habitPayload);
      } else {
        await createHabit(db, habitPayload);
      }
      router.back();
    } catch {
      setError('The habit could not be saved. Please try again.');
      setSaving(false);
    }
  };

  const toggleScheduleDay = (day: number) => {
    setScheduleDays((current) => {
      if (current.includes(day)) {
        return current.length > 1 ? current.filter((item) => item !== day) : current;
      }

      return [...current, day].sort((first, second) => first - second);
    });
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
              <Text style={styles.eyebrow}>{editing ? 'EDIT DAILY QUEST' : 'NEW DAILY QUEST'}</Text>
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
          </View>

          {goalType === 'counter' ? (
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

          <Text style={styles.label}>SCHEDULE</Text>
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
                  onPress={() => setAttribute(option.value)}
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
                <Text style={styles.rewardValue}>+{reward.statXp}</Text>
                <Text style={styles.rewardLabel}>{attribute.toUpperCase()} EXP</Text>
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
                    {editing ? 'Save daily quest' : 'Create daily quest'}
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
