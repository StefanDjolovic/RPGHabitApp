import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HabitAttribute } from '@/src/database/habit-repository';
import {
  getWeeklyReview,
  type WeeklyReview,
  type WeeklySuggestionType,
} from '@/src/progression/weekly-review';

const attributeMeta: Record<
  HabitAttribute,
  { color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  strength: { color: '#FF7B8A', icon: 'dumbbell' },
  intelligence: { color: '#67D7FF', icon: 'brain' },
  discipline: { color: '#B493FF', icon: 'shield-check' },
  vitality: { color: '#63E0A2', icon: 'heart-pulse' },
  creativity: { color: '#FFD166', icon: 'palette' },
};

const suggestionMeta: Record<
  WeeklySuggestionType,
  { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; color: string }
> = {
  'start-small': { icon: 'sprout', label: 'Give it time', color: '#68E1A8' },
  ease: { icon: 'tune-variant', label: 'Ease the plan', color: '#FFD27A' },
  move: { icon: 'calendar-clock', label: 'Move the rhythm', color: '#7EE7FF' },
  pause: { icon: 'pause-circle-outline', label: 'Consider a pause', color: '#FF9BCB' },
  maintain: { icon: 'check-decagram-outline', label: 'Keep momentum', color: '#68E1A8' },
};

function formatDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatCadence(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function WeeklyReviewScreen() {
  const db = useSQLiteContext();
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getWeeklyReview(db)
      .then((result) => {
        if (active) setReview(result);
      })
      .catch(() => {
        if (active) setError('Weekly Review could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [db]);

  const editFocusHabit = () => {
    if (!review?.focusHabit) return;
    router.push(`/create-habit?id=${review.focusHabit.id}` as Href);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingState}>
          <ActivityIndicator color="#7EE7FF" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!review || error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#FF8FA3" />
          <Text style={styles.errorText}>{error || 'Weekly Review is unavailable.'}</Text>
          <Pressable onPress={() => router.back()} style={styles.errorButton}>
            <Text style={styles.errorButtonText}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const successPercent = Math.round(review.rate * 100);
  const previousPercent = Math.round(review.previousRate * 100);
  const delta = successPercent - previousPercent;
  const suggestion = suggestionMeta[review.suggestionType];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close Weekly Review"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}>
            <MaterialCommunityIcons name="close" size={22} color="#BFC5DB" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>WEEKLY REVIEW</Text>
            <Text style={styles.heading}>Your week</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.periodRow}>
          <MaterialCommunityIcons name="calendar-week" size={18} color="#7EE7FF" />
          <Text style={styles.periodText}>
            {formatDate(review.weekStart)} - {formatDate(review.weekEnd)}
          </Text>
        </View>

        <View style={styles.overviewPanel}>
          <View style={styles.overviewTop}>
            <View>
              <Text style={styles.panelLabel}>WEEK COMPLETION</Text>
              <Text style={styles.completionValue}>{successPercent}%</Text>
            </View>
            <View style={[styles.deltaBadge, delta < 0 && styles.deltaBadgeDown]}>
              <MaterialCommunityIcons
                name={delta >= 0 ? 'trending-up' : 'trending-down'}
                size={15}
                color={delta >= 0 ? '#68E1A8' : '#FF9BCB'}
              />
              <Text style={[styles.deltaText, delta < 0 && styles.deltaTextDown]}>
                {delta > 0 ? '+' : ''}{delta} pts
              </Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${successPercent}%` }]} />
          </View>
          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryValue}>{review.completed}/{review.planned}</Text>
              <Text style={styles.summaryLabel}>QUESTS</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryValue}>+{review.xpEarned}</Text>
              <Text style={styles.summaryLabel}>EXP EARNED</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryValue}>{previousPercent}%</Text>
              <Text style={styles.summaryLabel}>LAST WEEK</Text>
            </View>
          </View>
        </View>

        {review.strongestHabit ? (
          <View style={styles.highlightBand}>
            <View style={styles.highlightIcon}>
              <MaterialCommunityIcons name="star-four-points" size={20} color="#FFD27A" />
            </View>
            <View style={styles.highlightBody}>
              <Text style={styles.highlightLabel}>STRONGEST ROUTINE</Text>
              <Text numberOfLines={1} style={styles.highlightTitle}>
                {review.strongestHabit.title}
              </Text>
            </View>
            <Text style={styles.highlightValue}>
              {Math.round(review.strongestHabit.rate * 100)}%
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>NEXT WEEK</Text>
          <Text style={styles.sectionTitle}>One useful adjustment</Text>
        </View>

        <View style={styles.suggestionPanel}>
          <View style={styles.suggestionTop}>
            <View style={[styles.suggestionIcon, { borderColor: `${suggestion.color}88` }]}>
              <MaterialCommunityIcons name={suggestion.icon} size={22} color={suggestion.color} />
            </View>
            <View style={styles.suggestionHeading}>
              <Text style={[styles.suggestionType, { color: suggestion.color }]}>
                {suggestion.label.toUpperCase()}
              </Text>
              <Text numberOfLines={1} style={styles.suggestionHabit}>
                {review.focusHabit?.title ?? 'Routine plan'}
              </Text>
            </View>
          </View>
          <Text style={styles.suggestionText}>{review.suggestion}</Text>
          <View style={styles.goalRow}>
            <MaterialCommunityIcons name="target" size={18} color="#7EE7FF" />
            <Text style={styles.goalText}>{review.smallGoal}</Text>
          </View>
          {review.focusHabit ? (
            <Pressable
              accessibilityLabel={`Review ${review.focusHabit.title} quest`}
              onPress={editFocusHabit}
              style={({ pressed }) => [styles.reviewButton, pressed && styles.buttonPressed]}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#071019" />
              <Text style={styles.reviewButtonText}>Review quest</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>ROUTINES</Text>
          <Text style={styles.sectionTitle}>Week breakdown</Text>
        </View>

        <View style={styles.habitList}>
          {review.habits.map((habit) => {
            const attribute = attributeMeta[habit.attribute];
            const percent = Math.round(habit.rate * 100);
            return (
              <View key={habit.id} style={styles.habitRow}>
                <View style={[styles.habitIcon, { borderColor: `${attribute.color}66` }]}>
                  <MaterialCommunityIcons name={attribute.icon} size={18} color={attribute.color} />
                </View>
                <View style={styles.habitBody}>
                  <View style={styles.habitTop}>
                    <View style={styles.habitTitleBlock}>
                      <Text numberOfLines={1} style={styles.habitTitle}>{habit.title}</Text>
                      <Text style={styles.habitCadence}>{formatCadence(habit.cadence)}</Text>
                    </View>
                    <Text style={styles.habitCount}>{habit.completed}/{habit.planned}</Text>
                  </View>
                  <View style={styles.habitTrack}>
                    <View
                      style={[
                        styles.habitFill,
                        { backgroundColor: attribute.color, width: `${percent}%` },
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 40 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: '#D9DDEB', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  errorButton: { minHeight: 38, paddingHorizontal: 18, justifyContent: 'center' },
  errorButtonText: { color: '#7EE7FF', fontSize: 12, fontWeight: '900' },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 24 },
  headerText: { flex: 1, paddingHorizontal: 14 },
  headerSpacer: { width: 42 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101421',
    borderWidth: 1,
    borderColor: '#292E44',
  },
  buttonPressed: { opacity: 0.68 },
  eyebrow: { color: '#7EE7FF', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  heading: { color: '#F5F2FF', fontSize: 27, fontWeight: '900', paddingTop: 2 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12 },
  periodText: { color: '#9AA4BE', fontSize: 11, fontWeight: '800' },
  overviewPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2B3651',
    backgroundColor: '#0C111F',
    padding: 15,
    marginBottom: 12,
  },
  overviewTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  panelLabel: { color: '#77819C', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  completionValue: { color: '#F3F1FF', fontSize: 32, fontWeight: '900', paddingTop: 2 },
  deltaBadge: {
    minHeight: 28,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    backgroundColor: '#10251F',
    borderWidth: 1,
    borderColor: '#285A49',
  },
  deltaBadgeDown: { backgroundColor: '#27151E', borderColor: '#633044' },
  deltaText: { color: '#68E1A8', fontSize: 9, fontWeight: '900' },
  deltaTextDown: { color: '#FF9BCB' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#080B16', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#7EE7FF' },
  summaryStats: { flexDirection: 'row', paddingTop: 16 },
  summaryStat: { flex: 1, minWidth: 0 },
  summaryValue: { color: '#E9ECF8', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summaryLabel: { color: '#65708B', fontSize: 7, fontWeight: '900', paddingTop: 3 },
  highlightBand: {
    minHeight: 66,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3C3548',
    backgroundColor: '#12121F',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 24,
  },
  highlightIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#231E18',
  },
  highlightBody: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  highlightLabel: { color: '#837C92', fontSize: 8, fontWeight: '900' },
  highlightTitle: { color: '#F0EDF7', fontSize: 12, fontWeight: '900', paddingTop: 3 },
  highlightValue: { color: '#FFD27A', fontSize: 16, fontWeight: '900' },
  sectionHeader: { paddingBottom: 11 },
  sectionEyebrow: { color: '#F08ABD', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: '#F1EFFF', fontSize: 18, fontWeight: '800', paddingTop: 3 },
  suggestionPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#382E4C',
    backgroundColor: '#100E1B',
    padding: 14,
    marginBottom: 24,
  },
  suggestionTop: { flexDirection: 'row', alignItems: 'center' },
  suggestionIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151323',
    borderWidth: 1,
  },
  suggestionHeading: { flex: 1, minWidth: 0, paddingLeft: 11 },
  suggestionType: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  suggestionHabit: { color: '#F0EDF7', fontSize: 14, fontWeight: '900', paddingTop: 3 },
  suggestionText: { color: '#A9B0C4', fontSize: 11, fontWeight: '700', lineHeight: 17, paddingTop: 13 },
  goalRow: {
    minHeight: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#0C1722',
    paddingHorizontal: 11,
    marginTop: 12,
  },
  goalText: { flex: 1, color: '#BFDCE5', fontSize: 10, fontWeight: '800' },
  reviewButton: {
    minHeight: 40,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#7EE7FF',
    marginTop: 12,
  },
  reviewButtonText: { color: '#071019', fontSize: 11, fontWeight: '900' },
  habitList: { gap: 9 },
  habitRow: {
    minHeight: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#252B42',
    backgroundColor: '#0C101C',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  habitIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11172A',
    borderWidth: 1,
  },
  habitBody: { flex: 1, minWidth: 0, paddingLeft: 11 },
  habitTop: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8 },
  habitTitleBlock: { flex: 1, minWidth: 0 },
  habitTitle: { color: '#E8E9F4', fontSize: 12, fontWeight: '900' },
  habitCadence: { color: '#68718C', fontSize: 8, fontWeight: '900', paddingTop: 2 },
  habitCount: { color: '#C6CEE2', fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  habitTrack: { height: 5, borderRadius: 3, backgroundColor: '#080B18', overflow: 'hidden' },
  habitFill: { height: '100%', borderRadius: 3 },
});
