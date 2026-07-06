import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
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
  getHabitHistoryFilters,
  getHabitHistoryMonth,
  getHabitHistoryYear,
  getLifetimeHabitHistory,
  type HabitHistoryFilter,
  type HabitHistoryMonth,
  type HabitHistoryYear,
  type LifetimeHabitHistory,
} from '@/src/database/activity-history-repository';
import { getLocalDateKey, type HabitAttribute } from '@/src/database/habit-repository';
import { YearlyHistoryView } from '@/src/history/yearly-history-view';

type HistoryView = 'month' | 'year';

const EMPTY_LIFETIME: LifetimeHabitHistory = {
  firstDate: null,
  activeDays: 0,
  totalCompletions: 0,
  totalXp: 0,
  totalStatXp: 0,
  totalEnergy: 0,
};

const attributeMeta: Record<
  HabitAttribute,
  { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }
> = {
  strength: { label: 'Strength', icon: 'dumbbell', color: '#FF7B8A' },
  intelligence: { label: 'Intelligence', icon: 'brain', color: '#67D7FF' },
  discipline: { label: 'Discipline', icon: 'shield-check', color: '#B493FF' },
  vitality: { label: 'Vitality', icon: 'heart-pulse', color: '#63E0A2' },
  creativity: { label: 'Creativity', icon: 'palette', color: '#FFD166' },
};

const difficultyMeta = {
  easy: { label: 'EASY', color: '#68E1A8' },
  medium: { label: 'MEDIUM', color: '#FFD166' },
  hard: { label: 'HARD', color: '#FF7B8A' },
} as const;

const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatShortDate(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatMonth(monthKey: string) {
  return parseDateKey(`${monthKey}-01`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getCalendarRows(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (firstDay.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);

  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(`${monthKey}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
}

function getActivityLevel(count: number) {
  if (count >= 5) return 3;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

export default function ActivityHistoryScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const todayKey = getLocalDateKey();
  const currentMonthKey = todayKey.slice(0, 7);
  const currentYear = Number(todayKey.slice(0, 4));
  const [view, setView] = useState<HistoryView>('month');
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [year, setYear] = useState(currentYear);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [selectedHabitId, setSelectedHabitId] = useState<number | null>(null);
  const [filters, setFilters] = useState<HabitHistoryFilter[]>([]);
  const [lifetime, setLifetime] = useState<LifetimeHabitHistory>(EMPTY_LIFETIME);
  const [history, setHistory] = useState<HabitHistoryMonth | null>(null);
  const [yearHistory, setYearHistory] = useState<HabitHistoryYear | null>(null);
  const [monthLoading, setMonthLoading] = useState(true);
  const [yearLoading, setYearLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getHabitHistoryFilters(db)
      .then((result) => {
        if (active) setFilters(result);
      })
      .catch(() => {
        if (active) setError('Habit filters could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [db]);

  useEffect(() => {
    let active = true;
    void getLifetimeHabitHistory(db, selectedHabitId)
      .then((result) => {
        if (active) setLifetime(result);
      })
      .catch(() => {
        if (active) setError('Lifetime history could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [db, selectedHabitId]);

  useEffect(() => {
    let active = true;
    if (view !== 'month') return;
    setMonthLoading(true);
    setError('');
    void getHabitHistoryMonth(db, monthKey, selectedHabitId)
      .then((result) => {
        if (!active) return;
        setHistory(result);
        setSelectedDate((current) => {
          if (current.startsWith(monthKey)) return current;
          if (monthKey === currentMonthKey) return todayKey;
          return result.days.at(-1)?.dateKey ?? `${monthKey}-01`;
        });
      })
      .catch(() => {
        if (active) setError('Habit history could not be loaded.');
      })
      .finally(() => {
        if (active) setMonthLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentMonthKey, db, monthKey, selectedHabitId, todayKey, view]);

  useEffect(() => {
    let active = true;
    if (view !== 'year') return;
    setYearLoading(true);
    setError('');
    void getHabitHistoryYear(db, year, todayKey, selectedHabitId)
      .then((result) => {
        if (active) setYearHistory(result);
      })
      .catch(() => {
        if (active) setError('Yearly habit history could not be loaded.');
      })
      .finally(() => {
        if (active) setYearLoading(false);
      });
    return () => {
      active = false;
    };
  }, [db, selectedHabitId, todayKey, view, year]);

  const firstMonthKey = lifetime.firstDate?.slice(0, 7) ?? currentMonthKey;
  const firstYear = Number(firstMonthKey.slice(0, 4));
  const selectedFilter = filters.find((filter) => filter.habitId === selectedHabitId) ?? null;
  const calendarRows = useMemo(() => getCalendarRows(monthKey), [monthKey]);
  const activityByDate = useMemo(
    () => new Map(history?.days.map((day) => [day.dateKey, day]) ?? []),
    [history?.days],
  );
  const selectedEntries = useMemo(
    () => history?.entries.filter((entry) => entry.dateKey === selectedDate) ?? [],
    [history?.entries, selectedDate],
  );
  const selectedDay = activityByDate.get(selectedDate);
  const canMoveBack = monthKey > firstMonthKey;
  const canMoveForward = monthKey < currentMonthKey;
  const canMoveYearBack = year > firstYear;
  const canMoveYearForward = year < currentYear;

  useEffect(() => {
    setMonthKey((current) => current < firstMonthKey ? firstMonthKey : current);
    setYear((current) => current < firstYear ? firstYear : current);
  }, [firstMonthKey, firstYear]);

  const moveMonth = (amount: number) => {
    const candidate = shiftMonth(monthKey, amount);
    const next = candidate < firstMonthKey
      ? firstMonthKey
      : candidate > currentMonthKey
        ? currentMonthKey
        : candidate;
    setMonthKey(next);
  };

  const moveYear = (amount: number) => {
    setYear((current) => Math.max(firstYear, Math.min(currentYear, current + amount)));
  };

  const openMonthFromYear = (nextMonthKey: string) => {
    setMonthKey(nextMonthKey > currentMonthKey ? currentMonthKey : nextMonthKey);
    setView('month');
    setMonthLoading(true);
  };

  const selectHabit = (habitId: number | null) => {
    setSelectedHabitId(habitId);
    if (view === 'month') setMonthLoading(true);
    else setYearLoading(true);
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Return to profile"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}>
          <MaterialCommunityIcons color="#D8DCE8" name="arrow-left" size={21} />
        </Pressable>
        <View style={styles.topBarBody}>
          <Text style={styles.eyebrow}>JOURNEY ARCHIVE</Text>
          <Text style={styles.heading}>Habit History</Text>
        </View>
        <View style={styles.archiveIcon}>
          <MaterialCommunityIcons color="#7EE7FF" name="calendar-search" size={23} />
        </View>
      </View>

      <LinearGradient
        colors={['rgba(20, 53, 65, 0.98)', 'rgba(40, 26, 58, 0.98)']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.lifetimePanel}>
        <View style={styles.lifetimeMain}>
          <Text numberOfLines={1} style={styles.panelLabel}>
            {selectedFilter ? selectedFilter.title.toUpperCase() : 'LIFETIME COMPLETIONS'}
          </Text>
          <Text style={styles.lifetimeValue}>{formatNumber(lifetime.totalCompletions)}</Text>
          <Text style={styles.firstRecord}>
            {lifetime.firstDate ? `Since ${formatShortDate(lifetime.firstDate)}` : 'No records yet'}
          </Text>
        </View>
        <View style={styles.lifetimeDivider} />
        <View style={styles.lifetimeSide}>
          <Text style={styles.sideValue}>{formatNumber(lifetime.activeDays)}</Text>
          <Text style={styles.sideLabel}>ACTIVE DAYS</Text>
          <Text style={styles.sideReward}>+{formatNumber(lifetime.totalXp)} EXP</Text>
        </View>
      </LinearGradient>

      <View accessibilityRole="tablist" style={styles.viewControl}>
        {(['month', 'year'] as const).map((option) => {
          const selected = view === option;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => {
                setView(option);
                if (option === 'month') setMonthLoading(true);
                else setYearLoading(true);
                if (option === 'year') setYear(Number(monthKey.slice(0, 4)));
              }}
              style={[styles.viewOption, selected && styles.viewOptionSelected]}>
              <MaterialCommunityIcons
                color={selected ? '#071018' : '#7E879F'}
                name={option === 'month' ? 'calendar-month-outline' : 'calendar-range-outline'}
                size={17}
              />
              <Text style={[styles.viewOptionText, selected && styles.viewOptionTextSelected]}>
                {option === 'month' ? 'Month' : 'Year'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.filterSection}>
        <View style={styles.filterLabelRow}>
          <MaterialCommunityIcons color="#8B94AA" name="filter-variant" size={16} />
          <Text style={styles.filterLabel}>HABIT FILTER</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.filterList}
          horizontal
          showsHorizontalScrollIndicator={false}>
          <Pressable
            accessibilityState={{ selected: selectedHabitId === null }}
            onPress={() => selectHabit(null)}
            style={[styles.filterOption, selectedHabitId === null && styles.filterOptionSelected]}>
            <MaterialCommunityIcons
              color={selectedHabitId === null ? '#071018' : '#818AA2'}
              name="view-grid-outline"
              size={15}
            />
            <Text style={[styles.filterOptionText, selectedHabitId === null && styles.filterOptionTextSelected]}>
              All habits
            </Text>
          </Pressable>
          {filters.map((filter) => {
            const selected = selectedHabitId === filter.habitId;
            return (
              <Pressable
                accessibilityState={{ selected }}
                key={filter.habitId}
                onPress={() => selectHabit(filter.habitId)}
                style={[styles.filterOption, selected && styles.filterOptionSelected]}>
                <Text numberOfLines={1} style={[styles.filterOptionText, selected && styles.filterOptionTextSelected]}>
                  {filter.title}
                </Text>
                <Text style={[styles.filterCount, selected && styles.filterOptionTextSelected]}>
                  {filter.totalCompletions}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {view === 'month' ? (
        <View style={styles.monthToolbar}>
        <View style={styles.monthNavigation}>
          <Pressable
            accessibilityLabel="Previous year"
            accessibilityState={{ disabled: !canMoveBack }}
            disabled={!canMoveBack}
            onPress={() => moveMonth(-12)}
            style={({ pressed }) => [
              styles.navigationButton,
              !canMoveBack && styles.buttonDisabled,
              pressed && canMoveBack && styles.buttonPressed,
            ]}>
            <MaterialCommunityIcons color="#AEB6CF" name="chevron-double-left" size={20} />
          </Pressable>
          <Pressable
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: !canMoveBack }}
            disabled={!canMoveBack}
            onPress={() => moveMonth(-1)}
            style={({ pressed }) => [
              styles.navigationButton,
              !canMoveBack && styles.buttonDisabled,
              pressed && canMoveBack && styles.buttonPressed,
            ]}>
            <MaterialCommunityIcons color="#AEB6CF" name="chevron-left" size={21} />
          </Pressable>
        </View>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.monthTitle}>
          {formatMonth(monthKey)}
        </Text>
        <View style={styles.monthNavigation}>
          <Pressable
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: !canMoveForward }}
            disabled={!canMoveForward}
            onPress={() => moveMonth(1)}
            style={({ pressed }) => [
              styles.navigationButton,
              !canMoveForward && styles.buttonDisabled,
              pressed && canMoveForward && styles.buttonPressed,
            ]}>
            <MaterialCommunityIcons color="#AEB6CF" name="chevron-right" size={21} />
          </Pressable>
          <Pressable
            accessibilityLabel="Next year"
            accessibilityState={{ disabled: !canMoveForward }}
            disabled={!canMoveForward}
            onPress={() => moveMonth(12)}
            style={({ pressed }) => [
              styles.navigationButton,
              !canMoveForward && styles.buttonDisabled,
              pressed && canMoveForward && styles.buttonPressed,
            ]}>
            <MaterialCommunityIcons color="#AEB6CF" name="chevron-double-right" size={20} />
          </Pressable>
        </View>
        </View>
      ) : (
        <View style={styles.yearToolbar}>
          <Pressable
            accessibilityLabel="Previous year"
            disabled={!canMoveYearBack}
            onPress={() => moveYear(-1)}
            style={({ pressed }) => [
              styles.navigationButton,
              !canMoveYearBack && styles.buttonDisabled,
              pressed && canMoveYearBack && styles.buttonPressed,
            ]}>
            <MaterialCommunityIcons color="#AEB6CF" name="chevron-left" size={21} />
          </Pressable>
          <Text style={styles.yearTitle}>{year}</Text>
          <Pressable
            accessibilityLabel="Next year"
            disabled={!canMoveYearForward}
            onPress={() => moveYear(1)}
            style={({ pressed }) => [
              styles.navigationButton,
              !canMoveYearForward && styles.buttonDisabled,
              pressed && canMoveYearForward && styles.buttonPressed,
            ]}>
            <MaterialCommunityIcons color="#AEB6CF" name="chevron-right" size={21} />
          </Pressable>
        </View>
      )}

      {(view === 'month' ? monthLoading : yearLoading) ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#7EE7FF" />
        </View>
      ) : error ? (
        <View style={styles.errorState}>
          <MaterialCommunityIcons color="#FF8A98" name="alert-circle-outline" size={22} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : view === 'year' && yearHistory ? (
        <YearlyHistoryView
          history={yearHistory}
          onSelectHabit={(habitId) => selectHabit(habitId)}
          onSelectMonth={openMonthFromYear}
          todayKey={todayKey}
        />
      ) : (
        <>
          <View style={styles.monthSummary}>
            <View style={styles.monthStat}>
              <Text style={styles.monthStatValue}>{history?.totalCompletions ?? 0}</Text>
              <Text style={styles.monthStatLabel}>COMPLETIONS</Text>
            </View>
            <View style={styles.monthStatDivider} />
            <View style={styles.monthStat}>
              <Text style={styles.monthStatValue}>{history?.activeDays ?? 0}</Text>
              <Text style={styles.monthStatLabel}>ACTIVE DAYS</Text>
            </View>
            <View style={styles.monthStatDivider} />
            <View style={styles.monthStat}>
              <Text style={styles.monthStatValue}>+{formatNumber(history?.totalXp ?? 0)}</Text>
              <Text style={styles.monthStatLabel}>EXP</Text>
            </View>
          </View>

          <View style={styles.calendar}>
            <View style={styles.weekRow}>
              {weekdays.map((weekday) => (
                <Text key={weekday} style={styles.weekday}>{weekday}</Text>
              ))}
            </View>
            {calendarRows.map((row, rowIndex) => (
              <View key={`week-${rowIndex}`} style={styles.weekRow}>
                {row.map((dateKey, columnIndex) => {
                  if (!dateKey) return <View key={`empty-${columnIndex}`} style={styles.dayCell} />;
                  const day = activityByDate.get(dateKey);
                  const count = day?.completedCount ?? 0;
                  const level = getActivityLevel(count);
                  const selected = selectedDate === dateKey;
                  const future = dateKey > todayKey;
                  return (
                    <Pressable
                      accessibilityLabel={`${formatDate(dateKey)}, ${count} completed habits`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: future, selected }}
                      disabled={future}
                      key={dateKey}
                      onPress={() => setSelectedDate(dateKey)}
                      style={({ pressed }) => [
                        styles.dayCell,
                        styles.dayButton,
                        level === 1 && styles.dayLevelOne,
                        level === 2 && styles.dayLevelTwo,
                        level === 3 && styles.dayLevelThree,
                        selected && styles.daySelected,
                        future && styles.dayFuture,
                        pressed && !future && styles.buttonPressed,
                      ]}>
                      <Text style={[styles.dayNumber, level > 0 && styles.dayNumberActive]}>
                        {Number(dateKey.slice(-2))}
                      </Text>
                      {count > 0 ? <Text style={styles.dayCount}>{count}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.selectedHeader}>
            <View>
              <Text style={styles.sectionLabel}>SELECTED DAY</Text>
              <Text style={styles.selectedTitle}>{formatDate(selectedDate)}</Text>
            </View>
            <View style={styles.selectedCountBadge}>
              <Text style={styles.selectedCount}>{selectedDay?.completedCount ?? 0}</Text>
            </View>
          </View>

          {selectedEntries.length > 0 ? (
            <View style={styles.entryList}>
              {selectedEntries.map((entry) => {
                const attribute = attributeMeta[entry.attribute];
                const difficulty = difficultyMeta[entry.difficulty];
                return (
                  <View key={entry.completionId} style={styles.entryRow}>
                    <View style={[styles.entryIcon, { borderColor: `${attribute.color}66` }]}>
                      <MaterialCommunityIcons color={attribute.color} name={attribute.icon} size={20} />
                    </View>
                    <View style={styles.entryBody}>
                      <Text numberOfLines={2} style={styles.entryTitle}>{entry.title}</Text>
                      <View style={styles.entryMeta}>
                        <Text style={[styles.entryDifficulty, { color: difficulty.color }]}>
                          {difficulty.label}
                        </Text>
                        <Text style={styles.entryAttribute}>{attribute.label}</Text>
                      </View>
                    </View>
                    <View style={styles.entryRewards}>
                      <Text style={styles.entryXp}>+{entry.xpEarned} EXP</Text>
                      <Text style={styles.entryStatXp}>+{entry.statXpEarned} Stat XP</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyDay}>
              <MaterialCommunityIcons color="#626A84" name="calendar-blank-outline" size={25} />
              <Text style={styles.emptyDayText}>No completed habits on this day.</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' },
  content: { flexGrow: 1, paddingHorizontal: 17, gap: 16 },
  topBar: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11 },
  topBarBody: { flex: 1, minWidth: 0 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111522', borderWidth: 1, borderColor: '#282E40' },
  buttonPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  buttonDisabled: { opacity: 0.3 },
  eyebrow: { color: '#70DDF7', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  heading: { color: '#F3F0FF', fontSize: 25, fontWeight: '900' },
  archiveIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C1B24', borderWidth: 1, borderColor: '#285A69' },
  lifetimePanel: { minHeight: 132, borderRadius: 8, borderWidth: 1, borderColor: '#36566A', padding: 16, flexDirection: 'row', alignItems: 'center' },
  lifetimeMain: { flex: 1, minWidth: 0 },
  panelLabel: { color: '#8EDFF2', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  lifetimeValue: { color: '#FFFFFF', fontSize: 38, lineHeight: 44, fontWeight: '900', fontVariant: ['tabular-nums'] },
  firstRecord: { color: '#A9B0C5', fontSize: 10, fontWeight: '700' },
  lifetimeDivider: { width: 1, height: 70, backgroundColor: 'rgba(151, 194, 210, 0.24)', marginHorizontal: 15 },
  lifetimeSide: { minWidth: 86, alignItems: 'flex-end' },
  sideValue: { color: '#FFD166', fontSize: 23, fontWeight: '900', fontVariant: ['tabular-nums'] },
  sideLabel: { color: '#969FB7', fontSize: 8, fontWeight: '900', marginTop: 1 },
  sideReward: { color: '#75D7EC', fontSize: 10, fontWeight: '800', marginTop: 13 },
  viewControl: { height: 44, flexDirection: 'row', gap: 4, padding: 4, borderRadius: 8, backgroundColor: '#0D111C', borderWidth: 1, borderColor: '#252B3D' },
  viewOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 6 },
  viewOptionSelected: { backgroundColor: '#7CDFF2' },
  viewOptionText: { color: '#7E879F', fontSize: 10, fontWeight: '900' },
  viewOptionTextSelected: { color: '#071018' },
  filterSection: { gap: 8 },
  filterLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterLabel: { color: '#8B94AA', fontSize: 8, fontWeight: '900' },
  filterList: { gap: 7, paddingRight: 12 },
  filterOption: { maxWidth: 210, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#101420', borderWidth: 1, borderColor: '#2B3147' },
  filterOptionSelected: { backgroundColor: '#7CDFF2', borderColor: '#7CDFF2' },
  filterOptionText: { flexShrink: 1, color: '#818AA2', fontSize: 9, fontWeight: '900' },
  filterOptionTextSelected: { color: '#071018' },
  filterCount: { color: '#FFD166', fontSize: 8, fontWeight: '900', fontVariant: ['tabular-nums'] },
  monthToolbar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  yearToolbar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  yearTitle: { flex: 1, color: '#ECEAF7', fontSize: 19, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] },
  monthNavigation: { flexDirection: 'row', gap: 5 },
  navigationButton: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2B3147', backgroundColor: '#101420' },
  monthTitle: { flex: 1, color: '#ECEAF7', fontSize: 16, fontWeight: '900', textAlign: 'center', minWidth: 0 },
  loadingState: { minHeight: 340, alignItems: 'center', justifyContent: 'center' },
  errorState: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#55303A', backgroundColor: '#1A1018', borderRadius: 8 },
  errorText: { color: '#FFABB5', fontSize: 11, fontWeight: '700' },
  monthSummary: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#242A3E' },
  monthStat: { flex: 1, alignItems: 'center', minWidth: 0 },
  monthStatValue: { color: '#E8EAF5', fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  monthStatLabel: { color: '#727B94', fontSize: 7, fontWeight: '900', marginTop: 3 },
  monthStatDivider: { width: 1, height: 29, backgroundColor: '#292F45' },
  calendar: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 6 },
  weekRow: { flexDirection: 'row', gap: 6 },
  weekday: { flex: 1, color: '#626A84', fontSize: 7, fontWeight: '900', textAlign: 'center', paddingBottom: 3 },
  dayCell: { flex: 1, aspectRatio: 1, minWidth: 0 },
  dayButton: { borderRadius: 8, borderWidth: 1, borderColor: '#252B41', backgroundColor: '#0D1120', alignItems: 'center', justifyContent: 'center' },
  dayLevelOne: { backgroundColor: '#123038', borderColor: '#285663' },
  dayLevelTwo: { backgroundColor: '#154957', borderColor: '#3B8495' },
  dayLevelThree: { backgroundColor: '#493C70', borderColor: '#846EC0' },
  daySelected: { borderColor: '#F2EDFF', borderWidth: 2 },
  dayFuture: { opacity: 0.28 },
  dayNumber: { color: '#69718B', fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dayNumberActive: { color: '#F2F7FF' },
  dayCount: { position: 'absolute', right: 4, bottom: 3, color: '#9DEBFA', fontSize: 7, fontWeight: '900' },
  selectedHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  sectionLabel: { color: '#8EDFF2', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  selectedTitle: { color: '#EDEAF7', fontSize: 15, fontWeight: '900', marginTop: 3, flexShrink: 1 },
  selectedCountBadge: { minWidth: 36, height: 30, paddingHorizontal: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#121A29', borderWidth: 1, borderColor: '#2E5360' },
  selectedCount: { color: '#7EE7FF', fontSize: 13, fontWeight: '900' },
  entryList: { gap: 8 },
  entryRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#272D43', backgroundColor: '#0D111D' },
  entryIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#121827', borderWidth: 1 },
  entryBody: { flex: 1, minWidth: 0 },
  entryTitle: { color: '#EBEAF3', fontSize: 13, fontWeight: '900' },
  entryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 5 },
  entryDifficulty: { fontSize: 8, fontWeight: '900' },
  entryAttribute: { color: '#7E879F', fontSize: 8, fontWeight: '800' },
  entryRewards: { alignItems: 'flex-end', minWidth: 67 },
  entryXp: { color: '#76D9EC', fontSize: 9, fontWeight: '900' },
  entryStatXp: { color: '#A8A0C8', fontSize: 8, fontWeight: '800', marginTop: 4 },
  emptyDay: { minHeight: 102, borderRadius: 8, borderWidth: 1, borderColor: '#262C41', backgroundColor: '#0C101C', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyDayText: { color: '#747D96', fontSize: 10, fontWeight: '700' },
});
