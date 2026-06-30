import type { SQLiteDatabase } from 'expo-sqlite';

import type { HabitAttribute } from '@/src/database/habit-repository';
import {
  MAX_DAILY_DUNGEON_ENERGY,
  MAX_DUNGEON_ENERGY,
} from '@/src/progression/dungeon-energy';

export const MAX_LEVEL = 100;
export { MAX_DAILY_DUNGEON_ENERGY, MAX_DUNGEON_ENERGY };

export type PlayerProgress = {
  level: number;
  rankLabel: string;
  rankShort: string;
  totalXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  dungeonEnergy: number;
  todayDungeonEnergy: number;
  attributeXp: Record<HabitAttribute, number>;
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
  rankLabel: 'Unawakened',
  rankShort: 'U',
  totalXp: 0,
  xpIntoLevel: 0,
  xpForNextLevel: 100,
  dungeonEnergy: 0,
  todayDungeonEnergy: 0,
  attributeXp: { ...emptyAttributeXp },
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
  if (level < 10) return { rankLabel: 'Unawakened', rankShort: 'U' };
  if (level < 20) return { rankLabel: 'E Rank', rankShort: 'E' };
  if (level < 30) return { rankLabel: 'D Rank', rankShort: 'D' };
  if (level < 40) return { rankLabel: 'C Rank', rankShort: 'C' };
  if (level < 50) return { rankLabel: 'B Rank', rankShort: 'B' };
  if (level < 65) return { rankLabel: 'A Rank', rankShort: 'A' };
  if (level < 80) return { rankLabel: 'S Rank', rankShort: 'S' };
  if (level < 100) return { rankLabel: 'Ascendant', rankShort: 'A+' };
  return { rankLabel: 'Transcendent', rankShort: 'T' };
}

export async function getPlayerProgress(db: SQLiteDatabase): Promise<PlayerProgress> {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  const [xpRow, energyRow, spentEnergyRow, todayEnergyRow, attributeRows] = await Promise.all([
    db.getFirstAsync<TotalRow>('SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events'),
    db.getFirstAsync<TotalRow>('SELECT COALESCE(SUM(amount), 0) AS total FROM energy_events'),
    db.getFirstAsync<TotalRow>('SELECT COALESCE(SUM(energy_cost), 0) AS total FROM dungeon_runs'),
    db.getFirstAsync<TotalRow>(
      `SELECT COALESCE(SUM(ee.amount), 0) AS total
       FROM energy_events ee
       JOIN habit_completions hc ON hc.id = ee.completion_id
       WHERE hc.completion_date = ? AND hc.status = 'complete'`,
      todayKey,
    ),
    db.getAllAsync<AttributeTotalRow>(
      `SELECT attribute, COALESCE(SUM(amount), 0) AS total
       FROM attribute_events
       GROUP BY attribute`,
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
  const rank = getRankForLevel(levelProgress.level);
  const attributeXp = { ...emptyAttributeXp };

  for (const row of attributeRows) {
    attributeXp[row.attribute] = Math.max(0, row.total);
  }

  return {
    ...levelProgress,
    ...rank,
    totalXp,
    dungeonEnergy,
    todayDungeonEnergy,
    attributeXp,
  };
}
