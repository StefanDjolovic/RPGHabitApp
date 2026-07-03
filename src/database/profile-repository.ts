import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { createHabit, type NewHabit } from '@/src/database/habit-repository';
import type { LifeArea } from '@/src/onboarding/starter-habits';

export type AvatarMode = 'system' | 'initials' | 'custom';

export type PlayerProfile = {
  nickname: string;
  avatarMode: AvatarMode;
  customAvatarUri: string | null;
  lifeAreas: LifeArea[];
  onboardingCompleted: boolean;
};

type PlayerProfileRow = Omit<
  PlayerProfile,
  'avatarMode' | 'lifeAreas' | 'onboardingCompleted'
> & {
  avatarMode: 'system' | 'initials';
  lifeAreas: string;
  onboardingCompleted: number;
};

export const INITIAL_PLAYER_PROFILE: PlayerProfile = {
  nickname: 'Shadow Candidate',
  avatarMode: 'system',
  customAvatarUri: null,
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
       custom_avatar_uri AS customAvatarUri,
       life_areas AS lifeAreas,
       onboarding_completed AS onboardingCompleted
     FROM player_profile
     WHERE id = 1`,
  );

  if (!row) return INITIAL_PLAYER_PROFILE;

  return {
    ...row,
    avatarMode: row.customAvatarUri ? 'custom' : row.avatarMode,
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
      profile.avatarMode === 'initials' ? 'initials' : 'system',
      lifeAreas,
    );
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => applyOnboarding(db));
  } else {
    await db.withExclusiveTransactionAsync(applyOnboarding);
  }
}

export async function updatePlayerProfile(
  db: SQLiteDatabase,
  profile: Pick<PlayerProfile, 'nickname' | 'avatarMode' | 'customAvatarUri'>,
) {
  const nickname = profile.nickname.trim();
  if (!nickname) throw new Error('Nickname is required.');
  if (nickname.length > 30) throw new Error('Nickname must be 30 characters or fewer.');
  if (profile.avatarMode === 'custom' && !profile.customAvatarUri) {
    throw new Error('Choose a custom avatar image first.');
  }

  await db.runAsync(
    `UPDATE player_profile
     SET nickname = ?,
         avatar_mode = ?,
         custom_avatar_uri = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    nickname,
    profile.avatarMode === 'initials' ? 'initials' : 'system',
    profile.avatarMode === 'custom' ? profile.customAvatarUri : null,
  );
  return getPlayerProfile(db);
}
