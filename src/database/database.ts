import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 35;

export async function migrateDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const versionResult = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionResult?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentVersion === 0) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        habit_type TEXT NOT NULL DEFAULT 'daily',
        difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
        attribute TEXT NOT NULL CHECK (attribute IN ('strength', 'intelligence', 'discipline', 'vitality', 'creativity')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS habit_completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id INTEGER NOT NULL,
        completion_date TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
        UNIQUE (habit_id, completion_date)
      );

      CREATE INDEX IF NOT EXISTS idx_habit_completions_date
        ON habit_completions(completion_date);
    `);

  }

  if (currentVersion < 2) {
    await db.execAsync(`
      ALTER TABLE habit_completions
        ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'
        CHECK (status IN ('complete', 'undone'));

      ALTER TABLE habit_completions
        ADD COLUMN updated_at TEXT;

      CREATE TABLE IF NOT EXISTS xp_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        completion_id INTEGER NOT NULL,
        transition_number INTEGER NOT NULL,
        amount INTEGER NOT NULL CHECK (amount != 0),
        reason TEXT NOT NULL CHECK (reason IN ('completion', 'undo')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (completion_id) REFERENCES habit_completions(id) ON DELETE CASCADE,
        UNIQUE (completion_id, transition_number)
      );

      CREATE TABLE IF NOT EXISTS attribute_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        completion_id INTEGER NOT NULL,
        transition_number INTEGER NOT NULL,
        attribute TEXT NOT NULL CHECK (attribute IN ('strength', 'intelligence', 'discipline', 'vitality', 'creativity')),
        amount INTEGER NOT NULL CHECK (amount != 0),
        reason TEXT NOT NULL CHECK (reason IN ('completion', 'undo')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (completion_id) REFERENCES habit_completions(id) ON DELETE CASCADE,
        UNIQUE (completion_id, transition_number)
      );

      CREATE TABLE IF NOT EXISTS energy_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        completion_id INTEGER NOT NULL,
        transition_number INTEGER NOT NULL,
        amount INTEGER NOT NULL CHECK (amount != 0),
        reason TEXT NOT NULL CHECK (reason IN ('completion', 'undo')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (completion_id) REFERENCES habit_completions(id) ON DELETE CASCADE,
        UNIQUE (completion_id, transition_number)
      );

      INSERT OR IGNORE INTO xp_events (
        client_event_id, completion_id, transition_number, amount, reason
      )
      SELECT
        'legacy-xp-' || hc.id,
        hc.id,
        1,
        CASE h.difficulty WHEN 'easy' THEN 10 WHEN 'medium' THEN 30 ELSE 80 END,
        'completion'
      FROM habit_completions hc
      JOIN habits h ON h.id = hc.habit_id;

      INSERT OR IGNORE INTO attribute_events (
        client_event_id, completion_id, transition_number, attribute, amount, reason
      )
      SELECT
        'legacy-attribute-' || hc.id,
        hc.id,
        1,
        h.attribute,
        CASE h.difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 3 ELSE 8 END,
        'completion'
      FROM habit_completions hc
      JOIN habits h ON h.id = hc.habit_id;

      INSERT OR IGNORE INTO energy_events (
        client_event_id, completion_id, transition_number, amount, reason
      )
      SELECT
        'legacy-energy-' || hc.id,
        hc.id,
        1,
        CASE h.difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        'completion'
      FROM habit_completions hc
      JOIN habits h ON h.id = hc.habit_id;
    `);
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS daily_clear_chests (
        clear_date TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'earned'
          CHECK (status IN ('earned', 'claimed')),
        earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        claimed_at TEXT
      );
    `);
  }

  if (currentVersion < 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        item_key TEXT PRIMARY KEY,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        first_acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS loot_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        source_ref TEXT,
        item_key TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_loot_events_created_at
        ON loot_events(created_at);

      ALTER TABLE daily_clear_chests
        ADD COLUMN reward_item_key TEXT;

      ALTER TABLE daily_clear_chests
        ADD COLUMN reward_quantity INTEGER;
    `);
  }

  if (currentVersion < 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS dungeon_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_run_id TEXT NOT NULL UNIQUE,
        dungeon_key TEXT NOT NULL,
        dungeon_name TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('cleared', 'failed')),
        energy_cost INTEGER NOT NULL CHECK (energy_cost > 0),
        reward_item_key TEXT,
        reward_quantity INTEGER,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_dungeon_runs_completed_at
        ON dungeon_runs(completed_at);
    `);
  }

  if (currentVersion < 6) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS stat_point_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attribute TEXT NOT NULL
          CHECK (attribute IN ('strength', 'intelligence', 'discipline', 'vitality', 'creativity')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_stat_point_allocations_attribute
        ON stat_point_allocations(attribute);
    `);
  }

  if (currentVersion < 7) {
    await db.execAsync(`
      ALTER TABLE habits
        ADD COLUMN schedule_days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6';

      ALTER TABLE habits
        ADD COLUMN is_required INTEGER NOT NULL DEFAULT 1
        CHECK (is_required IN (0, 1));
    `);
  }

  if (currentVersion < 8) {
    await db.execAsync(`
      ALTER TABLE habits
        ADD COLUMN is_paused INTEGER NOT NULL DEFAULT 0
        CHECK (is_paused IN (0, 1));
    `);
  }

  if (currentVersion < 9) {
    await db.execAsync(`
      ALTER TABLE habits
        ADD COLUMN goal_type TEXT NOT NULL DEFAULT 'single'
        CHECK (goal_type IN ('single', 'counter'));

      ALTER TABLE habits
        ADD COLUMN target_count INTEGER NOT NULL DEFAULT 1
        CHECK (target_count >= 1);

      CREATE TABLE IF NOT EXISTS habit_counter_progress (
        habit_id INTEGER NOT NULL,
        progress_date TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (habit_id, progress_date),
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_habit_counter_progress_date
        ON habit_counter_progress(progress_date);
    `);
  }

  if (currentVersion < 10) {
    const onboardingCompleted = currentVersion === 0 ? 0 : 1;
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS player_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        nickname TEXT NOT NULL,
        avatar_mode TEXT NOT NULL DEFAULT 'system'
          CHECK (avatar_mode IN ('system', 'initials')),
        life_areas TEXT NOT NULL DEFAULT '',
        onboarding_completed INTEGER NOT NULL DEFAULT 0
          CHECK (onboarding_completed IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO player_profile (
        id, nickname, avatar_mode, life_areas, onboarding_completed
      ) VALUES (1, 'Shadow Candidate', 'system', '', ${onboardingCompleted});
    `);
  }

  if (currentVersion < 11) {
    await db.execAsync(`
      ALTER TABLE habits
        ADD COLUMN reminder_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (reminder_enabled IN (0, 1));

      ALTER TABLE habits
        ADD COLUMN reminder_time TEXT NOT NULL DEFAULT '09:00';

      ALTER TABLE habits
        ADD COLUMN reminder_tone TEXT NOT NULL DEFAULT 'gentle'
        CHECK (reminder_tone IN ('gentle', 'system', 'strict'));

      CREATE TABLE IF NOT EXISTS habit_reminder_notifications (
        notification_id TEXT PRIMARY KEY,
        habit_id INTEGER NOT NULL,
        weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_habit_reminder_notifications_habit
        ON habit_reminder_notifications(habit_id);
    `);
  }

  if (currentVersion < 12) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS habit_weekly_checkins (
        habit_id INTEGER NOT NULL,
        checkin_date TEXT NOT NULL,
        week_start TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (habit_id, checkin_date),
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_habit_weekly_checkins_week
        ON habit_weekly_checkins(habit_id, week_start);
    `);
  }

  if (currentVersion < 13) {
    await db.execAsync(`
      ALTER TABLE habits
        ADD COLUMN target_duration_minutes INTEGER NOT NULL DEFAULT 0
        CHECK (target_duration_minutes >= 0);

      CREATE TABLE IF NOT EXISTS habit_timer_progress (
        habit_id INTEGER NOT NULL,
        progress_date TEXT NOT NULL,
        accumulated_seconds INTEGER NOT NULL DEFAULT 0
          CHECK (accumulated_seconds >= 0),
        started_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (habit_id, progress_date),
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_habit_timer_progress_date
        ON habit_timer_progress(progress_date);
    `);
  }

  if (currentVersion < 14) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS boss_quests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        attribute TEXT NOT NULL
          CHECK (attribute IN ('strength', 'intelligence', 'discipline', 'vitality', 'creativity')),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'completed', 'archived')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        archived_at TEXT
      );

      CREATE TABLE IF NOT EXISTS boss_quest_milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        boss_quest_id INTEGER NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 1),
        title TEXT NOT NULL,
        difficulty TEXT NOT NULL
          CHECK (difficulty IN ('easy', 'medium', 'hard')),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'complete')),
        completed_at TEXT,
        completion_date TEXT,
        FOREIGN KEY (boss_quest_id) REFERENCES boss_quests(id) ON DELETE CASCADE,
        UNIQUE (boss_quest_id, position)
      );

      CREATE INDEX IF NOT EXISTS idx_boss_quest_milestones_status
        ON boss_quest_milestones(boss_quest_id, status, position);

      CREATE TABLE IF NOT EXISTS boss_quest_reward_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        boss_quest_id INTEGER NOT NULL,
        milestone_id INTEGER,
        event_date TEXT NOT NULL,
        xp_amount INTEGER NOT NULL CHECK (xp_amount >= 0),
        attribute TEXT NOT NULL
          CHECK (attribute IN ('strength', 'intelligence', 'discipline', 'vitality', 'creativity')),
        stat_xp_amount INTEGER NOT NULL CHECK (stat_xp_amount >= 0),
        energy_amount INTEGER NOT NULL CHECK (energy_amount >= 0),
        reason TEXT NOT NULL CHECK (reason IN ('milestone', 'final_bonus')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (boss_quest_id) REFERENCES boss_quests(id) ON DELETE CASCADE,
        FOREIGN KEY (milestone_id) REFERENCES boss_quest_milestones(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_boss_quest_reward_events_date
        ON boss_quest_reward_events(event_date);
    `);
  }

  if (currentVersion < 15) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        timezone TEXT NOT NULL DEFAULT 'system',
        day_cutoff_hour INTEGER NOT NULL DEFAULT 4
          CHECK (day_cutoff_hour BETWEEN 0 AND 12),
        quiet_hours_enabled INTEGER NOT NULL DEFAULT 0
          CHECK (quiet_hours_enabled IN (0, 1)),
        quiet_start TEXT NOT NULL DEFAULT '22:00',
        quiet_end TEXT NOT NULL DEFAULT '07:00',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO user_settings (
        id, timezone, day_cutoff_hour, quiet_hours_enabled, quiet_start, quiet_end
      ) VALUES (1, 'system', 4, 0, '22:00', '07:00');

      ALTER TABLE habit_completions
        ADD COLUMN local_timezone TEXT NOT NULL DEFAULT 'system';

      ALTER TABLE habit_completions
        ADD COLUMN day_cutoff_hour INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE boss_quest_reward_events
        ADD COLUMN local_timezone TEXT NOT NULL DEFAULT 'system';

      ALTER TABLE boss_quest_reward_events
        ADD COLUMN day_cutoff_hour INTEGER NOT NULL DEFAULT 0;
    `);
  }

  if (currentVersion < 16) {
    await db.execAsync(`
      ALTER TABLE habits
        ADD COLUMN start_date TEXT NOT NULL DEFAULT '1970-01-01';

      UPDATE habits
      SET start_date = substr(created_at, 1, 10)
      WHERE start_date = '1970-01-01';

      CREATE TABLE IF NOT EXISTS recovery_quest_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        trigger_date TEXT NOT NULL UNIQUE,
        event_date TEXT NOT NULL,
        last_active_date TEXT NOT NULL,
        missed_days INTEGER NOT NULL CHECK (missed_days > 0),
        xp_amount INTEGER NOT NULL CHECK (xp_amount >= 0),
        attribute TEXT NOT NULL DEFAULT 'discipline'
          CHECK (attribute IN ('strength', 'intelligence', 'discipline', 'vitality', 'creativity')),
        stat_xp_amount INTEGER NOT NULL CHECK (stat_xp_amount >= 0),
        energy_amount INTEGER NOT NULL CHECK (energy_amount >= 0),
        local_timezone TEXT NOT NULL,
        day_cutoff_hour INTEGER NOT NULL,
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_recovery_quest_events_date
        ON recovery_quest_events(event_date);
    `);
  }

  if (currentVersion < 17) {
    await db.execAsync(`
      ALTER TABLE habits
        ADD COLUMN secondary_attribute TEXT
        CHECK (
          secondary_attribute IS NULL OR
          secondary_attribute IN ('strength', 'intelligence', 'discipline', 'vitality', 'creativity')
        );

      BEGIN TRANSACTION;

      CREATE TABLE attribute_events_v17 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        completion_id INTEGER NOT NULL,
        transition_number INTEGER NOT NULL,
        attribute TEXT NOT NULL
          CHECK (attribute IN ('strength', 'intelligence', 'discipline', 'vitality', 'creativity')),
        amount INTEGER NOT NULL CHECK (amount != 0),
        reason TEXT NOT NULL CHECK (reason IN ('completion', 'undo')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (completion_id) REFERENCES habit_completions(id) ON DELETE CASCADE,
        UNIQUE (completion_id, transition_number, attribute)
      );

      INSERT INTO attribute_events_v17 (
        id,
        client_event_id,
        completion_id,
        transition_number,
        attribute,
        amount,
        reason,
        created_at
      )
      SELECT
        id,
        client_event_id,
        completion_id,
        transition_number,
        attribute,
        amount,
        reason,
        created_at
      FROM attribute_events;

      DROP TABLE attribute_events;
      ALTER TABLE attribute_events_v17 RENAME TO attribute_events;

      CREATE INDEX idx_attribute_events_attribute
        ON attribute_events(attribute);

      COMMIT;
    `);
  }

  if (currentVersion < 18) {
    await db.execAsync(`
      BEGIN TRANSACTION;

      CREATE TABLE dungeon_runs_v18 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_run_id TEXT NOT NULL UNIQUE,
        dungeon_key TEXT NOT NULL,
        dungeon_name TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('cleared', 'failed')),
        energy_cost INTEGER NOT NULL CHECK (energy_cost >= 0),
        reward_item_key TEXT,
        reward_quantity INTEGER,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO dungeon_runs_v18 (
        id,
        client_run_id,
        dungeon_key,
        dungeon_name,
        difficulty,
        status,
        energy_cost,
        reward_item_key,
        reward_quantity,
        started_at,
        completed_at
      )
      SELECT
        id,
        client_run_id,
        dungeon_key,
        dungeon_name,
        difficulty,
        status,
        energy_cost,
        reward_item_key,
        reward_quantity,
        started_at,
        completed_at
      FROM dungeon_runs;

      DROP TABLE dungeon_runs;
      ALTER TABLE dungeon_runs_v18 RENAME TO dungeon_runs;

      CREATE INDEX idx_dungeon_runs_completed_at
        ON dungeon_runs(completed_at);

      CREATE TABLE IF NOT EXISTS dungeon_battle_sessions (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        client_run_id TEXT NOT NULL UNIQUE,
        dungeon_key TEXT NOT NULL,
        dungeon_name TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        energy_cost INTEGER NOT NULL CHECK (energy_cost >= 0),
        player_hp INTEGER NOT NULL CHECK (player_hp >= 0),
        enemy_hp INTEGER NOT NULL CHECK (enemy_hp >= 0),
        max_player_hp INTEGER NOT NULL CHECK (max_player_hp > 0),
        max_enemy_hp INTEGER NOT NULL CHECK (max_enemy_hp > 0),
        basic_damage INTEGER NOT NULL CHECK (basic_damage > 0),
        skill_damage INTEGER NOT NULL CHECK (skill_damage > 0),
        potion_healing INTEGER NOT NULL CHECK (potion_healing > 0),
        enemy_power INTEGER NOT NULL CHECK (enemy_power >= 0),
        turn_number INTEGER NOT NULL DEFAULT 1 CHECK (turn_number > 0),
        skill_cooldown INTEGER NOT NULL DEFAULT 0 CHECK (skill_cooldown >= 0),
        combat_log TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      COMMIT;
    `);
  }

  if (currentVersion < 19) {
    await db.execAsync(`
      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN equipment_defense INTEGER NOT NULL DEFAULT 0
        CHECK (equipment_defense >= 0);

      CREATE TABLE IF NOT EXISTS equipment_progress (
        item_key TEXT PRIMARY KEY,
        upgrade_level INTEGER NOT NULL DEFAULT 0
          CHECK (upgrade_level BETWEEN 0 AND 5),
        is_locked INTEGER NOT NULL DEFAULT 0
          CHECK (is_locked IN (0, 1)),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_key) REFERENCES inventory_items(item_key) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS equipment_loadouts (
        loadout_key TEXT NOT NULL,
        slot TEXT NOT NULL,
        item_key TEXT NOT NULL,
        equipped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (loadout_key, slot),
        FOREIGN KEY (item_key) REFERENCES inventory_items(item_key) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_equipment_loadouts_item
        ON equipment_loadouts(loadout_key, item_key);

      CREATE TABLE IF NOT EXISTS gold_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        amount INTEGER NOT NULL CHECK (amount != 0),
        reason TEXT NOT NULL,
        source_ref TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_gold_events_created_at
        ON gold_events(created_at);

      CREATE TABLE IF NOT EXISTS blacksmith_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        action TEXT NOT NULL CHECK (action IN ('salvage', 'upgrade')),
        item_key TEXT NOT NULL,
        level_before INTEGER NOT NULL CHECK (level_before >= 0),
        level_after INTEGER,
        gold_delta INTEGER NOT NULL,
        material_key TEXT,
        material_delta INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO gold_events (
        client_event_id,
        amount,
        reason,
        source_ref,
        created_at
      )
      SELECT
        'legacy-dungeon-gold-' || id,
        10,
        'dungeon_clear',
        client_run_id,
        completed_at
      FROM dungeon_runs
      WHERE status = 'cleared';
    `);
  }

  if (currentVersion < 20) {
    await db.execAsync(`
      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN damage_taken INTEGER NOT NULL DEFAULT 0
        CHECK (damage_taken >= 0);

      ALTER TABLE dungeon_runs
        ADD COLUMN player_hp_remaining INTEGER;

      ALTER TABLE dungeon_runs
        ADD COLUMN max_player_hp INTEGER;

      ALTER TABLE dungeon_runs
        ADD COLUMN damage_taken INTEGER;

      ALTER TABLE dungeon_runs
        ADD COLUMN turns_taken INTEGER;

      CREATE TABLE IF NOT EXISTS equipment_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        action TEXT NOT NULL CHECK (action IN ('equip', 'unequip')),
        item_key TEXT NOT NULL,
        loadout_key TEXT NOT NULL,
        slot TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_equipment_events_action
        ON equipment_events(action, created_at);

      INSERT OR IGNORE INTO equipment_events (
        client_event_id,
        action,
        item_key,
        loadout_key,
        slot,
        created_at
      )
      SELECT
        'legacy-equip-' || loadout_key || '-' || slot,
        'equip',
        item_key,
        loadout_key,
        slot,
        equipped_at
      FROM equipment_loadouts;

      CREATE TABLE IF NOT EXISTS user_achievements (
        achievement_key TEXT PRIMARY KEY,
        progress_at_unlock INTEGER NOT NULL,
        unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  if (currentVersion < 21) {
    await db.execAsync(`
      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN class_key TEXT NOT NULL DEFAULT 'unawakened';

      CREATE TABLE IF NOT EXISTS player_class_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_class_key TEXT NOT NULL,
        awakened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        free_change_expires_at TEXT NOT NULL,
        free_change_used INTEGER NOT NULL DEFAULT 0
          CHECK (free_change_used IN (0, 1)),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_classes (
        class_key TEXT PRIMARY KEY,
        mastery_xp INTEGER NOT NULL DEFAULT 0 CHECK (mastery_xp >= 0),
        unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_skills (
        skill_key TEXT PRIMARY KEY,
        class_key TEXT NOT NULL,
        skill_type TEXT NOT NULL CHECK (skill_type IN ('active', 'passive')),
        is_equipped INTEGER NOT NULL DEFAULT 0 CHECK (is_equipped IN (0, 1)),
        slot_order INTEGER,
        unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_key) REFERENCES user_classes(class_key) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_skills_class
        ON user_skills(class_key, skill_type, is_equipped);

      CREATE TABLE IF NOT EXISTS class_change_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        previous_class_key TEXT,
        next_class_key TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('initial', 'free_change', 'reawakening')),
        changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_class_change_events_changed_at
        ON class_change_events(changed_at);
    `);
  }

  if (currentVersion < 22) {
    await db.execAsync(`
      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN class_resource INTEGER NOT NULL DEFAULT 0
        CHECK (class_resource >= 0);

      ALTER TABLE dungeon_runs
        ADD COLUMN class_key TEXT NOT NULL DEFAULT 'unawakened';

      ALTER TABLE dungeon_runs
        ADD COLUMN mastery_xp_earned INTEGER NOT NULL DEFAULT 0
        CHECK (mastery_xp_earned >= 0);

      CREATE TABLE IF NOT EXISTS class_mastery_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        class_key TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        dungeon_run_id INTEGER NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('clear', 'attempt')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_key) REFERENCES user_classes(class_key) ON DELETE CASCADE,
        FOREIGN KEY (dungeon_run_id) REFERENCES dungeon_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_class_mastery_events_class
        ON class_mastery_events(class_key, created_at);

    `);
  }

  if (currentVersion < 23) {
    await db.execAsync(`
      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN active_skill_keys TEXT NOT NULL DEFAULT '';

      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN passive_skill_keys TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS skill_loadout_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        class_key TEXT NOT NULL,
        skill_key TEXT NOT NULL,
        skill_type TEXT NOT NULL CHECK (skill_type IN ('active', 'passive')),
        previous_slot INTEGER,
        next_slot INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_key) REFERENCES user_classes(class_key) ON DELETE CASCADE,
        FOREIGN KEY (skill_key) REFERENCES user_skills(skill_key) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_skill_loadout_events_class
        ON skill_loadout_events(class_key, created_at);
    `);
  }

  if (currentVersion < 24) {
    await db.execAsync(`
      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN player_statuses TEXT NOT NULL DEFAULT '[]';

      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN enemy_statuses TEXT NOT NULL DEFAULT '[]';
    `);
  }

  if (currentVersion < 25) {
    await db.execAsync(`
      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN room_index INTEGER NOT NULL DEFAULT 4 CHECK (room_index BETWEEN 1 AND 4);

      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN room_type TEXT NOT NULL DEFAULT 'boss'
        CHECK (room_type IN ('combat', 'path_choice', 'event', 'elite', 'boss_ready', 'boss'));

      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN route_key TEXT CHECK (route_key IN ('safe', 'risky'));

      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN rooms_cleared INTEGER NOT NULL DEFAULT 0 CHECK (rooms_cleared BETWEEN 0 AND 4);

      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN enemy_name TEXT NOT NULL DEFAULT 'Cinder Warden';

      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN boss_max_enemy_hp INTEGER NOT NULL DEFAULT 1 CHECK (boss_max_enemy_hp > 0);

      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN turns_elapsed INTEGER NOT NULL DEFAULT 0 CHECK (turns_elapsed >= 0);

      ALTER TABLE dungeon_battle_sessions
        ADD COLUMN interim_gold INTEGER NOT NULL DEFAULT 0 CHECK (interim_gold >= 0);

      ALTER TABLE dungeon_runs
        ADD COLUMN route_key TEXT CHECK (route_key IN ('safe', 'risky'));

      ALTER TABLE dungeon_runs
        ADD COLUMN rooms_cleared INTEGER NOT NULL DEFAULT 1 CHECK (rooms_cleared BETWEEN 0 AND 4);

      ALTER TABLE dungeon_runs
        ADD COLUMN interim_gold INTEGER NOT NULL DEFAULT 0 CHECK (interim_gold >= 0);

      CREATE TABLE IF NOT EXISTS dungeon_room_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        client_run_id TEXT NOT NULL,
        room_index INTEGER NOT NULL CHECK (room_index BETWEEN 1 AND 4),
        room_type TEXT NOT NULL,
        route_key TEXT,
        outcome TEXT NOT NULL CHECK (outcome IN ('cleared', 'resolved')),
        gold_earned INTEGER NOT NULL DEFAULT 0 CHECK (gold_earned >= 0),
        item_key TEXT,
        item_quantity INTEGER NOT NULL DEFAULT 0 CHECK (item_quantity >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_dungeon_room_events_run
        ON dungeon_room_events(client_run_id, room_index);
    `);
  }

  if (currentVersion < 26) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS player_rank_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_rank_key TEXT NOT NULL DEFAULT 'unawakened',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO player_rank_state (id, current_rank_key)
      SELECT
        1,
        CASE
          WHEN EXISTS (SELECT 1 FROM player_class_state WHERE id = 1) THEN 'e_rank'
          ELSE 'unawakened'
        END;

      CREATE TABLE IF NOT EXISTS rank_trial_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        previous_rank_key TEXT NOT NULL,
        next_rank_key TEXT NOT NULL,
        player_level INTEGER NOT NULL CHECK (player_level > 0),
        dungeon_clears INTEGER NOT NULL CHECK (dungeon_clears >= 0),
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_rank_trial_events_completed
        ON rank_trial_events(completed_at);

      INSERT OR IGNORE INTO rank_trial_events (
        client_event_id,
        previous_rank_key,
        next_rank_key,
        player_level,
        dungeon_clears
      )
      SELECT
        'legacy-awakening-rank',
        'unawakened',
        'e_rank',
        10,
        COALESCE((SELECT COUNT(*) FROM dungeon_runs WHERE status = 'cleared'), 0)
      WHERE EXISTS (SELECT 1 FROM player_class_state WHERE id = 1);
    `);
  }

  if (currentVersion < 27) {
    await db.execAsync(`
      ALTER TABLE user_settings
        ADD COLUMN notification_tone TEXT NOT NULL DEFAULT 'gentle'
        CHECK (notification_tone IN ('gentle', 'system', 'strict'));

      ALTER TABLE user_settings
        ADD COLUMN morning_briefing_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (morning_briefing_enabled IN (0, 1));

      ALTER TABLE user_settings
        ADD COLUMN morning_briefing_time TEXT NOT NULL DEFAULT '08:00';

      ALTER TABLE user_settings
        ADD COLUMN evening_checkin_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (evening_checkin_enabled IN (0, 1));

      ALTER TABLE user_settings
        ADD COLUMN evening_checkin_time TEXT NOT NULL DEFAULT '20:00';

      ALTER TABLE user_settings
        ADD COLUMN weekly_review_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (weekly_review_enabled IN (0, 1));

      ALTER TABLE user_settings
        ADD COLUMN weekly_review_day INTEGER NOT NULL DEFAULT 0
        CHECK (weekly_review_day BETWEEN 0 AND 6);

      ALTER TABLE user_settings
        ADD COLUMN weekly_review_time TEXT NOT NULL DEFAULT '18:00';

      ALTER TABLE user_settings
        ADD COLUMN recovery_reminder_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (recovery_reminder_enabled IN (0, 1));

      ALTER TABLE user_settings
        ADD COLUMN recovery_reminder_time TEXT NOT NULL DEFAULT '10:00';

      CREATE TABLE IF NOT EXISTS system_notification_schedules (
        notification_key TEXT PRIMARY KEY,
        notification_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  if (currentVersion < 28) {
    await db.execAsync(`
      ALTER TABLE user_settings
        ADD COLUMN progress_alerts_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (progress_alerts_enabled IN (0, 1));

      CREATE TABLE IF NOT EXISTS progress_notification_state (
        notification_key TEXT PRIMARY KEY,
        is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        event_token TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  if (currentVersion < 29) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS player_recalibration_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        free_credits INTEGER NOT NULL DEFAULT 0 CHECK (free_credits BETWEEN 0 AND 1),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO player_recalibration_state (id, free_credits)
      SELECT
        1,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM class_change_events
            WHERE reason IN ('free_change', 'reawakening')
          ) THEN 1
          ELSE 0
        END;

      CREATE TABLE IF NOT EXISTS stat_recalibration_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        allocation_cutoff_id INTEGER NOT NULL CHECK (allocation_cutoff_id > 0),
        returned_points INTEGER NOT NULL CHECK (returned_points > 0),
        source TEXT NOT NULL CHECK (source IN ('class_change', 'quest')),
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_stat_recalibration_events_completed
        ON stat_recalibration_events(completed_at);

      CREATE TABLE IF NOT EXISTS reawakening_quest_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        previous_class_key TEXT NOT NULL,
        next_class_key TEXT NOT NULL,
        dungeon_clears INTEGER NOT NULL CHECK (dungeon_clears > 0),
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_reawakening_quest_events_completed
        ON reawakening_quest_events(completed_at);
    `);
  }

  if (currentVersion < 30) {
    await db.execAsync(`
      ALTER TABLE player_profile
        ADD COLUMN custom_avatar_uri TEXT;
    `);
  }

  if (currentVersion < 31) {
    await db.execAsync(`
      ALTER TABLE user_settings
        ADD COLUMN reduce_motion_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (reduce_motion_enabled IN (0, 1));

      ALTER TABLE user_settings
        ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (sound_enabled IN (0, 1));

      ALTER TABLE user_settings
        ADD COLUMN haptics_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (haptics_enabled IN (0, 1));
    `);
  }

  if (currentVersion < 32) {
    await db.execAsync(`
      ALTER TABLE habits
        ADD COLUMN icon_key TEXT;

      ALTER TABLE habits
        ADD COLUMN color_key TEXT;
    `);
  }

  if (currentVersion < 33) {
    await db.execAsync(`
      ALTER TABLE user_settings
        ADD COLUMN streak_risk_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (streak_risk_enabled IN (0, 1));

      ALTER TABLE user_settings
        ADD COLUMN streak_risk_time TEXT NOT NULL DEFAULT '21:00';
    `);
  }

  if (currentVersion < 34) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS habit_reminder_snoozes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_event_id TEXT NOT NULL UNIQUE,
        habit_id INTEGER NOT NULL,
        reminder_time TEXT NOT NULL,
        snoozed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_habit_reminder_snoozes_habit_time
        ON habit_reminder_snoozes(habit_id, reminder_time, snoozed_at);
    `);
  }

  if (currentVersion < 35) {
    await db.execAsync(`
      UPDATE player_rank_state
      SET current_rank_key = 'sss_rank', updated_at = CURRENT_TIMESTAMP
      WHERE current_rank_key = 'ascendant';

      UPDATE rank_trial_events
      SET previous_rank_key = 'sss_rank'
      WHERE previous_rank_key = 'ascendant';

      UPDATE rank_trial_events
      SET next_rank_key = 'sss_rank'
      WHERE next_rank_key = 'ascendant';
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
