import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import {
  getLocalDateKey,
  type HabitAttribute,
  type HabitDifficulty,
  rewardByDifficulty,
} from '@/src/database/habit-repository';
import { grantInventoryItem } from '@/src/database/inventory-repository';
import { MAX_DAILY_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';
import { getRuntimeUserSettings } from '@/src/settings/user-settings';

export type BossQuestStatus = 'active' | 'completed' | 'archived';

export type BossQuestMilestone = {
  id: number;
  position: number;
  title: string;
  difficulty: HabitDifficulty;
  complete: boolean;
  completionDate: string | null;
};

export type BossQuest = {
  id: number;
  title: string;
  description: string;
  attribute: HabitAttribute;
  status: BossQuestStatus;
  createdAt: string;
  completedAt: string | null;
  milestones: BossQuestMilestone[];
};

export type NewBossQuest = {
  title: string;
  description: string;
  attribute: HabitAttribute;
  milestones: {
    title: string;
    difficulty: HabitDifficulty;
  }[];
};

type BossQuestRow = Omit<BossQuest, 'milestones'>;
type BossQuestMilestoneRow = Omit<BossQuestMilestone, 'complete'> & {
  bossQuestId: number;
  complete: number;
};

async function hydrateBossQuests(db: SQLiteDatabase, rows: BossQuestRow[]) {
  if (rows.length === 0) return [];

  const milestones = await db.getAllAsync<BossQuestMilestoneRow>(
    `SELECT
       id,
       boss_quest_id AS bossQuestId,
       position,
       title,
       difficulty,
       CASE WHEN status = 'complete' THEN 1 ELSE 0 END AS complete,
       completion_date AS completionDate
     FROM boss_quest_milestones
     WHERE boss_quest_id IN (${rows.map(() => '?').join(',')})
     ORDER BY boss_quest_id ASC, position ASC`,
    ...rows.map((row) => row.id),
  );
  const milestonesByBoss = new Map<number, BossQuestMilestone[]>();

  for (const milestone of milestones) {
    const bossMilestones = milestonesByBoss.get(milestone.bossQuestId) ?? [];
    bossMilestones.push({
      id: milestone.id,
      position: milestone.position,
      title: milestone.title,
      difficulty: milestone.difficulty,
      complete: milestone.complete === 1,
      completionDate: milestone.completionDate,
    });
    milestonesByBoss.set(milestone.bossQuestId, bossMilestones);
  }

  return rows.map((row) => ({
    ...row,
    milestones: milestonesByBoss.get(row.id) ?? [],
  }));
}

export async function getBossQuests(
  db: SQLiteDatabase,
  view: 'active' | 'history' = 'active',
) {
  const rows = await db.getAllAsync<BossQuestRow>(
    `SELECT
       id,
       title,
       description,
       attribute,
       status,
       created_at AS createdAt,
       completed_at AS completedAt
     FROM boss_quests
     WHERE ${view === 'active' ? "status = 'active'" : "status IN ('completed', 'archived')"}
     ORDER BY created_at DESC, id DESC`,
  );

  return hydrateBossQuests(db, rows);
}

export async function getActiveBossQuest(db: SQLiteDatabase) {
  const bosses = await getBossQuests(db, 'active');
  return bosses[0] ?? null;
}

export async function createBossQuest(db: SQLiteDatabase, boss: NewBossQuest) {
  const title = boss.title.trim();
  const description = boss.description.trim();
  const milestones = boss.milestones
    .map((milestone) => ({ ...milestone, title: milestone.title.trim() }))
    .filter((milestone) => milestone.title.length > 0);

  if (!title) throw new Error('Boss Quest title is required.');
  if (milestones.length < 2 || milestones.length > 6) {
    throw new Error('Boss Quest requires between 2 and 6 phases.');
  }

  let bossQuestId = 0;
  const applyCreate = async (txn: SQLiteDatabase) => {
    const activeBoss = await txn.getFirstAsync<{ id: number }>(
      `SELECT id FROM boss_quests WHERE status = 'active' LIMIT 1`,
    );
    if (activeBoss) throw new Error('Finish or archive the active Boss Quest first.');

    const result = await txn.runAsync(
      `INSERT INTO boss_quests (title, description, attribute)
       VALUES (?, ?, ?)`,
      title,
      description,
      boss.attribute,
    );
    bossQuestId = result.lastInsertRowId;

    for (const [index, milestone] of milestones.entries()) {
      await txn.runAsync(
        `INSERT INTO boss_quest_milestones (
           boss_quest_id, position, title, difficulty
         ) VALUES (?, ?, ?, ?)`,
        bossQuestId,
        index + 1,
        milestone.title,
        milestone.difficulty,
      );
    }
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyCreate(db));
  } else {
    await db.withExclusiveTransactionAsync(applyCreate);
  }

  return bossQuestId;
}

export async function completeCurrentBossMilestone(db: SQLiteDatabase, bossQuestId: number) {
  const today = getLocalDateKey();
  const settings = getRuntimeUserSettings();

  const applyCompletion = async (txn: SQLiteDatabase) => {
    const milestone = await txn.getFirstAsync<{
      id: number;
      difficulty: HabitDifficulty;
      attribute: HabitAttribute;
      remainingMilestones: number;
    }>(
      `SELECT
         milestone.id,
         milestone.difficulty,
         boss.attribute,
         (
           SELECT COUNT(*)
           FROM boss_quest_milestones remaining
           WHERE remaining.boss_quest_id = boss.id
             AND remaining.status = 'pending'
         ) AS remainingMilestones
       FROM boss_quests boss
       JOIN boss_quest_milestones milestone
         ON milestone.boss_quest_id = boss.id
       WHERE boss.id = ?
         AND boss.status = 'active'
         AND milestone.status = 'pending'
       ORDER BY milestone.position ASC
       LIMIT 1`,
      bossQuestId,
    );
    if (!milestone) throw new Error('Active Boss Quest phase not found.');

    const reward = rewardByDifficulty[milestone.difficulty];
    const [habitEnergy, bossEnergy, recoveryEnergy, missionEnergy] = await Promise.all([
      txn.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(ee.amount), 0) AS total
         FROM energy_events ee
         JOIN habit_completions hc ON hc.id = ee.completion_id
         WHERE hc.completion_date = ? AND hc.status = 'complete'`,
        today,
      ),
      txn.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(energy_amount), 0) AS total
         FROM boss_quest_reward_events
         WHERE event_date = ?`,
        today,
      ),
      txn.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(energy_amount), 0) AS total
         FROM recovery_quest_events
         WHERE event_date = ?`,
        today,
      ),
      txn.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(energy_amount), 0) AS total
         FROM habit_mission_claims
         WHERE event_date = ?`,
        today,
      ),
    ]);
    const todayEnergy =
      Math.max(0, habitEnergy?.total ?? 0) +
      Math.max(0, bossEnergy?.total ?? 0) +
      Math.max(0, recoveryEnergy?.total ?? 0) +
      Math.max(0, missionEnergy?.total ?? 0);
    const energyAmount = Math.min(
      reward.energy,
      Math.max(0, MAX_DAILY_DUNGEON_ENERGY - todayEnergy),
    );

    const eventResult = await txn.runAsync(
      `INSERT OR IGNORE INTO boss_quest_reward_events (
         client_event_id,
         boss_quest_id,
         milestone_id,
         event_date,
         xp_amount,
         attribute,
         stat_xp_amount,
         energy_amount,
         reason,
         local_timezone,
         day_cutoff_hour
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'milestone', ?, ?)`,
      `boss-milestone-${milestone.id}`,
      bossQuestId,
      milestone.id,
      today,
      reward.xp,
      milestone.attribute,
      reward.statXp,
      energyAmount,
      settings.timezone,
      settings.dayCutoffHour,
    );
    if (eventResult.changes === 0) return;

    await txn.runAsync(
      `UPDATE boss_quest_milestones
       SET status = 'complete',
           completed_at = CURRENT_TIMESTAMP,
           completion_date = ?
       WHERE id = ?`,
      today,
      milestone.id,
    );

    if (milestone.remainingMilestones > 1) return;

    await txn.runAsync(
      `INSERT OR IGNORE INTO boss_quest_reward_events (
         client_event_id,
         boss_quest_id,
         milestone_id,
         event_date,
         xp_amount,
         attribute,
         stat_xp_amount,
         energy_amount,
         reason,
         local_timezone,
         day_cutoff_hour
       ) VALUES (?, ?, NULL, ?, ?, ?, ?, 0, 'final_bonus', ?, ?)`,
      `boss-final-${bossQuestId}`,
      bossQuestId,
      today,
      reward.xp,
      milestone.attribute,
      reward.statXp,
      settings.timezone,
      settings.dayCutoffHour,
    );
    await txn.runAsync(
      `UPDATE boss_quests
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      bossQuestId,
    );
    await grantInventoryItem(
      txn,
      'dungeon-key',
      1,
      'boss_quest',
      String(bossQuestId),
      `boss-key-${bossQuestId}`,
    );
    await grantInventoryItem(
      txn,
      'boss-quest-chest',
      1,
      'boss_quest',
      String(bossQuestId),
      `boss-chest-${bossQuestId}`,
    );
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyCompletion(db));
  } else {
    await db.withExclusiveTransactionAsync(applyCompletion);
  }

  return getActiveBossQuest(db);
}

export async function archiveBossQuest(db: SQLiteDatabase, bossQuestId: number) {
  await db.runAsync(
    `UPDATE boss_quests
     SET status = 'archived', archived_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'active'`,
    bossQuestId,
  );
}

export async function restoreBossQuest(db: SQLiteDatabase, bossQuestId: number) {
  const activeBoss = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM boss_quests WHERE status = 'active' LIMIT 1`,
  );
  if (activeBoss) throw new Error('Archive the active Boss Quest before restoring another.');

  await db.runAsync(
    `UPDATE boss_quests
     SET status = 'active', archived_at = NULL
     WHERE id = ? AND status = 'archived'`,
    bossQuestId,
  );
}
