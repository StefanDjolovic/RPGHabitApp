import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  completeOnboarding,
  getProfileInitials,
  getPlayerProfile,
  type AvatarMode,
} from '@/src/database/profile-repository';
import {
  lifeAreaOptions,
  starterHabits,
  tutorialHabit,
  type LifeArea,
} from '@/src/onboarding/starter-habits';

const stepLabels = ['Identity', 'Focus', 'Quests', 'Tutorial'];

export default function OnboardingScreen() {
  const db = useSQLiteContext();
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState('');
  const [avatarMode, setAvatarMode] = useState<AvatarMode>('system');
  const [lifeAreas, setLifeAreas] = useState<LifeArea[]>([]);
  const [starterKeys, setStarterKeys] = useState<string[]>([]);
  const [includeTutorial, setIncludeTutorial] = useState(true);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getPlayerProfile(db)
      .then((profile) => {
        if (!active) return;
        if (profile.onboardingCompleted) {
          router.replace('/');
          return;
        }
        setNickname(profile.nickname === 'Shadow Candidate' ? '' : profile.nickname);
        setAvatarMode(profile.avatarMode);
      })
      .finally(() => {
        if (active) setCheckingProfile(false);
      });
    return () => {
      active = false;
    };
  }, [db]);

  const availableStarterHabits = useMemo(
    () => starterHabits.filter((habit) => lifeAreas.includes(habit.area)),
    [lifeAreas],
  );

  const toggleLifeArea = (area: LifeArea) => {
    setError('');
    setLifeAreas((current) => {
      if (current.includes(area)) return current.filter((item) => item !== area);
      if (current.length >= 3) return current;
      return [...current, area];
    });
  };

  const toggleStarter = (key: string) => {
    setError('');
    setStarterKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= 3) return current;
      return [...current, key];
    });
  };

  const continueFlow = async () => {
    setError('');

    if (step === 0) {
      if (nickname.trim().length < 2) {
        setError('Choose a nickname with at least two characters.');
        return;
      }
      setStep(1);
      return;
    }

    if (step === 1) {
      if (lifeAreas.length === 0) {
        setError('Choose at least one area.');
        return;
      }
      setStarterKeys(availableStarterHabits.map((habit) => habit.key));
      setStep(2);
      return;
    }

    if (step === 2) {
      if (starterKeys.length === 0) {
        setError('Choose at least one starter quest.');
        return;
      }
      setStep(3);
      return;
    }

    const selectedHabits = starterHabits
      .filter((starter) => starterKeys.includes(starter.key))
      .map((starter) => starter.habit);
    if (includeTutorial) selectedHabits.push(tutorialHabit);

    try {
      setSaving(true);
      await completeOnboarding(
        db,
        { nickname, avatarMode, lifeAreas },
        selectedHabits,
      );
      router.replace('/');
    } catch {
      setError('The Hunter record could not be created. Please try again.');
      setSaving(false);
    }
  };

  if (checkingProfile) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#6DDEFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.systemMark}>
              <MaterialCommunityIcons name="shield-star-outline" size={19} color="#7EE7FF" />
              <Text style={styles.systemMarkText}>HABIT RPG</Text>
            </View>
            <Text style={styles.stepCount}>{step + 1} / {stepLabels.length}</Text>
          </View>

          <View style={styles.progressRow}>
            {stepLabels.map((label, index) => (
              <View key={label} style={styles.progressItem}>
                <View style={[styles.progressLine, index <= step && styles.progressLineActive]} />
                <Text style={[styles.progressLabel, index === step && styles.progressLabelActive]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {step === 0 ? (
            <View style={styles.stepBody}>
              <View style={styles.stepIcon}>
                <MaterialCommunityIcons name="account-plus-outline" size={29} color="#B898FF" />
              </View>
              <Text style={styles.eyebrow}>UNAWAKENED ENTRY</Text>
              <Text style={styles.heading}>Create your Hunter record</Text>

              <Text style={styles.fieldLabel}>NICKNAME</Text>
              <TextInput
                autoCapitalize="words"
                autoFocus
                maxLength={24}
                onChangeText={setNickname}
                placeholder="Your Hunter name"
                placeholderTextColor="#555E7A"
                style={styles.input}
                value={nickname}
              />

              <Text style={styles.fieldLabel}>AVATAR MODE</Text>
              <View style={styles.choiceRow}>
                {(['system', 'initials'] as AvatarMode[]).map((mode) => {
                  const selected = avatarMode === mode;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={mode}
                      onPress={() => setAvatarMode(mode)}
                      style={[styles.avatarOption, selected && styles.avatarOptionSelected]}>
                      <View style={[styles.avatarPreview, selected && styles.avatarPreviewSelected]}>
                        {mode === 'system' ? (
                          <MaterialCommunityIcons name="account" size={25} color="#8EEBFF" />
                        ) : (
                          <Text style={styles.initialsText}>{getProfileInitials(nickname)}</Text>
                        )}
                      </View>
                      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                        {mode === 'system' ? 'System' : 'Initials'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.stepBody}>
              <View style={styles.stepIcon}>
                <MaterialCommunityIcons name="chart-timeline-variant-shimmer" size={29} color="#63E0A2" />
              </View>
              <Text style={styles.eyebrow}>GROWTH PATH</Text>
              <Text style={styles.heading}>Choose your focus</Text>
              <Text style={styles.selectionMeta}>{lifeAreas.length} / 3 selected</Text>

              <View style={styles.areaGrid}>
                {lifeAreaOptions.map((area) => {
                  const selected = lifeAreas.includes(area.value);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      key={area.value}
                      onPress={() => toggleLifeArea(area.value)}
                      style={[styles.areaOption, selected && styles.areaOptionSelected]}>
                      <MaterialCommunityIcons name={area.icon} size={23} color={area.color} />
                      <Text style={[styles.areaText, selected && styles.areaTextSelected]}>
                        {area.label}
                      </Text>
                      <MaterialCommunityIcons
                        name={selected ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={selected ? '#7EE7FF' : '#48506A'}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.stepBody}>
              <View style={styles.stepIcon}>
                <MaterialCommunityIcons name="sword-cross" size={28} color="#FF9BCB" />
              </View>
              <Text style={styles.eyebrow}>STARTER QUESTS</Text>
              <Text style={styles.heading}>Build your first day</Text>
              <Text style={styles.selectionMeta}>{starterKeys.length} / 3 selected</Text>

              <View style={styles.questOptions}>
                {availableStarterHabits.map((starter) => {
                  const selected = starterKeys.includes(starter.key);
                  const area = lifeAreaOptions.find((item) => item.value === starter.area);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      key={starter.key}
                      onPress={() => toggleStarter(starter.key)}
                      style={[styles.questOption, selected && styles.questOptionSelected]}>
                      <View style={styles.questOptionIcon}>
                        <MaterialCommunityIcons
                          name={area?.icon ?? 'star-outline'}
                          size={21}
                          color={area?.color ?? '#7EE7FF'}
                        />
                      </View>
                      <View style={styles.questOptionBody}>
                        <Text style={styles.questOptionTitle}>{starter.title}</Text>
                        <Text style={styles.questOptionText}>{starter.description}</Text>
                      </View>
                      <MaterialCommunityIcons
                        name={selected ? 'check-circle' : 'circle-outline'}
                        size={20}
                        color={selected ? '#7EE7FF' : '#48506A'}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.stepBody}>
              <LinearGradient
                colors={['rgba(65, 37, 85, 0.98)', 'rgba(10, 27, 47, 0.98)']}
                style={styles.tutorialBanner}>
                <MaterialCommunityIcons name="creation" size={31} color="#B898FF" />
                <Text style={styles.tutorialRank}>UNAWAKENED</Text>
                <Text style={styles.tutorialName}>{nickname.trim()}</Text>
                <Text style={styles.tutorialQuestCount}>
                  {starterKeys.length} starter {starterKeys.length === 1 ? 'quest' : 'quests'} ready
                </Text>
              </LinearGradient>

              <Text style={styles.fieldLabel}>TUTORIAL QUEST</Text>
              <View style={styles.choiceRow}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: includeTutorial }}
                  onPress={() => setIncludeTutorial(true)}
                  style={[styles.tutorialChoice, includeTutorial && styles.avatarOptionSelected]}>
                  <MaterialCommunityIcons name="play-circle-outline" size={22} color="#7EE7FF" />
                  <Text style={[styles.choiceText, includeTutorial && styles.choiceTextSelected]}>
                    Add tutorial
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: !includeTutorial }}
                  onPress={() => setIncludeTutorial(false)}
                  style={[styles.tutorialChoice, !includeTutorial && styles.avatarOptionSelected]}>
                  <MaterialCommunityIcons name="skip-next-outline" size={22} color="#A8AFC6" />
                  <Text style={[styles.choiceText, !includeTutorial && styles.choiceTextSelected]}>
                    Skip
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.footerActions}>
            {step > 0 ? (
              <Pressable
                accessibilityLabel="Previous onboarding step"
                disabled={saving}
                onPress={() => {
                  setError('');
                  setStep((current) => Math.max(0, current - 1));
                }}
                style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}>
                <MaterialCommunityIcons name="arrow-left" size={20} color="#AEB6CF" />
              </Pressable>
            ) : null}

            <Pressable
              disabled={saving}
              onPress={() => void continueFlow()}
              style={({ pressed }) => [
                styles.continueButton,
                step === 0 && styles.continueButtonFull,
                pressed && styles.buttonPressed,
              ]}>
              <LinearGradient
                colors={['#744DFF', '#27C9EF']}
                end={{ x: 1, y: 0 }}
                start={{ x: 0, y: 0 }}
                style={styles.continueGradient}>
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.continueText}>
                      {step === stepLabels.length - 1 ? 'Enter Today' : 'Continue'}
                    </Text>
                    <MaterialCommunityIcons
                      name={step === stepLabels.length - 1 ? 'shield-check' : 'arrow-right'}
                      size={20}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050711' },
  safeArea: { flex: 1, backgroundColor: '#050711' },
  keyboardView: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  systemMark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  systemMarkText: { color: '#8FE9FF', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  stepCount: { color: '#69718F', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressRow: { flexDirection: 'row', gap: 7, paddingTop: 22 },
  progressItem: { flex: 1, gap: 6 },
  progressLine: { height: 3, borderRadius: 2, backgroundColor: '#20263B' },
  progressLineActive: { backgroundColor: '#62DDF8' },
  progressLabel: { color: '#555D76', fontSize: 8, fontWeight: '800', textAlign: 'center' },
  progressLabelActive: { color: '#9BEAFF' },
  stepBody: { flex: 1, paddingTop: 38 },
  stepIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11162A',
    borderWidth: 1,
    borderColor: '#303652',
  },
  eyebrow: { color: '#8E72FF', fontSize: 9, fontWeight: '900', letterSpacing: 1.7, paddingTop: 18 },
  heading: { color: '#F3F0FF', fontSize: 28, fontWeight: '900', paddingTop: 5, paddingBottom: 30 },
  fieldLabel: { color: '#8B91AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.4, paddingBottom: 8 },
  input: {
    height: 54,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#303652',
    backgroundColor: '#0D1121',
    color: '#EDF0FF',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 15,
    marginBottom: 24,
  },
  choiceRow: { flexDirection: 'row', gap: 9 },
  avatarOption: {
    flex: 1,
    minHeight: 94,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  avatarOptionSelected: { borderColor: '#3DAFCB', backgroundColor: '#0C202C' },
  avatarPreview: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#13192D',
    borderWidth: 1,
    borderColor: '#303652',
  },
  avatarPreviewSelected: { borderColor: '#4C9DB3' },
  initialsText: { color: '#FF9BCB', fontSize: 15, fontWeight: '900' },
  choiceText: { color: '#747C97', fontSize: 11, fontWeight: '800' },
  choiceTextSelected: { color: '#9BEAFF' },
  selectionMeta: { color: '#747C97', fontSize: 10, fontWeight: '800', paddingBottom: 12 },
  areaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  areaOption: {
    width: '48.5%',
    minHeight: 68,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 9,
  },
  areaOptionSelected: { borderColor: '#3D8196', backgroundColor: '#0C202C' },
  areaText: { flex: 1, color: '#8A91AA', fontSize: 11, fontWeight: '800' },
  areaTextSelected: { color: '#E5F8FF' },
  questOptions: { gap: 9 },
  questOption: {
    minHeight: 76,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 11,
  },
  questOptionSelected: { borderColor: '#3D8196', backgroundColor: '#0C202C' },
  questOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#13192D',
  },
  questOptionBody: { flex: 1, minWidth: 0 },
  questOptionTitle: { color: '#E8E9F4', fontSize: 13, fontWeight: '900' },
  questOptionText: { color: '#737B98', fontSize: 10, fontWeight: '700', paddingTop: 4 },
  tutorialBanner: {
    minHeight: 178,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#46406D',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    marginBottom: 26,
  },
  tutorialRank: { color: '#B898FF', fontSize: 9, fontWeight: '900', letterSpacing: 1.8, paddingTop: 12 },
  tutorialName: { color: '#F4F1FF', fontSize: 22, fontWeight: '900', paddingTop: 4 },
  tutorialQuestCount: { color: '#8A91AA', fontSize: 10, fontWeight: '800', paddingTop: 8 },
  tutorialChoice: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#292E48',
    backgroundColor: '#0D1121',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: { color: '#FF7694', fontSize: 11, fontWeight: '700', textAlign: 'center', paddingTop: 18 },
  footerActions: { flexDirection: 'row', gap: 10, paddingTop: 24 },
  backButton: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#303652',
    backgroundColor: '#11162A',
  },
  continueButton: { flex: 1, height: 54, borderRadius: 16, overflow: 'hidden' },
  continueButtonFull: { flex: 1 },
  continueGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  continueText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
