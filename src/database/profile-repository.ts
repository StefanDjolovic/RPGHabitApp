import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { createHabit, type NewHabit } from '@/src/database/habit-repository';
import type { LifeArea } from '@/src/onboarding/starter-habits';

export type AvatarMode = 'system' | 'initials';

export type PlayerProfile = {
  nickname: string;
  avatarMode: AvatarMode;
  lifeAreas: LifeArea[];
  onboardingCompleted: boolean;
};

type PlayerProfileRow = Omit<PlayerProfile, 'lifeAreas' | 'onboardingCompleted'> & {
  lifeAreas: string;
  onboardingCompleted: number;
};

export const INITIAL_PLAYER_PROFILE: PlayerProfile = {
  nickname: 'Shadow Candidate',
  avatarMode: 'system',
  lifeAreas: [],
  onboardingCompleted: false,
};

export function getProfileInitials(nickname: string) {
  const parts = nickname.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'HC';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function parseLifeAreas(value: string) {
  const validAreas = new Set<LifeArea>([
    'strength',
    'intelligence',
    'discipline',
    'vitality',
    'creativity',
  ]);
  return value
    .split(',')
    .filter((area): area is LifeArea => validAreas.has(area as LifeArea));
}

export async function getPlayerProfile(db: SQLiteDatabase): Promise<PlayerProfile> {
  const row = await db.getFirstAsync<PlayerProfileRow>(
    `SELECT
       nickname,
       avatar_mode AS avatarMode,
       life_areas AS lifeAreas,
       onboarding_completed AS onboardingCompleted
     FROM player_profile
     WHERE id = 1`,
  );

  if (!row) return INITIAL_PLAYER_PROFILE;

  return {
    ...row,
    lifeAreas: parseLifeAreas(row.lifeAreas),
    onboardingCompleted: row.onboardingCompleted === 1,
  };
}

export async function completeOnboarding(
  db: SQLiteDatabase,
  profile: Omit<PlayerProfile, 'onboardingCompleted'>,
  habits: NewHabit[],
) {
  const nickname = profile.nickname.trim();
  if (!nickname) throw new Error('Nickname is required.');
  if (habits.length === 0) throw new Error('Choose at least one starter habit.');

  const lifeAreas = [...new Set(profile.lifeAreas)].join(',');
  const applyOnboarding = async (txn: SQLiteDatabase) => {
    const current = await txn.getFirstAsync<{ completed: number }>(
      'SELECT onboarding_completed AS completed FROM player_profile WHERE id = 1',
    );
    if (current?.completed === 1) return;

    for (const habit of habits) {
      await createHabit(txn, habit);
    }

    await txn.runAsync(
      `UPDATE player_profile
       SET nickname = ?,
           avatar_mode = ?,
           life_areas = ?,
           onboarding_completed = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      nickname,
      profile.avatarMode,
      lifeAreas,
    );
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyOnboarding(db));
  } else {
    await db.withExclusiveTransactionAsync(applyOnboarding);
  }
}
