import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import { supabase } from '@/src/auth/supabase';

const SYNC_TABLES = [
  'habits',
  'player_profile',
  'user_settings',
  'boss_quests',
  'boss_quest_milestones',
  'boss_quest_reward_events',
  'habit_completions',
  'xp_events',
  'attribute_events',
  'energy_events',
  'habit_counter_progress',
  'habit_timer_progress',
  'habit_weekly_checkins',
  'daily_clear_chests',
  'inventory_items',
  'loot_events',
  'dungeon_runs',
  'dungeon_room_events',
  'equipment_progress',
  'equipment_loadouts',
  'gold_events',
  'shop_purchase_events',
  'blacksmith_events',
  'equipment_events',
  'user_achievements',
  'user_classes',
  'user_skills',
  'player_class_state',
  'class_change_events',
  'class_mastery_events',
  'skill_loadout_events',
  'recovery_quest_events',
  'player_rank_state',
  'rank_trial_events',
  'player_recalibration_state',
  'stat_point_allocations',
  'stat_recalibration_events',
  'reawakening_quest_events',
  'dungeon_battle_sessions',
] as const;

type SyncTable = (typeof SYNC_TABLES)[number];
type BackupRow = Record<string, SQLiteBindValue>;

export type CloudBackupSnapshot = {
  formatVersion: 1;
  databaseVersion: number;
  createdAt: string;
  tables: Partial<Record<SyncTable, BackupRow[]>>;
};

export type CloudBackupMetadata = {
  updatedAt: string;
  databaseVersion: number;
};

function quoteIdentifier(identifier: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) throw new Error('Invalid backup identifier.');
  return `"${identifier}"`;
}

function validateSnapshot(value: unknown): CloudBackupSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Cloud backup is invalid.');
  const snapshot = value as Partial<CloudBackupSnapshot>;
  if (
    snapshot.formatVersion !== 1 ||
    typeof snapshot.databaseVersion !== 'number' ||
    !snapshot.tables ||
    typeof snapshot.tables !== 'object'
  ) {
    throw new Error('Cloud backup format is not supported.');
  }
  return snapshot as CloudBackupSnapshot;
}

export async function createDatabaseSnapshot(db: SQLiteDatabase): Promise<CloudBackupSnapshot> {
  await db.execAsync('PRAGMA wal_checkpoint(PASSIVE);');
  const versionRow = await db.getFirstAsync<{ userVersion: number }>(
    'SELECT user_version AS userVersion FROM pragma_user_version',
  );
  const tables: CloudBackupSnapshot['tables'] = {};

  for (const table of SYNC_TABLES) {
    const exists = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      table,
    );
    if (!exists) continue;
    const rows = await db.getAllAsync<BackupRow>(`SELECT * FROM ${quoteIdentifier(table)}`);
    tables[table] = rows.map((row) =>
      table === 'player_profile' ? { ...row, custom_avatar_uri: null } : row,
    );
  }

  return {
    formatVersion: 1,
    databaseVersion: versionRow?.userVersion ?? 0,
    createdAt: new Date().toISOString(),
    tables,
  };
}

async function restoreTables(db: SQLiteDatabase, snapshot: CloudBackupSnapshot) {
  const availableTables = SYNC_TABLES.filter((table) => Array.isArray(snapshot.tables[table]));
  for (const table of [...availableTables].reverse()) {
    await db.runAsync(`DELETE FROM ${quoteIdentifier(table)}`);
  }

  for (const table of availableTables) {
    const rows = snapshot.tables[table] ?? [];
    for (const row of rows) {
      const columns = Object.keys(row);
      if (columns.length === 0) continue;
      const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns
        .map(quoteIdentifier)
        .join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
      await db.runAsync(sql, ...columns.map((column) => row[column]));
    }
  }

  const violations = await db.getAllAsync<{ table: string }>('PRAGMA foreign_key_check');
  if (violations.length > 0) throw new Error('Cloud backup contains inconsistent data.');
}

export async function restoreDatabaseSnapshot(
  db: SQLiteDatabase,
  rawSnapshot: unknown,
) {
  const snapshot = validateSnapshot(rawSnapshot);
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    if (process.env.EXPO_OS === 'web') {
      await db.withTransactionAsync(() => restoreTables(db, snapshot));
    } else {
      await db.withExclusiveTransactionAsync((txn) => restoreTables(txn, snapshot));
    }
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

export async function hasMeaningfulLocalData(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT
       (SELECT COUNT(*) FROM habits) +
       (SELECT COUNT(*) FROM habit_completions) +
       (SELECT COUNT(*) FROM dungeon_runs) +
       (SELECT COUNT(*) FROM boss_quests) +
       (SELECT COUNT(*) FROM loot_events) AS total`,
  );
  return (row?.total ?? 0) > 0;
}

export async function getCloudBackupMetadata(userId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('app_backups')
    .select('updated_at, schema_version')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { updatedAt: data.updated_at, databaseVersion: data.schema_version } satisfies CloudBackupMetadata
    : null;
}

export async function uploadCloudBackup(db: SQLiteDatabase, userId: string) {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const ownership = await db.getFirstAsync<{ userId: string | null }>(
    'SELECT user_id AS userId FROM cloud_sync_state WHERE id = 1',
  );
  if (ownership?.userId && ownership.userId !== userId) {
    throw new Error('Local progress belongs to another account and cannot be uploaded.');
  }
  const snapshot = await createDatabaseSnapshot(db);
  const { data, error } = await supabase
    .from('app_backups')
    .upsert({
      user_id: userId,
      payload: snapshot,
      schema_version: snapshot.databaseVersion,
      updated_at: snapshot.createdAt,
    }, { onConflict: 'user_id' })
    .select('updated_at')
    .single();
  if (error) throw error;
  await db.runAsync(
    `UPDATE cloud_sync_state
     SET user_id = ?, last_backup_at = ?
     WHERE id = 1`,
    userId,
    data.updated_at,
  );
  return data.updated_at as string;
}

export async function downloadCloudBackup(db: SQLiteDatabase, userId: string) {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const { data, error } = await supabase
    .from('app_backups')
    .select('payload, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No cloud backup exists for this account.');

  await restoreDatabaseSnapshot(db, data.payload);
  await db.runAsync(
    `INSERT INTO cloud_sync_state (id, user_id, last_backup_at, last_restore_at)
     VALUES (1, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       last_backup_at = excluded.last_backup_at,
       last_restore_at = CURRENT_TIMESTAMP`,
    userId,
    data.updated_at,
  );
  return data.updated_at as string;
}
