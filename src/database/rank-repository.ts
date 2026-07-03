import type { SQLiteDatabase } from 'expo-sqlite';

import { getPlayerProgress } from '@/src/progression/player-progression';
import {
  getNextRank,
  getRankDefinition,
  type RankDefinition,
} from '@/src/progression/rank-catalog';

export type RankTrialState = {
  currentRank: RankDefinition;
  nextRank: RankDefinition | null;
  playerLevel: number;
  dungeonClears: number;
  levelProgress: number;
  clearProgress: number;
  ready: boolean;
  requiresAwakening: boolean;
};

type TotalRow = { total: number };

export const INITIAL_RANK_TRIAL_STATE: RankTrialState = {
  currentRank: getRankDefinition('unawakened'),
  nextRank: getRankDefinition('e_rank'),
  playerLevel: 1,
  dungeonClears: 0,
  levelProgress: 0.1,
  clearProgress: 1,
  ready: false,
  requiresAwakening: true,
};

export async function getRankTrialState(db: SQLiteDatabase): Promise<RankTrialState> {
  const [progress, clearsRow] = await Promise.all([
    getPlayerProgress(db),
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total FROM dungeon_runs WHERE status = 'cleared'`,
    ),
  ]);
  const currentRank = getRankDefinition(progress.rankKey);
  const nextRank = getNextRank(currentRank.key);
  const dungeonClears = Math.max(0, clearsRow?.total ?? 0);
  const requiresAwakening = currentRank.key === 'unawakened';

  return {
    currentRank,
    nextRank,
    playerLevel: progress.level,
    dungeonClears,
    levelProgress: nextRank
      ? Math.min(1, progress.level / nextRank.minimumLevel)
      : 1,
    clearProgress: nextRank && nextRank.requiredDungeonClears > 0
      ? Math.min(1, dungeonClears / nextRank.requiredDungeonClears)
      : 1,
    ready: Boolean(
      nextRank &&
      !requiresAwakening &&
      progress.level >= nextRank.minimumLevel &&
      dungeonClears >= nextRank.requiredDungeonClears
    ),
    requiresAwakening,
  };
}

export async function completeRankTrial(db: SQLiteDatabase) {
  const complete = async (txn: SQLiteDatabase) => {
    const state = await getRankTrialState(txn);
    if (!state.nextRank) throw new Error('The highest rank has already been achieved.');
    if (state.requiresAwakening) throw new Error('Complete Awakening before entering a Rank-Up Trial.');
    if (!state.ready) throw new Error('The Rank-Up Trial requirements are not complete.');

    const eventRow = await txn.getFirstAsync<{ eventId: string }>(
      'SELECT lower(hex(randomblob(16))) AS eventId',
    );
    if (!eventRow?.eventId) throw new Error('Could not create a Rank-Up event.');

    const update = await txn.runAsync(
      `UPDATE player_rank_state
       SET current_rank_key = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1 AND current_rank_key = ?`,
      state.nextRank.key,
      state.currentRank.key,
    );
    if (update.changes === 0) throw new Error('Rank state changed before the Trial completed.');

    await txn.runAsync(
      `INSERT INTO rank_trial_events (
         client_event_id,
         previous_rank_key,
         next_rank_key,
         player_level,
         dungeon_clears
       ) VALUES (?, ?, ?, ?, ?)`,
      `rank-trial-${eventRow.eventId}`,
      state.currentRank.key,
      state.nextRank.key,
      state.playerLevel,
      state.dungeonClears,
    );
  };

  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => complete(db));
  } else {
    await db.withExclusiveTransactionAsync(complete);
  }
  return getRankTrialState(db);
}

