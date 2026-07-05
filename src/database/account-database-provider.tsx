import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/src/auth/auth-context';
import { secureSessionStorage } from '@/src/auth/secure-session-storage';

const DATABASE_OWNER_KEY = 'habit-rpg.database-owner';
const LEGACY_DATABASE_NAME = 'habit-rpg.db';
const GUEST_DATABASE_NAME = 'habit-rpg-guest.db';

type ResolvedDatabase = {
  identity: string;
  name: string;
};

function accountDatabaseName(userId: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9-]/g, '');
  if (!safeUserId) throw new Error('Account identifier is invalid.');
  return `habit-rpg-${safeUserId}.db`;
}

async function resolveDatabase(userId: string | null): Promise<ResolvedDatabase> {
  const ownerId = await secureSessionStorage.getItem(DATABASE_OWNER_KEY);
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

export function AccountDatabaseProvider({
  children,
  onInit,
}: {
  children: ReactNode;
  onInit: (db: SQLiteDatabase) => Promise<void>;
}) {
  const { loading: authLoading, user } = useAuth();
  const identity = user?.id ?? 'guest';
  const [resolved, setResolved] = useState<ResolvedDatabase | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setError('');

    void resolveDatabase(user?.id ?? null)
      .then((database) => {
        if (active) setResolved(database);
      })
      .catch((databaseError) => {
        if (!active) return;
        setError(databaseError instanceof Error ? databaseError.message : 'Local profile could not be opened.');
      });

    return () => {
      active = false;
    };
  }, [authLoading, user?.id]);

  if (authLoading || resolved?.identity !== identity) {
    return (
      <View style={styles.loadingScreen}>
        {error ? <Text selectable style={styles.errorText}>{error}</Text> : <ActivityIndicator color="#7EE7FF" />}
      </View>
    );
  }

  return (
    <SQLiteProvider databaseName={resolved.name} key={resolved.name} onInit={onInit}>
      {children}
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#050711',
  },
  errorText: {
    color: '#FF9EAA',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
});
