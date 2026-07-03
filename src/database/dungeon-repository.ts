import type { SQLiteDatabase } from 'expo-sqlite';

import { getStarterClass, isStarterClassKey } from '@/src/classes/class-catalog';
import { grantClassMastery } from '@/src/database/class-repository';
import {
  consumeInventoryItem,
  getEquippedCombatBonuses,
  grantGold,
  grantInventoryItem,
} from '@/src/database/inventory-repository';
import {
  dungeons,
  getDungeonDefinition,
  type DungeonDefinition,
} from '@/src/dungeon/dungeon-catalog';
import {
  getClassCombatProfile,
  type ClassCombatProfile,
} from '@/src/dungeon/class-combat';
import {
  combatStatusCatalog,
  type CombatStatus,
  type CombatStatusType,
} from '@/src/dungeon/combat-statuses';
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
import { getRankOrder } from '@/src/progression/rank-catalog';

export type DungeonPath = 'safe' | 'risky';
export type DungeonRoomType = 'combat' | 'path_choice' | 'event' | 'elite' | 'boss_ready' | 'boss';

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
  classKey: string;
  className: string;
  masteryXpEarned: number;
  routeKey: DungeonPath | null;
  roomsCleared: number;
  interimGold: number;
  completedAt: string;
};

export type DungeonOverview = {
  energyAvailable: number;
  entryCost: number;
  isTrialEntry: boolean;
  hasActiveBattle: boolean;
  totalClears: number;
  recentRuns: DungeonRun[];
  dungeons: DungeonAvailability[];
  activeDungeonKey: string | null;
};

export type DungeonAvailability = {
  dungeon: DungeonDefinition;
  unlocked: boolean;
  isTrialEntry: boolean;
  entryCost: number;
  attempts: number;
  active: boolean;
};

export type DungeonBattle = {
  dungeonKey: string;
  dungeonName: string;
  difficulty: string;
  bossName: string;
  dungeon: DungeonDefinition;
  enemyName: string;
  roomIndex: number;
  roomType: DungeonRoomType;
  routeKey: DungeonPath | null;
  roomsCleared: number;
  interimGold: number;
  classKey: string;
  className: string;
  combatProfile: ClassCombatProfile;
  activeSkillProfiles: ClassCombatProfile[];
  passiveSkillKeys: string[];
  energyCost: number;
  isTrialEntry: boolean;
  snapshot: CombatSnapshot;
  stats: UnawakenedCombatStats;
  enemyIntent: EnemyIntent;
  potionCount: number;
};

export type DungeonBattleActionResult = {
  outcome: 'active' | 'path-choice' | 'room-cleared' | 'cleared' | 'failed' | 'fled';
  battle: DungeonBattle | null;
  run: DungeonRun | null;
};

type TotalRow = { total: number };
type DungeonAttemptRow = { dungeonKey: string; total: number };
type DungeonRunRow = Omit<DungeonRun, 'rewardName' | 'className'>;

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
  classResource: number;
  activeSkillKeys: string;
  passiveSkillKeys: string;
  playerStatuses: string;
  enemyStatuses: string;
  combatLog: string;
  startedAt: string;
  classKey: string;
  roomIndex: number;
  roomType: DungeonRoomType;
  routeKey: DungeonPath | null;
  roomsCleared: number;
  enemyName: string;
  bossMaxEnemyHp: number;
  turnsElapsed: number;
  interimGold: number;
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
  started_at AS startedAt,
  class_key AS classKey,
  class_resource AS classResource,
  active_skill_keys AS activeSkillKeys,
  passive_skill_keys AS passiveSkillKeys,
  player_statuses AS playerStatuses,
  enemy_statuses AS enemyStatuses,
  room_index AS roomIndex,
  room_type AS roomType,
  route_key AS routeKey,
  rooms_cleared AS roomsCleared,
  enemy_name AS enemyName,
  boss_max_enemy_hp AS bossMaxEnemyHp,
  turns_elapsed AS turnsElapsed,
  interim_gold AS interimGold
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

function parseCombatStatuses(value: string): CombatStatus[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const candidate = entry as Partial<CombatStatus>;
      if (
        typeof candidate.type !== 'string' ||
        !(candidate.type in combatStatusCatalog) ||
        typeof candidate.turns !== 'number' ||
        !Number.isFinite(candidate.turns) ||
        typeof candidate.potency !== 'number' ||
        !Number.isFinite(candidate.potency)
      ) {
        return [];
      }
      return [{
        type: candidate.type as CombatStatusType,
        turns: Math.max(1, Math.floor(candidate.turns)),
        potency: Math.max(0, Math.floor(candidate.potency)),
      }];
    });
  } catch {
    return [];
  }
}

function parseSkillKeys(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function getSessionSkillKeys(
  value: string,
  classKey: string,
  type: 'active' | 'passive',
) {
  const storedKeys = parseSkillKeys(value);
  if (value !== '' || !isStarterClassKey(classKey)) return storedKeys;

  return getStarterClass(classKey).starterSkills
    .filter((skill) => skill.type === type && skill.equippedByDefault)
    .sort((first, second) => (first.slotOrder ?? 99) - (second.slotOrder ?? 99))
    .map((skill) => skill.key);
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
    classResource: row.classResource,
    playerStatuses: parseCombatStatuses(row.playerStatuses),
    enemyStatuses: parseCombatStatuses(row.enemyStatuses),
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
  const profile = getClassCombatProfile(row.classKey);
  return {
    ...row,
    rewardName: row.rewardItemKey ? getItemDefinition(row.rewardItemKey).name : null,
    className: profile.className,
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
       class_key AS classKey,
       mastery_xp_earned AS masteryXpEarned,
       route_key AS routeKey,
       rooms_cleared AS roomsCleared,
       interim_gold AS interimGold,
       COALESCE((
         SELECT SUM(ge.amount)
         FROM gold_events ge
         WHERE ge.source_ref = dr.client_run_id
       ), 0) AS goldEarned,
       completed_at AS completedAt
     FROM dungeon_runs dr
     WHERE dr.id = ?`,
    runId,
  );
  return row ? toDungeonRun(row) : null;
}

export async function getDungeonOverview(db: SQLiteDatabase): Promise<DungeonOverview> {
  const firstDungeon = getDungeonDefinition('ashen-ruins');
  const [energyAvailable, clearsRow, attemptRows, activeRow, runRows, rankRow] = await Promise.all([
    getDungeonEnergyAvailable(db),
    db.getFirstAsync<TotalRow>(
      `SELECT COUNT(*) AS total
       FROM dungeon_runs
       WHERE status = 'cleared'`,
    ),
    db.getAllAsync<DungeonAttemptRow>(
      `SELECT dungeon_key AS dungeonKey, COUNT(*) AS total
       FROM dungeon_runs
       GROUP BY dungeon_key`,
    ),
    db.getFirstAsync<{ dungeonKey: string; energyCost: number }>(
      `SELECT dungeon_key AS dungeonKey, energy_cost AS energyCost
       FROM dungeon_battle_sessions WHERE id = 1`,
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
         class_key AS classKey,
         mastery_xp_earned AS masteryXpEarned,
         route_key AS routeKey,
         rooms_cleared AS roomsCleared,
         interim_gold AS interimGold,
         COALESCE((
           SELECT SUM(ge.amount)
           FROM gold_events ge
           WHERE ge.source_ref = dr.client_run_id
         ), 0) AS goldEarned,
         completed_at AS completedAt
       FROM dungeon_runs dr
       ORDER BY dr.completed_at DESC, dr.id DESC
      LIMIT 5`,
    ),
    db.getFirstAsync<{ rankKey: string }>(
      'SELECT current_rank_key AS rankKey FROM player_rank_state WHERE id = 1',
    ),
  ]);
  const attemptMap = new Map(attemptRows.map((row) => [row.dungeonKey, row.total]));
  const hasActiveBattle = activeRow !== null;
  const currentRankOrder = getRankOrder(rankRow?.rankKey ?? 'unawakened');
  const availability = dungeons.map((dungeon) => {
    const attempts = attemptMap.get(dungeon.key) ?? 0;
    const active = activeRow?.dungeonKey === dungeon.key;
    return {
      dungeon,
      unlocked: currentRankOrder >= getRankOrder(dungeon.requiredRankKey),
      isTrialEntry: !active && attempts === 0,
      entryCost: active ? activeRow.energyCost : attempts === 0 ? 0 : dungeon.energyCost,
      attempts,
      active,
    };
  });
  const firstAvailability = availability.find((entry) => entry.dungeon.key === firstDungeon.key);

  return {
    energyAvailable,
    entryCost: firstAvailability?.entryCost ?? firstDungeon.energyCost,
    isTrialEntry: firstAvailability?.isTrialEntry ?? false,
    hasActiveBattle,
    totalClears: clearsRow?.total ?? 0,
    recentRuns: runRows.map(toDungeonRun),
    dungeons: availability,
    activeDungeonKey: activeRow?.dungeonKey ?? null,
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
  const activeSkillKeys = getSessionSkillKeys(row.activeSkillKeys, row.classKey, 'active');
  const passiveSkillKeys = getSessionSkillKeys(row.passiveSkillKeys, row.classKey, 'passive');
  const activeSkillProfiles = activeSkillKeys.map((skillKey) =>
    getClassCombatProfile(row.classKey, skillKey),
  );
  const combatProfile = activeSkillProfiles[0] ?? getClassCombatProfile(row.classKey);
  const dungeon = getDungeonDefinition(row.dungeonKey);

  return {
    dungeonKey: row.dungeonKey,
    dungeonName: row.dungeonName,
    difficulty: row.difficulty,
    bossName: dungeon.bossName,
    dungeon,
    enemyName: row.enemyName,
    roomIndex: row.roomIndex,
    roomType: row.roomType,
    routeKey: row.routeKey,
    roomsCleared: row.roomsCleared,
    interimGold: row.interimGold,
    classKey: row.classKey,
    className: combatProfile.className,
    combatProfile,
    activeSkillProfiles,
    passiveSkillKeys,
    energyCost: row.energyCost,
    isTrialEntry: row.energyCost === 0,
    snapshot,
    stats,
    enemyIntent: getEnemyIntent(snapshot.turnNumber, stats.enemyPower, row.dungeonKey),
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
    const [energyAvailable, attemptsRow, progress, equipmentBonuses, classRow, rankRow, eventIdRow] =
      await Promise.all([
      getDungeonEnergyAvailable(txn),
      txn.getFirstAsync<TotalRow>(
        'SELECT COUNT(*) AS total FROM dungeon_runs WHERE dungeon_key = ?',
        dungeon.key,
      ),
      getPlayerProgress(txn),
      getEquippedCombatBonuses(txn),
      txn.getFirstAsync<{ classKey: string }>(
        'SELECT active_class_key AS classKey FROM player_class_state WHERE id = 1',
      ),
      txn.getFirstAsync<{ rankKey: string }>(
        'SELECT current_rank_key AS rankKey FROM player_rank_state WHERE id = 1',
      ),
      txn.getFirstAsync<{ eventId: string }>('SELECT lower(hex(randomblob(16))) AS eventId'),
    ]);
    const isTrialEntry = (attemptsRow?.total ?? 0) === 0;
    const energyCost = isTrialEntry ? 0 : dungeon.energyCost;
    const eventId = eventIdRow?.eventId;

    if (energyAvailable < energyCost) throw new Error('Not enough Dungeon Energy.');
    if (!eventId) throw new Error('Could not create a dungeon battle.');
    if (getRankOrder(rankRow?.rankKey ?? 'unawakened') < getRankOrder(dungeon.requiredRankKey)) {
      throw new Error(`${dungeon.rank} is required to enter ${dungeon.name}.`);
    }

    const classKey = classRow?.classKey ?? 'unawakened';
    const equippedSkills = isStarterClassKey(classKey)
      ? await txn.getAllAsync<{ skillKey: string; skillType: 'active' | 'passive' }>(
          `SELECT skill_key AS skillKey, skill_type AS skillType
           FROM user_skills
           WHERE class_key = ? AND is_equipped = 1
           ORDER BY skill_type ASC, slot_order ASC`,
          classKey,
        )
      : [];
    const activeSkillKeys = equippedSkills
      .filter((skill) => skill.skillType === 'active')
      .map((skill) => skill.skillKey);
    const passiveSkillKeys = equippedSkills
      .filter((skill) => skill.skillType === 'passive')
      .map((skill) => skill.skillKey);
    const combatProfile = getClassCombatProfile(classKey);
    const baseStats = getUnawakenedCombatStats(progress, equipmentBonuses);
    const stats: UnawakenedCombatStats = {
      ...baseStats,
      maxEnemyHp: Math.round(baseStats.maxEnemyHp * dungeon.enemyHpMultiplier),
      enemyPower: baseStats.enemyPower + dungeon.enemyPowerBonus,
    };
    const bossMaxEnemyHp = stats.maxEnemyHp;
    const scoutMaxEnemyHp = Math.max(36, Math.round(bossMaxEnemyHp * 0.62));
    const snapshot: CombatSnapshot = {
      ...createCombatSnapshot(stats, combatProfile),
      enemyHp: scoutMaxEnemyHp,
      log: [{
        id: 'system-entry',
        message: `${dungeon.scoutName} guards the first fork.`,
        tone: 'system',
      }],
    };
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
         combat_log,
         class_key,
         class_resource,
         active_skill_keys,
         passive_skill_keys,
         player_statuses,
         enemy_statuses,
         room_index,
         room_type,
         route_key,
         rooms_cleared,
         enemy_name,
         boss_max_enemy_hp,
         turns_elapsed,
         interim_gold
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `${dungeon.key}-${eventId}`,
      dungeon.key,
      dungeon.name,
      dungeon.difficulty,
      energyCost,
      snapshot.playerHp,
      snapshot.enemyHp,
      stats.maxPlayerHp,
      scoutMaxEnemyHp,
      stats.basicDamage,
      stats.skillDamage,
      stats.potionHealing,
      stats.enemyPower,
      stats.defense,
      snapshot.turnNumber,
      snapshot.skillCooldown,
      JSON.stringify(snapshot.log),
      classKey,
      snapshot.classResource,
      JSON.stringify(activeSkillKeys),
      JSON.stringify(passiveSkillKeys),
      JSON.stringify(snapshot.playerStatuses),
      JSON.stringify(snapshot.enemyStatuses),
      1,
      'combat',
      null,
      0,
      dungeon.scoutName,
      bossMaxEnemyHp,
      0,
      0,
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

async function recordDungeonRoomEvent(
  txn: SQLiteDatabase,
  row: DungeonBattleSessionRow,
  roomIndex: number,
  roomType: string,
  outcome: 'cleared' | 'resolved',
  goldEarned = 0,
  itemKey: string | null = null,
  itemQuantity = 0,
) {
  await txn.runAsync(
    `INSERT OR IGNORE INTO dungeon_room_events (
       client_event_id,
       client_run_id,
       room_index,
       room_type,
       route_key,
       outcome,
       gold_earned,
       item_key,
       item_quantity
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `room-${row.clientRunId}-${roomIndex}-${roomType}`,
    row.clientRunId,
    roomIndex,
    roomType,
    row.routeKey,
    outcome,
    goldEarned,
    itemKey,
    itemQuantity,
  );
}

async function prepareDungeonEncounter(
  txn: SQLiteDatabase,
  row: DungeonBattleSessionRow,
  roomType: 'elite' | 'boss',
  roomsCleared: number,
) {
  const dungeon = getDungeonDefinition(row.dungeonKey);
  const enemyName = roomType === 'elite' ? dungeon.eliteName : dungeon.bossName;
  const maxEnemyHp = roomType === 'elite'
    ? Math.max(48, Math.round(row.bossMaxEnemyHp * 0.88))
    : row.bossMaxEnemyHp;
  const roomIndex = roomType === 'elite' ? 3 : 4;
  const log: CombatLogEntry[] = [{
    id: `room-${roomIndex}-entry`,
    message: roomType === 'elite'
      ? `${dungeon.eliteName} blocks the risky passage.`
      : `${dungeon.bossName} descends before the final gate.`,
    tone: 'system',
  }];

  await txn.runAsync(
    `UPDATE dungeon_battle_sessions
     SET room_index = ?,
         room_type = ?,
         rooms_cleared = ?,
         enemy_name = ?,
         enemy_hp = ?,
         max_enemy_hp = ?,
         turn_number = 1,
         skill_cooldown = 0,
         player_statuses = '[]',
         enemy_statuses = '[]',
         combat_log = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    roomIndex,
    roomType,
    roomsCleared,
    enemyName,
    maxEnemyHp,
    maxEnemyHp,
    JSON.stringify(log),
  );
}

export async function chooseDungeonPath(db: SQLiteDatabase, path: DungeonPath) {
  const choosePath = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<DungeonBattleSessionRow>(sessionSelect);
    if (!row || row.roomType !== 'path_choice') {
      throw new Error('The dungeon path is no longer available.');
    }

    if (path === 'safe') {
      const dungeon = getDungeonDefinition(row.dungeonKey);
      const healing = Math.min(
        Math.ceil(row.maxPlayerHp * 0.35),
        row.maxPlayerHp - row.playerHp,
      );
      await txn.runAsync(
        `UPDATE dungeon_battle_sessions
         SET route_key = 'safe',
             room_index = 3,
             room_type = 'event',
             rooms_cleared = 2,
             enemy_name = ?,
             player_hp = player_hp + ?,
             player_statuses = '[]',
             enemy_statuses = '[]',
             combat_log = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        dungeon.eventName,
        healing,
        JSON.stringify([{
          id: 'safe-rest',
          message: `The Rest Room restores ${healing} HP.`,
          tone: 'system',
        }]),
      );
      await recordDungeonRoomEvent(txn, { ...row, routeKey: 'safe' }, 2, 'rest', 'resolved');
      return;
    }

    await grantGold(
      txn,
      6,
      'dungeon_treasure',
      row.clientRunId,
      `dungeon-treasure-gold-${row.clientRunId}`,
    );
    const dungeon = getDungeonDefinition(row.dungeonKey);
    await grantInventoryItem(
      txn,
      dungeon.treasureItemKey,
      dungeon.treasureItemQuantity,
      'dungeon_treasure',
      row.clientRunId,
      `dungeon-treasure-item-${row.clientRunId}`,
    );
    await txn.runAsync(
      `UPDATE dungeon_battle_sessions
       SET route_key = 'risky',
           rooms_cleared = 2,
           interim_gold = interim_gold + 6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
    );
    const riskyRow = { ...row, routeKey: 'risky' as const, interimGold: row.interimGold + 6 };
    await recordDungeonRoomEvent(
      txn,
      riskyRow,
      2,
      'treasure',
      'resolved',
      6,
      dungeon.treasureItemKey,
      dungeon.treasureItemQuantity,
    );
    await prepareDungeonEncounter(txn, riskyRow, 'elite', 2);
  };

  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => choosePath(db));
  } else {
    await db.withExclusiveTransactionAsync(choosePath);
  }
  return getActiveDungeonBattle(db);
}

export async function continueDungeonRoute(db: SQLiteDatabase) {
  const continueRoute = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<DungeonBattleSessionRow>(sessionSelect);
    if (!row || (row.roomType !== 'event' && row.roomType !== 'boss_ready')) {
      throw new Error('There is no dungeon room to continue.');
    }

    if (row.roomType === 'event') {
      await grantGold(
        txn,
        2,
        'dungeon_event',
        row.clientRunId,
        `dungeon-event-gold-${row.clientRunId}`,
      );
      await txn.runAsync(
        `UPDATE dungeon_battle_sessions
         SET interim_gold = interim_gold + 2,
             rooms_cleared = 3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
      );
      const eventRow = { ...row, interimGold: row.interimGold + 2 };
      await recordDungeonRoomEvent(txn, eventRow, 3, 'event', 'resolved', 2);
      await prepareDungeonEncounter(txn, eventRow, 'boss', 3);
      return;
    }

    await prepareDungeonEncounter(txn, row, 'boss', row.roomsCleared);
  };

  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => continueRoute(db));
  } else {
    await db.withExclusiveTransactionAsync(continueRoute);
  }
  return getActiveDungeonBattle(db);
}

async function finalizeDungeonBattle(
  txn: SQLiteDatabase,
  row: DungeonBattleSessionRow,
  status: DungeonRun['status'],
) {
  const reward = status === 'cleared' ? rollDungeonReward(row.dungeonKey) : null;
  const masteryXpEarned = isStarterClassKey(row.classKey) ? (status === 'cleared' ? 25 : 8) : 0;
  const currentRoomTurns = ['combat', 'elite', 'boss'].includes(row.roomType)
    ? row.turnNumber
    : 0;
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
         turns_taken,
         class_key,
         mastery_xp_earned,
         route_key,
         rooms_cleared,
         interim_gold
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    row.turnsElapsed + currentRoomTurns,
    row.classKey,
    masteryXpEarned,
    row.routeKey,
    row.roomsCleared,
    row.interimGold,
  );

  await grantClassMastery(
    txn,
    row.classKey,
    masteryXpEarned,
    result.lastInsertRowId,
    `class-mastery-${row.clientRunId}`,
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
  skillKey?: string,
): Promise<DungeonBattleActionResult> {
  let outcome: DungeonBattleActionResult['outcome'] = 'active';
  let completedRunId: number | null = null;

  const applyAction = async (txn: SQLiteDatabase) => {
    const row = await txn.getFirstAsync<DungeonBattleSessionRow>(sessionSelect);
    if (!row) throw new Error('No active dungeon battle.');
    if (!['combat', 'elite', 'boss'].includes(row.roomType)) {
      throw new Error('Resolve the current dungeon room before choosing a combat action.');
    }

    const stats = getSessionStats(row);
    const snapshot = getSessionSnapshot(row);
    if (action === 'item') {
      if (snapshot.playerHp >= stats.maxPlayerHp) throw new Error('Health is already full.');
      await consumeInventoryItem(txn, 'minor-health-potion');
    }

    const activeSkillKeys = getSessionSkillKeys(row.activeSkillKeys, row.classKey, 'active');
    const passiveSkillKeys = getSessionSkillKeys(row.passiveSkillKeys, row.classKey, 'passive');
    if (action === 'skill' && activeSkillKeys.length > 0 && skillKey && !activeSkillKeys.includes(skillKey)) {
      throw new Error('This skill is not equipped for the current run.');
    }
    if (action === 'skill' && isStarterClassKey(row.classKey) && activeSkillKeys.length === 0) {
      throw new Error('No active skill is equipped.');
    }
    const combatProfile = getClassCombatProfile(
      row.classKey,
      action === 'skill' ? skillKey ?? activeSkillKeys[0] : activeSkillKeys[0],
    );
    const resolution = resolveCombatAction(
      snapshot,
      stats,
      action,
      combatProfile,
      passiveSkillKeys,
      row.enemyName,
      row.dungeonKey,
    );
    outcome = resolution.outcome;

    if (resolution.outcome === 'active') {
      await txn.runAsync(
        `UPDATE dungeon_battle_sessions
         SET player_hp = ?,
             enemy_hp = ?,
             turn_number = ?,
             skill_cooldown = ?,
             class_resource = ?,
             player_statuses = ?,
             enemy_statuses = ?,
             damage_taken = damage_taken + ?,
             combat_log = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        resolution.snapshot.playerHp,
        resolution.snapshot.enemyHp,
        resolution.snapshot.turnNumber,
        resolution.snapshot.skillCooldown,
        resolution.snapshot.classResource,
        JSON.stringify(resolution.snapshot.playerStatuses),
        JSON.stringify(resolution.snapshot.enemyStatuses),
        resolution.enemyDamage,
        JSON.stringify(resolution.snapshot.log),
      );
      return;
    }

    const resolvedRow: DungeonBattleSessionRow = {
      ...row,
      playerHp: resolution.snapshot.playerHp,
      enemyHp: resolution.snapshot.enemyHp,
      turnNumber: resolution.snapshot.turnNumber,
      skillCooldown: resolution.snapshot.skillCooldown,
      classResource: resolution.snapshot.classResource,
      playerStatuses: JSON.stringify(resolution.snapshot.playerStatuses),
      enemyStatuses: JSON.stringify(resolution.snapshot.enemyStatuses),
      damageTaken: row.damageTaken + resolution.enemyDamage,
    };

    if (resolution.outcome === 'failed') {
      completedRunId = await finalizeDungeonBattle(txn, resolvedRow, 'failed');
      return;
    }

    if (row.roomType === 'combat') {
      await recordDungeonRoomEvent(txn, row, 1, 'combat', 'cleared');
      await txn.runAsync(
        `UPDATE dungeon_battle_sessions
         SET player_hp = ?,
             enemy_hp = 0,
             room_index = 2,
             room_type = 'path_choice',
             rooms_cleared = 1,
             enemy_name = 'Forked Hall',
             turn_number = 1,
             turns_elapsed = turns_elapsed + ?,
             skill_cooldown = 0,
             class_resource = ?,
             player_statuses = '[]',
             enemy_statuses = '[]',
             damage_taken = damage_taken + ?,
             combat_log = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        resolvedRow.playerHp,
        resolvedRow.turnNumber,
        resolvedRow.classResource,
        resolution.enemyDamage,
        JSON.stringify([{
          id: 'path-choice',
          message: 'The first guardian falls. Two passages open ahead.',
          tone: 'system',
        }]),
      );
      outcome = 'path-choice';
      return;
    }

    if (row.roomType === 'elite') {
      const dungeon = getDungeonDefinition(row.dungeonKey);
      await grantGold(
        txn,
        4,
        'dungeon_elite',
        row.clientRunId,
        `dungeon-elite-gold-${row.clientRunId}`,
      );
      await grantInventoryItem(
        txn,
        dungeon.eliteItemKey,
        1,
        'dungeon_elite',
        row.clientRunId,
        `dungeon-elite-item-${row.clientRunId}`,
      );
      await recordDungeonRoomEvent(
        txn,
        row,
        3,
        'elite',
        'cleared',
        4,
        dungeon.eliteItemKey,
        1,
      );
      await txn.runAsync(
        `UPDATE dungeon_battle_sessions
         SET player_hp = ?,
             enemy_hp = 0,
             room_index = 4,
             room_type = 'boss_ready',
             rooms_cleared = 3,
             enemy_name = 'Final Gate',
             turn_number = 1,
             turns_elapsed = turns_elapsed + ?,
             skill_cooldown = 0,
             class_resource = ?,
             player_statuses = '[]',
             enemy_statuses = '[]',
             damage_taken = damage_taken + ?,
             interim_gold = interim_gold + 4,
             combat_log = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        resolvedRow.playerHp,
        resolvedRow.turnNumber,
        resolvedRow.classResource,
        resolution.enemyDamage,
        JSON.stringify([{
          id: 'elite-clear',
          message: 'The Elite falls. The final gate is now exposed.',
          tone: 'system',
        }]),
      );
      outcome = 'room-cleared';
      return;
    }

    const clearedRooms = Math.min(4, Math.max(1, row.roomsCleared + 1));
    await recordDungeonRoomEvent(txn, row, 4, 'boss', 'cleared');
    completedRunId = await finalizeDungeonBattle(
      txn,
      { ...resolvedRow, roomsCleared: clearedRooms },
      'cleared',
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
    battle: ['active', 'path-choice', 'room-cleared'].includes(outcome)
      ? await getActiveDungeonBattle(db)
      : null,
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
