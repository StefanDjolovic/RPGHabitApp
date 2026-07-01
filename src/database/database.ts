import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 17;

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

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
