import type { SQLiteDatabase } from 'expo-sqlite';

import {
  achievementCatalog,
  type AchievementDefinition,
  type AchievementMetric,
} from '@/src/achievements/achievement-catalog';
import { getActivityStreak } from '@/src/progression/activity-streak';
import { getItemDefinition } from '@/src/inventory/item-catalog';
import { getLevelProgress } from '@/src/progression/player-progression';

export type AchievementProgress = AchievementDefinition & {
  current: number;
  progress: number;
  unlocked: boolean;
};

export type AchievementSummary = {
  unlockedCount: number;
  totalCount: number;
  achievements: AchievementProgress[];
};

type TotalRow = { total: number };
type CombatMetricRow = {
  losses: number;
  lowHealthWins: number;
  flawlessClears: number;
};
type BlacksmithMetricRow = { upgrades: number; salvages: number };
type ItemKeyRow = { itemKey: string };
type UnlockedAchievementRow = { achievementKey: string };

type AchievementMetrics = Record<AchievementMetric, number>;

function toProgress(
  definition: AchievementDefinition,
  metrics: AchievementMetrics,
  permanentlyUnlocked: boolean,
) {
  const metricCurrent = metrics[definition.metric];
  const current = permanentlyUnlocked ? Math.max(metricCurrent, definition.target) : metricCurrent;
  const progress = Math.min(1, Math.max(0, current / definition.target));

  return {
    ...definition,
    current,
    progress,
    unlocked: permanentlyUnlocked || current >= definition.target,
  };
}

export async function getAchievementSummary(
  db: SQLiteDatabase,
): Promise<AchievementSummary> {
  const [
    questRow,
    streak,
    dailyClearRow,
    dungeonClearRow,
    inventoryRow,
    combatRow,
    equipmentEventRow,
    blacksmithRow,
    equippedSlotRow,
    historicalItemRows,
    classesUnlockedRow,
    classMasteryRow,
    recoveryRow,
    xpRow,
  ] = await Promise.all([
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total
       FROM habit_completions
       WHERE status = 'complete'`,
    ),
    getActivityStreak(db),
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total
       FROM daily_clear_chests
       WHERE status = 'claimed'`,
    ),
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total
       FROM dungeon_runs
       WHERE status = 'cleared'`,
    ),
    db.getFirstAsync<TotalRow>(
      `SELECT COALESCE(SUM(quantity), 0) AS total
       FROM inventory_items`,
    ),
    db.getFirstAsync<CombatMetricRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS losses,
         COALESCE(SUM(CASE
           WHEN status = 'cleared'
             AND max_player_hp IS NOT NULL
             AND player_hp_remaining * 5 <= max_player_hp
           THEN 1 ELSE 0 END), 0) AS lowHealthWins,
         COALESCE(SUM(CASE
           WHEN status = 'cleared'
             AND max_player_hp IS NOT NULL
             AND damage_taken = 0
           THEN 1 ELSE 0 END), 0) AS flawlessClears
       FROM dungeon_runs`,
    ),
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total
       FROM equipment_events
       WHERE action = 'equip'`,
    ),
    db.getFirstAsync<BlacksmithMetricRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN action = 'upgrade' THEN 1 ELSE 0 END), 0) AS upgrades,
         COALESCE(SUM(CASE WHEN action = 'salvage' THEN 1 ELSE 0 END), 0) AS salvages
       FROM blacksmith_events`,
    ),
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total
       FROM equipment_loadouts`,
    ),
    db.getAllAsync<ItemKeyRow>(
      `SELECT DISTINCT item_key AS itemKey
       FROM loot_events`,
    ),
    db.getFirstAsync<TotalRow>('SELECT COUNT(*) AS total FROM user_classes'),
    db.getFirstAsync<TotalRow>('SELECT COALESCE(SUM(mastery_xp), 0) AS total FROM user_classes'),
    db.getFirstAsync<TotalRow>(
      'SELECT COUNT(*) AS total FROM recovery_quest_events',
    ),
    db.getFirstAsync<TotalRow>(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM xp_events), 0) +
         COALESCE((SELECT SUM(xp_amount) FROM boss_quest_reward_events), 0) +
         COALESCE((SELECT SUM(xp_amount) FROM recovery_quest_events), 0) AS total`,
    ),
  ]);

  const uniqueRarities = new Set(
    historicalItemRows.map((row) => getItemDefinition(row.itemKey).rarity),
  ).size;

  const metrics: AchievementMetrics = {
    questCompletions: questRow?.total ?? 0,
    activityStreak: streak,
    dailyClears: dailyClearRow?.total ?? 0,
    dungeonClears: dungeonClearRow?.total ?? 0,
    combatLosses: combatRow?.losses ?? 0,
    lowHealthWins: combatRow?.lowHealthWins ?? 0,
    flawlessClears: combatRow?.flawlessClears ?? 0,
    inventoryItems: inventoryRow?.total ?? 0,
    equipmentEquips: equipmentEventRow?.total ?? 0,
    equipmentUpgrades: blacksmithRow?.upgrades ?? 0,
    equipmentSalvages: blacksmithRow?.salvages ?? 0,
    equippedSlots: equippedSlotRow?.total ?? 0,
    uniqueRarities,
    classesUnlocked: classesUnlockedRow?.total ?? 0,
    classMasteryXp: classMasteryRow?.total ?? 0,
    recoveryCompletions: recoveryRow?.total ?? 0,
    playerLevel: getLevelProgress(Math.max(0, xpRow?.total ?? 0)).level,
  };

  const unlockedRows = await db.getAllAsync<UnlockedAchievementRow>(
    'SELECT achievement_key AS achievementKey FROM user_achievements',
  );
  const unlockedKeys = new Set(unlockedRows.map((row) => row.achievementKey));

  for (const definition of achievementCatalog) {
    const current = metrics[definition.metric];
    if (current < definition.target || unlockedKeys.has(definition.key)) continue;
    await db.runAsync(
      `INSERT OR IGNORE INTO user_achievements (achievement_key, progress_at_unlock)
       VALUES (?, ?)`,
      definition.key,
      current,
    );
    unlockedKeys.add(definition.key);
  }

  const achievements = achievementCatalog.map((definition) =>
    toProgress(definition, metrics, unlockedKeys.has(definition.key)),
  );

  return {
    unlockedCount: achievements.filter((achievement) => achievement.unlocked).length,
    totalCount: achievements.length,
    achievements,
  };
}
