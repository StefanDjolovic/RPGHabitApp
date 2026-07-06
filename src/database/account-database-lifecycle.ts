import { deleteDatabaseAsync } from 'expo-sqlite';

import { secureSessionStorage } from '@/src/auth/secure-session-storage';

const DATABASE_OWNER_KEY = 'habit-rpg.database-owner';
const PENDING_DELETION_KEY = 'habit-rpg.pending-database-deletion';
const LEGACY_DATABASE_NAME = 'habit-rpg.db';
const GUEST_DATABASE_NAME = 'habit-rpg-guest.db';

export type ResolvedAccountDatabase = {
  identity: string;
  name: string;
};

function accountDatabaseName(userId: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9-]/g, '');
  if (!safeUserId) throw new Error('Account identifier is invalid.');
  return `habit-rpg-${safeUserId}.db`;
}

export async function markAccountDatabaseForDeletion(userId: string) {
  await secureSessionStorage.setItem(PENDING_DELETION_KEY, userId);
}

async function deletePendingAccountDatabase(ownerId: string | null) {
  const deletedUserId = await secureSessionStorage.getItem(PENDING_DELETION_KEY);
  if (!deletedUserId) return ownerId;

  const databaseName = ownerId === deletedUserId
    ? LEGACY_DATABASE_NAME
    : accountDatabaseName(deletedUserId);
  await deleteDatabaseAsync(databaseName).catch(() => undefined);
  await secureSessionStorage.removeItem(PENDING_DELETION_KEY);

  if (ownerId === deletedUserId) {
    await secureSessionStorage.removeItem(DATABASE_OWNER_KEY);
    return null;
  }
  return ownerId;
}

export async function resolveAccountDatabase(
  userId: string | null,
): Promise<ResolvedAccountDatabase> {
  const storedOwnerId = await secureSessionStorage.getItem(DATABASE_OWNER_KEY);
  const ownerId = userId ? storedOwnerId : await deletePendingAccountDatabase(storedOwnerId);
  const identity = userId ?? 'guest';

  if (!userId) {
    return {
      identity,
      name: ownerId ? GUEST_DATABASE_NAME : LEGACY_DATABASE_NAME,
    };
  }

  if (!ownerId) {
    await secureSessionStorage.setItem(DATABASE_OWNER_KEY, userId);
    return { identity, name: LEGACY_DATABASE_NAME };
  }

  return {
    identity,
    name: ownerId === userId ? LEGACY_DATABASE_NAME : accountDatabaseName(userId),
  };
}
