import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { HabitHistoryYear } from '@/src/database/activity-history-repository';

const weekdayLabels = ['M', '', 'W', '', 'F', '', 'S'];

function getYearWeeks(year: number) {
  const first = new Date(Date.UTC(year, 0, 1));
  const last = new Date(Date.UTC(year, 11, 31));
  const leading = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);

  for (let date = first; date <= last; date = new Date(date.getTime() + 86_400_000)) {
    cells.push(date.toISOString().slice(0, 10));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

function getActivityLevel(count: number) {
  if (count >= 5) return 3;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

function formatMonth(monthKey: string, style: 'short' | 'long' = 'short') {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: style,
    timeZone: 'UTC',
  });
}

export function YearlyHistoryView({
  history,
  todayKey,
  onSelectHabit,
  onSelectMonth,
}: {
  history: HabitHistoryYear;
  todayKey: string;
  onSelectHabit: (habitId: number) => void;
  onSelectMonth: (monthKey: string) => void;
}) {
  const activityByDate = new Map(history.days.map((day) => [day.dateKey, day.completedCount]));
  const weeks = getYearWeeks(history.year);
  const maxMonthCompletions = Math.max(1, ...history.months.map((month) => month.totalCompletions));

  if (history.totalCompletions === 0) {
    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons color="#667089" name="chart-timeline-variant" size={34} />
        <Text style={styles.emptyTitle}>No activity in {history.year}</Text>
        <Text style={styles.emptyText}>Completed habits will build this yearly record automatically.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryBand}>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>{history.totalCompletions.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>COMPLETIONS</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>{history.activeDays}</Text>
          <Text style={styles.summaryLabel}>ACTIVE DAYS</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>{history.activeDayRate}%</Text>
          <Text style={styles.summaryLabel}>ACTIVE RATE</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>YEAR HEATMAP</Text>
        <Text style={styles.sectionTitle}>Daily consistency</Text>
      </View>
      <View style={styles.heatmapFrame}>
        <View style={styles.weekdayColumn}>
          {weekdayLabels.map((label, index) => <Text key={`${label}-${index}`} style={styles.weekday}>{label}</Text>)}
        </View>
        <ScrollView
          contentContainerStyle={styles.heatmapScrollContent}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {weeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.weekColumn}>
              {week.map((dateKey, dayIndex) => {
                if (!dateKey) return <View key={`empty-${dayIndex}`} style={styles.heatCell} />;
                const level = getActivityLevel(activityByDate.get(dateKey) ?? 0);
                return (
                  <View
                    accessibilityLabel={`${dateKey}: ${activityByDate.get(dateKey) ?? 0} completions`}
                    key={dateKey}
                    style={[
                      styles.heatCell,
                      level === 1 && styles.heatLevelOne,
                      level === 2 && styles.heatLevelTwo,
                      level === 3 && styles.heatLevelThree,
                      dateKey > todayKey && styles.futureCell,
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendText}>Less</Text>
        {[0, 1, 2, 3].map((level) => (
          <View
            key={level}
            style={[
              styles.legendCell,
              level === 1 && styles.heatLevelOne,
              level === 2 && styles.heatLevelTwo,
              level === 3 && styles.heatLevelThree,
            ]}
          />
        ))}
        <Text style={styles.legendText}>More</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>MONTHLY MOMENTUM</Text>
        <Text style={styles.sectionTitle}>Completions by month</Text>
      </View>
      <View style={styles.monthGrid}>
        {history.months.map((month) => (
          <Pressable
            accessibilityLabel={`Open ${formatMonth(month.monthKey, 'long')}, ${month.totalCompletions} completions`}
            key={month.monthKey}
            onPress={() => onSelectMonth(month.monthKey)}
            style={({ pressed }) => [styles.monthItem, pressed && styles.pressed]}>
            <View style={styles.monthTopRow}>
              <Text style={styles.monthLabel}>{formatMonth(month.monthKey)}</Text>
              <Text style={styles.monthValue}>{month.totalCompletions}</Text>
            </View>
            <View style={styles.monthTrack}>
              <View
                style={[
                  styles.monthFill,
                  { width: `${Math.max(0, month.totalCompletions / maxMonthCompletions) * 100}%` },
                ]}
              />
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.insightGrid}>
        <View style={styles.insightItem}>
          <MaterialCommunityIcons color="#FFD166" name="fire" size={20} />
          <Text style={styles.insightValue}>{history.longestStreak} days</Text>
          <Text style={styles.insightLabel}>LONGEST ACTIVE STREAK</Text>
        </View>
        <View style={styles.insightItem}>
          <MaterialCommunityIcons color="#7EE7FF" name="calendar-star" size={20} />
          <Text numberOfLines={1} style={styles.insightValue}>{history.bestWeekday ?? 'No pattern'}</Text>
          <Text style={styles.insightLabel}>STRONGEST WEEKDAY</Text>
        </View>
        <View style={styles.insightItem}>
          <MaterialCommunityIcons color="#C68CFF" name="chart-box-outline" size={20} />
          <Text numberOfLines={1} style={styles.insightValue}>
            {history.bestMonthKey ? formatMonth(history.bestMonthKey, 'long') : 'No activity'}
          </Text>
          <Text style={styles.insightLabel}>BEST MONTH</Text>
        </View>
        <View style={styles.insightItem}>
          <MaterialCommunityIcons color="#68E1A8" name="star-four-points-outline" size={20} />
          <Text style={styles.insightValue}>+{history.totalXp.toLocaleString()}</Text>
          <Text style={styles.insightLabel}>EXP EARNED</Text>
        </View>
      </View>

      {history.topHabits.length > 1 ? (
        <View style={styles.topHabits}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>TOP HABITS</Text>
            <Text style={styles.sectionTitle}>Most completed</Text>
          </View>
          {history.topHabits.map((habit, index) => (
            <Pressable
              key={habit.habitId}
              onPress={() => onSelectHabit(habit.habitId)}
              style={({ pressed }) => [styles.habitRow, pressed && styles.pressed]}>
              <Text style={styles.habitPosition}>{index + 1}</Text>
              <Text numberOfLines={1} style={styles.habitName}>{habit.title}</Text>
              <Text style={styles.habitCount}>{habit.totalCompletions}</Text>
              <MaterialCommunityIcons color="#6C748B" name="chevron-right" size={17} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 15 },
  pressed: { opacity: 0.72 },
  summaryBand: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#252B40' },
  summaryStat: { flex: 1, minWidth: 0, alignItems: 'center' },
  summaryValue: { color: '#EDF0F8', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summaryLabel: { color: '#737C94', fontSize: 7, fontWeight: '900', marginTop: 4 },
  summaryDivider: { width: 1, height: 31, backgroundColor: '#293047' },
  sectionHeader: { gap: 3 },
  sectionEyebrow: { color: '#7EE7FF', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: '#EEECF7', fontSize: 16, fontWeight: '900' },
  heatmapFrame: { minHeight: 78, flexDirection: 'row', gap: 6, paddingVertical: 7, borderRadius: 8, backgroundColor: '#0B0F1A', borderWidth: 1, borderColor: '#242A3D' },
  weekdayColumn: { width: 12, gap: 3, paddingLeft: 3 },
  weekday: { height: 8, color: '#687189', fontSize: 6, lineHeight: 8, fontWeight: '900', textAlign: 'center' },
  heatmapScrollContent: { flexDirection: 'row', gap: 3, paddingRight: 8 },
  weekColumn: { gap: 3 },
  heatCell: { width: 8, height: 8, borderRadius: 2, backgroundColor: '#171B28' },
  heatLevelOne: { backgroundColor: '#17404A' },
  heatLevelTwo: { backgroundColor: '#207083' },
  heatLevelThree: { backgroundColor: '#846EC0' },
  futureCell: { opacity: 0.25 },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  legendCell: { width: 9, height: 9, borderRadius: 2, backgroundColor: '#171B28' },
  legendText: { color: '#697188', fontSize: 7, fontWeight: '800' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthItem: { width: '48.5%', minHeight: 45, justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#252B3F' },
  monthTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthLabel: { color: '#8B94AA', fontSize: 8, fontWeight: '900' },
  monthValue: { color: '#E7EAF3', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  monthTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: '#242A3A' },
  monthFill: { height: '100%', borderRadius: 2, backgroundColor: '#66D8ED' },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  insightItem: { width: '48.5%', minHeight: 94, justifyContent: 'center', padding: 11, gap: 5, borderRadius: 8, backgroundColor: '#0C101B', borderWidth: 1, borderColor: '#282E42' },
  insightValue: { color: '#EFF0F7', fontSize: 14, fontWeight: '900' },
  insightLabel: { color: '#747D95', fontSize: 7, fontWeight: '900' },
  topHabits: { gap: 8 },
  habitRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#23293B' },
  habitPosition: { width: 22, color: '#7EE7FF', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  habitName: { flex: 1, minWidth: 0, color: '#D9DCE7', fontSize: 10, fontWeight: '800' },
  habitCount: { color: '#FFD166', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  emptyState: { minHeight: 270, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 22, borderRadius: 8, backgroundColor: '#0C101B', borderWidth: 1, borderColor: '#272D40' },
  emptyTitle: { color: '#EDEBF5', fontSize: 16, fontWeight: '900' },
  emptyText: { maxWidth: 270, color: '#7A839B', fontSize: 10, lineHeight: 15, fontWeight: '700', textAlign: 'center' },
});
