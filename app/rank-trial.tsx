import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  completeRankTrial,
  getRankTrialState,
  INITIAL_RANK_TRIAL_STATE,
  type RankTrialState,
} from '@/src/database/rank-repository';
import { syncProgressNotifications } from '@/src/notifications/system-notifications';

function RequirementRow({
  accent,
  current,
  icon,
  label,
  target,
}: {
  accent: string;
  current: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  target: number;
}) {
  const complete = current >= target;
  const progress = target > 0 ? Math.min(1, current / target) : 1;
  return (
    <View style={styles.requirementRow}>
      <View style={[styles.requirementIcon, complete && { borderColor: `${accent}88` }]}>
        <MaterialCommunityIcons color={complete ? accent : '#70798F'} name={icon} size={21} />
      </View>
      <View style={styles.requirementBody}>
        <View style={styles.requirementHeader}>
          <Text style={styles.requirementLabel}>{label}</Text>
          <Text style={[styles.requirementValue, complete && { color: accent }]}>
            {Math.min(current, target)} / {target}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
        </View>
      </View>
      <MaterialCommunityIcons
        color={complete ? accent : '#596176'}
        name={complete ? 'check-circle' : 'circle-outline'}
        size={19}
      />
    </View>
  );
}

export default function RankTrialScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<RankTrialState>(INITIAL_RANK_TRIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completedRank, setCompletedRank] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    try {
      setState(await getRankTrialState(db));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void load();
  }, [load]);

  const completeTrial = async () => {
    if (!state.ready || completing || !state.nextRank) return;
    setCompleting(true);
    setErrorMessage('');
    try {
      const rankLabel = state.nextRank.label;
      setState(await completeRankTrial(db));
      await syncProgressNotifications(db).catch(() => 0);
      setCompletedRank(rankLabel);
      if (process.env.EXPO_OS === 'ios') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The Rank-Up Trial could not be completed.');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#FFD166" />
        <Text style={styles.loadingText}>Reading rank record...</Text>
      </View>
    );
  }

  if (completedRank) {
    return (
      <ScrollView
        contentContainerStyle={[styles.resultContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 }]}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}>
        <Image
          contentFit="contain"
          source={require('../assets/images/habit-rpg-emblem.png')}
          style={styles.resultEmblem}
        />
        <View style={styles.resultIcon}>
          <MaterialCommunityIcons color="#FFD166" name="shield-star-outline" size={52} />
        </View>
        <Text style={styles.resultEyebrow}>RANK-UP COMPLETE</Text>
        <Text style={styles.resultTitle}>{completedRank}</Text>
        <Text style={styles.resultDescription}>Your Hunter Record has been updated.</Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons color="#071018" name="account" size={19} />
          <Text style={styles.primaryButtonText}>Return to Profile</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const nextRank = state.nextRank;
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Return to Profile"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons color="#D5D9E8" name="arrow-left" size={21} />
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={styles.eyebrow}>SYSTEM CHALLENGE</Text>
          <Text style={styles.heading}>Rank-Up Trial</Text>
        </View>
        <View style={[styles.rankSeal, { borderColor: `${state.currentRank.accent}88` }]}>
          <Text style={[styles.rankSealText, { color: state.currentRank.accent }]}>
            {state.currentRank.shortLabel}
          </Text>
        </View>
      </View>

      {nextRank ? (
        <>
          <View style={[styles.trialHero, { borderColor: `${nextRank.accent}66` }]}>
            <Image
              contentFit="contain"
              source={require('../assets/images/habit-rpg-emblem.png')}
              style={styles.heroEmblem}
            />
            <Text style={[styles.trialEyebrow, { color: nextRank.accent }]}>NEXT DESIGNATION</Text>
            <Text style={styles.trialName}>{nextRank.trialName}</Text>
            <View style={styles.rankTransition}>
              <Text style={styles.currentRank}>{state.currentRank.shortLabel}</Text>
              <MaterialCommunityIcons color="#818AA1" name="arrow-right" size={23} />
              <Text style={[styles.nextRank, { color: nextRank.accent }]}>{nextRank.shortLabel}</Text>
            </View>
            <Text style={styles.milestoneText}>{nextRank.milestone}</Text>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>TRIAL CONDITIONS</Text>
            <Text style={styles.sectionTitle}>Qualification record</Text>
          </View>

          <View style={styles.requirementList}>
            <RequirementRow
              accent={nextRank.accent}
              current={state.playerLevel}
              icon="star-four-points-outline"
              label="Player Level"
              target={nextRank.minimumLevel}
            />
            <RequirementRow
              accent={nextRank.accent}
              current={state.dungeonClears}
              icon="gate"
              label="Dungeon Clears"
              target={nextRank.requiredDungeonClears}
            />
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons color="#F19AB0" name="alert-circle-outline" size={17} />
              <Text selectable style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={!state.ready || completing}
            onPress={() => void completeTrial()}
            style={({ pressed }) => [
              styles.primaryButton,
              !state.ready && styles.primaryButtonDisabled,
              pressed && state.ready && styles.pressed,
            ]}>
            {completing ? (
              <ActivityIndicator color="#071018" />
            ) : (
              <MaterialCommunityIcons
                color={state.ready ? '#071018' : '#667086'}
                name={state.ready ? 'shield-star-outline' : 'lock-outline'}
                size={20}
              />
            )}
            <Text style={[styles.primaryButtonText, !state.ready && styles.primaryButtonTextDisabled]}>
              {state.ready ? 'Complete Rank-Up Trial' : 'Trial Locked'}
            </Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.maxRankPanel}>
          <MaterialCommunityIcons color="#FFF0A8" name="crown" size={48} />
          <Text style={styles.resultTitle}>Highest rank achieved</Text>
          <Text style={styles.resultDescription}>No further Rank-Up Trial is available.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' },
  content: { flexGrow: 1, paddingHorizontal: 16, gap: 16 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#050711' },
  loadingText: { color: '#777F98', fontSize: 11, fontWeight: '700' },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111522', borderWidth: 1, borderColor: '#282E40' },
  headerBody: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#9D83F6', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  heading: { color: '#F2F0FA', fontSize: 21, fontWeight: '900' },
  rankSeal: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111827', borderWidth: 1 },
  rankSealText: { fontSize: 15, fontWeight: '900' },
  trialHero: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, overflow: 'hidden' },
  heroEmblem: { position: 'absolute', width: 240, height: 240, opacity: 0.06 },
  trialEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  trialName: { color: '#F2EFF8', fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  rankTransition: { flexDirection: 'row', alignItems: 'center', gap: 17, marginTop: 20 },
  currentRank: { color: '#8991A7', fontSize: 28, fontWeight: '900' },
  nextRank: { fontSize: 36, fontWeight: '900' },
  milestoneText: { color: '#858EA4', fontSize: 10, lineHeight: 15, fontWeight: '700', textAlign: 'center', marginTop: 15 },
  sectionHeader: { gap: 2 },
  sectionEyebrow: { color: '#8F84B7', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  sectionTitle: { color: '#ECEAF4', fontSize: 16, fontWeight: '900' },
  requirementList: { gap: 8 },
  requirementRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#272D3F' },
  requirementIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#151A27', borderWidth: 1, borderColor: '#30374A' },
  requirementBody: { flex: 1, minWidth: 0 },
  requirementHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  requirementLabel: { color: '#DDE1ED', fontSize: 10, fontWeight: '900' },
  requirementValue: { color: '#7A8398', fontSize: 9, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#1A1F2E', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 3 },
  errorBanner: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#26151E', borderWidth: 1, borderColor: '#633048' },
  errorText: { flex: 1, color: '#F1A7B9', fontSize: 10, fontWeight: '700' },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, backgroundColor: '#FFD166' },
  primaryButtonDisabled: { backgroundColor: '#161B28', borderWidth: 1, borderColor: '#2D3447' },
  primaryButtonText: { color: '#071018', fontSize: 12, fontWeight: '900' },
  primaryButtonTextDisabled: { color: '#667086' },
  maxRankPanel: { flex: 1, minHeight: 500, alignItems: 'center', justifyContent: 'center', gap: 10 },
  resultContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  resultEmblem: { position: 'absolute', width: 320, height: 320, opacity: 0.07 },
  resultIcon: { width: 94, height: 94, alignItems: 'center', justifyContent: 'center', borderRadius: 47, backgroundColor: '#2B2417', borderWidth: 1, borderColor: '#665632' },
  resultEyebrow: { color: '#FFD166', fontSize: 9, fontWeight: '900', letterSpacing: 1.6, marginTop: 20 },
  resultTitle: { color: '#F3F0FA', fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  resultDescription: { color: '#858DA4', fontSize: 11, lineHeight: 17, fontWeight: '700', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  pressed: { opacity: 0.74 },
});
