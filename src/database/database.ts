import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

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

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
