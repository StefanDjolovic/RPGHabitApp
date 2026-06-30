import type { SQLiteDatabase } from 'expo-sqlite';

import {
  achievementCatalog,
  type AchievementDefinition,
  type AchievementMetric,
} from '@/src/achievements/achievement-catalog';
import { getActivityStreak } from '@/src/progression/activity-streak';
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

type AchievementMetrics = Record<AchievementMetric, number>;

function toProgress(definition: AchievementDefinition, metrics: AchievementMetrics) {
  const current = metrics[definition.metric];
  const progress = Math.min(1, Math.max(0, current / definition.target));

  return {
    ...definition,
    current,
    progress,
    unlocked: current >= definition.target,
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
    db.getFirstAsync<TotalRow>('SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events'),
  ]);

  const metrics: AchievementMetrics = {
    questCompletions: questRow?.total ?? 0,
    activityStreak: streak,
    dailyClears: dailyClearRow?.total ?? 0,
    dungeonClears: dungeonClearRow?.total ?? 0,
    inventoryItems: inventoryRow?.total ?? 0,
    playerLevel: getLevelProgress(Math.max(0, xpRow?.total ?? 0)).level,
  };
  const achievements = achievementCatalog.map((definition) => toProgress(definition, metrics));

  return {
    unlockedCount: achievements.filter((achievement) => achievement.unlocked).length,
    totalCount: achievements.length,
    achievements,
  };
}
