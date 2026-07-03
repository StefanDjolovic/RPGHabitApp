import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getStarterClass,
  isStarterClassKey,
  type ClassSkillDefinition,
  type StarterClassDefinition,
  type StarterClassKey,
} from '@/src/classes/class-catalog';
import { getPlayerProgress } from '@/src/progression/player-progression';

export const AWAKENING_LEVEL = 10;
export const ACTIVE_SKILL_SLOTS = 4;
export const PASSIVE_SKILL_SLOTS = 3;
export const REAWAKENING_REQUIRED_CLEARS = 1;

export type UserSkillProgress = ClassSkillDefinition & {
  isEquipped: boolean;
  equippedSlot: number | null;
};

export type ClassSkillLoadout = {
  class: StarterClassDefinition;
  activeSlots: (UserSkillProgress | null)[];
  passiveSlots: (UserSkillProgress | null)[];
  activeSkills: UserSkillProgress[];
  passiveSkills: UserSkillProgress[];
};

export type UserClassProgress = {
  class: StarterClassDefinition;
  masteryXp: number;
  masteryLevel: number;
  unlockedAt: string;
  active: boolean;
};

export type PlayerClassState = {
  eligible: boolean;
  awakened: boolean;
  activeClass: StarterClassDefinition | null;
  activeSkills: ClassSkillDefinition[];
  masteryXp: number;
  masteryLevel: number;
  awakenedAt: string | null;
  freeChangeExpiresAt: string | null;
  freeChangeAvailable: boolean;
  freeChangeDaysRemaining: number;
  reawakeningDungeonClears: number;
  reawakeningRequiredClears: number;
  reawakeningReady: boolean;
  unlockedClasses: UserClassProgress[];
};

type ClassStateRow = {
  activeClassKey: string;
  awakenedAt: string;
  freeChangeExpiresAt: string;
  freeChangeAvailable: number;
  freeChangeDaysRemaining: number;
  reawakeningDungeonClears: number;
};

type UserClassRow = {
  classKey: string;
  masteryXp: number;
  unlockedAt: string;
};

type UserSkillRow = {
  skillKey: string;
  isEquipped: number;
  slotOrder: number | null;
};

export const INITIAL_PLAYER_CLASS_STATE: PlayerClassState = {
  eligible: false,
  awakened: false,
  activeClass: null,
  activeSkills: [],
  masteryXp: 0,
  masteryLevel: 0,
  awakenedAt: null,
  freeChangeExpiresAt: null,
  freeChangeAvailable: false,
  freeChangeDaysRemaining: 0,
  reawakeningDungeonClears: 0,
  reawakeningRequiredClears: REAWAKENING_REQUIRED_CLEARS,
  reawakeningReady: false,
  unlockedClasses: [],
};

function getMasteryLevel(masteryXp: number) {
  return masteryXp <= 0 ? 1 : Math.min(100, Math.floor(Math.sqrt(masteryXp / 25)) + 1);
}

async function runInTransaction(db: SQLiteDatabase, task: (txn: SQLiteDatabase) => Promise<void>) {
  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => task(db));
  } else {
    await db.withExclusiveTransactionAsync(task);
  }
}

async function createEventId(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ eventId: string }>(
    'SELECT lower(hex(randomblob(16))) AS eventId',
  );
  if (!row?.eventId) throw new Error('Could not create a class event.');
  return row.eventId;
}

async function unlockStarterSkills(
  db: SQLiteDatabase,
  classKey: StarterClassKey,
) {
  const definition = getStarterClass(classKey);
  for (const skill of definition.starterSkills) {
    await db.runAsync(
      `INSERT OR IGNORE INTO user_skills (
         skill_key,
         class_key,
         skill_type,
         is_equipped,
         slot_order
       ) VALUES (?, ?, ?, ?, ?)`,
      skill.key,
      classKey,
      skill.type,
      skill.equippedByDefault ? 1 : 0,
      skill.slotOrder,
    );
  }
}

async function grantFreeRecalibration(db: SQLiteDatabase) {
  await db.runAsync(
    `INSERT INTO player_recalibration_state (id, free_credits)
     VALUES (1, 1)
     ON CONFLICT(id) DO UPDATE SET
       free_credits = 1,
       updated_at = CURRENT_TIMESTAMP`,
  );
}

async function activateClass(db: SQLiteDatabase, classKey: StarterClassKey) {
  await db.runAsync(
    `INSERT INTO user_classes (class_key)
     VALUES (?)
     ON CONFLICT(class_key) DO UPDATE SET last_active_at = CURRENT_TIMESTAMP`,
    classKey,
  );
  await unlockStarterSkills(db, classKey);
  await db.runAsync(
    `UPDATE player_class_state
     SET active_class_key = ?,
         free_change_used = 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    classKey,
  );
}

export async function getPlayerClassState(db: SQLiteDatabase): Promise<PlayerClassState> {
  const [progress, stateRow, classRows] = await Promise.all([
    getPlayerProgress(db),
    db.getFirstAsync<ClassStateRow>(
      `SELECT
         active_class_key AS activeClassKey,
         awakened_at AS awakenedAt,
         free_change_expires_at AS freeChangeExpiresAt,
         CASE
           WHEN free_change_used = 0 AND free_change_expires_at > CURRENT_TIMESTAMP THEN 1
           ELSE 0
         END AS freeChangeAvailable,
         MAX(
           0,
           CAST((julianday(free_change_expires_at) - julianday('now')) + 0.999 AS INTEGER)
         ) AS freeChangeDaysRemaining,
         COALESCE((
           SELECT COUNT(*)
           FROM dungeon_runs dr
           WHERE dr.class_key = pcs.active_class_key
             AND dr.status = 'cleared'
             AND dr.completed_at >= pcs.updated_at
         ), 0) AS reawakeningDungeonClears
       FROM player_class_state pcs
       WHERE pcs.id = 1`,
    ),
    db.getAllAsync<UserClassRow>(
      `SELECT
         class_key AS classKey,
         mastery_xp AS masteryXp,
         unlocked_at AS unlockedAt
       FROM user_classes
       ORDER BY unlocked_at ASC`,
    ),
  ]);

  if (!stateRow) {
    return {
      ...INITIAL_PLAYER_CLASS_STATE,
      eligible: progress.level >= AWAKENING_LEVEL,
    };
  }

  const activeClass = getStarterClass(stateRow.activeClassKey);
  const activeClassRow = classRows.find((row) => row.classKey === activeClass.key);
  const skillRows = await db.getAllAsync<UserSkillRow>(
    `SELECT
       skill_key AS skillKey,
       is_equipped AS isEquipped,
       slot_order AS slotOrder
     FROM user_skills
     WHERE class_key = ?
     ORDER BY skill_type ASC, is_equipped DESC, slot_order ASC, unlocked_at ASC`,
    activeClass.key,
  );
  const equippedSkillKeys = new Set(
    skillRows.filter((row) => row.isEquipped === 1).map((row) => row.skillKey),
  );
  const masteryXp = Math.max(0, activeClassRow?.masteryXp ?? 0);

  return {
    eligible: true,
    awakened: true,
    activeClass,
    activeSkills: activeClass.starterSkills.filter((skill) => equippedSkillKeys.has(skill.key)),
    masteryXp,
    masteryLevel: getMasteryLevel(masteryXp),
    awakenedAt: stateRow.awakenedAt,
    freeChangeExpiresAt: stateRow.freeChangeExpiresAt,
    freeChangeAvailable: stateRow.freeChangeAvailable === 1,
    freeChangeDaysRemaining: stateRow.freeChangeDaysRemaining,
    reawakeningDungeonClears: Math.max(0, stateRow.reawakeningDungeonClears),
    reawakeningRequiredClears: REAWAKENING_REQUIRED_CLEARS,
    reawakeningReady:
      stateRow.freeChangeAvailable !== 1 &&
      stateRow.reawakeningDungeonClears >= REAWAKENING_REQUIRED_CLEARS,
    unlockedClasses: classRows
      .filter((row) => isStarterClassKey(row.classKey))
      .map((row) => ({
        class: getStarterClass(row.classKey),
        masteryXp: Math.max(0, row.masteryXp),
        masteryLevel: getMasteryLevel(row.masteryXp),
        unlockedAt: row.unlockedAt,
        active: row.classKey === activeClass.key,
      })),
  };
}

export async function awakenPlayer(db: SQLiteDatabase, classKey: StarterClassKey) {
  if (!isStarterClassKey(classKey)) throw new Error('Unknown starter class.');

  await runInTransaction(db, async (txn) => {
    const [progress, existingState, eventId] = await Promise.all([
      getPlayerProgress(txn),
      txn.getFirstAsync<{ id: number }>('SELECT id FROM player_class_state WHERE id = 1'),
      createEventId(txn),
    ]);
    if (progress.level < AWAKENING_LEVEL) {
      throw new Error(`Reach level ${AWAKENING_LEVEL} to begin Awakening.`);
    }
    if (existingState) throw new Error('Awakening has already been completed.');

    await txn.runAsync(
      `INSERT INTO user_classes (class_key)
       VALUES (?)`,
      classKey,
    );
    await txn.runAsync(
      `INSERT INTO player_class_state (
         id,
         active_class_key,
         free_change_expires_at
       ) VALUES (1, ?, datetime('now', '+7 days'))`,
      classKey,
    );
    await unlockStarterSkills(txn, classKey);
    await txn.runAsync(
      `INSERT INTO class_change_events (
         client_event_id,
         previous_class_key,
         next_class_key,
         reason
       ) VALUES (?, NULL, ?, 'initial')`,
      `awakening-${eventId}`,
      classKey,
    );
    await txn.runAsync(
      `INSERT INTO player_rank_state (id, current_rank_key)
       VALUES (1, 'e_rank')
       ON CONFLICT(id) DO UPDATE SET
         current_rank_key = CASE
           WHEN current_rank_key = 'unawakened' THEN 'e_rank'
           ELSE current_rank_key
         END,
         updated_at = CURRENT_TIMESTAMP`,
    );
    const clearsRow = await txn.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM dungeon_runs WHERE status = 'cleared'`,
    );
    await txn.runAsync(
      `INSERT OR IGNORE INTO rank_trial_events (
         client_event_id,
         previous_rank_key,
         next_rank_key,
         player_level,
         dungeon_clears
       ) VALUES (?, 'unawakened', 'e_rank', ?, ?)`,
      `awakening-rank-${eventId}`,
      progress.level,
      clearsRow?.total ?? 0,
    );
  });

  return getPlayerClassState(db);
}

export async function changeClassDuringFreeWindow(
  db: SQLiteDatabase,
  classKey: StarterClassKey,
) {
  if (!isStarterClassKey(classKey)) throw new Error('Unknown starter class.');

  await runInTransaction(db, async (txn) => {
    const state = await txn.getFirstAsync<{
      activeClassKey: string;
      freeChangeAvailable: number;
    }>(
      `SELECT
         active_class_key AS activeClassKey,
         CASE
           WHEN free_change_used = 0 AND free_change_expires_at > CURRENT_TIMESTAMP THEN 1
           ELSE 0
         END AS freeChangeAvailable
       FROM player_class_state
       WHERE id = 1`,
    );
    if (!state) throw new Error('Complete Awakening before changing class.');
    if (state.activeClassKey === classKey) throw new Error('This class is already active.');
    if (state.freeChangeAvailable !== 1) {
      throw new Error('The free class change window has ended. A Reawakening Quest is required.');
    }

    const eventId = await createEventId(txn);
    await activateClass(txn, classKey);
    await txn.runAsync(
      `INSERT INTO class_change_events (
         client_event_id,
         previous_class_key,
         next_class_key,
         reason
       ) VALUES (?, ?, ?, 'free_change')`,
      `class-change-${eventId}`,
      state.activeClassKey,
      classKey,
    );
    await grantFreeRecalibration(txn);
  });

  return getPlayerClassState(db);
}

export async function changeClassThroughReawakening(
  db: SQLiteDatabase,
  classKey: StarterClassKey,
) {
  if (!isStarterClassKey(classKey)) throw new Error('Unknown starter class.');

  await runInTransaction(db, async (txn) => {
    const state = await txn.getFirstAsync<{
      activeClassKey: string;
      freeChangeAvailable: number;
      dungeonClears: number;
    }>(
      `SELECT
         pcs.active_class_key AS activeClassKey,
         CASE
           WHEN pcs.free_change_used = 0 AND pcs.free_change_expires_at > CURRENT_TIMESTAMP THEN 1
           ELSE 0
         END AS freeChangeAvailable,
         COALESCE((
           SELECT COUNT(*)
           FROM dungeon_runs dr
           WHERE dr.class_key = pcs.active_class_key
             AND dr.status = 'cleared'
             AND dr.completed_at >= pcs.updated_at
         ), 0) AS dungeonClears
       FROM player_class_state pcs
       WHERE pcs.id = 1`,
    );
    if (!state) throw new Error('Complete Awakening before starting Reawakening.');
    if (state.activeClassKey === classKey) throw new Error('This class is already active.');
    if (state.freeChangeAvailable === 1) {
      throw new Error('The free class change is still available.');
    }
    if (state.dungeonClears < REAWAKENING_REQUIRED_CLEARS) {
      throw new Error(`Clear ${REAWAKENING_REQUIRED_CLEARS} dungeon with the active class first.`);
    }

    const eventId = await createEventId(txn);
    await activateClass(txn, classKey);
    await txn.runAsync(
      `INSERT INTO class_change_events (
         client_event_id,
         previous_class_key,
         next_class_key,
         reason
       ) VALUES (?, ?, ?, 'reawakening')`,
      `reawakening-class-${eventId}`,
      state.activeClassKey,
      classKey,
    );
    await txn.runAsync(
      `INSERT INTO reawakening_quest_events (
         client_event_id,
         previous_class_key,
         next_class_key,
         dungeon_clears
       ) VALUES (?, ?, ?, ?)`,
      `reawakening-quest-${eventId}`,
      state.activeClassKey,
      classKey,
      state.dungeonClears,
    );
    await grantFreeRecalibration(txn);
  });

  return getPlayerClassState(db);
}

export async function grantClassMastery(
  db: SQLiteDatabase,
  classKey: string,
  amount: number,
  dungeonRunId: number,
  clientEventId: string,
) {
  if (!isStarterClassKey(classKey) || amount <= 0) return 0;

  const result = await db.runAsync(
    `INSERT OR IGNORE INTO class_mastery_events (
       client_event_id,
       class_key,
       amount,
       dungeon_run_id,
       reason
     ) VALUES (?, ?, ?, ?, ?)`,
    clientEventId,
    classKey,
    amount,
    dungeonRunId,
    amount >= 25 ? 'clear' : 'attempt',
  );
  if (result.changes === 0) return 0;

  await db.runAsync(
    `UPDATE user_classes
     SET mastery_xp = mastery_xp + ?,
         last_active_at = CURRENT_TIMESTAMP
     WHERE class_key = ?`,
    amount,
    classKey,
  );
  return amount;
}

function toSkillProgress(
  definition: ClassSkillDefinition,
  row: UserSkillRow,
): UserSkillProgress {
  return {
    ...definition,
    isEquipped: row.isEquipped === 1,
    equippedSlot: row.isEquipped === 1 ? row.slotOrder : null,
  };
}

export async function getActiveClassSkillLoadout(
  db: SQLiteDatabase,
): Promise<ClassSkillLoadout | null> {
  const state = await db.getFirstAsync<{ classKey: string }>(
    'SELECT active_class_key AS classKey FROM player_class_state WHERE id = 1',
  );
  if (!state || !isStarterClassKey(state.classKey)) return null;

  const definition = getStarterClass(state.classKey);
  const rows = await db.getAllAsync<UserSkillRow>(
    `SELECT
       skill_key AS skillKey,
       is_equipped AS isEquipped,
       slot_order AS slotOrder
     FROM user_skills
     WHERE class_key = ?
     ORDER BY skill_type ASC, is_equipped DESC, slot_order ASC, unlocked_at ASC`,
    state.classKey,
  );
  const rowByKey = new Map(rows.map((row) => [row.skillKey, row]));
  const skills = definition.starterSkills.flatMap((skill) => {
    const row = rowByKey.get(skill.key);
    return row ? [toSkillProgress(skill, row)] : [];
  });
  const activeSkills = skills.filter((skill) => skill.type === 'active');
  const passiveSkills = skills.filter((skill) => skill.type === 'passive');
  const activeSlots = Array<UserSkillProgress | null>(ACTIVE_SKILL_SLOTS).fill(null);
  const passiveSlots = Array<UserSkillProgress | null>(PASSIVE_SKILL_SLOTS).fill(null);

  for (const skill of skills) {
    if (!skill.isEquipped || skill.equippedSlot === null) continue;
    const slots = skill.type === 'active' ? activeSlots : passiveSlots;
    if (skill.equippedSlot >= 1 && skill.equippedSlot <= slots.length) {
      slots[skill.equippedSlot - 1] = skill;
    }
  }

  return { class: definition, activeSlots, passiveSlots, activeSkills, passiveSkills };
}

export async function equipClassSkill(
  db: SQLiteDatabase,
  skillKey: string,
  slotOrder: number,
) {
  await runInTransaction(db, async (txn) => {
    const row = await txn.getFirstAsync<{
      classKey: string;
      skillType: 'active' | 'passive';
      isEquipped: number;
      previousSlot: number | null;
    }>(
      `SELECT
         us.class_key AS classKey,
         us.skill_type AS skillType,
         us.is_equipped AS isEquipped,
         us.slot_order AS previousSlot
       FROM user_skills us
       INNER JOIN player_class_state pcs ON pcs.active_class_key = us.class_key
       WHERE pcs.id = 1 AND us.skill_key = ?`,
      skillKey,
    );
    if (!row) throw new Error('This skill is not unlocked for the active class.');

    const maximum = row.skillType === 'active' ? ACTIVE_SKILL_SLOTS : PASSIVE_SKILL_SLOTS;
    if (!Number.isInteger(slotOrder) || slotOrder < 1 || slotOrder > maximum) {
      throw new Error('Invalid skill slot.');
    }

    await txn.runAsync(
      `UPDATE user_skills
       SET is_equipped = 0, slot_order = NULL
       WHERE class_key = ?
         AND skill_type = ?
         AND is_equipped = 1
         AND slot_order = ?
         AND skill_key != ?`,
      row.classKey,
      row.skillType,
      slotOrder,
      skillKey,
    );
    await txn.runAsync(
      `UPDATE user_skills
       SET is_equipped = 1, slot_order = ?
       WHERE skill_key = ?`,
      slotOrder,
      skillKey,
    );
    const eventId = await createEventId(txn);
    await txn.runAsync(
      `INSERT INTO skill_loadout_events (
         client_event_id, class_key, skill_key, skill_type, previous_slot, next_slot
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      `skill-equip-${eventId}`,
      row.classKey,
      skillKey,
      row.skillType,
      row.isEquipped === 1 ? row.previousSlot : null,
      slotOrder,
    );
  });

  return getActiveClassSkillLoadout(db);
}

export async function unequipClassSkill(db: SQLiteDatabase, skillKey: string) {
  await runInTransaction(db, async (txn) => {
    const row = await txn.getFirstAsync<{
      classKey: string;
      skillType: 'active' | 'passive';
      previousSlot: number | null;
    }>(
      `SELECT
         us.class_key AS classKey,
         us.skill_type AS skillType,
         us.slot_order AS previousSlot
       FROM user_skills us
       INNER JOIN player_class_state pcs ON pcs.active_class_key = us.class_key
       WHERE pcs.id = 1 AND us.skill_key = ? AND us.is_equipped = 1`,
      skillKey,
    );
    if (!row) return;

    await txn.runAsync(
      'UPDATE user_skills SET is_equipped = 0, slot_order = NULL WHERE skill_key = ?',
      skillKey,
    );
    const eventId = await createEventId(txn);
    await txn.runAsync(
      `INSERT INTO skill_loadout_events (
         client_event_id, class_key, skill_key, skill_type, previous_slot, next_slot
       ) VALUES (?, ?, ?, ?, ?, NULL)`,
      `skill-unequip-${eventId}`,
      row.classKey,
      skillKey,
      row.skillType,
      row.previousSlot,
    );
  });

  return getActiveClassSkillLoadout(db);
}
