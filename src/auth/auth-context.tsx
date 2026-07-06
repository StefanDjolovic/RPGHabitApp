import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isCloudConfigured, supabase } from '@/src/auth/supabase';
import { markAccountDatabaseForDeletion } from '@/src/database/account-database-lifecycle';

export type AccountRole = 'user' | 'admin';

type SignUpResult = { verificationRequired: boolean };

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: AccountRole;
  emailVerified: boolean;
  recoveryMode: boolean;
  recoveryError: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  resendVerification: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateEmail: (email: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  cancelRecovery: () => void;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function getAccountRole(userId: string): Promise<AccountRole> {
  if (!supabase) return 'user';
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role === 'admin' ? 'admin' : 'user';
}

function getAuthUrlParams(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : '');
  hashParams.forEach((value, key) => params.set(key, value));
  return params;
}

function getAccountRedirectUrl(recovery = false) {
  const accountUrl = Linking.createURL('/account');
  if (!recovery) return accountUrl;
  return `${accountUrl}${accountUrl.includes('?') ? '&' : '?'}recovery=1`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isCloudConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AccountRole>('user');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  const applySession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession?.user) {
      setRole('user');
      return;
    }
    setRole(await getAccountRole(nextSession.user.id).catch((): AccountRole => 'user'));
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      return applySession(data.session);
    }).finally(() => {
      if (active) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setRecoveryError('');
      }
      setTimeout(() => {
        if (active) void applySession(nextSession);
      }, 0);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  const handleAuthUrl = useCallback(async (url: string) => {
    if (!supabase) return;
    const params = getAuthUrlParams(url);
    const errorDescription = params.get('error_description');
    if (errorDescription) throw new Error(errorDescription.replace(/\+/g, ' '));

    const code = params.get('code');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    let nextSession: Session | null = null;

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      nextSession = data.session;
    } else if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      nextSession = data.session;
    } else {
      return;
    }

    await applySession(nextSession);
    if (params.get('type') === 'recovery' || params.get('recovery') === '1') {
      setRecoveryMode(true);
    }
    setRecoveryError('');
  }, [applySession]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const openUrl = (url: string) => {
      void handleAuthUrl(url).catch((error) => {
        if (!active) return;
        setRecoveryError(error instanceof Error ? error.message : 'Account link could not be opened.');
      });
    };

    void Linking.getInitialURL().then((url) => {
      if (active && url) openUrl(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => openUrl(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [handleAuthUrl]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Cloud accounts are not configured yet.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applySession(data.session);
  }, [applySession]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Cloud accounts are not configured yet.');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) await applySession(data.session);
    return { verificationRequired: data.session === null };
  }, [applySession]);

  const resendVerification = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Cloud accounts are not configured yet.');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Cloud accounts are not configured yet.');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: getAccountRedirectUrl(true),
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error('Cloud accounts are not configured yet.');
    if (password.length < 8) throw new Error('Password must contain at least 8 characters.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecoveryMode(false);
    setRecoveryError('');
  }, []);

  const updateEmail = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Cloud accounts are not configured yet.');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Enter a valid email address.');
    const { error } = await supabase.auth.updateUser(
      { email: normalizedEmail },
      { emailRedirectTo: getAccountRedirectUrl() },
    );
    if (error) throw error;
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    if (!supabase || !session?.user.email) throw new Error('Sign in again before deleting this account.');

    const userId = session.user.id;
    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password,
    });
    if (verificationError) throw new Error('Current password is incorrect.');

    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) throw new Error(`Account deletion failed: ${error.message}`);

    await markAccountDatabaseForDeletion(userId);
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    setRecoveryMode(false);
    setRecoveryError('');
    await applySession(null);
  }, [applySession, session]);

  const cancelRecovery = useCallback(() => {
    setRecoveryMode(false);
    setRecoveryError('');
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setRecoveryMode(false);
    setRecoveryError('');
    await applySession(null);
  }, [applySession]);

  const refreshAccount = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    await applySession(data.session);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: isCloudConfigured,
    loading,
    session,
    user: session?.user ?? null,
    role,
    emailVerified: Boolean(session?.user.email_confirmed_at),
    recoveryMode,
    recoveryError,
    signIn,
    signUp,
    resendVerification,
    requestPasswordReset,
    updatePassword,
    updateEmail,
    deleteAccount,
    cancelRecovery,
    signOut,
    refreshAccount,
  }), [
    cancelRecovery,
    deleteAccount,
    loading,
    recoveryError,
    recoveryMode,
    refreshAccount,
    requestPasswordReset,
    resendVerification,
    role,
    session,
    signIn,
    signOut,
    signUp,
    updateEmail,
    updatePassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = React.use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
