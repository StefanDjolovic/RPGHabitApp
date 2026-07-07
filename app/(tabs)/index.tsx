import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  completeCurrentBossMilestone,
  getActiveBossQuest,
  type BossQuest,
} from '@/src/database/boss-quest-repository';

import { PlayerAvatar } from '@/components/player-avatar';

import {
  changeHabitCounter,
  claimDailyClearChest,
  DailyClearStatus,
  getDailyClearStatus,
  getTodayHabits,
  Habit,
  HabitAttribute,
  resetTimedHabitForToday,
  rewardByDifficulty,
  setHabitCompletion,
  setTimedHabitRunning,
  setWeeklyHabitCheckIn,
} from '@/src/database/habit-repository';
import { getActivityStreak } from '@/src/progression/activity-streak';
import { getSecondaryAttributeXp } from '@/src/progression/attribute-rewards';
import {
  getPlayerProgress,
  INITIAL_PLAYER_PROGRESS,
  MAX_DAILY_DUNGEON_ENERGY,
  MAX_DUNGEON_ENERGY,
  type PlayerProgress,
} from '@/src/progression/player-progression';
import {
  getPlayerProfile,
  INITIAL_PLAYER_PROFILE,
  type PlayerProfile,
} from '@/src/database/profile-repository';
import {
  getPlayerClassState,
  INITIAL_PLAYER_CLASS_STATE,
  type PlayerClassState,
} from '@/src/database/class-repository';
import {
  completeRecoveryQuest,
  getRecoveryQuestStatus,
  RECOVERY_QUEST_REWARD,
  type RecoveryQuestStatus,
} from '@/src/progression/recovery-quest';
import {
  claimHabitMission,
  getHabitMissionBoard,
  type HabitMission,
  type HabitMissionBoard,
} from '@/src/database/mission-repository';
import { getItemDefinition } from '@/src/inventory/item-catalog';
import { getHabitAppearance } from '@/src/habits/habit-appearance';
import { syncHabitReminderFromDatabase } from '@/src/notifications/habit-reminders';
import { syncSystemNotifications } from '@/src/notifications/system-notifications';

const difficultyColors = {
  easy: '#68E1A8',
  medium: '#61D4FF',
  hard: '#C68CFF',
};

function formatAttribute(attribute: HabitAttribute) {
  return attribute.charAt(0).toUpperCase() + attribute.slice(1);
}

function getTimedHabitElapsedSeconds(habit: Habit, nowEpoch: number) {
  const activeSeconds = habit.timerStartedAtEpoch
    ? Math.max(0, nowEpoch - habit.timerStartedAtEpoch)
    : 0;
  return Math.min(
    habit.targetDurationMinutes * 60,
    habit.elapsedSeconds + activeSeconds,
  );
}

function formatTimerDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const initialRecoveryStatus: RecoveryQuestStatus = {
  available: false,
  completedToday: false,
  lastActiveDate: null,
  triggerDate: null,
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
  rewardItemKey: null,
  rewardQuantity: null,
};

const initialMissionBoard: HabitMissionBoard = {
  todayKey: '',
  weekStartKey: '',
  daily: [],
  weekly: [],
};

function MissionCard({
  mission,
  claiming,
  onClaim,
}: {
  mission: HabitMission;
  claiming: boolean;
  onClaim: (missionKey: string) => void;
}) {
  const progressRatio = mission.target > 0 ? mission.progress / mission.target : 0;
  const locked = !mission.complete || claiming;
  const rewardText = [
    `+${mission.reward.xp} EXP`,
    `+${mission.reward.statXp} ${formatAttribute(mission.reward.attribute)}`,
    mission.reward.energy > 0 ? `+${mission.reward.energy} Energy` : null,
    mission.reward.gold > 0 ? `+${mission.reward.gold} Gold` : null,
  ].filter(Boolean).join('  |  ');

  return (
    <View style={[styles.missionCard, mission.claimed && styles.missionCardClaimed]}>
      <View style={[styles.missionIcon, { borderColor: `${mission.accent}66` }]}>
        <MaterialCommunityIcons
          color={mission.claimed ? '#071018' : mission.accent}
          name={mission.claimed ? 'check-bold' : mission.icon}
          size={20}
        />
      </View>
      <View style={styles.missionBody}>
        <View style={styles.missionTitleRow}>
          <View style={styles.missionTitleBlock}>
            <Text style={[styles.missionCadence, { color: mission.accent }]}>
              {mission.cadence.toUpperCase()}
            </Text>
            <Text style={styles.missionTitle}>{mission.title}</Text>
          </View>
          <Text style={styles.missionProgressText}>
            {mission.progress}/{mission.target}
          </Text>
        </View>
        <Text style={styles.missionDetail}>{mission.detail}</Text>
        <View style={styles.missionTrack}>
          <View
            style={[
              styles.missionFill,
              { backgroundColor: mission.accent, width: `${progressRatio * 100}%` },
            ]}
          />
        </View>
        <View style={styles.missionFooter}>
          <Text numberOfLines={1} style={styles.missionReward}>{rewardText}</Text>
          {mission.claimed ? (
            <View style={styles.missionClaimedBadge}>
              <Text style={styles.missionClaimedText}>Claimed</Text>
            </View>
          ) : (
            <Pressable
              accessibilityLabel={`Claim ${mission.title}`}
              disabled={locked}
              onPress={() => onClaim(mission.key)}
              style={({ pressed }) => [
                styles.missionClaimButton,
                locked && styles.missionClaimButtonLocked,
                pressed && !locked && styles.missionClaimButtonPressed,
              ]}>
              {claiming ? (
                <ActivityIndicator color="#071018" size="small" />
              ) : (
                <Text
                  style={[
                    styles.missionClaimText,
                    locked && styles.missionClaimTextLocked,
                  ]}>
                  Claim
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export default function TodayScreen() {
  const db = useSQLiteContext();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [bossQuest, setBossQuest] = useState<BossQuest | null>(null);
  const [playerProgress, setPlayerProgress] = useState<PlayerProgress>(INITIAL_PLAYER_PROGRESS);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile>(INITIAL_PLAYER_PROFILE);
  const [playerClassState, setPlayerClassState] =
    useState<PlayerClassState>(INITIAL_PLAYER_CLASS_STATE);
  const [activityStreak, setActivityStreak] = useState(0);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryQuestStatus>(initialRecoveryStatus);
  const [dailyClearStatus, setDailyClearStatus] =
    useState<DailyClearStatus>(initialDailyClearStatus);
  const [missionBoard, setMissionBoard] = useState<HabitMissionBoard>(initialMissionBoard);
  const [claimingDailyClear, setClaimingDailyClear] = useState(false);
  const [claimingMissionKey, setClaimingMissionKey] = useState<string | null>(null);
  const [completingRecovery, setCompletingRecovery] = useState(false);
  const [updatingHabitId, setUpdatingHabitId] = useState<number | null>(null);
  const [updatingBossQuest, setUpdatingBossQuest] = useState(false);
  const [clockEpoch, setClockEpoch] = useState(() => Math.floor(Date.now() / 1000));
  const [loading, setLoading] = useState(true);
  const syncNotificationState = useCallback(() => {
    void syncSystemNotifications(db).catch(() => ({
      permissionGranted: false,
      scheduledCount: 0,
    }));
  }, [db]);
  const requiredProgress =
    dailyClearStatus.required > 0
      ? dailyClearStatus.completed / dailyClearStatus.required
      : 0;
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
  const dailyClearReward = dailyClearStatus.rewardItemKey
    ? getItemDefinition(dailyClearStatus.rewardItemKey)
    : null;
  const dailyClearText =
    dailyClearStatus.required === 0
      ? 'No required objectives scheduled today.'
      : dailyClearStatus.claimed
        ? dailyClearReward
          ? `Loot stored: ${dailyClearStatus.rewardQuantity ?? 1}x ${dailyClearReward.name}.`
          : "Chest claimed for today's full clear."
        : dailyClearStatus.eligible
          ? 'All objectives cleared. The chest is ready.'
          : `${remainingDailyObjectives} ${
              remainingDailyObjectives === 1 ? 'objective' : 'objectives'
            } left before the chest unlocks.`;
  const bossMilestone = bossQuest?.milestones.find((milestone) => !milestone.complete) ?? null;
  const completedBossMilestones = bossQuest?.milestones.filter((milestone) => milestone.complete).length ?? 0;
  const bossProgress = bossQuest?.milestones.length
    ? completedBossMilestones / bossQuest.milestones.length
    : 0;
  const bossMilestoneReward = bossMilestone
    ? rewardByDifficulty[bossMilestone.difficulty]
    : null;
  const missions = [...missionBoard.daily, ...missionBoard.weekly];
  const missionReadyCount = missions.filter((mission) => mission.complete && !mission.claimed).length;
  const missionClaimedCount = missions.filter((mission) => mission.claimed).length;

  const loadTodayData = useCallback(async () => {
    try {
      const [
        todayHabits,
        activeBoss,
        progressSummary,
        profile,
        classState,
        streak,
        recovery,
        dailyClear,
        missions,
      ] = await Promise.all([
        getTodayHabits(db),
        getActiveBossQuest(db),
        getPlayerProgress(db),
        getPlayerProfile(db),
        getPlayerClassState(db),
        getActivityStreak(db),
        getRecoveryQuestStatus(db),
        getDailyClearStatus(db),
        getHabitMissionBoard(db),
      ]);
      setHabits(todayHabits);
      setBossQuest(activeBoss);
      setPlayerProgress(progressSummary);
      setPlayerProfile(profile);
      setPlayerClassState(classState);
      setActivityStreak(streak);
      setRecoveryStatus(recovery);
      setDailyClearStatus(dailyClear);
      setMissionBoard(missions);
      syncNotificationState();
    } finally {
      setLoading(false);
    }
  }, [db, syncNotificationState]);

  useFocusEffect(
    useCallback(() => {
      void loadTodayData();
    }, [loadTodayData]),
  );

  const toggleHabit = async (id: number) => {
    const habit = habits.find((item) => item.id === id);
    if (
      !habit ||
      habit.goalType !== 'single' ||
      (habit.cadence !== 'daily' && habit.cadence !== 'one-time') ||
      updatingHabitId === id
    ) {
      return;
    }

    const nextComplete = !habit.complete;
    setUpdatingHabitId(id);
    setHabits((current) =>
      current.map((item) => (item.id === id ? { ...item, complete: nextComplete } : item)),
    );

    try {
      await setHabitCompletion(db, id, nextComplete, habit.cadence);
      if (habit.cadence === 'one-time') {
        await syncHabitReminderFromDatabase(db, id).catch(() => false);
      }
      const [progressSummary, streak, recovery, dailyClear, missions] = await Promise.all([
        getPlayerProgress(db),
        getActivityStreak(db),
        getRecoveryQuestStatus(db),
        getDailyClearStatus(db),
        getHabitMissionBoard(db),
      ]);
      setPlayerProgress(progressSummary);
      setActivityStreak(streak);
      setRecoveryStatus(recovery);
      setDailyClearStatus(dailyClear);
      setMissionBoard(missions);
      syncNotificationState();
    } catch {
      setHabits((current) =>
        current.map((item) => (item.id === id ? { ...item, complete: habit.complete } : item)),
      );
    } finally {
      setUpdatingHabitId(null);
    }
  };

  const updateCounter = async (habit: Habit, delta: number) => {
    if (habit.goalType !== 'counter' || updatingHabitId === habit.id) return;

    const nextCount = Math.min(habit.targetCount, Math.max(0, habit.currentCount + delta));
    if (nextCount === habit.currentCount) return;

    const nextComplete = nextCount >= habit.targetCount;
    setUpdatingHabitId(habit.id);
    setHabits((current) =>
      current.map((item) =>
        item.id === habit.id
          ? { ...item, currentCount: nextCount, complete: nextComplete }
          : item,
      ),
    );

    try {
      const savedCount = await changeHabitCounter(db, habit.id, delta);
      setHabits((current) =>
        current.map((item) =>
          item.id === habit.id
            ? {
                ...item,
                currentCount: savedCount,
                complete: savedCount >= item.targetCount,
              }
            : item,
        ),
      );
      const [progressSummary, streak, recovery, dailyClear, missions] = await Promise.all([
        getPlayerProgress(db),
        getActivityStreak(db),
        getRecoveryQuestStatus(db),
        getDailyClearStatus(db),
        getHabitMissionBoard(db),
      ]);
      setPlayerProgress(progressSummary);
      setActivityStreak(streak);
      setRecoveryStatus(recovery);
      setDailyClearStatus(dailyClear);
      setMissionBoard(missions);
      syncNotificationState();
    } catch {
      setHabits((current) =>
        current.map((item) => (item.id === habit.id ? habit : item)),
      );
    } finally {
      setUpdatingHabitId(null);
    }
  };

  const updateWeeklyCheckIn = async (habit: Habit) => {
    if (habit.cadence !== 'weekly' || updatingHabitId === habit.id) return;

    const nextChecked = !habit.checkedToday;
    if (nextChecked && habit.complete) return;
    const nextCount = Math.max(0, habit.currentCount + (nextChecked ? 1 : -1));
    const nextComplete = nextCount >= habit.targetCount;
    setUpdatingHabitId(habit.id);
    setHabits((current) =>
      current.map((item) =>
        item.id === habit.id
          ? {
              ...item,
              checkedToday: nextChecked,
              currentCount: nextCount,
              complete: nextComplete,
            }
          : item,
      ),
    );

    try {
      const savedCount = await setWeeklyHabitCheckIn(db, habit.id, nextChecked);
      setHabits((current) =>
        current.map((item) =>
          item.id === habit.id
            ? {
                ...item,
                checkedToday: nextChecked,
                currentCount: savedCount,
                complete: savedCount >= item.targetCount,
              }
            : item,
        ),
      );
      const [progressSummary, streak, recovery, dailyClear, missions] = await Promise.all([
        getPlayerProgress(db),
        getActivityStreak(db),
        getRecoveryQuestStatus(db),
        getDailyClearStatus(db),
        getHabitMissionBoard(db),
      ]);
      setPlayerProgress(progressSummary);
      setActivityStreak(streak);
      setRecoveryStatus(recovery);
      setDailyClearStatus(dailyClear);
      setMissionBoard(missions);
      syncNotificationState();
    } catch {
      setHabits((current) =>
        current.map((item) => (item.id === habit.id ? habit : item)),
      );
    } finally {
      setUpdatingHabitId(null);
    }
  };

  const updateTimedHabit = useCallback(
    async (habit: Habit, running: boolean) => {
      if (habit.goalType !== 'timer' || updatingHabitId === habit.id) return;

      const nowEpoch = Math.floor(Date.now() / 1000);
      const elapsedSeconds = getTimedHabitElapsedSeconds(habit, nowEpoch);
      setUpdatingHabitId(habit.id);
      setClockEpoch(nowEpoch);
      setHabits((current) =>
        current.map((item) =>
          item.id === habit.id
            ? {
                ...item,
                elapsedSeconds,
                timerStartedAtEpoch: running ? nowEpoch : null,
              }
            : item,
        ),
      );

      try {
        const savedProgress = await setTimedHabitRunning(db, habit.id, running);
        setHabits((current) =>
          current.map((item) =>
            item.id === habit.id
              ? {
                  ...item,
                  elapsedSeconds: savedProgress.elapsedSeconds,
                  timerStartedAtEpoch: savedProgress.timerStartedAtEpoch,
                  complete: savedProgress.complete,
                }
              : item,
          ),
        );
        const [progressSummary, streak, recovery, dailyClear, missions] = await Promise.all([
          getPlayerProgress(db),
          getActivityStreak(db),
          getRecoveryQuestStatus(db),
          getDailyClearStatus(db),
          getHabitMissionBoard(db),
        ]);
        setPlayerProgress(progressSummary);
        setActivityStreak(streak);
        setRecoveryStatus(recovery);
        setDailyClearStatus(dailyClear);
        setMissionBoard(missions);
        syncNotificationState();
      } catch {
        setHabits((current) =>
          current.map((item) => (item.id === habit.id ? habit : item)),
        );
      } finally {
        setUpdatingHabitId(null);
      }
    },
    [db, syncNotificationState, updatingHabitId],
  );

  const resetTimedHabit = async (habit: Habit) => {
    if (habit.goalType !== 'timer' || updatingHabitId === habit.id) return;

    setUpdatingHabitId(habit.id);
    setHabits((current) =>
      current.map((item) =>
        item.id === habit.id
          ? {
              ...item,
              elapsedSeconds: 0,
              timerStartedAtEpoch: null,
              complete: false,
            }
          : item,
      ),
    );

    try {
      await resetTimedHabitForToday(db, habit.id);
      const [progressSummary, streak, recovery, dailyClear, missions] = await Promise.all([
        getPlayerProgress(db),
        getActivityStreak(db),
        getRecoveryQuestStatus(db),
        getDailyClearStatus(db),
        getHabitMissionBoard(db),
      ]);
      setPlayerProgress(progressSummary);
      setActivityStreak(streak);
      setRecoveryStatus(recovery);
      setDailyClearStatus(dailyClear);
      setMissionBoard(missions);
      syncNotificationState();
    } catch {
      setHabits((current) =>
        current.map((item) => (item.id === habit.id ? habit : item)),
      );
    } finally {
      setUpdatingHabitId(null);
    }
  };

  useEffect(() => {
    const hasRunningTimer = habits.some(
      (habit) => habit.goalType === 'timer' && habit.timerStartedAtEpoch !== null,
    );
    if (!hasRunningTimer) return;

    const interval = setInterval(() => {
      setClockEpoch(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [habits]);

  useEffect(() => {
    if (updatingHabitId !== null) return;
    const finishedTimer = habits.find(
      (habit) =>
        habit.goalType === 'timer' &&
        !habit.complete &&
        habit.timerStartedAtEpoch !== null &&
        getTimedHabitElapsedSeconds(habit, clockEpoch) >= habit.targetDurationMinutes * 60,
    );
    if (finishedTimer) void updateTimedHabit(finishedTimer, false);
  }, [clockEpoch, habits, updateTimedHabit, updatingHabitId]);

  const completeBossPhase = async () => {
    if (!bossQuest || updatingBossQuest) return;

    try {
      setUpdatingBossQuest(true);
      const nextBoss = await completeCurrentBossMilestone(db, bossQuest.id);
      setBossQuest(nextBoss);
      const [progressSummary, streak, recovery] = await Promise.all([
        getPlayerProgress(db),
        getActivityStreak(db),
        getRecoveryQuestStatus(db),
      ]);
      setPlayerProgress(progressSummary);
      setActivityStreak(streak);
      setRecoveryStatus(recovery);
      syncNotificationState();

      if (!nextBoss) {
        Alert.alert(
          'Boss Quest defeated',
          'Final bonus granted. Dungeon Key and Boss Quest Chest are now in Inventory.',
        );
      }
    } catch {
      Alert.alert('Boss phase not completed', 'The phase could not be saved. Please try again.');
    } finally {
      setUpdatingBossQuest(false);
    }
  };

  const confirmBossPhase = () => {
    if (!bossQuest) return;
    const milestone = bossQuest.milestones.find((item) => !item.complete);
    if (!milestone) return;

    Alert.alert('Complete boss phase?', milestone.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => void completeBossPhase() },
    ]);
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

  const claimMission = async (missionKey: string) => {
    if (claimingMissionKey) return;

    setClaimingMissionKey(missionKey);
    try {
      const nextMissionBoard = await claimHabitMission(db, missionKey);
      const [progressSummary, dailyClear] = await Promise.all([
        getPlayerProgress(db),
        getDailyClearStatus(db),
      ]);
      setMissionBoard(nextMissionBoard);
      setPlayerProgress(progressSummary);
      setDailyClearStatus(dailyClear);
      syncNotificationState();
    } catch {
      Alert.alert('Mission not claimed', 'The mission reward could not be saved. Please try again.');
    } finally {
      setClaimingMissionKey(null);
    }
  };

  const completeRecovery = async () => {
    if (!recoveryStatus.available || completingRecovery) return;

    try {
      setCompletingRecovery(true);
      const recoveryResult = await completeRecoveryQuest(db);
      const [progressSummary, streak] = await Promise.all([
        getPlayerProgress(db),
        getActivityStreak(db),
      ]);
      setRecoveryStatus(recoveryResult.status);
      setPlayerProgress(progressSummary);
      setActivityStreak(streak);
      await syncSystemNotifications(db).catch(() => ({
        permissionGranted: false,
        scheduledCount: 0,
      }));
      Alert.alert(
        recoveryResult.unlockedSecondWind ? 'Second Wind unlocked' : 'Recovery complete',
        recoveryResult.unlockedSecondWind
          ? 'Recovery complete. The Second Wind achievement is now yours.'
          : 'A new Activity Streak begins today.',
      );
    } catch {
      Alert.alert('Recovery not completed', 'The quest could not be saved. Please try again.');
    } finally {
      setCompletingRecovery(false);
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
            <PlayerAvatar
              activeClass={playerClassState.activeClass}
              profile={playerProfile}
              rankKey={playerProgress.rankKey}
              size={48}
            />
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
              <Text style={styles.playerName}>{playerProfile.nickname}</Text>
              <Text style={styles.playerSubtitle}>
                {playerProgress.rankLabel} - {playerClassState.activeClass?.name ?? 'Path in progress'}
              </Text>
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

        {playerClassState.eligible && !playerClassState.awakened ? (
          <LinearGradient
            colors={['rgba(27, 54, 72, 0.98)', 'rgba(24, 20, 49, 0.98)']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.awakeningCard}>
            <View style={styles.awakeningIcon}>
              <MaterialCommunityIcons name="star-four-points" size={25} color="#8DEAFF" />
            </View>
            <View style={styles.awakeningBody}>
              <Text style={styles.awakeningEyebrow}>SYSTEM QUEST AVAILABLE</Text>
              <Text style={styles.awakeningTitle}>Awakening</Text>
              <Text style={styles.awakeningText}>Choose your first class and unlock its starter skills.</Text>
            </View>
            <Pressable
              accessibilityLabel="Begin Awakening"
              onPress={() => router.push('/awakening' as Href)}
              style={({ pressed }) => [
                styles.awakeningButton,
                pressed && styles.awakeningButtonPressed,
              ]}>
              <MaterialCommunityIcons name="arrow-right" size={19} color="#071018" />
            </Pressable>
          </LinearGradient>
        ) : null}

        {missions.length > 0 ? (
          <View style={styles.missionBoard}>
            <View style={styles.missionBoardHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>MISSION BOARD</Text>
                <Text style={styles.sectionTitle}>Daily and weekly targets</Text>
              </View>
              <View style={styles.missionSummaryBadge}>
                <Text style={styles.missionSummaryValue}>{missionReadyCount}</Text>
                <Text style={styles.missionSummaryLabel}>
                  {missionReadyCount === 1 ? 'ready' : 'ready'}
                </Text>
              </View>
            </View>

            <View style={styles.missionList}>
              {missions.map((mission) => (
                <MissionCard
                  claiming={claimingMissionKey === mission.key}
                  key={`${mission.periodStart}-${mission.key}`}
                  mission={mission}
                  onClaim={(key) => void claimMission(key)}
                />
              ))}
            </View>

            <View style={styles.missionBoardFooter}>
              <MaterialCommunityIcons name="check-circle-outline" size={14} color="#7D859B" />
              <Text style={styles.missionBoardFooterText}>
                {missionClaimedCount}/{missions.length} rewards claimed for the active periods.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>{"TODAY'S QUESTS"}</Text>
            <Text style={styles.sectionTitle}>{"Today's objectives"}</Text>
          </View>
          <View style={styles.completionBadge}>
            <Text style={styles.completionText}>
              {dailyClearStatus.completed}/{dailyClearStatus.required}
            </Text>
          </View>
        </View>

        <View style={styles.dailyProgressCard}>
          <View style={styles.dailyProgressTop}>
            <Text style={styles.dailyProgressTitle}>Required completion</Text>
            <Text style={styles.dailyProgressPercent}>{Math.round(requiredProgress * 100)}%</Text>
          </View>
          <View style={styles.dailyTrack}>
            <LinearGradient
              colors={['#6C4DFF', '#56D9FF']}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[styles.dailyFill, { width: `${requiredProgress * 100}%` }]}
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
                  : `A fresh start after ${recoveryStatus.missedDays} missed ${
                      recoveryStatus.missedDays === 1 ? 'day' : 'days'
                    }.`}
              </Text>
              <View style={styles.recoveryRewardRow}>
                <Text style={styles.recoveryReward}>+{RECOVERY_QUEST_REWARD.xp} EXP</Text>
                <Text style={styles.recoveryReward}>+{RECOVERY_QUEST_REWARD.statXp} Discipline</Text>
                <Text style={styles.recoveryReward}>+{RECOVERY_QUEST_REWARD.energy} Energy</Text>
              </View>
              {recoveryStatus.available ? (
                <Pressable
                  accessibilityLabel="Complete Recovery Quest"
                  disabled={completingRecovery}
                  onPress={() => void completeRecovery()}
                  style={({ pressed }) => [
                    styles.recoveryButton,
                    pressed && styles.recoveryButtonPressed,
                  ]}>
                  {completingRecovery ? (
                    <ActivityIndicator color="#071019" size="small" />
                  ) : (
                    <MaterialCommunityIcons name="check" size={18} color="#071019" />
                  )}
                  <Text style={styles.recoveryButtonText}>
                    {completingRecovery ? 'Completing' : 'Complete'}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.recoveryCompleteBadge}>
                  <MaterialCommunityIcons name="check-circle" size={16} color="#7EE7FF" />
                  <Text style={styles.recoveryCompleteText}>SECOND WIND</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        ) : null}

        {bossQuest && bossMilestone && bossMilestoneReward ? (
          <LinearGradient
            colors={['rgba(70, 24, 45, 0.98)', 'rgba(23, 15, 39, 0.98)', 'rgba(8, 12, 25, 0.98)']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.bossCard}>
            <View style={styles.bossTopRow}>
              <View style={styles.bossIcon}>
                <MaterialCommunityIcons name="skull-crossbones" size={24} color="#FF91AD" />
              </View>
              <View style={styles.bossIdentity}>
                <Text style={styles.bossEyebrow}>ACTIVE BOSS QUEST</Text>
                <Text style={styles.bossTitle}>{bossQuest.title}</Text>
              </View>
              <Text style={styles.bossProgressValue}>
                {completedBossMilestones}/{bossQuest.milestones.length}
              </Text>
            </View>

            <View style={styles.bossTrack}>
              <LinearGradient
                colors={['#D54470', '#8A62FF']}
                end={{ x: 1, y: 0 }}
                start={{ x: 0, y: 0 }}
                style={[styles.bossTrackFill, { width: `${bossProgress * 100}%` }]}
              />
            </View>

            <View style={styles.bossPhaseRow}>
              <View style={styles.bossPhaseBody}>
                <Text style={styles.bossPhaseLabel}>PHASE {bossMilestone.position}</Text>
                <Text style={styles.bossPhaseTitle}>{bossMilestone.title}</Text>
                <Text style={styles.bossRewardText}>
                  {bossMilestone.difficulty.toUpperCase()} · +{bossMilestoneReward.xp} EXP · +{bossMilestoneReward.statXp} STAT
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Complete ${bossMilestone.title}`}
                disabled={updatingBossQuest}
                onPress={confirmBossPhase}
                style={({ pressed }) => [
                  styles.bossCompleteButton,
                  updatingBossQuest && styles.counterButtonDisabled,
                  pressed && styles.counterButtonPressed,
                ]}>
                {updatingBossQuest ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <MaterialCommunityIcons name="sword-cross" size={20} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          </LinearGradient>
        ) : null}

        <View style={styles.habitList}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#63DFFF" />
              <Text style={styles.loadingText}>Loading quests...</Text>
            </View>
          ) : null}

          {!loading && habits.length === 0 ? (
            <View style={styles.loadingState}>
              <MaterialCommunityIcons name="sword-cross" size={28} color="#707894" />
              <Text style={styles.loadingText}>No quests scheduled today.</Text>
            </View>
          ) : null}

          {habits.map((habit) => {
            const difficultyAccent = difficultyColors[habit.difficulty];
            const appearance = getHabitAppearance(
              habit.iconKey,
              habit.colorKey,
              habit.attribute,
              difficultyAccent,
            );
            const reward = rewardByDifficulty[habit.difficulty];
            const timerElapsedSeconds = getTimedHabitElapsedSeconds(habit, clockEpoch);
            return (
              <View
                key={habit.id}
                style={[
                  styles.habitCard,
                  habit.complete && styles.habitCardComplete,
                ]}>
                <View style={[styles.habitIcon, { borderColor: `${appearance.color}66` }]}>
                  <MaterialCommunityIcons
                    name={appearance.icon}
                    size={23}
                    color={appearance.color}
                  />
                </View>

                <View style={styles.habitInfo}>
                  <View style={styles.habitTitleRow}>
                    <Text style={[styles.habitTitle, habit.complete && styles.habitTitleComplete]}>
                      {habit.title}
                    </Text>
                    <View style={styles.habitBadgeRow}>
                      <Text style={[styles.modeBadge, !habit.isRequired && styles.modeBadgeOptional]}>
                        {habit.cadence === 'weekly'
                          ? 'WEEKLY'
                          : habit.cadence === 'one-time'
                            ? 'ONE-TIME'
                            : habit.isRequired
                              ? 'REQ'
                              : 'OPT'}
                      </Text>
                      <Text style={[styles.difficulty, { color: difficultyAccent }]}>
                        {habit.difficulty.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.habitDetail}>
                    {habit.description ||
                      (habit.cadence === 'weekly'
                        ? `Check in ${habit.targetCount} times this week`
                        : habit.cadence === 'one-time'
                          ? 'Complete this objective once'
                        : habit.goalType === 'timer'
                          ? `${habit.targetDurationMinutes} minute focused session`
                        : 'Complete this daily quest')}
                  </Text>
                  <View style={styles.rewardRow}>
                    <Text style={styles.rewardText}>+{reward.xp} EXP</Text>
                    <View style={styles.rewardDot} />
                    <Text style={styles.rewardText}>
                      +{reward.statXp} {formatAttribute(habit.attribute)}
                    </Text>
                    {habit.secondaryAttribute ? (
                      <>
                        <View style={styles.rewardDot} />
                        <Text style={styles.rewardText}>
                          +{getSecondaryAttributeXp(reward.statXp)}{' '}
                          {formatAttribute(habit.secondaryAttribute)}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>

                {habit.cadence === 'weekly' ? (
                  <View style={styles.counterControl}>
                    <Pressable
                      accessibilityLabel={`Remove today's ${habit.title} check-in`}
                      disabled={!habit.checkedToday || updatingHabitId === habit.id}
                      onPress={() => void updateWeeklyCheckIn(habit)}
                      style={({ pressed }) => [
                        styles.counterButton,
                        (!habit.checkedToday || updatingHabitId === habit.id) &&
                          styles.counterButtonDisabled,
                        pressed && styles.counterButtonPressed,
                      ]}>
                      <MaterialCommunityIcons name="minus" size={17} color="#AEB6CF" />
                    </Pressable>
                    <Text style={styles.counterValue}>
                      {habit.currentCount}/{habit.targetCount}
                    </Text>
                    <Pressable
                      accessibilityLabel={`Check in to ${habit.title} today`}
                      disabled={
                        habit.checkedToday || habit.complete || updatingHabitId === habit.id
                      }
                      onPress={() => void updateWeeklyCheckIn(habit)}
                      style={({ pressed }) => [
                        styles.counterButton,
                        (habit.checkedToday || habit.complete || updatingHabitId === habit.id) &&
                          styles.counterButtonDisabled,
                        pressed && styles.counterButtonPressed,
                      ]}>
                      <MaterialCommunityIcons
                        name={habit.complete ? 'check' : 'plus'}
                        size={17}
                        color={habit.complete ? '#8DECB4' : '#7EE7FF'}
                      />
                    </Pressable>
                  </View>
                ) : habit.goalType === 'timer' ? (
                  <View style={styles.timerControl}>
                    <View style={styles.timerReadout}>
                      <Text style={styles.timerValue}>
                        {formatTimerDuration(timerElapsedSeconds)}
                      </Text>
                      <Text style={styles.timerTarget}>/ {habit.targetDurationMinutes}m</Text>
                    </View>
                    <Pressable
                      accessibilityLabel={
                        habit.complete
                          ? `Undo ${habit.title}`
                          : habit.timerStartedAtEpoch !== null
                            ? `Pause ${habit.title}`
                            : `Start ${habit.title}`
                      }
                      disabled={updatingHabitId === habit.id}
                      onPress={() =>
                        habit.complete
                          ? void resetTimedHabit(habit)
                          : void updateTimedHabit(habit, habit.timerStartedAtEpoch === null)
                      }
                      style={({ pressed }) => [
                        styles.timerButton,
                        habit.complete && styles.timerButtonComplete,
                        updatingHabitId === habit.id && styles.counterButtonDisabled,
                        pressed && styles.counterButtonPressed,
                      ]}>
                      <MaterialCommunityIcons
                        name={
                          habit.complete
                            ? 'backup-restore'
                            : habit.timerStartedAtEpoch !== null
                              ? 'pause'
                              : 'play'
                        }
                        size={16}
                        color={habit.complete ? '#07131A' : '#8EEBFF'}
                      />
                    </Pressable>
                  </View>
                ) : habit.goalType === 'counter' ? (
                  <View style={styles.counterControl}>
                    <Pressable
                      accessibilityLabel={`Decrease ${habit.title} progress`}
                      disabled={habit.currentCount <= 0 || updatingHabitId === habit.id}
                      onPress={() => void updateCounter(habit, -1)}
                      style={({ pressed }) => [
                        styles.counterButton,
                        (habit.currentCount <= 0 || updatingHabitId === habit.id) &&
                          styles.counterButtonDisabled,
                        pressed && styles.counterButtonPressed,
                      ]}>
                      <MaterialCommunityIcons name="minus" size={17} color="#AEB6CF" />
                    </Pressable>
                    <Text style={styles.counterValue}>
                      {habit.currentCount}/{habit.targetCount}
                    </Text>
                    <Pressable
                      accessibilityLabel={`Increase ${habit.title} progress`}
                      disabled={habit.complete || updatingHabitId === habit.id}
                      onPress={() => void updateCounter(habit, 1)}
                      style={({ pressed }) => [
                        styles.counterButton,
                        (habit.complete || updatingHabitId === habit.id) &&
                          styles.counterButtonDisabled,
                        pressed && styles.counterButtonPressed,
                      ]}>
                      <MaterialCommunityIcons
                        name={habit.complete ? 'check' : 'plus'}
                        size={17}
                        color={habit.complete ? '#8DECB4' : '#7EE7FF'}
                      />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityLabel={`${habit.complete ? 'Undo' : 'Complete'} ${habit.title}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: habit.complete }}
                    disabled={updatingHabitId === habit.id}
                    onPress={() => void toggleHabit(habit.id)}
                    style={({ pressed }) => [
                      styles.checkButton,
                      habit.complete && styles.checkButtonComplete,
                      updatingHabitId === habit.id && styles.counterButtonDisabled,
                      pressed && styles.checkButtonPressed,
                    ]}>
                    {habit.complete ? (
                      <MaterialCommunityIcons name="check" size={20} color="#061018" />
                    ) : null}
                  </Pressable>
                )}
              </View>
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
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
  awakeningCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#31566A',
    overflow: 'hidden',
    marginBottom: 24,
  },
  awakeningIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#102333',
    borderWidth: 1,
    borderColor: '#31566A',
  },
  awakeningBody: { flex: 1, minWidth: 0 },
  awakeningEyebrow: { color: '#8DEAFF', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  awakeningTitle: { color: '#F0F2FA', fontSize: 14, fontWeight: '900', marginTop: 2 },
  awakeningText: { color: '#8590A5', fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 3 },
  awakeningButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#8DEAFF',
  },
  awakeningButtonPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  missionBoard: { gap: 10, marginBottom: 24 },
  missionBoardHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  missionSummaryBadge: {
    width: 50,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#2D4154',
  },
  missionSummaryValue: { color: '#8DEAFF', fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  missionSummaryLabel: { color: '#778298', fontSize: 7, fontWeight: '900', marginTop: 1 },
  missionList: { gap: 8 },
  missionCard: {
    minHeight: 116,
    flexDirection: 'row',
    gap: 11,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(13, 17, 32, 0.92)',
    borderWidth: 1,
    borderColor: '#252C42',
  },
  missionCardClaimed: { backgroundColor: 'rgba(12, 32, 31, 0.86)', borderColor: '#2D5B50' },
  missionIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
  },
  missionBody: { flex: 1, minWidth: 0, gap: 6 },
  missionTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  missionTitleBlock: { flex: 1, minWidth: 0 },
  missionCadence: { fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  missionTitle: { color: '#EEF1FA', fontSize: 13, fontWeight: '900', marginTop: 2 },
  missionProgressText: { color: '#C8D0E6', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  missionDetail: { color: '#858EA6', fontSize: 9, lineHeight: 13, fontWeight: '700' },
  missionTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: '#090D19' },
  missionFill: { height: '100%', borderRadius: 3 },
  missionFooter: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
  missionReward: { flex: 1, color: '#AEB7CC', fontSize: 8, fontWeight: '800' },
  missionClaimButton: {
    width: 70,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#8DEAFF',
    borderWidth: 1,
    borderColor: '#A8F0FF',
  },
  missionClaimButtonLocked: { backgroundColor: '#151A2A', borderColor: '#2B3146' },
  missionClaimButtonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  missionClaimText: { color: '#071018', fontSize: 10, fontWeight: '900' },
  missionClaimTextLocked: { color: '#68708D' },
  missionClaimedBadge: {
    height: 31,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(127, 231, 169, 0.14)',
    borderWidth: 1,
    borderColor: '#4D9E71',
  },
  missionClaimedText: { color: '#8DECB4', fontSize: 9, fontWeight: '900' },
  missionBoardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  missionBoardFooterText: { flex: 1, color: '#737B94', fontSize: 9, fontWeight: '700' },
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
    minHeight: 146,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3E3558',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    overflow: 'hidden',
  },
  recoveryIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 9, 22, 0.7)',
    borderWidth: 1,
    borderColor: '#573A60',
  },
  recoveryBody: { flex: 1, paddingLeft: 12 },
  recoveryTitle: { color: '#F1EEFF', fontSize: 14, fontWeight: '900' },
  recoveryText: { color: '#BFC5DB', fontSize: 11, fontWeight: '700', marginTop: 5 },
  recoveryRewardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    paddingTop: 9,
  },
  recoveryReward: { color: '#8E9AB8', fontSize: 9, fontWeight: '800' },
  recoveryButton: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#7EE7FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  recoveryButtonPressed: { opacity: 0.75 },
  recoveryButtonText: { color: '#071019', fontSize: 11, fontWeight: '900' },
  recoveryCompleteBadge: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 11,
  },
  recoveryCompleteText: { color: '#7EE7FF', fontSize: 10, fontWeight: '900' },
  bossCard: {
    minHeight: 164,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#6C3049',
    padding: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  bossTopRow: { flexDirection: 'row', alignItems: 'center' },
  bossIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#321522',
    borderWidth: 1,
    borderColor: '#7A3852',
  },
  bossIdentity: { flex: 1, minWidth: 0, paddingHorizontal: 11 },
  bossEyebrow: { color: '#D66B93', fontSize: 8, fontWeight: '900' },
  bossTitle: { color: '#F5ECF2', fontSize: 15, fontWeight: '900', marginTop: 3 },
  bossProgressValue: {
    color: '#FFB2C5',
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  bossTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#241525',
    overflow: 'hidden',
    marginVertical: 13,
  },
  bossTrackFill: { height: '100%', borderRadius: 3 },
  bossPhaseRow: { flexDirection: 'row', alignItems: 'center' },
  bossPhaseBody: { flex: 1, minWidth: 0, paddingRight: 12 },
  bossPhaseLabel: { color: '#B898FF', fontSize: 8, fontWeight: '900' },
  bossPhaseTitle: { color: '#EDEAF6', fontSize: 12, fontWeight: '800', marginTop: 3 },
  bossRewardText: { color: '#A998B1', fontSize: 8, fontWeight: '800', marginTop: 5 },
  bossCompleteButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A63861',
    borderWidth: 1,
    borderColor: '#D05D84',
  },
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
  habitBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  modeBadge: {
    color: '#7EE7FF',
    fontSize: 8,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#0D2230',
    borderWidth: 1,
    borderColor: '#24506A',
  },
  modeBadgeOptional: {
    color: '#FFD27A',
    backgroundColor: '#251E15',
    borderColor: '#5A4524',
  },
  difficulty: { fontSize: 8, fontWeight: '900', letterSpacing: 0.9, marginLeft: 8 },
  habitDetail: { color: '#737B98', fontSize: 10, marginTop: 4 },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
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
  checkButtonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  counterControl: {
    width: 106,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#313955',
    backgroundColor: '#11162A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 3,
  },
  counterButton: {
    width: 27,
    height: 27,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#192037',
  },
  counterButtonDisabled: { opacity: 0.35 },
  counterButtonPressed: { opacity: 0.7 },
  counterValue: {
    minWidth: 42,
    color: '#E9E8F7',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  timerControl: {
    width: 78,
    minHeight: 58,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 5,
  },
  timerReadout: { alignItems: 'center' },
  timerValue: {
    color: '#F0EEFF',
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  timerTarget: { color: '#747C97', fontSize: 8, fontWeight: '800', paddingTop: 1 },
  timerButton: {
    height: 27,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#315267',
    backgroundColor: '#102333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerButtonComplete: { backgroundColor: '#67DDF6', borderColor: '#67DDF6' },
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
