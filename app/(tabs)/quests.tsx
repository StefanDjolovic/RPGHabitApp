import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
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
  archiveHabit,
  getQuestLogHabits,
  type HabitAttribute,
  type HabitDifficulty,
  type QuestLogHabit,
  rewardByDifficulty,
  restoreHabit,
} from '@/src/database/habit-repository';
import { getHabitStreaksById } from '@/src/progression/habit-streak';

const difficultyMeta: Record<HabitDifficulty, { color: string; label: string }> = {
  easy: { color: '#68E1A8', label: 'Easy' },
  medium: { color: '#61D4FF', label: 'Medium' },
  hard: { color: '#C68CFF', label: 'Hard' },
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

type QuestFilter = 'active' | 'archived';

function formatAttribute(attribute: HabitAttribute) {
  return attribute.charAt(0).toUpperCase() + attribute.slice(1);
}

function formatLastCompleted(dateKey: string | null) {
  if (!dateKey) return 'No clears yet';
  return `Last clear ${dateKey}`;
}

export default function QuestsScreen() {
  const db = useSQLiteContext();
  const [quests, setQuests] = useState<QuestLogHabit[]>([]);
  const [habitStreaksById, setHabitStreaksById] = useState<Record<number, number>>({});
  const [questFilter, setQuestFilter] = useState<QuestFilter>('active');
  const [updatingQuestId, setUpdatingQuestId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadQuests = useCallback(async () => {
    try {
      setLoading(true);
      const [questRows, streaksById] = await Promise.all([
        getQuestLogHabits(db, questFilter),
        getHabitStreaksById(db),
      ]);
      setQuests(questRows);
      setHabitStreaksById(Object.fromEntries(streaksById));
    } finally {
      setLoading(false);
    }
  }, [db, questFilter]);

  const archiveQuest = useCallback(
    async (quest: QuestLogHabit) => {
      const previousQuests = quests;
      try {
        setUpdatingQuestId(quest.id);
        setQuests((current) => current.filter((item) => item.id !== quest.id));
        await archiveHabit(db, quest.id);
      } catch {
        setQuests(previousQuests);
      } finally {
        setUpdatingQuestId(null);
      }
    },
    [db, quests],
  );

  const restoreQuest = useCallback(
    async (quest: QuestLogHabit) => {
      const previousQuests = quests;
      try {
        setUpdatingQuestId(quest.id);
        setQuests((current) => current.filter((item) => item.id !== quest.id));
        await restoreHabit(db, quest.id);
      } catch {
        setQuests(previousQuests);
      } finally {
        setUpdatingQuestId(null);
      }
    },
    [db, quests],
  );

  const confirmArchiveQuest = useCallback(
    (quest: QuestLogHabit) => {
      Alert.alert(
        'Archive quest?',
        'This removes it from active daily quests but keeps completion history and rewards.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Archive',
            onPress: () => {
              void archiveQuest(quest);
            },
            style: 'destructive',
          },
        ],
      );
    },
    [archiveQuest],
  );

  useFocusEffect(
    useCallback(() => {
      void loadQuests();
    }, [loadQuests]),
  );

  const summary = useMemo(() => {
    return quests.reduce(
      (totals, quest) => {
        const reward = rewardByDifficulty[quest.difficulty];
        return {
          completedToday: totals.completedToday + (quest.complete ? 1 : 0),
          totalClears: totals.totalClears + quest.totalCompletions,
          totalEnergy: totals.totalEnergy + reward.energy,
          totalXp: totals.totalXp + reward.xp,
        };
      },
      { completedToday: 0, totalClears: 0, totalEnergy: 0, totalXp: 0 },
    );
  }, [quests]);
  const completionRatio = quests.length > 0 ? summary.completedToday / quests.length : 0;
  const showingArchived = questFilter === 'archived';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundGlowBlue} />
      <View style={styles.backgroundGlowPurple} />

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <View style={styles.systemRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.systemLabel}>QUEST LOG</Text>
            </View>
            <Text style={styles.heading}>Quests</Text>
          </View>

          <Pressable
            accessibilityLabel="Create daily quest"
            onPress={() => router.push('/create-habit')}
            style={styles.addIconButton}>
            <MaterialCommunityIcons name="plus" size={24} color="#7EE8FF" />
          </Pressable>
        </View>

        <LinearGradient
          colors={['rgba(19, 31, 62, 0.98)', 'rgba(12, 18, 38, 0.98)', 'rgba(8, 11, 24, 0.98)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.summaryCard}>
          <View style={styles.cardAccent} />
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryLabel}>
                {showingArchived ? 'ARCHIVED QUESTS' : 'TODAY CLEAR RATE'}
              </Text>
              <Text style={styles.summaryValue}>
                {showingArchived ? quests.length : `${summary.completedToday} / ${quests.length}`}
              </Text>
            </View>
            <View style={styles.summaryIcon}>
              <MaterialCommunityIcons
                name={showingArchived ? 'archive-outline' : 'sword-cross'}
                size={28}
                color="#7EE8FF"
              />
            </View>
          </View>

          <View style={styles.progressTrack}>
            <LinearGradient
              colors={['#6C4DFF', '#56D9FF']}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[
                styles.progressFill,
                { width: `${(showingArchived ? 1 : completionRatio) * 100}%` },
              ]}
            />
          </View>

          <View style={styles.rewardSummary}>
            <View style={styles.rewardSummaryItem}>
              <Text style={styles.rewardSummaryValue}>
                {showingArchived ? summary.totalClears : summary.totalXp}
              </Text>
              <Text style={styles.rewardSummaryLabel}>
                {showingArchived ? 'Historical clears' : 'XP available'}
              </Text>
            </View>
            <View style={styles.rewardDivider} />
            <View style={styles.rewardSummaryItem}>
              <Text style={styles.rewardSummaryValue}>
                {showingArchived ? 'Safe' : summary.totalEnergy}
              </Text>
              <Text style={styles.rewardSummaryLabel}>
                {showingArchived ? 'History preserved' : 'Energy available'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.filterTabs}>
          {(['active', 'archived'] as QuestFilter[]).map((filter) => {
            const selected = questFilter === filter;

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={filter}
                onPress={() => setQuestFilter(filter)}
                style={[styles.filterTab, selected && styles.filterTabSelected]}>
                <MaterialCommunityIcons
                  name={filter === 'active' ? 'sword-cross' : 'archive-outline'}
                  size={15}
                  color={selected ? '#7EE8FF' : '#7F879F'}
                />
                <Text style={[styles.filterTabText, selected && styles.filterTabTextSelected]}>
                  {filter === 'active' ? 'Active' : 'Archived'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>
              {showingArchived ? 'ARCHIVED QUESTS' : 'ACTIVE DAILY QUESTS'}
            </Text>
            <Text style={styles.sectionTitle}>
              {showingArchived ? 'Stored records' : 'Quest board'}
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{quests.length}</Text>
          </View>
        </View>

        <View style={styles.questList}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#63DFFF" />
              <Text style={styles.loadingText}>Loading quest log...</Text>
            </View>
          ) : null}

          {!loading && quests.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="book-open-page-variant" size={30} color="#707894" />
              <Text style={styles.emptyTitle}>
                {showingArchived ? 'No archived quests' : 'No active quests'}
              </Text>
              <Text style={styles.emptyText}>
                {showingArchived
                  ? 'Archived quests will appear here with their history intact.'
                  : 'Create your first daily quest to start earning XP.'}
              </Text>
            </View>
          ) : null}

          {quests.map((quest) => {
            const difficulty = difficultyMeta[quest.difficulty];
            const reward = rewardByDifficulty[quest.difficulty];
            const habitStreak = habitStreaksById[quest.id] ?? 0;

            return (
              <View
                key={quest.id}
                style={[styles.questCard, quest.complete && styles.questCardComplete]}>
                <View style={[styles.questIcon, { borderColor: `${difficulty.color}66` }]}>
                  <MaterialCommunityIcons
                    name={attributeIcons[quest.attribute]}
                    size={23}
                    color={difficulty.color}
                  />
                </View>

                <View style={styles.questBody}>
                  <View style={styles.questTitleRow}>
                    <Text style={styles.questTitle}>{quest.title}</Text>
                    <View style={styles.questActions}>
                      <Text style={[styles.difficulty, { color: difficulty.color }]}>
                        {difficulty.label.toUpperCase()}
                      </Text>
                      <Pressable
                        accessibilityLabel={
                          showingArchived ? `Restore ${quest.title}` : `Archive ${quest.title}`
                        }
                        disabled={updatingQuestId === quest.id}
                        onPress={() =>
                          showingArchived ? void restoreQuest(quest) : confirmArchiveQuest(quest)
                        }
                        style={({ pressed }) => [
                          styles.archiveButton,
                          pressed && styles.archiveButtonPressed,
                          updatingQuestId === quest.id && styles.archiveButtonDisabled,
                        ]}>
                        <MaterialCommunityIcons
                          name={showingArchived ? 'backup-restore' : 'archive-outline'}
                          size={16}
                          color={showingArchived ? '#7EE8FF' : '#7F879F'}
                        />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.questDescription}>
                    {quest.description || 'Complete this daily quest'}
                  </Text>

                  <View style={styles.rewardRow}>
                    <Text style={styles.rewardText}>+{reward.xp} EXP</Text>
                    <View style={styles.rewardDot} />
                    <Text style={styles.rewardText}>
                      +{reward.statXp} {formatAttribute(quest.attribute)}
                    </Text>
                    <View style={styles.rewardDot} />
                    <Text style={styles.rewardText}>+{reward.energy} Energy</Text>
                  </View>

                  <View style={styles.questMetaRow}>
                    <View style={styles.streakPill}>
                      <MaterialCommunityIcons name="fire" size={13} color="#FF8FC7" />
                      <Text style={styles.streakText}>
                        {habitStreak} {habitStreak === 1 ? 'day' : 'days'}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, quest.complete && styles.statusPillComplete]}>
                      <View style={[styles.statusDot, quest.complete && styles.statusDotComplete]} />
                      <Text style={[styles.statusText, quest.complete && styles.statusTextComplete]}>
                        {quest.complete ? 'Cleared today' : 'Pending today'}
                      </Text>
                    </View>
                    <Text style={styles.historyText}>
                      {quest.totalCompletions} clears - {formatLastCompleted(quest.lastCompletedDate)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.push('/create-habit')}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}>
          <MaterialCommunityIcons name="plus-circle" size={20} color="#7EE7FF" />
          <Text style={styles.addButtonText}>Create daily quest</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  backgroundGlowBlue: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#006C9C',
    opacity: 0.13,
    top: -100,
    right: -100,
  },
  backgroundGlowPurple: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#5E2B97',
    opacity: 0.1,
    top: 300,
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
  heading: { color: '#F5F2FF', fontSize: 31, fontWeight: '800' },
  addIconButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11162A',
    borderWidth: 1,
    borderColor: '#293252',
  },
  summaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#31476D',
    padding: 17,
    overflow: 'hidden',
    marginBottom: 24,
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
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  summaryLabel: { color: '#8D91AD', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  summaryValue: { color: '#F1EEFF', fontSize: 34, fontWeight: '900', marginTop: 3 },
  summaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6, 9, 22, 0.7)',
    borderWidth: 1,
    borderColor: '#345E7A',
  },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#11152A', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  rewardSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 17,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(126, 133, 170, 0.18)',
  },
  rewardSummaryItem: { flex: 1 },
  rewardSummaryValue: { color: '#EDF0FF', fontSize: 17, fontWeight: '900' },
  rewardSummaryLabel: { color: '#777E9C', fontSize: 10, fontWeight: '700', marginTop: 2 },
  rewardDivider: { width: 1, height: 31, backgroundColor: '#30334E', marginHorizontal: 14 },
  filterTabs: {
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#252A48',
    backgroundColor: 'rgba(12, 16, 31, 0.88)',
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    marginBottom: 18,
  },
  filterTab: {
    flex: 1,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  filterTabSelected: { backgroundColor: '#102331', borderWidth: 1, borderColor: '#2F7184' },
  filterTabText: { color: '#7F879F', fontSize: 11, fontWeight: '800' },
  filterTabTextSelected: { color: '#9BEAFF' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  sectionEyebrow: { color: '#8E72FF', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  sectionTitle: { color: '#F1EFFF', fontSize: 19, fontWeight: '800', marginTop: 4 },
  countBadge: {
    minWidth: 34,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#12172A',
    borderWidth: 1,
    borderColor: '#282F4A',
  },
  countBadgeText: { color: '#8EDFF2', fontSize: 11, fontWeight: '800' },
  questList: { gap: 10 },
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
  emptyState: {
    minHeight: 150,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(12, 16, 31, 0.72)',
    borderWidth: 1,
    borderColor: '#222842',
    padding: 18,
  },
  emptyTitle: { color: '#E8E9F4', fontSize: 15, fontWeight: '800' },
  emptyText: { color: '#737B98', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 118,
    borderRadius: 17,
    padding: 13,
    backgroundColor: 'rgba(12, 16, 31, 0.94)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  questCardComplete: { backgroundColor: 'rgba(12, 25, 35, 0.94)', borderColor: '#254B58' },
  questIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11172A',
    borderWidth: 1,
  },
  questBody: { flex: 1, paddingLeft: 12 },
  questTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  questTitle: { color: '#E8E9F4', fontSize: 14, fontWeight: '800', flexShrink: 1 },
  questActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 8 },
  archiveButton: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12172A',
    borderWidth: 1,
    borderColor: '#303652',
  },
  archiveButtonPressed: { opacity: 0.72 },
  archiveButtonDisabled: { opacity: 0.38 },
  difficulty: { fontSize: 8, fontWeight: '900', letterSpacing: 0.9, marginLeft: 8 },
  questDescription: { color: '#737B98', fontSize: 10, marginTop: 4 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  rewardText: { color: '#6FC8DC', fontSize: 9, fontWeight: '700' },
  rewardDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#454D69' },
  questMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  streakPill: {
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#211525',
    borderWidth: 1,
    borderColor: '#51314F',
  },
  streakText: { color: '#FF9BCB', fontSize: 9, fontWeight: '900' },
  statusPill: {
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#12172A',
    borderWidth: 1,
    borderColor: '#303652',
  },
  statusPillComplete: { backgroundColor: '#10272D', borderColor: '#2C6A73' },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#747C97' },
  statusDotComplete: { backgroundColor: '#67DDF6' },
  statusText: { color: '#8A91AA', fontSize: 9, fontWeight: '800' },
  statusTextComplete: { color: '#8AE8F9' },
  historyText: { color: '#69718F', fontSize: 9, fontWeight: '700', flexShrink: 1 },
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
