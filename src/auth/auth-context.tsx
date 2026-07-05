import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isCloudConfigured, supabase } from '@/src/auth/supabase';

export type AccountRole = 'user' | 'admin';

type SignUpResult = { verificationRequired: boolean };

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: AccountRole;
  emailVerified: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  resendVerification: (email: string) => Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isCloudConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AccountRole>('user');

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

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => {
        if (active) void applySession(nextSession);
      }, 0);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

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

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
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
    signIn,
    signUp,
    resendVerification,
    signOut,
    refreshAccount,
  }), [loading, refreshAccount, resendVerification, role, session, signIn, signOut, signUp]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = React.use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
