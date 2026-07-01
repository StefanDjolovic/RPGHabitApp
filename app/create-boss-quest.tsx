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
  createBossQuest,
  type NewBossQuest,
} from '@/src/database/boss-quest-repository';
import {
  type HabitAttribute,
  type HabitDifficulty,
  rewardByDifficulty,
} from '@/src/database/habit-repository';

const attributes: {
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

const difficulties: { value: HabitDifficulty; label: string; color: string }[] = [
  { value: 'easy', label: 'E', color: '#68E1A8' },
  { value: 'medium', label: 'M', color: '#61D4FF' },
  { value: 'hard', label: 'H', color: '#C68CFF' },
];

type DraftMilestone = NewBossQuest['milestones'][number] & { key: number };

const initialMilestones: DraftMilestone[] = [
  { key: 1, title: '', difficulty: 'easy' },
  { key: 2, title: '', difficulty: 'medium' },
  { key: 3, title: '', difficulty: 'hard' },
];

export default function CreateBossQuestScreen() {
  const db = useSQLiteContext();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attribute, setAttribute] = useState<HabitAttribute>('discipline');
  const [milestones, setMilestones] = useState(initialMilestones);
  const [nextMilestoneKey, setNextMilestoneKey] = useState(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const rewardPreview = useMemo(() => {
    const phaseRewards = milestones.map((milestone) => rewardByDifficulty[milestone.difficulty]);
    const finalReward = phaseRewards.at(-1) ?? rewardByDifficulty.medium;
    return phaseRewards.reduce<{ xp: number; statXp: number; energy: number }>(
      (total, reward) => ({
        xp: total.xp + reward.xp,
        statXp: total.statXp + reward.statXp,
        energy: total.energy + reward.energy,
      }),
      { xp: finalReward.xp, statXp: finalReward.statXp, energy: 0 },
    );
  }, [milestones]);

  const updateMilestone = (key: number, changes: Partial<DraftMilestone>) => {
    setMilestones((current) =>
      current.map((milestone) =>
        milestone.key === key ? { ...milestone, ...changes } : milestone,
      ),
    );
  };

  const addMilestone = () => {
    if (milestones.length >= 6) return;
    setMilestones((current) => [
      ...current,
      { key: nextMilestoneKey, title: '', difficulty: 'medium' },
    ]);
    setNextMilestoneKey((current) => current + 1);
  };

  const removeMilestone = (key: number) => {
    if (milestones.length <= 2) return;
    setMilestones((current) => current.filter((milestone) => milestone.key !== key));
  };

  const saveBossQuest = async () => {
    if (!title.trim()) {
      setError('Enter a name for the Boss Quest.');
      return;
    }
    if (milestones.some((milestone) => !milestone.title.trim())) {
      setError('Every phase needs a measurable objective.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await createBossQuest(db, {
        title,
        description,
        attribute,
        milestones: milestones.map(({ title: milestoneTitle, difficulty }) => ({
          title: milestoneTitle,
          difficulty,
        })),
      });
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Boss Quest could not be saved.');
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
            <Pressable
              accessibilityLabel="Close"
              onPress={() => router.back()}
              style={styles.iconButton}>
              <MaterialCommunityIcons name="close" size={22} color="#BFC5DB" />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>NEW BOSS QUEST</Text>
              <Text style={styles.heading}>Define the campaign</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <Text style={styles.label}>BOSS QUEST NAME</Text>
          <TextInput
            autoFocus
            maxLength={60}
            onChangeText={setTitle}
            placeholder="e.g. Ship portfolio website"
            placeholderTextColor="#555E7A"
            style={styles.input}
            value={title}
          />

          <Text style={styles.label}>DESCRIPTION · OPTIONAL</Text>
          <TextInput
            maxLength={160}
            multiline
            onChangeText={setDescription}
            placeholder="What does defeating this boss unlock?"
            placeholderTextColor="#555E7A"
            style={[styles.input, styles.descriptionInput]}
            textAlignVertical="top"
            value={description}
          />

          <Text style={styles.label}>PRIMARY ATTRIBUTE</Text>
          <View style={styles.attributeGrid}>
            {attributes.map((option) => {
              const selected = attribute === option.value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option.value}
                  onPress={() => setAttribute(option.value)}
                  style={[styles.attributeOption, selected && styles.attributeOptionSelected]}>
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={17}
                    color={selected ? '#8EEBFF' : '#737B98'}
                  />
                  <Text style={[styles.attributeText, selected && styles.attributeTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.phaseHeader}>
            <View>
              <Text style={styles.label}>MILESTONES</Text>
              <Text style={styles.phaseCount}>{milestones.length} PHASES</Text>
            </View>
            <Pressable
              accessibilityLabel="Add milestone"
              disabled={milestones.length >= 6}
              onPress={addMilestone}
              style={[styles.iconButton, milestones.length >= 6 && styles.disabled]}>
              <MaterialCommunityIcons name="plus" size={20} color="#7EE7FF" />
            </Pressable>
          </View>

          <View style={styles.phaseList}>
            {milestones.map((milestone, index) => (
              <View key={milestone.key} style={styles.phaseCard}>
                <View style={styles.phaseTopRow}>
                  <View style={styles.phaseNumber}>
                    <Text style={styles.phaseNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.phaseTitle}>PHASE {index + 1}</Text>
                  <Pressable
                    accessibilityLabel={`Remove phase ${index + 1}`}
                    disabled={milestones.length <= 2}
                    onPress={() => removeMilestone(milestone.key)}
                    style={[styles.removeButton, milestones.length <= 2 && styles.disabled]}>
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FF829E" />
                  </Pressable>
                </View>
                <TextInput
                  maxLength={80}
                  onChangeText={(value) => updateMilestone(milestone.key, { title: value })}
                  placeholder={`Measurable objective for phase ${index + 1}`}
                  placeholderTextColor="#555E7A"
                  style={styles.phaseInput}
                  value={milestone.title}
                />
                <View style={styles.difficultyRow}>
                  {difficulties.map((difficulty) => {
                    const selected = milestone.difficulty === difficulty.value;
                    return (
                      <Pressable
                        accessibilityLabel={`${difficulty.value} difficulty for phase ${index + 1}`}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        key={difficulty.value}
                        onPress={() =>
                          updateMilestone(milestone.key, { difficulty: difficulty.value })
                        }
                        style={[
                          styles.difficultyOption,
                          selected && styles.difficultyOptionSelected,
                        ]}>
                        <View style={[styles.difficultyDot, { backgroundColor: difficulty.color }]} />
                        <Text
                          style={[
                            styles.difficultyText,
                            selected && { color: difficulty.color },
                          ]}>
                          {difficulty.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          <LinearGradient
            colors={['rgba(69, 31, 59, 0.98)', 'rgba(20, 18, 42, 0.98)']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.rewardPanel}>
            <MaterialCommunityIcons name="skull-crossbones" size={26} color="#FF91AD" />
            <View style={styles.rewardBody}>
              <Text style={styles.rewardTitle}>TOTAL CAMPAIGN REWARD</Text>
              <Text style={styles.rewardValues}>
                +{rewardPreview.xp} EXP · +{rewardPreview.statXp} STAT · +{rewardPreview.energy} ENERGY
              </Text>
              <Text style={styles.rewardLoot}>Dungeon Key · Boss Quest Chest</Text>
            </View>
          </LinearGradient>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={saving}
            onPress={() => void saveBossQuest()}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <LinearGradient
              colors={['#A63861', '#6A4DFF']}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={styles.saveGradient}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="sword-cross" size={20} color="#FFFFFF" />
                  <Text style={styles.saveText}>Create Boss Quest</Text>
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
  headerText: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 42 },
  eyebrow: { color: '#D66B93', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  heading: { color: '#F3F0FF', fontSize: 22, fontWeight: '900', marginTop: 3 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101426',
    borderWidth: 1,
    borderColor: '#292E48',
  },
  label: { color: '#8B91AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#0D1121',
    borderWidth: 1,
    borderColor: '#272D48',
    color: '#EDF0FF',
    fontSize: 14,
    paddingHorizontal: 15,
    marginBottom: 22,
  },
  descriptionInput: { height: 88, paddingTop: 14 },
  attributeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  attributeOption: {
    width: '48%',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  attributeOptionSelected: { borderColor: '#3DAFCB', backgroundColor: '#0C202C' },
  attributeText: { color: '#7F879F', fontSize: 10, fontWeight: '800' },
  attributeTextSelected: { color: '#9BEAFF' },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  phaseCount: { color: '#D66B93', fontSize: 10, fontWeight: '900' },
  phaseList: { gap: 10 },
  phaseCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#33273E',
    backgroundColor: '#0E1020',
    padding: 12,
  },
  phaseTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  phaseNumber: {
    width: 25,
    height: 25,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3A1B2A',
    borderWidth: 1,
    borderColor: '#793953',
  },
  phaseNumberText: { color: '#FF91AD', fontSize: 11, fontWeight: '900' },
  phaseTitle: { flex: 1, color: '#AAB1C8', fontSize: 9, fontWeight: '900', paddingLeft: 9 },
  removeButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  phaseInput: {
    height: 43,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A304A',
    backgroundColor: '#090D1A',
    color: '#EDF0FF',
    fontSize: 12,
    paddingHorizontal: 12,
    marginBottom: 9,
  },
  difficultyRow: { flexDirection: 'row', gap: 7 },
  difficultyOption: {
    flex: 1,
    height: 31,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#292E48',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  difficultyOptionSelected: { backgroundColor: '#18152A', borderColor: '#5C4A78' },
  difficultyDot: { width: 5, height: 5, borderRadius: 3 },
  difficultyText: { color: '#737B98', fontSize: 9, fontWeight: '900' },
  rewardPanel: {
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#6D3650',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginTop: 16,
  },
  rewardBody: { flex: 1, paddingLeft: 12 },
  rewardTitle: { color: '#FFB2C5', fontSize: 9, fontWeight: '900' },
  rewardValues: { color: '#F1EEFF', fontSize: 10, fontWeight: '800', marginTop: 5 },
  rewardLoot: { color: '#B898FF', fontSize: 9, fontWeight: '800', marginTop: 4 },
  errorText: { color: '#FF8BA7', fontSize: 11, fontWeight: '700', marginTop: 13 },
  saveButton: { height: 54, borderRadius: 14, overflow: 'hidden', marginTop: 18 },
  saveGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.3 },
});
