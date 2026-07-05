import type { SQLiteDatabase } from 'expo-sqlite';

import { achievementCatalog } from '@/src/achievements/achievement-catalog';
import { isStarterClassKey, starterClasses, type StarterClassKey } from '@/src/classes/class-catalog';
import { itemCatalog } from '@/src/inventory/item-catalog';

async function runInTransaction(db: SQLiteDatabase, task: (txn: SQLiteDatabase) => Promise<void>) {
  if (process.env.EXPO_OS === 'web') await db.withTransactionAsync(() => task(db));
  else await db.withExclusiveTransactionAsync(task);
}

async function getAdminCompletionId(db: SQLiteDatabase) {
  await db.runAsync(
    `INSERT INTO habits (
       title, description, difficulty, attribute, is_active, deleted_at
     )
     SELECT 'Admin Sandbox Progress', 'Reserved admin progression record.', 'hard', 'creativity', 0, CURRENT_TIMESTAMP
     WHERE NOT EXISTS (SELECT 1 FROM habits WHERE title = 'Admin Sandbox Progress')`,
  );
  const habit = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM habits WHERE title = 'Admin Sandbox Progress' ORDER BY id ASC LIMIT 1",
  );
  if (!habit) throw new Error('Admin progression record could not be created.');

  await db.runAsync(
    `INSERT OR IGNORE INTO habit_completions (
       habit_id, completion_date, status, habit_title, habit_difficulty, habit_attribute,
       local_timezone, day_cutoff_hour, updated_at
     ) VALUES (?, '2099-12-31', 'complete', 'Admin Sandbox Progress', 'hard', 'creativity',
       'system', 0, CURRENT_TIMESTAMP)`,
    habit.id,
  );
  const completion = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM habit_completions
     WHERE habit_id = ? AND completion_date = '2099-12-31'`,
    habit.id,
  );
  if (!completion) throw new Error('Admin progression record could not be loaded.');
  return completion.id;
}

export async function unlockAdminSandbox(db: SQLiteDatabase) {
  await runInTransaction(db, async (txn) => {
    const completionId = await getAdminCompletionId(txn);
    await txn.runAsync(
      `INSERT OR IGNORE INTO xp_events (
         client_event_id, completion_id, transition_number, amount, reason
       ) VALUES ('admin-sandbox-xp', ?, 1, 1000000, 'completion')`,
      completionId,
    );
    for (const attribute of ['strength', 'intelligence', 'discipline', 'vitality', 'creativity']) {
      await txn.runAsync(
        `INSERT OR IGNORE INTO attribute_events (
           client_event_id, completion_id, transition_number, attribute, amount, reason
         ) VALUES (?, ?, 1, ?, 100000, 'completion')`,
        `admin-sandbox-attribute-${attribute}`,
        completionId,
        attribute,
      );
    }
    await txn.runAsync(
      `INSERT OR IGNORE INTO energy_events (
         client_event_id, completion_id, transition_number, amount, reason
       ) VALUES ('admin-sandbox-energy', ?, 1, 999999, 'completion')`,
      completionId,
    );

    for (const classDefinition of starterClasses) {
      await txn.runAsync(
        `INSERT INTO user_classes (class_key, mastery_xp)
         VALUES (?, 250000)
         ON CONFLICT(class_key) DO UPDATE SET mastery_xp = MAX(mastery_xp, 250000)`,
        classDefinition.key,
      );
      for (const skill of classDefinition.starterSkills) {
        await txn.runAsync(
          `INSERT INTO user_skills (skill_key, class_key, skill_type, is_equipped, slot_order)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(skill_key) DO NOTHING`,
          skill.key,
          classDefinition.key,
          skill.type,
          skill.equippedByDefault ? 1 : 0,
          skill.slotOrder,
        );
      }
    }
    await txn.runAsync(
      `INSERT INTO player_class_state (
         id, active_class_key, free_change_expires_at, free_change_used
       ) VALUES (1, 'summoner', datetime('now', '+100 years'), 0)
       ON CONFLICT(id) DO UPDATE SET
         active_class_key = 'summoner',
         free_change_expires_at = datetime('now', '+100 years'),
         free_change_used = 0,
         updated_at = CURRENT_TIMESTAMP`,
    );
    await txn.runAsync(
      `INSERT INTO player_rank_state (id, current_rank_key)
       VALUES (1, 'transcendent')
       ON CONFLICT(id) DO UPDATE SET
         current_rank_key = 'transcendent', updated_at = CURRENT_TIMESTAMP`,
    );

    for (const achievement of achievementCatalog) {
      await txn.runAsync(
        `INSERT OR IGNORE INTO user_achievements (achievement_key, progress_at_unlock)
         VALUES (?, ?)`,
        achievement.key,
        achievement.target,
      );
    }
  });

  await refillAdminResources(db);
}

export async function refillAdminResources(db: SQLiteDatabase) {
  await runInTransaction(db, async (txn) => {
    for (const itemKey of Object.keys(itemCatalog)) {
      await txn.runAsync(
        `INSERT INTO inventory_items (item_key, quantity)
         VALUES (?, 99)
         ON CONFLICT(item_key) DO UPDATE SET
           quantity = MAX(quantity, 99), last_acquired_at = CURRENT_TIMESTAMP`,
        itemKey,
      );
    }

    const gold = await txn.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM gold_events',
    );
    const missingGold = Math.max(0, 999999 - (gold?.total ?? 0));
    if (missingGold > 0) {
      const event = await txn.getFirstAsync<{ id: string }>(
        'SELECT lower(hex(randomblob(16))) AS id',
      );
      await txn.runAsync(
        `INSERT INTO gold_events (client_event_id, amount, reason, source_ref)
         VALUES (?, ?, 'admin_refill', 'admin-lab')`,
        `admin-gold-${event?.id ?? Date.now()}`,
        missingGold,
      );
    }
  });
}

export async function setAdminActiveClass(db: SQLiteDatabase, classKey: StarterClassKey) {
  if (!isStarterClassKey(classKey)) throw new Error('Unknown class.');
  const result = await db.runAsync(
    `UPDATE player_class_state
     SET active_class_key = ?,
         free_change_used = 0,
         free_change_expires_at = datetime('now', '+100 years'),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1
       AND EXISTS (SELECT 1 FROM user_classes WHERE class_key = ?)`,
    classKey,
    classKey,
  );
  if (result.changes === 0) throw new Error('Unlock the admin sandbox first.');
}

export async function getAdminSandboxSummary(db: SQLiteDatabase) {
  const [itemRow, goldRow, classRow, activeClassRow] = await Promise.all([
    db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) AS total FROM inventory_items WHERE quantity > 0',
    ),
    db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM gold_events',
    ),
    db.getFirstAsync<{ total: number }>('SELECT COUNT(*) AS total FROM user_classes'),
    db.getFirstAsync<{ activeClass: string }>(
      'SELECT active_class_key AS activeClass FROM player_class_state WHERE id = 1',
    ),
  ]);
  return {
    items: itemRow?.total ?? 0,
    gold: Math.max(0, goldRow?.total ?? 0),
    classes: classRow?.total ?? 0,
    activeClass: activeClassRow?.activeClass ?? null,
  };
}
