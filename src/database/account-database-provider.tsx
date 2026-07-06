import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/src/auth/auth-context';
import {
  resolveAccountDatabase,
  type ResolvedAccountDatabase,
} from '@/src/database/account-database-lifecycle';

export function AccountDatabaseProvider({
  children,
  onInit,
}: {
  children: ReactNode;
  onInit: (db: SQLiteDatabase) => Promise<void>;
}) {
  const { loading: authLoading, user } = useAuth();
  const identity = user?.id ?? 'guest';
  const [resolved, setResolved] = useState<ResolvedAccountDatabase | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setError('');

    void resolveAccountDatabase(user?.id ?? null)
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
