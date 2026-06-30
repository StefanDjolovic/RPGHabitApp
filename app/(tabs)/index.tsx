import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  claimDailyClearChest,
  DailyClearStatus,
  getDailyClearStatus,
  getTodayHabits,
  Habit,
  HabitAttribute,
  rewardByDifficulty,
  setHabitCompletion,
} from '@/src/database/habit-repository';
import { getActivityStreak } from '@/src/progression/activity-streak';
import {
  getPlayerProgress,
  INITIAL_PLAYER_PROGRESS,
  MAX_DAILY_DUNGEON_ENERGY,
  MAX_DUNGEON_ENERGY,
  type PlayerProgress,
} from '@/src/progression/player-progression';
import {
  getRecoveryQuestStatus,
  type RecoveryQuestStatus,
} from '@/src/progression/recovery-quest';

const difficultyColors = {
  easy: '#68E1A8',
  medium: '#61D4FF',
  hard: '#C68CFF',
};

const attributeIcons: Record<
  HabitAttribute,
  keyof typeof MaterialCommunityIcons.glyphMap
> = {
  strength: 'dumbbell',
  intelligence: 'brain',
  discipline: 'shield-check',
  vitality: 'heart-pulse',
  creativity: 'palette',
};

function formatAttribute(attribute: HabitAttribute) {
  return attribute.charAt(0).toUpperCase() + attribute.slice(1);
}

const initialRecoveryStatus: RecoveryQuestStatus = {
  available: false,
  completedToday: false,
  lastActiveDate: null,
  missedDays: 0,
};

const initialDailyClearStatus: DailyClearStatus = {
  dateKey: '',
  completed: 0,
  required: 0,
  eligible: false,
  claimed: false,
  earnedAt: null,
  claimedAt: null,
};

export default function TodayScreen() {
  const db = useSQLiteContext();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [playerProgress, setPlayerProgress] = useState<PlayerProgress>(INITIAL_PLAYER_PROGRESS);
  const [activityStreak, setActivityStreak] = useState(0);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryQuestStatus>(initialRecoveryStatus);
  const [dailyClearStatus, setDailyClearStatus] =
    useState<DailyClearStatus>(initialDailyClearStatus);
  const [claimingDailyClear, setClaimingDailyClear] = useState(false);
  const [loading, setLoading] = useState(true);
  const completed = useMemo(() => habits.filter((habit) => habit.complete).length, [habits]);
  const progress = habits.length > 0 ? completed / habits.length : 0;
  const xpProgress =
    playerProgress.xpForNextLevel > 0
      ? playerProgress.xpIntoLevel / playerProgress.xpForNextLevel
      : 1;
  const remainingDailyObjectives = Math.max(
    0,
    dailyClearStatus.required - dailyClearStatus.completed,
  );
  const dailyClearIcon = dailyClearStatus.claimed
    ? 'check-decagram'
    : dailyClearStatus.eligible
      ? 'treasure-chest'
      : 'lock-outline';
  const dailyClearTitle = dailyClearStatus.claimed
    ? 'Daily Clear claimed'
    : dailyClearStatus.eligible
      ? 'Daily Clear ready'
      : 'Daily Clear locked';
  const dailyClearText =
    dailyClearStatus.required === 0
      ? "Add an objective to activate today's chest."
      : dailyClearStatus.claimed
        ? "Chest claimed for today's full clear."
        : dailyClearStatus.eligible
          ? 'All objectives cleared. The chest is ready.'
          : `${remainingDailyObjectives} ${
              remainingDailyObjectives === 1 ? 'objective' : 'objectives'
            } left before the chest unlocks.`;

  const loadTodayData = useCallback(async () => {
    try {
      const [todayHabits, progressSummary, streak, recovery, dailyClear] = await Promise.all([
        getTodayHabits(db),
        getPlayerProgress(db),
        getActivityStreak(db),
        getRecoveryQuestStatus(db),
        getDailyClearStatus(db),
      ]);
      setHabits(todayHabits);
      setPlayerProgress(progressSummary);
      setActivityStreak(streak);
      setRecoveryStatus(recovery);
      setDailyClearStatus(dailyClear);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadTodayData();
    }, [loadTodayData]),
  );

  const toggleHabit = async (id: number) => {
    const habit = habits.find((item) => item.id === id);
    if (!habit) return;

    const nextComplete = !habit.complete;
    setHabits((current) =>
      current.map((item) => (item.id === id ? { ...item, complete: nextComplete } : item)),
    );

    try {
      await setHabitCompletion(db, id, nextComplete);
      const [progressSummary, streak, recovery, dailyClear] = await Promise.all([
        getPlayerProgress(db),
        getActivityStreak(db),
        getRecoveryQuestStatus(db),
        getDailyClearStatus(db),
      ]);
      setPlayerProgress(progressSummary);
      setActivityStreak(streak);
      setRecoveryStatus(recovery);
      setDailyClearStatus(dailyClear);
    } catch {
      setHabits((current) =>
        current.map((item) => (item.id === id ? { ...item, complete: habit.complete } : item)),
      );
    }
  };

  const claimDailyClear = async () => {
    if (!dailyClearStatus.eligible || dailyClearStatus.claimed || claimingDailyClear) return;

    setClaimingDailyClear(true);
    try {
      const status = await claimDailyClearChest(db);
      setDailyClearStatus(status);
    } catch {
      const status = await getDailyClearStatus(db);
      setDailyClearStatus(status);
    } finally {
      setClaimingDailyClear(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundGlowPurple} />
      <View style={styles.backgroundGlowCyan} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <View style={styles.systemRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.systemLabel}>SYSTEM ONLINE</Text>
            </View>
            <Text style={styles.heading}>Today</Text>
          </View>

          <Pressable
            accessibilityLabel="Open profile"
            onPress={() => router.push('/profile')}
            style={styles.avatarButton}>
            <MaterialCommunityIcons name="account" size={26} color="#9BE8FF" />
          </Pressable>
        </View>

        <LinearGradient
          colors={['rgba(39, 29, 78, 0.98)', 'rgba(10, 24, 48, 0.98)', 'rgba(9, 12, 27, 0.98)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.playerCard}>
          <View style={styles.cardAccent} />
          <View style={styles.playerTopRow}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelCaption}>LEVEL</Text>
              <Text style={styles.levelNumber}>{String(playerProgress.level).padStart(2, '0')}</Text>
            </View>

            <View style={styles.playerIdentity}>
              <Text style={styles.playerName}>Shadow Candidate</Text>
              <Text style={styles.playerSubtitle}>{playerProgress.rankLabel} - Path in progress</Text>
            </View>

            <View style={styles.rankBadge}>
              <Text style={styles.rankLetter}>{playerProgress.rankShort}</Text>
            </View>
          </View>

          <View style={styles.xpHeader}>
            <Text style={styles.xpLabel}>PLAYER EXP</Text>
            <Text style={styles.xpValue}>
              {playerProgress.xpForNextLevel > 0
                ? `${playerProgress.xpIntoLevel.toLocaleString()} / ${playerProgress.xpForNextLevel.toLocaleString()}`
                : `${playerProgress.totalXp.toLocaleString()} TOTAL`}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={['#755BFF', '#44D7FF']}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[styles.progressFill, { width: `${xpProgress * 100}%` }]}
            />
          </View>

          <View style={styles.quickStats}>
            <View style={styles.quickStatItem}>
              <MaterialCommunityIcons name="fire" size={20} color="#FF6D8C" />
              <View>
                <Text style={styles.quickStatValue}>
                  {activityStreak} {activityStreak === 1 ? 'day' : 'days'}
                </Text>
                <Text style={styles.quickStatLabel}>Activity streak</Text>
              </View>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatItem}>
              <MaterialCommunityIcons name="lightning-bolt" size={20} color="#63E4FF" />
              <View>
                <Text style={styles.quickStatValue}>
                  {playerProgress.dungeonEnergy} / {MAX_DUNGEON_ENERGY}
                </Text>
                <Text style={styles.quickStatLabel}>
                  Today {playerProgress.todayDungeonEnergy} / {MAX_DAILY_DUNGEON_ENERGY}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>DAILY QUEST</Text>
            <Text style={styles.sectionTitle}>Required objectives</Text>
          </View>
          <View style={styles.completionBadge}>
            <Text style={styles.completionText}>{completed}/{habits.length}</Text>
          </View>
        </View>

        <View style={styles.dailyProgressCard}>
          <View style={styles.dailyProgressTop}>
            <Text style={styles.dailyProgressTitle}>Daily completion</Text>
            <Text style={styles.dailyProgressPercent}>{Math.round(progress * 100)}%</Text>
          </View>
          <View style={styles.dailyTrack}>
            <LinearGradient
              colors={['#6C4DFF', '#56D9FF']}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[styles.dailyFill, { width: `${progress * 100}%` }]}
            />
          </View>
          <View style={styles.dailyClearRow}>
            <View
              style={[
                styles.dailyClearIcon,
                dailyClearStatus.eligible && styles.dailyClearIconReady,
                dailyClearStatus.claimed && styles.dailyClearIconClaimed,
              ]}>
              <MaterialCommunityIcons
                name={dailyClearIcon}
                size={21}
                color={dailyClearStatus.claimed ? '#07131A' : '#8EEBFF'}
              />
            </View>
            <View style={styles.dailyClearBody}>
              <Text style={styles.dailyClearTitle}>{dailyClearTitle}</Text>
              <Text style={styles.dailyClearText}>{dailyClearText}</Text>
            </View>
            {dailyClearStatus.claimed ? (
              <View style={[styles.dailyClaimButton, styles.dailyClaimButtonClaimed]}>
                <Text style={styles.dailyClaimButtonTextClaimed}>Claimed</Text>
              </View>
            ) : (
              <Pressable
                disabled={!dailyClearStatus.eligible || claimingDailyClear}
                onPress={() => void claimDailyClear()}
                style={({ pressed }) => [
                  styles.dailyClaimButton,
                  !dailyClearStatus.eligible && styles.dailyClaimButtonLocked,
                  pressed && dailyClearStatus.eligible && styles.dailyClaimButtonPressed,
                ]}>
                <Text
                  style={[
                    styles.dailyClaimButtonText,
                    !dailyClearStatus.eligible && styles.dailyClaimButtonTextLocked,
                  ]}>
                  {claimingDailyClear ? 'Claiming' : 'Claim'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {recoveryStatus.available || recoveryStatus.completedToday ? (
          <LinearGradient
            colors={
              recoveryStatus.completedToday
                ? ['rgba(13, 42, 45, 0.94)', 'rgba(8, 17, 31, 0.94)']
                : ['rgba(49, 29, 57, 0.96)', 'rgba(12, 17, 34, 0.96)']
            }
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.recoveryCard}>
            <View style={styles.recoveryIcon}>
              <MaterialCommunityIcons
                name={recoveryStatus.completedToday ? 'weather-windy' : 'heart-flash'}
                size={24}
                color={recoveryStatus.completedToday ? '#7EE7FF' : '#FF8FC7'}
              />
            </View>
            <View style={styles.recoveryBody}>
              <Text style={styles.recoveryTitle}>
                {recoveryStatus.completedToday ? 'Recovery complete' : 'Recovery Quest available'}
              </Text>
              <Text style={styles.recoveryText}>
                {recoveryStatus.completedToday
                  ? `New streak started after ${recoveryStatus.missedDays} missed ${
                      recoveryStatus.missedDays === 1 ? 'day' : 'days'
                    }.`
                  : `Complete one real quest today to restart after ${recoveryStatus.missedDays} missed ${
                      recoveryStatus.missedDays === 1 ? 'day' : 'days'
                    }.`}
              </Text>
              <Text style={styles.recoveryMeta}>Earned XP stays safe. Start fresh with any quest below.</Text>
            </View>
          </LinearGradient>
        ) : null}

        <View style={styles.habitList}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#63DFFF" />
              <Text style={styles.loadingText}>Loading daily quests...</Text>
            </View>
          ) : null}

          {!loading && habits.length === 0 ? (
            <View style={styles.loadingState}>
              <MaterialCommunityIcons name="sword-cross" size={28} color="#707894" />
              <Text style={styles.loadingText}>No daily quests yet.</Text>
            </View>
          ) : null}

          {habits.map((habit) => {
            const accent = difficultyColors[habit.difficulty];
            const reward = rewardByDifficulty[habit.difficulty];
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: habit.complete }}
                key={habit.id}
                onPress={() => void toggleHabit(habit.id)}
                style={({ pressed }) => [
                  styles.habitCard,
                  habit.complete && styles.habitCardComplete,
                  pressed && styles.habitCardPressed,
                ]}>
                <View style={[styles.habitIcon, { borderColor: `${accent}55` }]}>
                  <MaterialCommunityIcons
                    name={attributeIcons[habit.attribute]}
                    size={23}
                    color={accent}
                  />
                </View>

                <View style={styles.habitInfo}>
                  <View style={styles.habitTitleRow}>
                    <Text style={[styles.habitTitle, habit.complete && styles.habitTitleComplete]}>
                      {habit.title}
                    </Text>
                    <Text style={[styles.difficulty, { color: accent }]}>
                      {habit.difficulty.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.habitDetail}>{habit.description || 'Complete this daily quest'}</Text>
                  <View style={styles.rewardRow}>
                    <Text style={styles.rewardText}>+{reward.xp} EXP</Text>
                    <View style={styles.rewardDot} />
                    <Text style={styles.rewardText}>
                      +{reward.statXp} {formatAttribute(habit.attribute)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.checkButton, habit.complete && styles.checkButtonComplete]}>
                  {habit.complete ? (
                    <MaterialCommunityIcons name="check" size={20} color="#061018" />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.push('/create-habit' as Href)}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}>
          <MaterialCommunityIcons name="plus" size={20} color="#7EE7FF" />
          <Text style={styles.addButtonText}>Add new habit</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  backgroundGlowPurple: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#5E2B97',
    opacity: 0.12,
    top: -100,
    right: -100,
  },
  backgroundGlowCyan: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#00B8D9',
    opacity: 0.08,
    top: 260,
    left: -150,
  },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 110 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#50E8FF' },
  systemLabel: { color: '#6ECFE4', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  heading: { color: '#F5F2FF', fontSize: 31, fontWeight: '800', letterSpacing: -0.8 },
  avatarButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11162A',
    borderWidth: 1,
    borderColor: '#293252',
  },
  playerCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#433C73',
    padding: 17,
    overflow: 'hidden',
    marginBottom: 26,
  },
  cardAccent: {
    position: 'absolute',
    width: 90,
    height: 170,
    right: -25,
    top: -50,
    backgroundColor: '#4FDDFF',
    opacity: 0.06,
    transform: [{ rotate: '24deg' }],
  },
  playerTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 19 },
  levelBadge: {
    width: 57,
    height: 57,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6, 9, 22, 0.7)',
    borderWidth: 1,
    borderColor: '#6357A5',
  },
  levelCaption: { color: '#9089C0', fontSize: 8, fontWeight: '800', letterSpacing: 1.3 },
  levelNumber: { color: '#E9E4FF', fontSize: 22, fontWeight: '900' },
  playerIdentity: { flex: 1, paddingHorizontal: 13 },
  playerName: { color: '#F1EEFF', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  playerSubtitle: { color: '#888EAC', fontSize: 11, fontWeight: '600' },
  rankBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1B2A',
    borderWidth: 1,
    borderColor: '#2B9BB5',
  },
  rankLetter: { color: '#6EE8FF', fontSize: 18, fontWeight: '900' },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  xpLabel: { color: '#8D91AD', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  xpValue: { color: '#B8C0DC', fontSize: 10, fontWeight: '700' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#11152A', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(126, 133, 170, 0.18)',
  },
  quickStatItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  quickStatDivider: { width: 1, height: 28, backgroundColor: '#30334E', marginHorizontal: 12 },
  quickStatValue: { color: '#EDF0FF', fontSize: 13, fontWeight: '800' },
  quickStatLabel: { color: '#777E9C', fontSize: 9, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  sectionEyebrow: { color: '#8E72FF', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  sectionTitle: { color: '#F1EFFF', fontSize: 19, fontWeight: '800', marginTop: 4 },
  completionBadge: {
    minWidth: 42,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#12172A',
    borderWidth: 1,
    borderColor: '#282F4A',
  },
  completionText: { color: '#8EDFF2', fontSize: 11, fontWeight: '800' },
  dailyProgressCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(17, 21, 40, 0.86)',
    borderWidth: 1,
    borderColor: '#252A48',
    marginBottom: 12,
  },
  dailyProgressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  dailyProgressTitle: { color: '#C6C9DC', fontSize: 12, fontWeight: '700' },
  dailyProgressPercent: { color: '#77E4FF', fontSize: 12, fontWeight: '900' },
  dailyTrack: { height: 5, borderRadius: 3, backgroundColor: '#080B18', overflow: 'hidden' },
  dailyFill: { height: '100%', borderRadius: 3 },
  dailyClearRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  dailyClearIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 11, 24, 0.92)',
    borderWidth: 1,
    borderColor: '#2C3658',
  },
  dailyClearIconReady: { borderColor: '#4AD6FF', backgroundColor: 'rgba(14, 34, 52, 0.94)' },
  dailyClearIconClaimed: { borderColor: '#7FE7A9', backgroundColor: '#7FE7A9' },
  dailyClearBody: { flex: 1, minWidth: 0 },
  dailyClearTitle: { color: '#E6E9F8', fontSize: 12, fontWeight: '900' },
  dailyClearText: { color: '#737B98', fontSize: 10, fontWeight: '700', marginTop: 3 },
  dailyClaimButton: {
    width: 78,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#52D7F5',
    borderWidth: 1,
    borderColor: '#73E8FF',
  },
  dailyClaimButtonLocked: {
    backgroundColor: 'rgba(21, 25, 44, 0.88)',
    borderColor: '#313955',
  },
  dailyClaimButtonClaimed: {
    backgroundColor: 'rgba(127, 231, 169, 0.14)',
    borderColor: '#4D9E71',
  },
  dailyClaimButtonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  dailyClaimButtonText: { color: '#061018', fontSize: 11, fontWeight: '900' },
  dailyClaimButtonTextLocked: { color: '#68708D' },
  dailyClaimButtonTextClaimed: { color: '#8DECB4', fontSize: 10, fontWeight: '900' },
  recoveryCard: {
    minHeight: 104,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#3E3558',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  recoveryIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 9, 22, 0.7)',
    borderWidth: 1,
    borderColor: '#573A60',
  },
  recoveryBody: { flex: 1, paddingLeft: 12 },
  recoveryTitle: { color: '#F1EEFF', fontSize: 14, fontWeight: '900' },
  recoveryText: { color: '#BFC5DB', fontSize: 11, fontWeight: '700', marginTop: 5 },
  recoveryMeta: { color: '#777E9C', fontSize: 10, fontWeight: '700', marginTop: 7 },
  habitList: { gap: 10 },
  loadingState: {
    minHeight: 90,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: 'rgba(12, 16, 31, 0.7)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  loadingText: { color: '#737B98', fontSize: 11, fontWeight: '700' },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 92,
    borderRadius: 17,
    padding: 13,
    backgroundColor: 'rgba(12, 16, 31, 0.94)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  habitCardComplete: { backgroundColor: 'rgba(12, 25, 35, 0.94)', borderColor: '#254B58' },
  habitCardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  habitIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11172A',
    borderWidth: 1,
  },
  habitInfo: { flex: 1, paddingHorizontal: 12 },
  habitTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  habitTitle: { color: '#E8E9F4', fontSize: 14, fontWeight: '800', flexShrink: 1 },
  habitTitleComplete: { color: '#A9B7C2' },
  difficulty: { fontSize: 8, fontWeight: '900', letterSpacing: 0.9, marginLeft: 8 },
  habitDetail: { color: '#737B98', fontSize: 10, marginTop: 4 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  rewardText: { color: '#6FC8DC', fontSize: 9, fontWeight: '700' },
  rewardDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#454D69' },
  checkButton: {
    width: 27,
    height: 27,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#39415F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkButtonComplete: { backgroundColor: '#67DDF6', borderColor: '#67DDF6' },
  addButton: {
    height: 50,
    marginTop: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#27485A',
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(12, 29, 40, 0.58)',
  },
  addButtonPressed: { opacity: 0.72 },
  addButtonText: { color: '#86DDF0', fontSize: 13, fontWeight: '700' },
});
