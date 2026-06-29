import type { SQLiteDatabase } from 'expo-sqlite';

export type HabitDifficulty = 'easy' | 'medium' | 'hard';
export type HabitAttribute =
  | 'strength'
  | 'intelligence'
  | 'discipline'
  | 'vitality'
  | 'creativity';

export type Habit = {
  id: number;
  title: string;
  description: string;
  difficulty: HabitDifficulty;
  attribute: HabitAttribute;
  complete: boolean;
};

export type NewHabit = {
  title: string;
  description: string;
  difficulty: HabitDifficulty;
  attribute: HabitAttribute;
};

type HabitRow = Omit<Habit, 'complete'> & { complete: number };

export const rewardByDifficulty = {
  easy: { xp: 10, statXp: 1 },
  medium: { xp: 30, statXp: 3 },
  hard: { xp: 80, statXp: 8 },
} as const;

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getTodayHabits(db: SQLiteDatabase): Promise<Habit[]> {
  const today = getLocalDateKey();
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT
       h.id,
       h.title,
       h.description,
       h.difficulty,
       h.attribute,
       CASE WHEN hc.id IS NULL THEN 0 ELSE 1 END AS complete
     FROM habits h
     LEFT JOIN habit_completions hc
       ON hc.habit_id = h.id AND hc.completion_date = ?
     WHERE h.is_active = 1 AND h.habit_type = 'daily'
     ORDER BY h.created_at ASC, h.id ASC`,
    today,
  );

  return rows.map((row) => ({ ...row, complete: row.complete === 1 }));
}

export async function createHabit(db: SQLiteDatabase, habit: NewHabit) {
  const title = habit.title.trim();
  const description = habit.description.trim();

  if (!title) {
    throw new Error('Habit title is required.');
  }

  await db.runAsync(
    `INSERT INTO habits (title, description, difficulty, attribute)
     VALUES (?, ?, ?, ?)`,
    title,
    description,
    habit.difficulty,
    habit.attribute,
  );
}

export async function setHabitCompletion(
  db: SQLiteDatabase,
  habitId: number,
  complete: boolean,
) {
  const today = getLocalDateKey();

  if (complete) {
    await db.runAsync(
      `INSERT OR IGNORE INTO habit_completions (habit_id, completion_date)
       VALUES (?, ?)`,
      habitId,
      today,
    );
    return;
  }

  await db.runAsync(
    'DELETE FROM habit_completions WHERE habit_id = ? AND completion_date = ?',
    habitId,
    today,
  );
}
