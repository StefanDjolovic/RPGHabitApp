import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
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
  HabitAttribute,
  HabitDifficulty,
  rewardByDifficulty,
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

export default function CreateHabitScreen() {
  const db = useSQLiteContext();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<HabitDifficulty>('medium');
  const [attribute, setAttribute] = useState<HabitAttribute>('discipline');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const reward = useMemo(() => rewardByDifficulty[difficulty], [difficulty]);

  const saveHabit = async () => {
    if (!title.trim()) {
      setError('Enter a name for your habit.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await createHabit(db, { title, description, difficulty, attribute });
      router.back();
    } catch {
      setError('The habit could not be saved. Please try again.');
      setSaving(false);
    }
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
              <Text style={styles.eyebrow}>NEW DAILY QUEST</Text>
              <Text style={styles.title}>Create habit</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <Text style={styles.label}>HABIT NAME</Text>
          <TextInput
            autoFocus
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
              <Text style={styles.rewardTitle}>Quest reward</Text>
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
                <Text style={styles.rewardValue}>+{difficulty === 'hard' ? 3 : difficulty === 'medium' ? 2 : 1}</Text>
                <Text style={styles.rewardLabel}>ENERGY</Text>
              </View>
            </View>
          </LinearGradient>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={saving}
            onPress={saveHabit}
            style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}>
            <LinearGradient colors={['#744DFF', '#27C9EF']} style={styles.saveGradient}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="plus-circle" color="#FFFFFF" size={21} />
                  <Text style={styles.saveText}>Create daily quest</Text>
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
