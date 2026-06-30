import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 3;

const seedHabits = [
  ['Morning workout', 'Complete 30 minutes', 'hard', 'strength'],
  ['Deep work', 'Focus for 45 minutes', 'medium', 'discipline'],
  ['Read a book', 'Read for 20 minutes', 'medium', 'intelligence'],
  ['Evening walk', 'Reach 3,000 steps', 'easy', 'vitality'],
] as const;

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

    const habitCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM habits',
    );

    if ((habitCount?.count ?? 0) === 0) {
      for (const [title, description, difficulty, attribute] of seedHabits) {
        await db.runAsync(
          `INSERT INTO habits (title, description, difficulty, attribute)
           VALUES (?, ?, ?, ?)`,
          title,
          description,
          difficulty,
          attribute,
        );
      }
    }
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

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
