import type { SQLiteDatabase } from 'expo-sqlite';

import {
  consumeInventoryItem,
  getEquippedCombatBonuses,
  grantGold,
  grantInventoryItem,
} from '@/src/database/inventory-repository';
import { getDungeonDefinition } from '@/src/dungeon/dungeon-catalog';
import {
  createCombatSnapshot,
  getEnemyIntent,
  getUnawakenedCombatStats,
  resolveCombatAction,
  type CombatAction,
  type CombatLogEntry,
  type CombatSnapshot,
  type EnemyIntent,
  type UnawakenedCombatStats,
} from '@/src/dungeon/unawakened-combat';
import { getItemDefinition, rollDungeonReward } from '@/src/inventory/item-catalog';
import { MAX_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';
import { getPlayerProgress } from '@/src/progression/player-progression';

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
  goldEarned: number;
  completedAt: string;
};

export type DungeonOverview = {
  energyAvailable: number;
  entryCost: number;
  isTrialEntry: boolean;
  hasActiveBattle: boolean;
  totalClears: number;
  recentRuns: DungeonRun[];
};

export type DungeonBattle = {
  dungeonKey: string;
  dungeonName: string;
  difficulty: string;
  bossName: string;
  energyCost: number;
  isTrialEntry: boolean;
  snapshot: CombatSnapshot;
  stats: UnawakenedCombatStats;
  enemyIntent: EnemyIntent;
  potionCount: number;
};

export type DungeonBattleActionResult = {
  outcome: 'active' | 'cleared' | 'failed' | 'fled';
  battle: DungeonBattle | null;
  run: DungeonRun | null;
};

type TotalRow = { total: number };
type DungeonRunRow = Omit<DungeonRun, 'rewardName'>;

type DungeonBattleSessionRow = {
  clientRunId: string;
  dungeonKey: string;
  dungeonName: string;
  difficulty: string;
  energyCost: number;
  playerHp: number;
  enemyHp: number;
  maxPlayerHp: number;
  maxEnemyHp: number;
  basicDamage: number;
  skillDamage: number;
  potionHealing: number;
  enemyPower: number;
  defense: number;
  damageTaken: number;
  turnNumber: number;
  skillCooldown: number;
  combatLog: string;
  startedAt: string;
};

const sessionSelect = `SELECT
  client_run_id AS clientRunId,
  dungeon_key AS dungeonKey,
  dungeon_name AS dungeonName,
  difficulty,
  energy_cost AS energyCost,
  player_hp AS playerHp,
  enemy_hp AS enemyHp,
  max_player_hp AS maxPlayerHp,
  max_enemy_hp AS maxEnemyHp,
  basic_damage AS basicDamage,
  skill_damage AS skillDamage,
  potion_healing AS potionHealing,
  enemy_power AS enemyPower,
  equipment_defense AS defense,
  damage_taken AS damageTaken,
  turn_number AS turnNumber,
  skill_cooldown AS skillCooldown,
  combat_log AS combatLog,
  started_at AS startedAt
FROM dungeon_battle_sessions
WHERE id = 1`;

function parseCombatLog(value: string): CombatLogEntry[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as CombatLogEntry[]) : [];
  } catch {
    return [];
  }
}

function getSessionStats(row: DungeonBattleSessionRow): UnawakenedCombatStats {
  return {
    maxPlayerHp: row.maxPlayerHp,
    maxEnemyHp: row.maxEnemyHp,
    basicDamage: row.basicDamage,
    skillDamage: row.skillDamage,
    potionHealing: row.potionHealing,
    enemyPower: row.enemyPower,
    defense: row.defense,
  };
}

function getSessionSnapshot(row: DungeonBattleSessionRow): CombatSnapshot {
  return {
    playerHp: row.playerHp,
    enemyHp: row.enemyHp,
    turnNumber: row.turnNumber,
    skillCooldown: row.skillCooldown,
    log: parseCombatLog(row.combatLog),
  };
}

async function getDungeonEnergyAvailable(db: SQLiteDatabase) {
  const [earnedRow, spentRow, reservedRow] = await Promise.all([
    db.getFirstAsync<TotalRow>(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM energy_events), 0) +
         COALESCE((SELECT SUM(energy_amount) FROM boss_quest_reward_events), 0) +
         COALESCE((SELECT SUM(energy_amount) FROM recovery_quest_events), 0) AS total`,
    ),
    db.getFirstAsync<TotalRow>('SELECT COALESCE(SUM(energy_cost), 0) AS total FROM dungeon_runs'),
    db.getFirstAsync<TotalRow>(
      'SELECT COALESCE(SUM(energy_cost), 0) AS total FROM dungeon_battle_sessions',
    ),
  ]);
  const earnedEnergy = Math.max(0, earnedRow?.total ?? 0);
  const spentEnergy = Math.max(0, spentRow?.total ?? 0);
  const reservedEnergy = Math.max(0, reservedRow?.total ?? 0);

  return Math.min(
    MAX_DUNGEON_ENERGY,
    Math.max(0, earnedEnergy - spentEnergy - reservedEnergy),
  );
}

function toDungeonRun(row: DungeonRunRow): DungeonRun {
  return {
    ...row,
    rewardName: row.rewardItemKey ? getItemDefinition(row.rewardItemKey).name : null,
  };
}

async function getRunById(db: SQLiteDatabase, runId: number) {
  const row = await db.getFirstAsync<DungeonRunRow>(
    `SELECT
       id,
       dungeon_key AS dungeonKey,
       dungeon_name AS dungeonName,
       difficulty,
       status,
       energy_cost AS energyCost,
       reward_item_key AS rewardItemKey,
       reward_quantity AS rewardQuantity,
       COALESCE((
         SELECT SUM(ge.amount)
         FROM gold_events ge
         WHERE ge.reason = 'dungeon_clear'
           AND ge.source_ref = dr.client_run_id
       ), 0) AS goldEarned,
       completed_at AS completedAt
     FROM dungeon_runs dr
     WHERE dr.id = ?`,
    runId,
  );
  return row ? toDungeonRun(row) : null;
}

export async function getDungeonOverview(db: SQLiteDatabase): Promise<DungeonOverview> {
  const dungeon = getDungeonDefinition('ashen-ruins');
  const [energyAvailable, clearsRow, attemptsRow, activeRow, runRows] = await Promise.all([
    getDungeonEnergyAvailable(db),
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total
       FROM dungeon_runs
       WHERE status = 'cleared'`,
    ),
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total
       FROM dungeon_runs
       WHERE dungeon_key = ?`,
      dungeon.key,
    ),
    db.getFirstAsync<{ energyCost: number }>(
      'SELECT energy_cost AS energyCost FROM dungeon_battle_sessions WHERE id = 1',
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
         COALESCE((
           SELECT SUM(ge.amount)
           FROM gold_events ge
           WHERE ge.reason = 'dungeon_clear'
             AND ge.source_ref = dr.client_run_id
         ), 0) AS goldEarned,
         completed_at AS completedAt
       FROM dungeon_runs dr
       ORDER BY dr.completed_at DESC, dr.id DESC
       LIMIT 5`,
    ),
  ]);
  const hasActiveBattle = activeRow !== null;
  const isTrialEntry = !hasActiveBattle && (attemptsRow?.total ?? 0) === 0;

  return {
    energyAvailable,
    entryCost: activeRow?.energyCost ?? (isTrialEntry ? 0 : dungeon.energyCost),
    isTrialEntry,
    hasActiveBattle,
    totalClears: clearsRow?.total ?? 0,
    recentRuns: runRows.map(toDungeonRun),
  };
}

export async function getActiveDungeonBattle(
  db: SQLiteDatabase,
): Promise<DungeonBattle | null> {
  const row = await db.getFirstAsync<DungeonBattleSessionRow>(sessionSelect);
  if (!row) return null;

  const potionRow = await db.getFirstAsync<{ quantity: number }>(
    `SELECT quantity
     FROM inventory_items
     WHERE item_key = 'minor-health-potion'`,
  );
  const stats = getSessionStats(row);
  const snapshot = getSessionSnapshot(row);

  return {
    dungeonKey: row.dungeonKey,
    dungeonName: row.dungeonName,
    difficulty: row.difficulty,
    bossName: getDungeonDefinition(row.dungeonKey).bossName,
    energyCost: row.energyCost,
    isTrialEntry: row.energyCost === 0,
    snapshot,
    stats,
    enemyIntent: getEnemyIntent(snapshot.turnNumber, stats.enemyPower),
    potionCount: Math.max(0, potionRow?.quantity ?? 0),
  };
}

export async function beginDungeonBattle(
  db: SQLiteDatabase,
  dungeonKey = 'ashen-ruins',
): Promise<DungeonBattle> {
  const existingBattle = await getActiveDungeonBattle(db);
  if (existingBattle) return existingBattle;

  const dungeon = getDungeonDefinition(dungeonKey);
  const createSession = async (txn: SQLiteDatabase) => {
    const [energyAvailable, attemptsRow, progress, equipmentBonuses, eventIdRow] =
      await Promise.all([
      getDungeonEnergyAvailable(txn),
      txn.getFirstAsync<TotalRow>(
        'SELECT COUNT(*) AS total FROM dungeon_runs WHERE dungeon_key = ?',
        dungeon.key,
      ),
      getPlayerProgress(txn),
      getEquippedCombatBonuses(txn),
      txn.getFirstAsync<{ eventId: string }>('SELECT lower(hex(randomblob(16))) AS eventId'),
    ]);
    const isTrialEntry = (attemptsRow?.total ?? 0) === 0;
    const energyCost = isTrialEntry ? 0 : dungeon.energyCost;
    const eventId = eventIdRow?.eventId;

    if (energyAvailable < energyCost) throw new Error('Not enough Dungeon Energy.');
    if (!eventId) throw new Error('Could not create a dungeon battle.');

    const stats = getUnawakenedCombatStats(progress, equipmentBonuses);
    const snapshot = createCombatSnapshot(stats);
    await txn.runAsync(
      `INSERT INTO dungeon_battle_sessions (
         id,
         client_run_id,
         dungeon_key,
         dungeon_name,
         difficulty,
         energy_cost,
         player_hp,
         enemy_hp,
         max_player_hp,
         max_enemy_hp,
         basic_damage,
         skill_damage,
         potion_healing,
         enemy_power,
         equipment_defense,
         turn_number,
         skill_cooldown,
         combat_log
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `${dungeon.key}-${eventId}`,
      dungeon.key,
      dungeon.name,
      dungeon.difficulty,
      energyCost,
      snapshot.playerHp,
      snapshot.enemyHp,
      stats.maxPlayerHp,
      stats.maxEnemyHp,
      stats.basicDamage,
      stats.skillDamage,
      stats.potionHealing,
      stats.enemyPower,
      stats.defense,
      snapshot.turnNumber,
      snapshot.skillCooldown,
      JSON.stringify(snapshot.log),
    );
  };

  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => createSession(db));
  } else {
    await db.withExclusiveTransactionAsync(createSession);
  }

  const battle = await getActiveDungeonBattle(db);
  if (!battle) throw new Error('Dungeon battle was not created.');
  return battle;
}

async function finalizeDungeonBattle(
  txn: SQLiteDatabase,
  row: DungeonBattleSessionRow,
  status: DungeonRun['status'],
) {
  const reward = status === 'cleared' ? rollDungeonReward(row.dungeonKey) : null;
  const result = await txn.runAsync(
    `INSERT INTO dungeon_runs (
       client_run_id,
       dungeon_key,
       dungeon_name,
       difficulty,
       status,
       energy_cost,
         reward_item_key,
         reward_quantity,
         started_at,
         player_hp_remaining,
         max_player_hp,
         damage_taken,
         turns_taken
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.clientRunId,
    row.dungeonKey,
    row.dungeonName,
    row.difficulty,
    status,
    row.energyCost,
    reward?.itemKey ?? null,
    reward?.quantity ?? null,
    row.startedAt,
    row.playerHp,
    row.maxPlayerHp,
    row.damageTaken,
    row.turnNumber,
  );

  if (reward) {
    await grantInventoryItem(
      txn,
      reward.itemKey,
      reward.quantity,
      'dungeon_run',
      row.clientRunId,
      `dungeon-loot-${row.clientRunId}`,
    );
    await grantGold(
      txn,
      12,
      'dungeon_clear',
      row.clientRunId,
      `dungeon-gold-${row.clientRunId}`,
    );
  }

  await txn.runAsync('DELETE FROM dungeon_battle_sessions WHERE id = 1');
  return result.lastInsertRowId;
}

export async function performDungeonBattleAction(
  db: SQLiteDatabase,
  action: CombatAction,
): Promise<DungeonBattleActionResult> {
  let outcome: DungeonBattleActionResult['outcome'] = 'active';
  let completedRunId: number | null = null;

  const applyAction = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<DungeonBattleSessionRow>(sessionSelect);
    if (!row) throw new Error('No active dungeon battle.');

    const stats = getSessionStats(row);
    const snapshot = getSessionSnapshot(row);
    if (action === 'item') {
      if (snapshot.playerHp >= stats.maxPlayerHp) throw new Error('Health is already full.');
      await consumeInventoryItem(txn, 'minor-health-potion');
    }

    const resolution = resolveCombatAction(snapshot, stats, action);
    outcome = resolution.outcome;

    if (resolution.outcome === 'active') {
      await txn.runAsync(
        `UPDATE dungeon_battle_sessions
         SET player_hp = ?,
             enemy_hp = ?,
             turn_number = ?,
             skill_cooldown = ?,
             damage_taken = damage_taken + ?,
             combat_log = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        resolution.snapshot.playerHp,
        resolution.snapshot.enemyHp,
        resolution.snapshot.turnNumber,
        resolution.snapshot.skillCooldown,
        resolution.enemyDamage,
        JSON.stringify(resolution.snapshot.log),
      );
      return;
    }

    completedRunId = await finalizeDungeonBattle(
      txn,
      {
        ...row,
        playerHp: resolution.snapshot.playerHp,
        enemyHp: resolution.snapshot.enemyHp,
        turnNumber: resolution.snapshot.turnNumber,
        skillCooldown: resolution.snapshot.skillCooldown,
        damageTaken: row.damageTaken + resolution.enemyDamage,
      },
      resolution.outcome === 'cleared' ? 'cleared' : 'failed',
    );
  };

  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => applyAction(db));
  } else {
    await db.withExclusiveTransactionAsync(applyAction);
  }

  const run = completedRunId === null ? null : await getRunById(db, completedRunId);
  return {
    outcome,
    battle: outcome === 'active' ? await getActiveDungeonBattle(db) : null,
    run,
  };
}

export async function fleeDungeonBattle(db: SQLiteDatabase): Promise<DungeonBattleActionResult> {
  let completedRunId: number | null = null;
  const flee = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<DungeonBattleSessionRow>(sessionSelect);
    if (!row) throw new Error('No active dungeon battle.');
    completedRunId = await finalizeDungeonBattle(txn, row, 'failed');
  };

  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => flee(db));
  } else {
    await db.withExclusiveTransactionAsync(flee);
  }

  return {
    outcome: 'fled',
    battle: null,
    run: completedRunId === null ? null : await getRunById(db, completedRunId),
  };
}
