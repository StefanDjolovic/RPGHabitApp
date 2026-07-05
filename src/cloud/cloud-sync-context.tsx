import * as Updates from 'expo-updates';
import { useSQLiteContext } from 'expo-sqlite';
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/src/auth/auth-context';
import {
  downloadCloudBackup,
  getCloudBackupMetadata,
  hasMeaningfulLocalData,
  uploadCloudBackup,
} from '@/src/cloud/cloud-backup';

export type CloudSyncStatus =
  | 'disabled'
  | 'signed-out'
  | 'unverified'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'cloud-newer'
  | 'error';

type CloudSyncContextValue = {
  status: CloudSyncStatus;
  lastSyncedAt: string | null;
  error: string;
  backupNow: () => Promise<void>;
  restoreNow: () => Promise<void>;
  checkCloud: () => Promise<void>;
};

type SyncStateRow = {
  userId: string | null;
  lastBackupAt: string | null;
};

const CloudSyncContext = createContext<CloudSyncContextValue | null>(null);

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { configured, emailVerified, loading: authLoading, user } = useAuth();
  const [status, setStatus] = useState<CloudSyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  const backupNow = useCallback(async () => {
    if (!user || !emailVerified || busyRef.current) return;
    busyRef.current = true;
    setStatus('syncing');
    setError('');
    try {
      const updatedAt = await uploadCloudBackup(db, user.id);
      setLastSyncedAt(updatedAt);
      setStatus('synced');
    } catch (syncError) {
      setStatus('error');
      setError(syncError instanceof Error ? syncError.message : 'Cloud backup failed.');
      throw syncError;
    } finally {
      busyRef.current = false;
    }
  }, [db, emailVerified, user]);

  const restoreNow = useCallback(async () => {
    if (!user || !emailVerified || busyRef.current) return;
    busyRef.current = true;
    setStatus('syncing');
    setError('');
    try {
      const updatedAt = await downloadCloudBackup(db, user.id);
      setLastSyncedAt(updatedAt);
      setStatus('synced');
      await Updates.reloadAsync().catch(() => undefined);
    } catch (syncError) {
      setStatus('error');
      setError(syncError instanceof Error ? syncError.message : 'Cloud restore failed.');
      throw syncError;
    } finally {
      busyRef.current = false;
    }
  }, [db, emailVerified, user]);

  const checkCloud = useCallback(async () => {
    if (authLoading) return;
    if (!configured) {
      setStatus('disabled');
      return;
    }
    if (!user) {
      setStatus('signed-out');
      return;
    }
    if (!emailVerified) {
      setStatus('unverified');
      return;
    }
    if (busyRef.current) return;

    busyRef.current = true;
    setStatus('syncing');
    setError('');
    try {
      const [metadata, localHasData, localState] = await Promise.all([
        getCloudBackupMetadata(user.id),
        hasMeaningfulLocalData(db),
        db.getFirstAsync<SyncStateRow>(
          `SELECT user_id AS userId, last_backup_at AS lastBackupAt
           FROM cloud_sync_state WHERE id = 1`,
        ),
      ]);

      if (!metadata) {
        if (localState?.userId && localState.userId !== user.id) {
          setStatus('error');
          setError('The active local profile does not match this account. Sign out and sign in again.');
          return;
        }
        const updatedAt = await uploadCloudBackup(db, user.id);
        setLastSyncedAt(updatedAt);
        setStatus('synced');
        return;
      }

      setLastSyncedAt(metadata.updatedAt);
      if (!localHasData) {
        await downloadCloudBackup(db, user.id);
        setStatus('synced');
        await Updates.reloadAsync().catch(() => undefined);
        return;
      }

      if (
        localState?.userId === user.id &&
        localState.lastBackupAt &&
        localState.lastBackupAt >= metadata.updatedAt
      ) {
        setStatus('synced');
      } else {
        setStatus('cloud-newer');
      }
    } catch (syncError) {
      setStatus('error');
      setError(syncError instanceof Error ? syncError.message : 'Cloud sync check failed.');
    } finally {
      busyRef.current = false;
    }
  }, [authLoading, configured, db, emailVerified, user]);

  useEffect(() => {
    void checkCloud();
  }, [checkCloud]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && status !== 'cloud-newer' && status !== 'error') {
        void backupNow().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [backupNow, status]);

  useEffect(() => {
    if (status !== 'synced' && status !== 'idle') return;
    const interval = setInterval(() => {
      void backupNow().catch(() => undefined);
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [backupNow, status]);

  const value = useMemo<CloudSyncContextValue>(() => ({
    status,
    lastSyncedAt,
    error,
    backupNow,
    restoreNow,
    checkCloud,
  }), [backupNow, checkCloud, error, lastSyncedAt, restoreNow, status]);

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}

export function useCloudSync() {
  const value = React.use(CloudSyncContext);
  if (!value) throw new Error('useCloudSync must be used inside CloudSyncProvider.');
  return value;
}
