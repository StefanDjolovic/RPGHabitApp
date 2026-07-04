import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import {
  getLocalDateKey,
  type HabitAttribute,
} from '@/src/database/habit-repository';
import {
  getAttributeProgressionMap,
  type AttributeProgression,
} from '@/src/progression/attribute-progression';
import {
  MAX_DAILY_DUNGEON_ENERGY,
  MAX_DUNGEON_ENERGY,
} from '@/src/progression/dungeon-energy';
import {
  getRankDefinition,
  rankCatalog,
  type RankKey,
} from '@/src/progression/rank-catalog';

export const MAX_LEVEL = 100;
export const STAT_POINTS_PER_LEVEL = 2;
export { MAX_DAILY_DUNGEON_ENERGY, MAX_DUNGEON_ENERGY };

export type PlayerProgress = {
  level: number;
  rankKey: RankKey;
  rankLabel: string;
  rankShort: string;
  totalXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  dungeonEnergy: number;
  todayDungeonEnergy: number;
  attributeXp: Record<HabitAttribute, number>;
  attributeProgression: Record<HabitAttribute, AttributeProgression>;
  manualStatPoints: Record<HabitAttribute, number>;
  totalStatPointsEarned: number;
  spentStatPoints: number;
  availableStatPoints: number;
};

export type StatRecalibrationState = {
  freeCredits: number;
  allocatedPoints: number;
  available: boolean;
  lastReturnedPoints: number;
  lastCompletedAt: string | null;
};

type TotalRow = { total: number };
type AttributeTotalRow = { attribute: HabitAttribute; total: number };

const emptyAttributeXp: Record<HabitAttribute, number> = {
  strength: 0,
  intelligence: 0,
  discipline: 0,
  vitality: 0,
  creativity: 0,
};

export const INITIAL_PLAYER_PROGRESS: PlayerProgress = {
  level: 1,
  rankKey: 'unawakened',
  rankLabel: 'Unawakened',
  rankShort: 'U',
  totalXp: 0,
  xpIntoLevel: 0,
  xpForNextLevel: 100,
  dungeonEnergy: 0,
  todayDungeonEnergy: 0,
  attributeXp: { ...emptyAttributeXp },
  attributeProgression: getAttributeProgressionMap(emptyAttributeXp),
  manualStatPoints: { ...emptyAttributeXp },
  totalStatPointsEarned: STAT_POINTS_PER_LEVEL,
  spentStatPoints: 0,
  availableStatPoints: STAT_POINTS_PER_LEVEL,
};

export function xpRequiredForNextLevel(level: number) {
  if (level >= MAX_LEVEL) return 0;
  if (level < 10) return 100 + 25 * (level - 1);
  if (level < 25) return 350 + 35 * (level - 10);
  if (level < 50) return 900 + 60 * (level - 25);
  if (level < 75) return 2500 + 110 * (level - 50);
  return 5500 + 180 * (level - 75);
}

export function getLevelProgress(totalXp: number) {
  let level = 1;
  let xpIntoLevel = Math.max(0, totalXp);

  while (level < MAX_LEVEL) {
    const required = xpRequiredForNextLevel(level);
    if (xpIntoLevel < required) break;
    xpIntoLevel -= required;
    level += 1;
  }

  return {
    level,
    xpIntoLevel: level === MAX_LEVEL ? 0 : xpIntoLevel,
    xpForNextLevel: xpRequiredForNextLevel(level),
  };
}

export function getRankForLevel(level: number) {
  const safeLevel = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  const rank = [...rankCatalog]
    .reverse()
    .find((definition) => safeLevel >= definition.minimumLevel) ?? rankCatalog[0];
  return { rankLabel: rank.label, rankShort: rank.shortLabel };
}

export async function getPlayerProgress(db: SQLiteDatabase): Promise<PlayerProgress> {
  const todayKey = getLocalDateKey();
  const [
    xpRow,
    rankRow,
    energyRow,
    spentEnergyRow,
    todayEnergyRow,
    attributeRows,
    manualStatRows,
    spentStatRow,
  ] = await Promise.all([
    db.getFirstAsync<TotalRow>(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM xp_events), 0) +
         COALESCE((SELECT SUM(xp_amount) FROM boss_quest_reward_events), 0) +
         COALESCE((SELECT SUM(xp_amount) FROM recovery_quest_events), 0) AS total`,
    ),
    db.getFirstAsync<{ rankKey: string }>(
      'SELECT current_rank_key AS rankKey FROM player_rank_state WHERE id = 1',
    ),
    db.getFirstAsync<TotalRow>(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM energy_events), 0) +
         COALESCE((SELECT SUM(energy_amount) FROM boss_quest_reward_events), 0) +
         COALESCE((SELECT SUM(energy_amount) FROM recovery_quest_events), 0) AS total`,
    ),
    db.getFirstAsync<TotalRow>('SELECT COALESCE(SUM(energy_cost), 0) AS total FROM dungeon_runs'),
    db.getFirstAsync<TotalRow>(
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
         ), 0) AS total`,
      todayKey,
      todayKey,
      todayKey,
    ),
    db.getAllAsync<AttributeTotalRow>(
      `SELECT attribute, COALESCE(SUM(amount), 0) AS total
       FROM (
         SELECT attribute, amount
         FROM attribute_events
         UNION ALL
         SELECT attribute, stat_xp_amount AS amount
         FROM boss_quest_reward_events
         UNION ALL
         SELECT attribute, stat_xp_amount AS amount
         FROM recovery_quest_events
       )
       GROUP BY attribute`,
    ),
    db.getAllAsync<AttributeTotalRow>(
      `SELECT attribute, COALESCE(SUM(amount), 0) AS total
       FROM stat_point_allocations
       WHERE id > COALESCE((
         SELECT MAX(allocation_cutoff_id)
         FROM stat_recalibration_events
       ), 0)
       GROUP BY attribute`,
    ),
    db.getFirstAsync<TotalRow>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM stat_point_allocations
       WHERE id > COALESCE((
         SELECT MAX(allocation_cutoff_id)
         FROM stat_recalibration_events
       ), 0)`,
    ),
  ]);

  const totalXp = Math.max(0, xpRow?.total ?? 0);
  const earnedDungeonEnergy = Math.max(0, energyRow?.total ?? 0);
  const spentDungeonEnergy = Math.max(0, spentEnergyRow?.total ?? 0);
  const dungeonEnergy = Math.min(
    MAX_DUNGEON_ENERGY,
    Math.max(0, earnedDungeonEnergy - spentDungeonEnergy),
  );
  const todayDungeonEnergy = Math.min(
    MAX_DAILY_DUNGEON_ENERGY,
    Math.max(0, todayEnergyRow?.total ?? 0),
  );
  const levelProgress = getLevelProgress(totalXp);
  const rank = getRankDefinition(rankRow?.rankKey ?? 'unawakened');
  const attributeXp = { ...emptyAttributeXp };
  const manualStatPoints = { ...emptyAttributeXp };
  const totalStatPointsEarned = levelProgress.level * STAT_POINTS_PER_LEVEL;
  const spentStatPoints = Math.max(0, spentStatRow?.total ?? 0);
  const availableStatPoints = Math.max(0, totalStatPointsEarned - spentStatPoints);

  for (const row of attributeRows) {
    attributeXp[row.attribute] = Math.max(0, row.total);
  }

  for (const row of manualStatRows) {
    manualStatPoints[row.attribute] = Math.max(0, row.total);
  }

  const attributeProgression = getAttributeProgressionMap(attributeXp);

  return {
    ...levelProgress,
    rankKey: rank.key,
    rankLabel: rank.label,
    rankShort: rank.shortLabel,
    totalXp,
    dungeonEnergy,
    todayDungeonEnergy,
    attributeXp,
    attributeProgression,
    manualStatPoints,
    totalStatPointsEarned,
    spentStatPoints,
    availableStatPoints,
  };
}

export async function allocateStatPoint(
  db: SQLiteDatabase,
  attribute: HabitAttribute,
): Promise<PlayerProgress> {
  const applyAllocation = async (txn: SQLiteDatabase) => {
    const progress = await getPlayerProgress(txn);

    if (progress.availableStatPoints <= 0) {
      throw new Error('No Stat Points available.');
    }

    await txn.runAsync(
      `INSERT INTO stat_point_allocations (attribute, amount)
       VALUES (?, 1)`,
      attribute,
    );
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyAllocation(db));
  } else {
    await db.withExclusiveTransactionAsync(applyAllocation);
  }

  return getPlayerProgress(db);
}

export async function getStatRecalibrationState(
  db: SQLiteDatabase,
): Promise<StatRecalibrationState> {
  const [progress, creditRow, lastEvent] = await Promise.all([
    getPlayerProgress(db),
    db.getFirstAsync<{ freeCredits: number }>(
      `SELECT free_credits AS freeCredits
       FROM player_recalibration_state
       WHERE id = 1`,
    ),
    db.getFirstAsync<{ returnedPoints: number; completedAt: string }>(
      `SELECT returned_points AS returnedPoints, completed_at AS completedAt
       FROM stat_recalibration_events
       ORDER BY id DESC
       LIMIT 1`,
    ),
  ]);
  const freeCredits = Math.max(0, creditRow?.freeCredits ?? 0);
  return {
    freeCredits,
    allocatedPoints: progress.spentStatPoints,
    available: freeCredits > 0 && progress.spentStatPoints > 0,
    lastReturnedPoints: Math.max(0, lastEvent?.returnedPoints ?? 0),
    lastCompletedAt: lastEvent?.completedAt ?? null,
  };
}

export async function recalibrateManualStatPoints(db: SQLiteDatabase) {
  const recalibrate = async (txn: SQLiteDatabase) => {
    const [creditRow, allocationRow, eventIdRow] = await Promise.all([
      txn.getFirstAsync<{ freeCredits: number }>(
        `SELECT free_credits AS freeCredits
         FROM player_recalibration_state
         WHERE id = 1`,
      ),
      txn.getFirstAsync<{ cutoffId: number; total: number }>(
        `SELECT MAX(id) AS cutoffId, COALESCE(SUM(amount), 0) AS total
         FROM stat_point_allocations
         WHERE id > COALESCE((
           SELECT MAX(allocation_cutoff_id)
           FROM stat_recalibration_events
         ), 0)`,
      ),
      txn.getFirstAsync<{ eventId: string }>(
        'SELECT lower(hex(randomblob(16))) AS eventId',
      ),
    ]);
    if ((creditRow?.freeCredits ?? 0) <= 0) {
      throw new Error('A class change is required for a free Stat Recalibration.');
    }
    if ((allocationRow?.total ?? 0) <= 0 || !allocationRow?.cutoffId) {
      throw new Error('There are no manually allocated Stat Points to return.');
    }
    if (!eventIdRow?.eventId) throw new Error('Could not create a recalibration event.');

    await txn.runAsync(
      `INSERT INTO stat_recalibration_events (
         client_event_id,
         allocation_cutoff_id,
         returned_points,
         source
       ) VALUES (?, ?, ?, 'class_change')`,
      `stat-recalibration-${eventIdRow.eventId}`,
      allocationRow.cutoffId,
      allocationRow.total,
    );
    await txn.runAsync(
      `UPDATE player_recalibration_state
       SET free_credits = free_credits - 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1 AND free_credits > 0`,
    );
  };

  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => recalibrate(db));
  } else {
    await db.withExclusiveTransactionAsync(recalibrate);
  }

  return {
    progress: await getPlayerProgress(db),
    state: await getStatRecalibrationState(db),
  };
}
