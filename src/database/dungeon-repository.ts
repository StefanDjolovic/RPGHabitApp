import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { grantInventoryItem } from '@/src/database/inventory-repository';
import { getDungeonDefinition } from '@/src/dungeon/dungeon-catalog';
import { getItemDefinition, rollDungeonReward } from '@/src/inventory/item-catalog';
import { MAX_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';

export type DungeonRun = {
  id: number;
  dungeonKey: string;
  dungeonName: string;
  difficulty: string;
  status: 'cleared' | 'failed';
  energyCost: number;
  rewardItemKey: string | null;
  rewardQuantity: number | null;
  rewardName: string | null;
  completedAt: string;
};

export type DungeonOverview = {
  energyAvailable: number;
  totalClears: number;
  recentRuns: DungeonRun[];
};

type TotalRow = { total: number };
type DungeonRunRow = Omit<DungeonRun, 'rewardName'>;

async function getDungeonEnergyAvailable(db: SQLiteDatabase) {
  const [earnedRow, spentRow] = await Promise.all([
    db.getFirstAsync<TotalRow>(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM energy_events), 0) +
         COALESCE((SELECT SUM(energy_amount) FROM boss_quest_reward_events), 0) +
         COALESCE((SELECT SUM(energy_amount) FROM recovery_quest_events), 0) AS total`,
    ),
    db.getFirstAsync<TotalRow>('SELECT COALESCE(SUM(energy_cost), 0) AS total FROM dungeon_runs'),
  ]);
  const earnedEnergy = Math.max(0, earnedRow?.total ?? 0);
  const spentEnergy = Math.max(0, spentRow?.total ?? 0);

  return Math.min(MAX_DUNGEON_ENERGY, Math.max(0, earnedEnergy - spentEnergy));
}

export async function getDungeonOverview(db: SQLiteDatabase): Promise<DungeonOverview> {
  const [energyAvailable, clearsRow, runRows] = await Promise.all([
    getDungeonEnergyAvailable(db),
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total
       FROM dungeon_runs
       WHERE status = 'cleared'`,
    ),
    db.getAllAsync<DungeonRunRow>(
      `SELECT
         id,
         dungeon_key AS dungeonKey,
         dungeon_name AS dungeonName,
         difficulty,
         status,
         energy_cost AS energyCost,
         reward_item_key AS rewardItemKey,
         reward_quantity AS rewardQuantity,
         completed_at AS completedAt
       FROM dungeon_runs
       ORDER BY completed_at DESC, id DESC
       LIMIT 5`,
    ),
  ]);

  return {
    energyAvailable,
    totalClears: clearsRow?.total ?? 0,
    recentRuns: runRows.map((run) => ({
      ...run,
      rewardName: run.rewardItemKey ? getItemDefinition(run.rewardItemKey).name : null,
    })),
  };
}

export async function startDungeonRun(
  db: SQLiteDatabase,
  dungeonKey = 'ashen-ruins',
): Promise<DungeonOverview> {
  const dungeon = getDungeonDefinition(dungeonKey);

  const applyRun = async (txn: SQLiteDatabase) => {
    const energyAvailable = await getDungeonEnergyAvailable(txn);

    if (energyAvailable < dungeon.energyCost) {
      throw new Error('Not enough Dungeon Energy.');
    }

    const eventIdRow = await txn.getFirstAsync<{ eventId: string }>(
      'SELECT lower(hex(randomblob(16))) AS eventId',
    );
    const eventId = eventIdRow?.eventId;
    if (!eventId) throw new Error('Could not start dungeon run.');

    const reward = rollDungeonReward(dungeon.key);
    const clientRunId = `${dungeon.key}-${eventId}`;

    await txn.runAsync(
      `INSERT INTO dungeon_runs (
         client_run_id,
         dungeon_key,
         dungeon_name,
         difficulty,
         status,
         energy_cost,
         reward_item_key,
         reward_quantity
       )
       VALUES (?, ?, ?, ?, 'cleared', ?, ?, ?)`,
      clientRunId,
      dungeon.key,
      dungeon.name,
      dungeon.difficulty,
      dungeon.energyCost,
      reward.itemKey,
      reward.quantity,
    );
    await grantInventoryItem(
      txn,
      reward.itemKey,
      reward.quantity,
      'dungeon_run',
      clientRunId,
      `dungeon-loot-${clientRunId}`,
    );
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyRun(db));
  } else {
    await db.withExclusiveTransactionAsync(applyRun);
  }

  return getDungeonOverview(db);
}
