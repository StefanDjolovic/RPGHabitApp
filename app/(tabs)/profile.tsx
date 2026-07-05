import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AttributeRadarChart } from '@/components/attribute-radar-chart';
import { PlayerAvatar } from '@/components/player-avatar';
import {
  getAchievementSummary,
  type AchievementSummary,
} from '@/src/database/achievement-repository';
import {
  getActivityCalendarDays,
  getRecentActivityDays,
  type ActivitySummaryDay,
  type HabitAttribute,
} from '@/src/database/habit-repository';
import {
  getPlayerProfile,
  INITIAL_PLAYER_PROFILE,
  type PlayerProfile,
} from '@/src/database/profile-repository';
import {
  getRankTrialState,
  INITIAL_RANK_TRIAL_STATE,
  type RankTrialState,
} from '@/src/database/rank-repository';
import {
  getPlayerClassState,
  INITIAL_PLAYER_CLASS_STATE,
  type PlayerClassState,
} from '@/src/database/class-repository';
import { getActivityStreak } from '@/src/progression/activity-streak';
import {
  getCharacterChronicle,
  type ChronicleEvent,
} from '@/src/progression/character-chronicle';
import {
  getHabitInsights,
  type HabitInsight,
  type HabitTrend,
} from '@/src/progression/habit-insights';
import {
  allocateStatPoint,
  getPlayerProgress,
  INITIAL_PLAYER_PROGRESS,
  MAX_DAILY_DUNGEON_ENERGY,
  MAX_DUNGEON_ENERGY,
  STAT_POINTS_PER_LEVEL,
  type PlayerProgress,
} from '@/src/progression/player-progression';

const attributeOrder: HabitAttribute[] = [
  'strength',
  'intelligence',
  'discipline',
  'vitality',
  'creativity',
];

type ProfileView = 'overview' | 'growth' | 'journey';

const profileViews: {
  key: ProfileView;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { key: 'overview', label: 'Overview', icon: 'account-outline' },
  { key: 'growth', label: 'Growth', icon: 'chart-line' },
  { key: 'journey', label: 'Journey', icon: 'map-marker-path' },
];

const attributeMeta: Record<
  HabitAttribute,
  {
    color: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
  }
> = {
  strength: { color: '#FF7B8A', icon: 'dumbbell', label: 'Strength' },
  intelligence: { color: '#67D7FF', icon: 'brain', label: 'Intelligence' },
  discipline: { color: '#B493FF', icon: 'shield-check', label: 'Discipline' },
  vitality: { color: '#63E0A2', icon: 'heart-pulse', label: 'Vitality' },
  creativity: { color: '#FFD166', icon: 'palette', label: 'Creativity' },
};

function formatNumber(value: number) {
  return value.toLocaleString();
}

function getProgressRatio(value: number, max: number) {
  if (max <= 0) return 1;
  return Math.min(1, Math.max(0, value / max));
}

const initialAchievementSummary: AchievementSummary = {
  unlockedCount: 0,
  totalCount: 0,
  achievements: [],
};

function formatActivityDate(dateKey: string) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, month, day] = dateKey.split('-').map(Number);
  return {
    day: String(day).padStart(2, '0'),
    month: monthNames[month - 1] ?? '---',
  };
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatCalendarDate(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatChronicleDate(value: string) {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getActivityLevel(completedCount: number) {
  if (completedCount >= 4) return 3;
  if (completedCount >= 2) return 2;
  if (completedCount >= 1) return 1;
  return 0;
}

const trendMeta: Record<
  HabitTrend,
  { color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }
> = {
  up: { color: '#68E1A8', icon: 'trending-up', label: 'Improving' },
  steady: { color: '#7EE7FF', icon: 'trending-neutral', label: 'Steady' },
  down: { color: '#FF9BCB', icon: 'trending-down', label: 'Rebuild' },
};

function formatCadence(cadence: HabitInsight['cadence']) {
  if (cadence === 'one-time') return 'ONE-TIME';
  return cadence.toUpperCase();
}

export default function ProfileScreen() {
  const db = useSQLiteContext();
  const scrollRef = useRef<ScrollView>(null);
  const [profileView, setProfileView] = useState<ProfileView>('overview');
  const [playerProgress, setPlayerProgress] = useState<PlayerProgress>(INITIAL_PLAYER_PROGRESS);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile>(INITIAL_PLAYER_PROFILE);
  const [playerClassState, setPlayerClassState] =
    useState<PlayerClassState>(INITIAL_PLAYER_CLASS_STATE);
  const [rankTrialState, setRankTrialState] =
    useState<RankTrialState>(INITIAL_RANK_TRIAL_STATE);
  const [activityStreak, setActivityStreak] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivitySummaryDay[]>([]);
  const [activityCalendar, setActivityCalendar] = useState<ActivitySummaryDay[]>([]);
  const [habitInsights, setHabitInsights] = useState<HabitInsight[]>([]);
  const [chronicleEvents, setChronicleEvents] = useState<ChronicleEvent[]>([]);
  const [selectedActivityDate, setSelectedActivityDate] = useState('');
  const [achievementSummary, setAchievementSummary] =
    useState<AchievementSummary>(initialAchievementSummary);
  const [allocatingAttribute, setAllocatingAttribute] = useState<HabitAttribute | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const [
        progressSummary,
        profile,
        classState,
        rankTrial,
        streak,
        activityDays,
        calendarDays,
        achievements,
        insights,
        chronicle,
      ] =
        await Promise.all([
          getPlayerProgress(db),
          getPlayerProfile(db),
          getPlayerClassState(db),
          getRankTrialState(db),
          getActivityStreak(db),
          getRecentActivityDays(db),
          getActivityCalendarDays(db),
          getAchievementSummary(db),
          getHabitInsights(db),
          getCharacterChronicle(db),
        ]);
      setPlayerProgress(progressSummary);
      setPlayerProfile(profile);
      setPlayerClassState(classState);
      setRankTrialState(rankTrial);
      setActivityStreak(streak);
      setRecentActivity(activityDays);
      setActivityCalendar(calendarDays);
      setSelectedActivityDate((current) => current || calendarDays.at(-1)?.dateKey || '');
      setAchievementSummary(achievements);
      setHabitInsights(insights);
      setChronicleEvents(chronicle);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const spendStatPoint = async (attribute: HabitAttribute) => {
    if (playerProgress.availableStatPoints <= 0 || allocatingAttribute) return;

    setAllocatingAttribute(attribute);
    try {
      const progressSummary = await allocateStatPoint(db, attribute);
      setPlayerProgress(progressSummary);
    } finally {
      setAllocatingAttribute(null);
    }
  };

  const selectProfileView = (view: ProfileView) => {
    setProfileView(view);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const xpRatio = getProgressRatio(playerProgress.xpIntoLevel, playerProgress.xpForNextLevel);
  const energyRatio = getProgressRatio(playerProgress.dungeonEnergy, MAX_DUNGEON_ENERGY);
  const xpRemaining = Math.max(playerProgress.xpForNextLevel - playerProgress.xpIntoLevel, 0);
  const achievementRatio = getProgressRatio(
    achievementSummary.unlockedCount,
    achievementSummary.totalCount,
  );
  const visibleAchievements = useMemo(
    () =>
      [...achievementSummary.achievements].sort((first, second) => {
        if (first.unlocked !== second.unlocked) return first.unlocked ? -1 : 1;
        return second.progress - first.progress;
      }),
    [achievementSummary.achievements],
  );
  const calendarWeeks = useMemo(
    () =>
      Array.from({ length: Math.ceil(activityCalendar.length / 7) }, (_, index) =>
        activityCalendar.slice(index * 7, index * 7 + 7),
      ),
    [activityCalendar],
  );
  const calendarWeekdays = useMemo(
    () =>
      activityCalendar.slice(0, 7).map((day) =>
        parseDateKey(day.dateKey)
          .toLocaleDateString('en-US', { weekday: 'narrow' })
          .toUpperCase(),
      ),
    [activityCalendar],
  );
  const selectedActivity = useMemo(
    () => activityCalendar.find((day) => day.dateKey === selectedActivityDate) ?? null,
    [activityCalendar, selectedActivityDate],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundGlowPink} />
      <View style={styles.backgroundGlowCyan} />

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        ref={scrollRef}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <View style={styles.systemRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.systemLabel}>HUNTER RECORD</Text>
            </View>
            <Text style={styles.heading}>Profile</Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="Edit profile"
              onPress={() => router.push('/edit-profile' as Href)}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.buttonPressed]}>
              <MaterialCommunityIcons name="account-edit-outline" size={22} color="#FF9BCB" />
            </Pressable>
            <Pressable
              accessibilityLabel="Open settings"
              onPress={() => router.push('/settings' as Href)}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.buttonPressed]}>
              <MaterialCommunityIcons name="cog-outline" size={22} color="#BFC5DB" />
            </Pressable>
            <View
              style={[
                styles.rankSeal,
                { borderColor: `${rankTrialState.currentRank.accent}88` },
              ]}>
              <Text
                style={[
                  styles.rankSealText,
                  { color: rankTrialState.currentRank.accent },
                ]}>
                {playerProgress.rankShort}
              </Text>
            </View>
          </View>
        </View>

        <LinearGradient
          colors={['rgba(56, 28, 70, 0.98)', 'rgba(14, 25, 50, 0.98)', 'rgba(8, 11, 24, 0.98)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.heroCard}>
          <View style={styles.cardAccent} />
          <View style={styles.identityRow}>
            <PlayerAvatar
              activeClass={playerClassState.activeClass}
              profile={playerProfile}
              rankKey={playerProgress.rankKey}
              size={70}
            />
            <View style={styles.identityText}>
              <Text style={styles.playerName}>{playerProfile.nickname}</Text>
              <Text style={styles.rankTitle}>
                {playerProgress.rankLabel}
                {playerClassState.activeClass ? ` - ${playerClassState.activeClass.name}` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.levelRow}>
            <View>
              <Text style={styles.levelLabel}>LEVEL</Text>
              <Text style={styles.levelValue}>{String(playerProgress.level).padStart(2, '0')}</Text>
            </View>
            <View style={styles.totalXpBox}>
              <Text style={styles.totalXpValue}>{formatNumber(playerProgress.totalXp)}</Text>
              <Text style={styles.totalXpLabel}>TOTAL XP</Text>
            </View>
          </View>

          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>PLAYER EXP</Text>
            <Text style={styles.progressValue}>
              {playerProgress.xpForNextLevel > 0
                ? `${formatNumber(playerProgress.xpIntoLevel)} / ${formatNumber(playerProgress.xpForNextLevel)}`
                : 'MAX LEVEL'}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={['#FF74B7', '#56D9FF']}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[styles.progressFill, { width: `${xpRatio * 100}%` }]}
            />
          </View>
          <Text style={styles.progressHint}>
            {playerProgress.xpForNextLevel > 0
              ? `${formatNumber(xpRemaining)} XP until next level`
              : 'The hunter has reached the level cap'}
          </Text>
        </LinearGradient>

        <View accessibilityRole="tablist" style={styles.profileViewTabs}>
          {profileViews.map((view) => {
            const selected = profileView === view.key;
            return (
              <Pressable
                accessibilityLabel={`Show ${view.label}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={view.key}
                onPress={() => selectProfileView(view.key)}
                style={({ pressed }) => [
                  styles.profileViewTab,
                  selected && styles.profileViewTabSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <MaterialCommunityIcons
                  color={selected ? '#071018' : '#838CA5'}
                  name={view.icon}
                  size={17}
                />
                <Text
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  style={[
                    styles.profileViewTabText,
                    selected && styles.profileViewTabTextSelected,
                  ]}>
                  {view.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {profileView === 'overview' ? (
          <>
        {playerClassState.eligible ? (
          playerClassState.activeClass ? (
            <View
              style={[
                styles.classPanel,
                { borderColor: `${playerClassState.activeClass.accent}66` },
              ]}>
              <View
                style={[
                  styles.classPanelIcon,
                  { borderColor: `${playerClassState.activeClass.accent}77` },
                ]}>
                <MaterialCommunityIcons
                  name={playerClassState.activeClass.icon}
                  size={29}
                  color={playerClassState.activeClass.accent}
                />
              </View>
              <View style={styles.classPanelBody}>
                <Text style={styles.classPanelEyebrow}>ACTIVE CLASS</Text>
                <Text style={styles.classPanelTitle}>{playerClassState.activeClass.name}</Text>
                <Text style={styles.classPanelMeta}>
                  {playerClassState.activeClass.resource} - Mastery {playerClassState.masteryLevel}
                </Text>
                <View style={styles.classSkillRow}>
                  {playerClassState.activeSkills.slice(0, 3).map((skill) => (
                    <View key={skill.key} style={styles.classSkillBadge}>
                      <Text numberOfLines={1} style={styles.classSkillText}>{skill.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.classPanelActions}>
                <Pressable
                  accessibilityLabel="Change active class"
                  onPress={() => router.push('/awakening' as Href)}
                  style={({ pressed }) => [styles.classPanelSecondaryButton, pressed && styles.buttonPressed]}>
                  <MaterialCommunityIcons name="sync" size={18} color="#9FA8BE" />
                </Pressable>
                <Pressable
                  accessibilityLabel="Open skill loadout"
                  onPress={() => router.push('/class-skills' as Href)}
                  style={({ pressed }) => [styles.classPanelButton, pressed && styles.buttonPressed]}>
                  <MaterialCommunityIcons name="sword-cross" size={19} color="#071018" />
                </Pressable>
              </View>
            </View>
          ) : (
            <LinearGradient
              colors={['rgba(28, 57, 73, 0.98)', 'rgba(27, 22, 53, 0.98)']}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.classPanel}>
              <View style={styles.classPanelIcon}>
                <MaterialCommunityIcons name="star-four-points" size={29} color="#8DEAFF" />
              </View>
              <View style={styles.classPanelBody}>
                <Text style={styles.classPanelEyebrow}>SYSTEM QUEST</Text>
                <Text style={styles.classPanelTitle}>Awakening available</Text>
                <Text style={styles.classPanelMeta}>Choose your first class at level 10.</Text>
              </View>
              <Pressable
                accessibilityLabel="Begin Awakening"
                onPress={() => router.push('/awakening' as Href)}
                style={({ pressed }) => [styles.classPanelButton, pressed && styles.buttonPressed]}>
                <MaterialCommunityIcons name="arrow-right" size={19} color="#071018" />
              </Pressable>
            </LinearGradient>
          )
        ) : null}

        {playerClassState.activeClass && rankTrialState.nextRank ? (
          <Pressable
            accessibilityLabel="Open Rank-Up Trial"
            onPress={() => router.push('/rank-trial' as Href)}
            style={({ pressed }) => [
              styles.rankTrialPanel,
              rankTrialState.ready && { borderColor: `${rankTrialState.nextRank?.accent}77` },
              pressed && styles.buttonPressed,
            ]}>
            <View
              style={[
                styles.rankTrialIcon,
                rankTrialState.ready && { backgroundColor: `${rankTrialState.nextRank.accent}18` },
              ]}>
              <MaterialCommunityIcons
                color={rankTrialState.ready ? rankTrialState.nextRank.accent : '#747D92'}
                name={rankTrialState.ready ? 'shield-star-outline' : 'shield-lock-outline'}
                size={25}
              />
            </View>
            <View style={styles.rankTrialBody}>
              <Text style={styles.rankTrialEyebrow}>
                {rankTrialState.ready ? 'RANK-UP AVAILABLE' : 'NEXT RANK'}
              </Text>
              <Text style={styles.rankTrialTitle}>{rankTrialState.nextRank.trialName}</Text>
              <Text style={styles.rankTrialMeta}>
                Level {rankTrialState.nextRank.minimumLevel} - {rankTrialState.nextRank.requiredDungeonClears} dungeon clears
              </Text>
            </View>
            <MaterialCommunityIcons color="#818AA1" name="chevron-right" size={22} />
          </Pressable>
        ) : null}

        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="lightning-bolt" size={22} color="#63E4FF" />
            <Text style={styles.statValue}>
              {playerProgress.dungeonEnergy} / {MAX_DUNGEON_ENERGY}
            </Text>
            <Text style={styles.statLabel}>
              Today {playerProgress.todayDungeonEnergy} / {MAX_DAILY_DUNGEON_ENERGY} earned
            </Text>
            <View style={styles.smallTrack}>
              <View style={[styles.energyFill, { width: `${energyRatio * 100}%` }]} />
            </View>
          </View>

          <View style={styles.statCard}>
            <MaterialCommunityIcons name="fire" size={22} color="#FF8FC7" />
            <Text style={styles.statValue}>
              {activityStreak} {activityStreak === 1 ? 'day' : 'days'}
            </Text>
            <Text style={styles.statLabel}>Activity streak</Text>
            <View style={styles.streakCode}>
              <Text style={styles.streakCodeText}>REAL QUESTS</Text>
            </View>
          </View>
        </View>

          </>
        ) : null}

        {profileView === 'growth' ? (
          <>
        <View style={styles.statPointPanel}>
          <View style={styles.statPointTopRow}>
            <View>
              <Text style={styles.statPointLabel}>FREE STAT POINTS</Text>
              <Text style={styles.statPointValue}>{playerProgress.availableStatPoints}</Text>
            </View>
            <View style={styles.statPointFormula}>
              <Text style={styles.statPointFormulaText}>
                +{STAT_POINTS_PER_LEVEL} per level
              </Text>
            </View>
          </View>
          <Text style={styles.statPointHint}>
            {playerProgress.spentStatPoints} spent from {playerProgress.totalStatPointsEarned} earned.
          </Text>
          {playerClassState.activeClass ? (
            <Pressable
              accessibilityLabel="Open Stat Recalibration"
              onPress={() => router.push('/stat-recalibration' as Href)}
              style={({ pressed }) => [styles.recalibrationButton, pressed && styles.buttonPressed]}>
              <MaterialCommunityIcons color="#B9A0E8" name="restore" size={17} />
              <Text style={styles.recalibrationButtonText}>Stat Recalibration</Text>
              <MaterialCommunityIcons color="#757E96" name="chevron-right" size={18} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>ACHIEVEMENTS</Text>
            <Text style={styles.sectionTitle}>Unlocked records</Text>
          </View>
          <View style={styles.achievementCounter}>
            <Text style={styles.achievementCounterText}>
              {achievementSummary.unlockedCount}/{achievementSummary.totalCount}
            </Text>
          </View>
        </View>

        <View style={styles.achievementPanel}>
          <View style={styles.achievementPanelTop}>
            <View>
              <Text style={styles.achievementPanelLabel}>RECORD COMPLETION</Text>
              <Text style={styles.achievementPanelValue}>
                {Math.round(achievementRatio * 100)}%
              </Text>
            </View>
            <MaterialCommunityIcons name="trophy-award" size={31} color="#FFD27A" />
          </View>
          <View style={styles.achievementTrack}>
            <LinearGradient
              colors={['#FFD27A', '#7EE7FF']}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[styles.achievementFill, { width: `${achievementRatio * 100}%` }]}
            />
          </View>
        </View>

        <View style={styles.achievementList}>
          {visibleAchievements.map((achievement) => (
            <View
              key={achievement.key}
              style={[
                styles.achievementCard,
                achievement.unlocked && styles.achievementCardUnlocked,
              ]}>
              <View
                style={[
                  styles.achievementIcon,
                  { borderColor: `${achievement.accent}66` },
                  achievement.unlocked && { backgroundColor: `${achievement.accent}22` },
                ]}>
                <MaterialCommunityIcons
                  name={
                    achievement.secret && !achievement.unlocked
                      ? 'help-rhombus-outline'
                      : achievement.icon
                  }
                  size={21}
                  color={achievement.unlocked ? achievement.accent : '#777E9C'}
                />
              </View>
              <View style={styles.achievementBody}>
                <View style={styles.achievementTopRow}>
                  <Text
                    style={[
                      styles.achievementTitle,
                      achievement.unlocked && styles.achievementTitleUnlocked,
                    ]}>
                    {achievement.secret && !achievement.unlocked
                      ? 'Hidden Record'
                      : achievement.title}
                  </Text>
                  <Text
                    style={[
                      styles.achievementStatus,
                      achievement.unlocked && { color: achievement.accent },
                    ]}>
                    {achievement.unlocked
                      ? 'UNLOCKED'
                      : achievement.secret
                        ? 'SECRET'
                        : `${achievement.current}/${achievement.target}`}
                  </Text>
                </View>
                <Text style={styles.achievementDescription}>
                  {achievement.secret && !achievement.unlocked
                    ? 'Keep exploring to reveal this achievement.'
                    : achievement.description}
                </Text>
                <View style={styles.achievementMiniTrack}>
                  <View
                    style={[
                      styles.achievementMiniFill,
                      {
                        backgroundColor: achievement.accent,
                        width: `${achievement.progress * 100}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>ATTRIBUTE BALANCE</Text>
            <Text style={styles.sectionTitle}>Hunter stats</Text>
          </View>
        </View>

        <AttributeRadarChart
          attributeProgression={playerProgress.attributeProgression}
          manualStatPoints={playerProgress.manualStatPoints}
        />

        <View style={styles.attributeList}>
          {attributeOrder.map((attribute) => {
            const meta = attributeMeta[attribute];
            const progression = playerProgress.attributeProgression[attribute];
            const manualPoints = playerProgress.manualStatPoints[attribute];
            const canAllocate = playerProgress.availableStatPoints > 0 && !allocatingAttribute;

            return (
              <View key={attribute} style={styles.attributeCard}>
                <View style={[styles.attributeIcon, { borderColor: `${meta.color}66` }]}>
                  <MaterialCommunityIcons name={meta.icon} size={21} color={meta.color} />
                </View>
                <View style={styles.attributeBody}>
                  <View style={styles.attributeTopRow}>
                    <Text style={styles.attributeName}>{meta.label}</Text>
                    <Text style={styles.attributeValue}>
                      {progression.naturalPoints} NAT | +{manualPoints} PTS
                    </Text>
                  </View>
                  <View style={styles.attributeTrack}>
                    <View
                      style={[
                        styles.attributeFill,
                        {
                          backgroundColor: meta.color,
                          width: `${progression.progressRatio * 100}%`,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.attributeProgressRow}>
                    <Text style={styles.attributeProgressText}>
                      {progression.xpIntoPoint}/{progression.xpForNextPoint} STAT XP
                    </Text>
                    <Text style={styles.attributeProgressNext}>NEXT +1 NAT</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel={`Allocate ${meta.label} stat point`}
                  disabled={!canAllocate}
                  onPress={() => void spendStatPoint(attribute)}
                  style={({ pressed }) => [
                    styles.allocateButton,
                    !canAllocate && styles.allocateButtonLocked,
                    pressed && canAllocate && styles.allocateButtonPressed,
                  ]}>
                  {allocatingAttribute === attribute ? (
                    <ActivityIndicator color="#061018" size="small" />
                  ) : (
                    <MaterialCommunityIcons
                      name="plus"
                      size={18}
                      color={canAllocate ? '#061018' : '#6D748D'}
                    />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

          </>
        ) : null}

        {profileView === 'journey' ? (
          <>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>JOURNEY</Text>
            <Text style={styles.sectionTitle}>Activity calendar</Text>
          </View>
          <Pressable
            accessibilityLabel="Open full habit history"
            onPress={() => router.push('/activity-history' as Href)}
            style={({ pressed }) => [styles.calendarRangeBadge, pressed && styles.buttonPressed]}>
            <MaterialCommunityIcons color="#8EDFF2" name="calendar-search" size={15} />
            <Text style={styles.calendarRangeText}>FULL HISTORY</Text>
          </Pressable>
        </View>

        <View style={styles.calendarGrid}>
          <View style={styles.calendarWeekdayRow}>
            {calendarWeekdays.map((weekday, index) => (
              <Text key={`${weekday}-${index}`} style={styles.calendarWeekday}>
                {weekday}
              </Text>
            ))}
          </View>
          {calendarWeeks.map((week, weekIndex) => (
            <View key={week[0]?.dateKey ?? weekIndex} style={styles.calendarWeek}>
              {week.map((day) => {
                const selected = selectedActivityDate === day.dateKey;
                const activityLevel = getActivityLevel(day.completedCount);
                return (
                  <Pressable
                    accessibilityLabel={`${formatCalendarDate(day.dateKey)}, ${day.completedCount} completed quests`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={day.dateKey}
                    onPress={() => setSelectedActivityDate(day.dateKey)}
                    style={({ pressed }) => [
                      styles.calendarDay,
                      activityLevel === 1 && styles.calendarDayLevelOne,
                      activityLevel === 2 && styles.calendarDayLevelTwo,
                      activityLevel === 3 && styles.calendarDayLevelThree,
                      selected && styles.calendarDaySelected,
                      pressed && styles.calendarDayPressed,
                    ]}>
                    <Text
                      style={[
                        styles.calendarDayText,
                        activityLevel > 0 && styles.calendarDayTextActive,
                      ]}>
                      {parseDateKey(day.dateKey).getDate()}
                    </Text>
                    {activityLevel > 0 ? <View style={styles.calendarActivityDot} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {selectedActivity ? (
          <View style={styles.calendarDetail}>
            <View style={styles.calendarDetailTop}>
              <Text style={styles.calendarDetailDate}>
                {formatCalendarDate(selectedActivity.dateKey)}
              </Text>
              <Text style={styles.calendarDetailCount}>
                {selectedActivity.completedCount}{' '}
                {selectedActivity.completedCount === 1 ? 'quest' : 'quests'}
              </Text>
            </View>
            {selectedActivity.completedCount > 0 ? (
              <View style={styles.calendarRewardRow}>
                <Text style={styles.calendarReward}>+{formatNumber(selectedActivity.xpEarned)} EXP</Text>
                <Text style={styles.calendarReward}>+{formatNumber(selectedActivity.statXpEarned)} Stat XP</Text>
                <Text style={styles.calendarReward}>+{formatNumber(selectedActivity.energyEarned)} Energy</Text>
              </View>
            ) : (
              <Text style={styles.calendarRestText}>No activity recorded for this day.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>HABIT INSIGHTS</Text>
            <Text style={styles.sectionTitle}>28-day consistency</Text>
          </View>
          <View style={styles.insightCountBadge}>
            <Text style={styles.insightCountText}>{habitInsights.length} ACTIVE</Text>
          </View>
        </View>

        <View style={styles.insightList}>
          {!loading && habitInsights.length === 0 ? (
            <View style={styles.emptyActivityCard}>
              <MaterialCommunityIcons name="chart-line" size={25} color="#707894" />
              <Text style={styles.emptyActivityText}>No active habits to analyze.</Text>
            </View>
          ) : null}

          {habitInsights.map((insight) => {
            const attribute = attributeMeta[insight.attribute];
            const secondaryAttribute = insight.secondaryAttribute
              ? attributeMeta[insight.secondaryAttribute]
              : null;
            const trend = trendMeta[insight.trend];
            const successPercent = Math.round(insight.successRate * 100);
            const streakValue =
              insight.cadence === 'one-time'
                ? insight.currentStreak > 0
                  ? 'Done'
                  : 'Open'
                : String(insight.currentStreak);
            const streakLabel =
              insight.cadence === 'weekly'
                ? 'WEEK STREAK'
                : insight.cadence === 'daily'
                  ? 'DAY STREAK'
                  : 'STATUS';

            return (
              <View key={insight.id} style={styles.insightCard}>
                <View style={styles.insightTopRow}>
                  <View style={styles.insightIdentity}>
                    <View
                      style={[
                        styles.insightIcon,
                        { borderColor: `${attribute.color}66` },
                      ]}>
                      <MaterialCommunityIcons
                        name={attribute.icon}
                        size={20}
                        color={attribute.color}
                      />
                    </View>
                    <View style={styles.insightTitleBlock}>
                      <Text numberOfLines={1} style={styles.insightTitle}>
                        {insight.title}
                      </Text>
                      <Text style={styles.insightCadence}>{formatCadence(insight.cadence)}</Text>
                    </View>
                  </View>
                  <View style={styles.insightTrend}>
                    <MaterialCommunityIcons name={trend.icon} size={15} color={trend.color} />
                    <Text style={[styles.insightTrendText, { color: trend.color }]}>
                      {trend.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.insightRateHeader}>
                  <Text style={styles.insightRateLabel}>SUCCESS RATE</Text>
                  <Text style={styles.insightRateValue}>{successPercent}%</Text>
                </View>
                <View style={styles.insightTrack}>
                  <View
                    style={[
                      styles.insightFill,
                      { backgroundColor: attribute.color, width: `${successPercent}%` },
                    ]}
                  />
                </View>

                <View style={styles.insightStats}>
                  <View style={styles.insightStat}>
                    <Text style={styles.insightStatValue}>{streakValue}</Text>
                    <Text style={styles.insightStatLabel}>{streakLabel}</Text>
                  </View>
                  <View style={styles.insightStat}>
                    <Text style={styles.insightStatValue}>{insight.totalCompletions}</Text>
                    <Text style={styles.insightStatLabel}>TOTAL CLEARS</Text>
                  </View>
                  <View style={styles.insightStat}>
                    <Text style={styles.insightStatValue}>
                      +{insight.attributeXp}
                      {secondaryAttribute ? ` / +${insight.secondaryAttributeXp}` : ''}
                    </Text>
                    <Text style={styles.insightStatLabel}>
                      {attribute.label.slice(0, 3).toUpperCase()}
                      {secondaryAttribute
                        ? ` / ${secondaryAttribute.label.slice(0, 3).toUpperCase()}`
                        : ''}{' '}
                      XP
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <Pressable
          accessibilityLabel="Open Weekly Review"
          onPress={() => router.push('/weekly-review' as Href)}
          style={({ pressed }) => [styles.weeklyReviewLink, pressed && styles.buttonPressed]}>
          <View style={styles.weeklyReviewIcon}>
            <MaterialCommunityIcons name="calendar-week" size={21} color="#7EE7FF" />
          </View>
          <View style={styles.weeklyReviewText}>
            <Text style={styles.weeklyReviewEyebrow}>WEEKLY REVIEW</Text>
            <Text style={styles.weeklyReviewTitle}>Review this week</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#7B849D" />
        </Pressable>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>CHARACTER CHRONICLE</Text>
            <Text style={styles.sectionTitle}>Milestone history</Text>
          </View>
          <View style={styles.chronicleCountBadge}>
            <MaterialCommunityIcons name="book-open-page-variant" size={14} color="#C8A8FF" />
            <Text style={styles.chronicleCountText}>{chronicleEvents.length}</Text>
          </View>
        </View>

        <View style={styles.chronicleList}>
          {!loading && chronicleEvents.length === 0 ? (
            <View style={styles.emptyActivityCard}>
              <MaterialCommunityIcons name="book-outline" size={25} color="#707894" />
              <Text style={styles.emptyActivityText}>No Chronicle milestones recorded yet.</Text>
            </View>
          ) : null}

          {chronicleEvents.map((event, index) => (
            <View key={event.id} style={styles.chronicleRow}>
              <View style={styles.chronicleRail}>
                <View style={[styles.chronicleIcon, { borderColor: `${event.accent}88` }]}>
                  <MaterialCommunityIcons name={event.icon} size={19} color={event.accent} />
                </View>
                {index < chronicleEvents.length - 1 ? (
                  <View style={styles.chronicleLine} />
                ) : null}
              </View>
              <View style={styles.chronicleBody}>
                <View style={styles.chronicleTopRow}>
                  <Text numberOfLines={1} style={styles.chronicleTitle}>
                    {event.title}
                  </Text>
                  <Text style={styles.chronicleDate}>{formatChronicleDate(event.occurredAt)}</Text>
                </View>
                <Text style={styles.chronicleDetail}>{event.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>LATEST CLEARS</Text>
            <Text style={styles.sectionTitle}>Recent activity</Text>
          </View>
        </View>

        <View style={styles.activityList}>
          {!loading && recentActivity.length === 0 ? (
            <View style={styles.emptyActivityCard}>
              <MaterialCommunityIcons name="calendar-blank" size={25} color="#707894" />
              <Text style={styles.emptyActivityText}>No completed quests recorded yet.</Text>
            </View>
          ) : null}

          {recentActivity.map((day) => {
            const date = formatActivityDate(day.dateKey);

            return (
              <View key={day.dateKey} style={styles.activityCard}>
                <View style={styles.activityDateBadge}>
                  <Text style={styles.activityDateMonth}>{date.month}</Text>
                  <Text style={styles.activityDateDay}>{date.day}</Text>
                </View>
                <View style={styles.activityBody}>
                  <Text style={styles.activityTitle}>
                    {day.completedCount} {day.completedCount === 1 ? 'quest' : 'quests'} cleared
                  </Text>
                  <View style={styles.activityRewardRow}>
                    <Text style={styles.activityReward}>+{formatNumber(day.xpEarned)} EXP</Text>
                    <View style={styles.activityDot} />
                    <Text style={styles.activityReward}>
                      +{formatNumber(day.statXpEarned)} Stat XP
                    </Text>
                    <View style={styles.activityDot} />
                    <Text style={styles.activityReward}>
                      +{formatNumber(day.energyEarned)} Energy
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

          </>
        ) : null}

        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#FF8FC7" />
            <Text style={styles.loadingText}>Syncing hunter record...</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  backgroundGlowPink: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#B53A7A',
    opacity: 0.12,
    top: -95,
    right: -95,
  },
  backgroundGlowCyan: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#00B8D9',
    opacity: 0.08,
    top: 290,
    left: -145,
  },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 110 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF8FC7' },
  systemLabel: { color: '#F08ABD', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  heading: { color: '#F5F2FF', fontSize: 31, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  settingsButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101421',
    borderWidth: 1,
    borderColor: '#292E44',
  },
  buttonPressed: { opacity: 0.65 },
  rankSeal: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161025',
    borderWidth: 1,
    borderColor: '#563059',
  },
  rankSealText: { color: '#FF9BCB', fontSize: 18, fontWeight: '900' },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#513553',
    padding: 17,
    overflow: 'hidden',
    marginBottom: 14,
  },
  profileViewTabs: {
    width: '100%',
    maxWidth: 520,
    minHeight: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    padding: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#292E44',
    backgroundColor: '#0D111D',
    marginBottom: 14,
  },
  profileViewTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  profileViewTabSelected: {
    backgroundColor: '#7EE7FF',
  },
  profileViewTabText: {
    minWidth: 0,
    color: '#838CA5',
    fontSize: 10,
    fontWeight: '900',
  },
  profileViewTabTextSelected: { color: '#071018' },
  cardAccent: {
    position: 'absolute',
    width: 95,
    height: 170,
    right: -28,
    top: -48,
    backgroundColor: '#FF74B7',
    opacity: 0.07,
    transform: [{ rotate: '23deg' }],
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  identityText: { flex: 1, paddingLeft: 13 },
  playerName: { color: '#F1EEFF', fontSize: 17, fontWeight: '900', marginBottom: 5 },
  rankTitle: { color: '#B9A4C8', fontSize: 12, fontWeight: '700' },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  levelLabel: { color: '#9A88B2', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  levelValue: { color: '#FFFFFF', fontSize: 42, fontWeight: '900', lineHeight: 48 },
  totalXpBox: {
    minWidth: 118,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: 'rgba(6, 10, 23, 0.58)',
    borderWidth: 1,
    borderColor: '#34324F',
  },
  totalXpValue: { color: '#7EE7FF', fontSize: 15, fontWeight: '900', textAlign: 'right' },
  totalXpLabel: { color: '#737B98', fontSize: 8, fontWeight: '900', marginTop: 3, textAlign: 'right' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { color: '#8D91AD', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  progressValue: { color: '#C9D0EA', fontSize: 10, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#11152A', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressHint: { color: '#767E9C', fontSize: 10, marginTop: 9 },
  classPanel: {
    minHeight: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#0D121E',
    borderWidth: 1,
    borderColor: '#31566A',
    marginBottom: 14,
    overflow: 'hidden',
  },
  classPanelIcon: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#31566A',
  },
  classPanelBody: { flex: 1, minWidth: 0 },
  classPanelEyebrow: { color: '#8DEAFF', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  classPanelTitle: { color: '#F0F2FA', fontSize: 15, fontWeight: '900', marginTop: 2 },
  classPanelMeta: { color: '#848DA3', fontSize: 9, fontWeight: '700', marginTop: 3 },
  classSkillRow: { flexDirection: 'row', gap: 5, marginTop: 7, overflow: 'hidden' },
  classSkillBadge: { maxWidth: 92, height: 20, justifyContent: 'center', paddingHorizontal: 6, borderRadius: 5, backgroundColor: '#151B2A' },
  classSkillText: { color: '#99A3B8', fontSize: 7, fontWeight: '800' },
  classPanelActions: { gap: 6 },
  classPanelSecondaryButton: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#171C2A',
    borderWidth: 1,
    borderColor: '#343B50',
  },
  classPanelButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#8DEAFF',
  },
  rankTrialPanel: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    borderRadius: 8,
    backgroundColor: '#0D111D',
    borderWidth: 1,
    borderColor: '#2A3043',
    marginBottom: 14,
  },
  rankTrialIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#151A27',
  },
  rankTrialBody: { flex: 1, minWidth: 0 },
  rankTrialEyebrow: { color: '#FFD166', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  rankTrialTitle: { color: '#ECEFF8', fontSize: 12, fontWeight: '900', marginTop: 2 },
  rankTrialMeta: { color: '#7D859B', fontSize: 8, fontWeight: '700', marginTop: 3 },
  statGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1,
    minHeight: 122,
    borderRadius: 17,
    padding: 14,
    backgroundColor: 'rgba(12, 16, 31, 0.92)',
    borderWidth: 1,
    borderColor: '#252A48',
  },
  statValue: { color: '#EDF0FF', fontSize: 15, fontWeight: '900', marginTop: 11 },
  statLabel: { color: '#777E9C', fontSize: 10, fontWeight: '700', marginTop: 4 },
  smallTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#080B18',
    overflow: 'hidden',
    marginTop: 14,
  },
  energyFill: { height: '100%', borderRadius: 3, backgroundColor: '#63E4FF' },
  streakCode: {
    alignSelf: 'flex-start',
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#221525',
    borderWidth: 1,
    borderColor: '#5B3458',
    marginTop: 14,
  },
  streakCodeText: { color: '#FF9BCB', fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  statPointPanel: {
    borderRadius: 17,
    padding: 14,
    backgroundColor: 'rgba(16, 20, 38, 0.92)',
    borderWidth: 1,
    borderColor: '#283450',
    marginBottom: 24,
  },
  statPointTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  statPointLabel: { color: '#7EE7FF', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  statPointValue: { color: '#F7F2FF', fontSize: 28, fontWeight: '900', marginTop: 2 },
  statPointFormula: {
    height: 30,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D2230',
    borderWidth: 1,
    borderColor: '#24506A',
  },
  statPointFormulaText: { color: '#83DDF1', fontSize: 10, fontWeight: '900' },
  statPointHint: { color: '#7B849D', fontSize: 10, fontWeight: '700', marginTop: 10 },
  recalibrationButton: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A3152',
    backgroundColor: '#161226',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    marginTop: 12,
  },
  recalibrationButtonText: { color: '#CDBCF0', fontSize: 10, fontWeight: '900', flex: 1 },
  achievementCounter: {
    minWidth: 50,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#14172B',
    borderWidth: 1,
    borderColor: '#333953',
  },
  achievementCounterText: { color: '#FFD27A', fontSize: 11, fontWeight: '900' },
  achievementPanel: {
    borderRadius: 17,
    padding: 14,
    backgroundColor: 'rgba(18, 17, 34, 0.92)',
    borderWidth: 1,
    borderColor: '#2F2D4A',
    marginBottom: 10,
  },
  achievementPanelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  achievementPanelLabel: { color: '#8D91AD', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  achievementPanelValue: { color: '#F7F2FF', fontSize: 22, fontWeight: '900', marginTop: 2 },
  achievementTrack: { height: 6, borderRadius: 3, backgroundColor: '#080B18', overflow: 'hidden' },
  achievementFill: { height: '100%', borderRadius: 3 },
  achievementList: { gap: 10, marginBottom: 24 },
  achievementCard: {
    minHeight: 86,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    backgroundColor: 'rgba(12, 16, 31, 0.86)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  achievementCardUnlocked: {
    backgroundColor: 'rgba(16, 24, 35, 0.94)',
    borderColor: '#2E4355',
  },
  achievementIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11172A',
    borderWidth: 1,
  },
  achievementBody: { flex: 1, minWidth: 0, paddingLeft: 12 },
  achievementTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  achievementTitle: { color: '#AEB5CA', fontSize: 13, fontWeight: '900', flex: 1 },
  achievementTitleUnlocked: { color: '#F0EEFF' },
  achievementStatus: { color: '#6D748D', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  achievementDescription: { color: '#777F98', fontSize: 10, fontWeight: '700', marginTop: 4 },
  achievementMiniTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#080B18',
    overflow: 'hidden',
    marginTop: 9,
  },
  achievementMiniFill: { height: '100%', borderRadius: 3 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  sectionEyebrow: { color: '#F08ABD', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  sectionTitle: { color: '#F1EFFF', fontSize: 19, fontWeight: '800', marginTop: 4 },
  attributeList: { gap: 10 },
  attributeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 88,
    borderRadius: 17,
    padding: 13,
    backgroundColor: 'rgba(12, 16, 31, 0.94)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  attributeIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11172A',
    borderWidth: 1,
  },
  attributeBody: { flex: 1, paddingLeft: 12 },
  attributeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  attributeName: { color: '#E8E9F4', fontSize: 13, fontWeight: '800', flexShrink: 1 },
  attributeValue: { color: '#B9C1DA', fontSize: 11, fontWeight: '800', marginLeft: 10 },
  attributeTrack: { height: 6, borderRadius: 3, backgroundColor: '#080B18', overflow: 'hidden' },
  attributeFill: { height: '100%', borderRadius: 3 },
  attributeProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  attributeProgressText: {
    color: '#7E88A4',
    fontSize: 8,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  attributeProgressNext: { color: '#626C89', fontSize: 8, fontWeight: '900' },
  allocateButton: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7EE7FF',
    borderWidth: 1,
    borderColor: '#A7F2FF',
    marginLeft: 10,
  },
  allocateButtonLocked: {
    backgroundColor: '#14182B',
    borderColor: '#303650',
  },
  allocateButtonPressed: { opacity: 0.76, transform: [{ scale: 0.96 }] },
  calendarRangeBadge: {
    height: 26,
    flexDirection: 'row',
    gap: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#303652',
    backgroundColor: '#12172A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  calendarRangeText: { color: '#8EDFF2', fontSize: 8, fontWeight: '900' },
  calendarGrid: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: 7,
    paddingBottom: 12,
  },
  calendarWeekdayRow: { flexDirection: 'row', gap: 7 },
  calendarWeekday: {
    flex: 1,
    color: '#626A84',
    fontSize: 8,
    fontWeight: '900',
    textAlign: 'center',
  },
  calendarWeek: { flexDirection: 'row', gap: 7 },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#262C46',
    backgroundColor: '#0D1121',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayLevelOne: { backgroundColor: '#14313A', borderColor: '#285764' },
  calendarDayLevelTwo: { backgroundColor: '#174756', borderColor: '#3A8192' },
  calendarDayLevelThree: { backgroundColor: '#4A3E72', borderColor: '#826FBD' },
  calendarDaySelected: { borderColor: '#E2D8FF', borderWidth: 2 },
  calendarDayPressed: { opacity: 0.72 },
  calendarDayText: { color: '#69718F', fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
  calendarDayTextActive: { color: '#F1F6FF' },
  calendarActivityDot: {
    position: 'absolute',
    bottom: 4,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#8DEBFF',
  },
  calendarDetail: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    minHeight: 78,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#2D3553',
    backgroundColor: '#0C1020',
    padding: 13,
    marginBottom: 24,
  },
  calendarDetailTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  calendarDetailDate: { color: '#E8E9F4', fontSize: 12, fontWeight: '900', flexShrink: 1 },
  calendarDetailCount: { color: '#8EDFF2', fontSize: 10, fontWeight: '900' },
  calendarRewardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingTop: 10 },
  calendarReward: { color: '#6FC8DC', fontSize: 9, fontWeight: '700' },
  calendarRestText: { color: '#737B98', fontSize: 10, fontWeight: '700', paddingTop: 9 },
  insightCountBadge: {
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#303652',
    backgroundColor: '#12172A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  insightCountText: { color: '#8EDFF2', fontSize: 8, fontWeight: '900' },
  insightList: { gap: 10, marginBottom: 24 },
  insightCard: {
    minHeight: 176,
    borderRadius: 8,
    padding: 13,
    backgroundColor: 'rgba(12, 16, 31, 0.94)',
    borderWidth: 1,
    borderColor: '#252B44',
  },
  insightTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  insightIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11172A',
    borderWidth: 1,
  },
  insightTitleBlock: { flex: 1, minWidth: 0, paddingLeft: 10 },
  insightTitle: { color: '#E8E9F4', fontSize: 13, fontWeight: '900' },
  insightCadence: { color: '#747D98', fontSize: 8, fontWeight: '900', marginTop: 3 },
  insightTrend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  insightTrendText: { fontSize: 9, fontWeight: '900' },
  insightRateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 7,
  },
  insightRateLabel: { color: '#747D98', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  insightRateValue: {
    color: '#F1EFFF',
    fontSize: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  insightTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#080B18',
    overflow: 'hidden',
  },
  insightFill: { height: '100%', borderRadius: 3 },
  insightStats: { flexDirection: 'row', paddingTop: 13 },
  insightStat: { flex: 1, minWidth: 0 },
  insightStatValue: {
    color: '#EDF0FF',
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  insightStatLabel: { color: '#68718C', fontSize: 7, fontWeight: '900', marginTop: 3 },
  weeklyReviewLink: {
    minHeight: 68,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A4050',
    backgroundColor: '#0C151F',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 24,
  },
  weeklyReviewIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#102330',
  },
  weeklyReviewText: { flex: 1, minWidth: 0, paddingHorizontal: 11 },
  weeklyReviewEyebrow: { color: '#76CDE0', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  weeklyReviewTitle: { color: '#E8E9F4', fontSize: 13, fontWeight: '900', paddingTop: 3 },
  chronicleCountBadge: {
    height: 28,
    minWidth: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#40345A',
    backgroundColor: '#171326',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  chronicleCountText: { color: '#D7C5F3', fontSize: 9, fontWeight: '900' },
  chronicleList: { marginBottom: 24 },
  chronicleRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  chronicleRail: { width: 42, alignItems: 'center' },
  chronicleIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111426',
    borderWidth: 1,
  },
  chronicleLine: {
    width: 1,
    flex: 1,
    minHeight: 24,
    backgroundColor: '#313650',
    marginVertical: 4,
  },
  chronicleBody: {
    flex: 1,
    minWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#242940',
    paddingLeft: 10,
    paddingBottom: 15,
  },
  chronicleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chronicleTitle: { flex: 1, minWidth: 0, color: '#E8E9F4', fontSize: 12, fontWeight: '900' },
  chronicleDate: { color: '#747D98', fontSize: 8, fontWeight: '800' },
  chronicleDetail: { color: '#8D96AE', fontSize: 10, fontWeight: '700', paddingTop: 5 },
  activityList: { gap: 10 },
  emptyActivityCard: {
    minHeight: 92,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(12, 16, 31, 0.72)',
    borderWidth: 1,
    borderColor: '#222842',
    padding: 16,
  },
  emptyActivityText: { color: '#737B98', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  activityCard: {
    minHeight: 78,
    borderRadius: 17,
    padding: 13,
    backgroundColor: 'rgba(12, 16, 31, 0.94)',
    borderWidth: 1,
    borderColor: '#222842',
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityDateBadge: {
    width: 48,
    height: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#13162A',
    borderWidth: 1,
    borderColor: '#313755',
  },
  activityDateMonth: { color: '#FF9BCB', fontSize: 9, fontWeight: '900' },
  activityDateDay: { color: '#EDF0FF', fontSize: 18, fontWeight: '900', marginTop: 1 },
  activityBody: { flex: 1, paddingLeft: 12 },
  activityTitle: { color: '#E8E9F4', fontSize: 13, fontWeight: '800' },
  activityRewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 7,
  },
  activityReward: { color: '#6FC8DC', fontSize: 9, fontWeight: '700' },
  activityDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#454D69' },
  loadingOverlay: {
    marginTop: 12,
    minHeight: 72,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(12, 16, 31, 0.72)',
    borderWidth: 1,
    borderColor: '#252A48',
  },
  loadingText: { color: '#A998B5', fontSize: 11, fontWeight: '700' },
});
