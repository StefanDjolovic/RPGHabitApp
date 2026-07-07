import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { SQLiteDatabase } from 'expo-sqlite';

import { grantGold } from '@/src/database/inventory-repository';
import {
  getDayFromDateKey,
  getLocalDateKey,
  getWeekStartDateKey,
  type HabitAttribute,
  type HabitCadence,
  type HabitDifficulty,
} from '@/src/database/habit-repository';
import { MAX_DAILY_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';

export type HabitMissionCadence = 'daily' | 'weekly';

export type HabitMissionReward = {
  xp: number;
  statXp: number;
  energy: number;
  gold: number;
  attribute: HabitAttribute;
};

export type HabitMission = {
  key: string;
  cadence: HabitMissionCadence;
  title: string;
  detail: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  progress: number;
  target: number;
  complete: boolean;
  claimed: boolean;
  periodStart: string;
  periodEnd: string;
  reward: HabitMissionReward;
};

export type HabitMissionBoard = {
  todayKey: string;
  weekStartKey: string;
  daily: HabitMission[];
  weekly: HabitMission[];
};

type SourceHabitRow = {
  id: number;
  title: string;
  difficulty: HabitDifficulty;
  attribute: HabitAttribute;
  cadence: HabitCadence;
  scheduleDays: string;
  isRequired: number;
};

type CompletionRow = {
  habitId: number;
  dateKey: string;
};

type CheckInRow = {
  habitId: number;
  dateKey: string;
};

type MissionClaimRow = {
  missionKey: string;
  periodStart: string;
  xpAmount: number;
  statXpAmount: number;
  energyAmount: number;
  goldAmount: number;
};

type MissionContext = {
  todayKey: string;
  todayDay: number;
  weekStartKey: string;
  weekEndKey: string;
  habits: SourceHabitRow[];
  weekCompletions: CompletionRow[];
  weekCheckIns: CheckInRow[];
  claims: Map<string, MissionClaimRow>;
};

const attributes: HabitAttribute[] = [
  'strength',
  'intelligence',
  'discipline',
  'vitality',
  'creativity',
];

const attributeMeta: Record<HabitAttribute, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; accent: string }> = {
  strength: { label: 'Strength', icon: 'arm-flex-outline', accent: '#FF8A7A' },
  intelligence: { label: 'Intelligence', icon: 'brain', accent: '#7EE7FF' },
  discipline: { label: 'Discipline', icon: 'target', accent: '#FFD166' },
  vitality: { label: 'Vitality', icon: 'heart-pulse', accent: '#68E1A8' },
  creativity: { label: 'Creativity', icon: 'creation', accent: '#C68CFF' },
};

const difficultyMeta: Record<HabitDifficulty, { label: string; accent: string; reward: HabitMissionReward }> = {
  easy: {
    label: 'Easy',
    accent: '#68E1A8',
    reward: { xp: 15, statXp: 1, energy: 0, gold: 3, attribute: 'discipline' },
  },
  medium: {
    label: 'Medium',
    accent: '#61D4FF',
    reward: { xp: 25, statXp: 3, energy: 1, gold: 5, attribute: 'discipline' },
  },
  hard: {
    label: 'Hard',
    accent: '#C68CFF',
    reward: { xp: 45, statXp: 5, energy: 1, gold: 8, attribute: 'discipline' },
  },
};

function parseScheduleDays(value: string | null) {
  if (!value) return [0, 1, 2, 3, 4, 5, 6];
  const days = [...new Set(value.split(',').map(Number))]
    .map((day) => Math.floor(day))
    .filter((day) => day >= 0 && day <= 6)
    .sort((first, second) => first - second);
  return days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clampProgress(progress: number, target: number) {
  return Math.min(target, Math.max(0, Math.floor(progress)));
}

function claimMapKey(missionKey: string, periodStart: string) {
  return `${missionKey}|${periodStart}`;
}

function getTopAttribute(habits: SourceHabitRow[]) {
  const counts = new Map<HabitAttribute, number>();
  for (const attribute of attributes) counts.set(attribute, 0);
  for (const habit of habits) counts.set(habit.attribute, (counts.get(habit.attribute) ?? 0) + 1);
  return attributes.reduce((best, attribute) =>
    (counts.get(attribute) ?? 0) > (counts.get(best) ?? 0) ? attribute : best,
  );
}

function countTodayCompleted(ids: Set<number>, habits: SourceHabitRow[]) {
  return habits.reduce((total, habit) => total + (ids.has(habit.id) ? 1 : 0), 0);
}

function applyClaim(mission: HabitMission, claims: Map<string, MissionClaimRow>): HabitMission {
  const claim = claims.get(claimMapKey(mission.key, mission.periodStart));
  if (!claim) return mission;

  return {
    ...mission,
    claimed: true,
    reward: {
      ...mission.reward,
      xp: claim.xpAmount,
      statXp: claim.statXpAmount,
      energy: claim.energyAmount,
      gold: claim.goldAmount,
    },
  };
}

function createMission(
  context: MissionContext,
  mission: Omit<HabitMission, 'complete' | 'claimed'>,
) {
  return applyClaim(
    {
      ...mission,
      progress: clampProgress(mission.progress, mission.target),
      complete: mission.progress >= mission.target,
      claimed: false,
    },
    context.claims,
  );
}

function buildDailyMissions(context: MissionContext): HabitMission[] {
  const dailyHabits = context.habits.filter(
    (habit) =>
      habit.cadence === 'daily' &&
      parseScheduleDays(habit.scheduleDays).includes(context.todayDay),
  );
  if (dailyHabits.length === 0) return [];

  const todayCompletedIds = new Set(
    context.weekCompletions
      .filter((row) => row.dateKey === context.todayKey)
      .map((row) => row.habitId),
  );
  const dailyCompletions = countTodayCompleted(todayCompletedIds, dailyHabits);
  const dailyTarget = Math.min(dailyHabits.length, dailyHabits.length >= 4 ? 3 : dailyHabits.length);
  const focusAttribute = getTopAttribute(dailyHabits);
  const focusHabits = dailyHabits.filter((habit) => habit.attribute === focusAttribute);
  const focusMeta = attributeMeta[focusAttribute];
  const difficulty = (['hard', 'medium', 'easy'] as const).find((candidate) =>
    dailyHabits.some((habit) => habit.difficulty === candidate),
  ) ?? 'easy';
  const difficultyHabits = dailyHabits.filter((habit) => habit.difficulty === difficulty);
  const difficultyAttribute = getTopAttribute(difficultyHabits);
  const difficultyProgress = countTodayCompleted(todayCompletedIds, difficultyHabits);

  return [
    createMission(context, {
      key: 'daily-quest-clear',
      cadence: 'daily',
      title: 'Daily quest clear',
      detail: `Complete ${dailyTarget} scheduled daily ${dailyTarget === 1 ? 'quest' : 'quests'}.`,
      icon: 'check-decagram-outline',
      accent: '#7EE7FF',
      progress: dailyCompletions,
      target: dailyTarget,
      periodStart: context.todayKey,
      periodEnd: context.todayKey,
      reward: {
        xp: 20 + dailyTarget * 10,
        statXp: 2,
        energy: 1,
        gold: 6,
        attribute: 'discipline',
      },
    }),
    createMission(context, {
      key: `daily-focus-${focusAttribute}`,
      cadence: 'daily',
      title: `${focusMeta.label} focus`,
      detail: `Finish ${Math.min(2, focusHabits.length)} ${focusMeta.label.toLowerCase()} ${focusHabits.length === 1 ? 'quest' : 'quests'}.`,
      icon: focusMeta.icon,
      accent: focusMeta.accent,
      progress: countTodayCompleted(todayCompletedIds, focusHabits),
      target: Math.min(2, focusHabits.length),
      periodStart: context.todayKey,
      periodEnd: context.todayKey,
      reward: {
        xp: 25,
        statXp: 4,
        energy: 1,
        gold: 5,
        attribute: focusAttribute,
      },
    }),
    createMission(context, {
      key: `daily-${difficulty}-quest`,
      cadence: 'daily',
      title: `${difficultyMeta[difficulty].label} quest push`,
      detail: `Complete 1 ${difficultyMeta[difficulty].label.toLowerCase()} daily quest.`,
      icon: difficulty === 'hard' ? 'sword-cross' : 'sword',
      accent: difficultyMeta[difficulty].accent,
      progress: difficultyProgress,
      target: 1,
      periodStart: context.todayKey,
      periodEnd: context.todayKey,
      reward: {
        ...difficultyMeta[difficulty].reward,
        attribute: difficultyAttribute,
      },
    }),
  ];
}

function buildWeeklyMissions(context: MissionContext): HabitMission[] {
  const trackedHabits = context.habits.filter(
    (habit) => habit.cadence === 'daily' || habit.cadence === 'weekly',
  );
  if (trackedHabits.length === 0) return [];

  const trackedIds = new Set(trackedHabits.map((habit) => habit.id));
  const weeklyCompletionActions = context.weekCompletions.filter((row) => trackedIds.has(row.habitId));
  const weeklyCheckInActions = context.weekCheckIns.filter((row) => trackedIds.has(row.habitId));
  const weeklyActions = [...weeklyCompletionActions, ...weeklyCheckInActions];
  const completedIds = new Set(weeklyActions.map((row) => row.habitId));
  const activeDailyCount = trackedHabits.filter((habit) => habit.cadence === 'daily').length;
  const activeWeeklyCount = trackedHabits.filter((habit) => habit.cadence === 'weekly').length;
  const weeklyTarget = Math.min(
    20,
    Math.max(3, Math.ceil(activeDailyCount * 2.5 + activeWeeklyCount)),
  );
  const varietyTarget = Math.min(trackedHabits.length, trackedHabits.length >= 5 ? 5 : Math.max(1, trackedHabits.length));
  const focusAttribute = getTopAttribute(trackedHabits);
  const focusMeta = attributeMeta[focusAttribute];
  const focusHabits = trackedHabits.filter((habit) => habit.attribute === focusAttribute);
  const focusIds = new Set(focusHabits.map((habit) => habit.id));
  const focusProgress = weeklyActions.filter((row) => focusIds.has(row.habitId)).length;

  return [
    createMission(context, {
      key: 'weekly-action-count',
      cadence: 'weekly',
      title: 'Weekly momentum',
      detail: `Complete ${weeklyTarget} quest actions this week.`,
      icon: 'calendar-week',
      accent: '#8DEAFF',
      progress: weeklyActions.length,
      target: weeklyTarget,
      periodStart: context.weekStartKey,
      periodEnd: context.weekEndKey,
      reward: { xp: 90, statXp: 8, energy: 3, gold: 18, attribute: 'discipline' },
    }),
    createMission(context, {
      key: 'weekly-quest-variety',
      cadence: 'weekly',
      title: 'Quest variety',
      detail: `Progress ${varietyTarget} different ${varietyTarget === 1 ? 'quest' : 'quests'}.`,
      icon: 'view-grid-plus-outline',
      accent: '#FFD166',
      progress: completedIds.size,
      target: varietyTarget,
      periodStart: context.weekStartKey,
      periodEnd: context.weekEndKey,
      reward: { xp: 80, statXp: 7, energy: 2, gold: 16, attribute: 'creativity' },
    }),
    createMission(context, {
      key: `weekly-focus-${focusAttribute}`,
      cadence: 'weekly',
      title: `${focusMeta.label} campaign`,
      detail: `Log ${Math.min(8, Math.max(2, focusHabits.length * 2))} ${focusMeta.label.toLowerCase()} actions.`,
      icon: focusMeta.icon,
      accent: focusMeta.accent,
      progress: focusProgress,
      target: Math.min(8, Math.max(2, focusHabits.length * 2)),
      periodStart: context.weekStartKey,
      periodEnd: context.weekEndKey,
      reward: { xp: 85, statXp: 10, energy: 2, gold: 16, attribute: focusAttribute },
    }),
  ];
}

async function getMissionContext(db: SQLiteDatabase): Promise<MissionContext> {
  const todayKey = getLocalDateKey();
  const weekStartKey = getWeekStartDateKey();
  const weekEndExclusive = addDays(weekStartKey, 7);
  const [habits, completionRows, checkInRows, claimRows] = await Promise.all([
    db.getAllAsync<SourceHabitRow>(
      `SELECT
         id,
         title,
         difficulty,
         attribute,
         habit_type AS cadence,
         schedule_days AS scheduleDays,
         is_required AS isRequired
       FROM habits
       WHERE is_active = 1
         AND is_paused = 0
         AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
    ),
    db.getAllAsync<CompletionRow>(
      `SELECT habit_id AS habitId, completion_date AS dateKey
       FROM habit_completions
       WHERE status = 'complete'
         AND completion_date >= ?
         AND completion_date < ?`,
      weekStartKey,
      weekEndExclusive,
    ),
    db.getAllAsync<CheckInRow>(
      `SELECT habit_id AS habitId, checkin_date AS dateKey
       FROM habit_weekly_checkins
       WHERE checkin_date >= ?
         AND checkin_date < ?`,
      weekStartKey,
      weekEndExclusive,
    ),
    db.getAllAsync<MissionClaimRow>(
      `SELECT
         mission_key AS missionKey,
         period_start AS periodStart,
         xp_amount AS xpAmount,
         stat_xp_amount AS statXpAmount,
         energy_amount AS energyAmount,
         gold_amount AS goldAmount
       FROM habit_mission_claims
       WHERE period_start IN (?, ?)`,
      todayKey,
      weekStartKey,
    ),
  ]);

  return {
    todayKey,
    todayDay: getDayFromDateKey(todayKey),
    weekStartKey,
    weekEndKey: addDays(weekStartKey, 6),
    habits,
    weekCompletions: completionRows,
    weekCheckIns: checkInRows,
    claims: new Map(claimRows.map((row) => [claimMapKey(row.missionKey, row.periodStart), row])),
  };
}

export async function getHabitMissionBoard(db: SQLiteDatabase): Promise<HabitMissionBoard> {
  const context = await getMissionContext(db);
  return {
    todayKey: context.todayKey,
    weekStartKey: context.weekStartKey,
    daily: buildDailyMissions(context),
    weekly: buildWeeklyMissions(context),
  };
}

async function getRemainingDailyEnergy(db: SQLiteDatabase, todayKey: string) {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT
       COALESCE((
         SELECT SUM(ee.amount)
         FROM energy_events ee
         JOIN habit_completions hc ON hc.id = ee.completion_id
         WHERE hc.completion_date = ? AND hc.status = 'complete'
       ), 0) +
       COALESCE((
         SELECT SUM(energy_amount)
         FROM boss_quest_reward_events
         WHERE event_date = ?
       ), 0) +
       COALESCE((
         SELECT SUM(energy_amount)
         FROM recovery_quest_events
         WHERE event_date = ?
       ), 0) +
       COALESCE((
         SELECT SUM(energy_amount)
         FROM habit_mission_claims
         WHERE event_date = ?
       ), 0) AS total`,
    todayKey,
    todayKey,
    todayKey,
    todayKey,
  );
  return Math.max(0, MAX_DAILY_DUNGEON_ENERGY - Math.max(0, row?.total ?? 0));
}

export async function claimHabitMission(
  db: SQLiteDatabase,
  missionKey: string,
): Promise<HabitMissionBoard> {
  const claim = async (txn: SQLiteDatabase) => {
    const board = await getHabitMissionBoard(txn);
    const mission = [...board.daily, ...board.weekly].find((candidate) => candidate.key === missionKey);
    if (!mission) throw new Error('Mission is no longer available.');
    if (!mission.complete) throw new Error('Mission is not complete yet.');
    if (mission.claimed) return;

    const eventIdRow = await txn.getFirstAsync<{ eventId: string }>(
      'SELECT lower(hex(randomblob(16))) AS eventId',
    );
    if (!eventIdRow?.eventId) throw new Error('Could not create mission reward.');

    const remainingEnergy = await getRemainingDailyEnergy(txn, board.todayKey);
    const energyAmount = Math.min(mission.reward.energy, remainingEnergy);
    const clientEventId = `mission-${mission.key}-${mission.periodStart}-${eventIdRow.eventId}`;

    await txn.runAsync(
      `INSERT INTO habit_mission_claims (
         client_event_id,
         mission_key,
         cadence,
         period_start,
         period_end,
         event_date,
         title,
         attribute,
         xp_amount,
         stat_xp_amount,
         energy_amount,
         gold_amount
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      clientEventId,
      mission.key,
      mission.cadence,
      mission.periodStart,
      mission.periodEnd,
      board.todayKey,
      mission.title,
      mission.reward.attribute,
      mission.reward.xp,
      mission.reward.statXp,
      energyAmount,
      mission.reward.gold,
    );

    if (mission.reward.gold > 0) {
      await grantGold(
        txn,
        mission.reward.gold,
        'habit_mission',
        `${mission.key}:${mission.periodStart}`,
        `${clientEventId}-gold`,
      );
    }
  };

  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => claim(db));
  } else {
    await db.withExclusiveTransactionAsync(claim);
  }

  return getHabitMissionBoard(db);
}
