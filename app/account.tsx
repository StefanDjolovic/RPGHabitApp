import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/auth-context';
import { useCloudSync, type CloudSyncStatus } from '@/src/cloud/cloud-sync-context';

type AuthMode = 'sign-in' | 'sign-up';

const syncMeta: Record<CloudSyncStatus, { label: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  disabled: { label: 'NOT CONFIGURED', color: '#8B94A9', icon: 'cloud-off-outline' },
  'signed-out': { label: 'SIGN IN REQUIRED', color: '#8B94A9', icon: 'account-lock-outline' },
  unverified: { label: 'EMAIL NOT VERIFIED', color: '#FFD166', icon: 'email-alert-outline' },
  idle: { label: 'READY', color: '#7EE7FF', icon: 'cloud-outline' },
  syncing: { label: 'SYNCING', color: '#7EE7FF', icon: 'cloud-sync-outline' },
  synced: { label: 'PROTECTED', color: '#68E1A8', icon: 'cloud-check-outline' },
  'cloud-newer': { label: 'CLOUD BACKUP AVAILABLE', color: '#FFD166', icon: 'cloud-download-outline' },
  error: { label: 'SYNC ERROR', color: '#FF8191', icon: 'cloud-alert-outline' },
};

function formatSyncDate(value: string | null) {
  if (!value) return 'No cloud backup yet';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const cloud = useCloudSync();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const currentSync = syncMeta[cloud.status];

  const canSubmit = useMemo(() => {
    if (!email.trim() || password.length < 8) return false;
    return mode === 'sign-in' || password === confirmPassword;
  }, [confirmPassword, email, mode, password]);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === 'sign-in') {
        await auth.signIn(normalizedEmail, password);
        setMessage('Signed in. Checking cloud progress...');
      } else {
        const result = await auth.signUp(normalizedEmail, password);
        if (result.verificationRequired) {
          setPendingEmail(normalizedEmail);
          setMessage('Verification email sent.');
        } else {
          setMessage('Account created.');
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Account request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    const targetEmail = pendingEmail || email.trim().toLowerCase();
    if (!targetEmail || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await auth.resendVerification(targetEmail);
      setMessage('A new verification email was sent.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Email could not be sent.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRestore = () => {
    Alert.alert(
      'Restore cloud progress?',
      'Current local progress will be replaced by the latest cloud backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => void cloud.restoreNow().catch(() => undefined) },
      ],
    );
  };

  const confirmBackup = () => {
    if (cloud.status !== 'cloud-newer') {
      void cloud.backupNow().catch(() => undefined);
      return;
    }
    Alert.alert(
      'Replace newer cloud backup?',
      'The local data on this phone will replace the newer cloud copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => void cloud.backupNow().catch(() => undefined) },
      ],
    );
  };

  const signOut = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      if (auth.emailVerified && cloud.status !== 'cloud-newer') await cloud.backupNow();
      await auth.signOut();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Sign out failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Return" onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons color="#D8DCE8" name="arrow-left" size={21} />
          </Pressable>
          <View style={styles.headerBody}>
            <Text style={styles.eyebrow}>HUNTER IDENTITY</Text>
            <Text style={styles.heading}>Account & Cloud</Text>
          </View>
          <View style={styles.cloudIcon}><MaterialCommunityIcons color="#7EE7FF" name="cloud-lock-outline" size={23} /></View>
        </View>

        {!auth.configured ? (
          <View style={styles.noticePanel}>
            <MaterialCommunityIcons color="#FFD166" name="database-cog-outline" size={30} />
            <Text style={styles.noticeTitle}>Cloud setup required</Text>
            <Text selectable style={styles.noticeText}>Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the project environment.</Text>
          </View>
        ) : auth.loading ? (
          <View style={styles.loadingState}><ActivityIndicator color="#7EE7FF" /></View>
        ) : auth.user ? (
          <>
            <View style={styles.identityPanel}>
              <View style={styles.identityIcon}><MaterialCommunityIcons color="#7EE7FF" name="account-check-outline" size={25} /></View>
              <View style={styles.identityBody}>
                <Text numberOfLines={1} selectable style={styles.identityEmail}>{auth.user.email}</Text>
                <Text style={styles.identityMeta}>{auth.emailVerified ? 'EMAIL VERIFIED' : 'VERIFICATION REQUIRED'} · {auth.role.toUpperCase()}</Text>
              </View>
              <MaterialCommunityIcons color={auth.emailVerified ? '#68E1A8' : '#FFD166'} name={auth.emailVerified ? 'check-decagram' : 'alert-decagram-outline'} size={21} />
            </View>

            <View style={styles.syncPanel}>
              <View style={styles.syncTopRow}>
                <View style={[styles.syncStatusIcon, { borderColor: `${currentSync.color}66` }]}>
                  {cloud.status === 'syncing' ? <ActivityIndicator color={currentSync.color} size="small" /> : <MaterialCommunityIcons color={currentSync.color} name={currentSync.icon} size={23} />}
                </View>
                <View style={styles.syncBody}>
                  <Text style={[styles.syncStatus, { color: currentSync.color }]}>{currentSync.label}</Text>
                  <Text style={styles.syncDate}>{formatSyncDate(cloud.lastSyncedAt)}</Text>
                </View>
              </View>
              {cloud.error ? <Text selectable style={styles.errorText}>{cloud.error}</Text> : null}
              <View style={styles.syncActions}>
                <Pressable disabled={!auth.emailVerified || cloud.status === 'syncing'} onPress={confirmBackup} style={({ pressed }) => [styles.secondaryButton, (!auth.emailVerified || cloud.status === 'syncing') && styles.disabled, pressed && styles.pressed]}>
                  <MaterialCommunityIcons color="#7EE7FF" name="cloud-upload-outline" size={19} />
                  <Text style={styles.secondaryButtonText}>Backup now</Text>
                </Pressable>
                <Pressable disabled={!auth.emailVerified || !cloud.lastSyncedAt || cloud.status === 'syncing'} onPress={confirmRestore} style={({ pressed }) => [styles.secondaryButton, (!auth.emailVerified || !cloud.lastSyncedAt || cloud.status === 'syncing') && styles.disabled, pressed && styles.pressed]}>
                  <MaterialCommunityIcons color="#FFD166" name="cloud-download-outline" size={19} />
                  <Text style={styles.secondaryButtonText}>Restore</Text>
                </Pressable>
              </View>
            </View>

            {auth.role === 'admin' ? (
              <Pressable onPress={() => router.push('/admin-lab' as Href)} style={({ pressed }) => [styles.adminLink, pressed && styles.pressed]}>
                <View style={styles.adminIcon}><MaterialCommunityIcons color="#FFD166" name="flask-outline" size={23} /></View>
                <View style={styles.adminBody}><Text style={styles.adminLabel}>ADMIN ACCESS</Text><Text style={styles.adminTitle}>Open Admin Lab</Text></View>
                <MaterialCommunityIcons color="#8B94A9" name="chevron-right" size={22} />
              </Pressable>
            ) : null}

            {!auth.emailVerified ? (
              <Pressable disabled={submitting} onPress={() => void resend()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <MaterialCommunityIcons color="#071018" name="email-fast-outline" size={20} />
                <Text style={styles.primaryButtonText}>Resend verification</Text>
              </Pressable>
            ) : null}

            <Pressable disabled={submitting} onPress={() => void signOut()} style={({ pressed }) => [styles.signOutButton, submitting && styles.disabled, pressed && styles.pressed]}>
              <MaterialCommunityIcons color="#FF8191" name="logout" size={19} />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </>
        ) : pendingEmail ? (
          <View style={styles.noticePanel}>
            <MaterialCommunityIcons color="#68E1A8" name="email-check-outline" size={34} />
            <Text style={styles.noticeTitle}>Verify your email</Text>
            <Text selectable style={styles.noticeText}>{pendingEmail}</Text>
            <Pressable disabled={submitting} onPress={() => void resend()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <MaterialCommunityIcons color="#7EE7FF" name="email-fast-outline" size={19} />
              <Text style={styles.secondaryButtonText}>Send again</Text>
            </Pressable>
            <Pressable onPress={() => { setPendingEmail(''); setMode('sign-in'); }} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}><Text style={styles.textButtonText}>Return to sign in</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={styles.segmentedControl}>
              {(['sign-in', 'sign-up'] as const).map((item) => {
                const selected = mode === item;
                return <Pressable accessibilityState={{ selected }} key={item} onPress={() => { setMode(item); setError(''); }} style={[styles.segment, selected && styles.segmentSelected]}><Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{item === 'sign-in' ? 'Sign in' : 'Create account'}</Text></Pressable>;
              })}
            </View>

            <View style={styles.form}>
              <Text style={styles.inputLabel}>EMAIL</Text>
              <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="hunter@example.com" placeholderTextColor="#596176" style={styles.input} value={email} />
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <View style={styles.passwordInput}>
                <TextInput autoCapitalize="none" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor="#596176" secureTextEntry={!showPassword} style={styles.passwordTextInput} value={password} />
                <Pressable accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((current) => !current)} style={styles.passwordToggle}><MaterialCommunityIcons color="#8B94A9" name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} /></Pressable>
              </View>
              {mode === 'sign-up' ? <><Text style={styles.inputLabel}>CONFIRM PASSWORD</Text><TextInput autoCapitalize="none" autoComplete="new-password" onChangeText={setConfirmPassword} placeholder="Repeat password" placeholderTextColor="#596176" secureTextEntry={!showPassword} style={styles.input} value={confirmPassword} /></> : null}
              {error ? <Text selectable style={styles.errorText}>{error}</Text> : null}
              {message ? <Text selectable style={styles.successText}>{message}</Text> : null}
              <Pressable disabled={!canSubmit || submitting} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, (!canSubmit || submitting) && styles.disabled, pressed && styles.pressed]}>
                {submitting ? <ActivityIndicator color="#071018" /> : <MaterialCommunityIcons color="#071018" name={mode === 'sign-in' ? 'login' : 'account-plus-outline'} size={20} />}
                <Text style={styles.primaryButtonText}>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' }, content: { flexGrow: 1, paddingHorizontal: 17, gap: 16 },
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11 }, iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111522', borderWidth: 1, borderColor: '#282E40' }, pressed: { opacity: 0.72 }, headerBody: { flex: 1, minWidth: 0 }, eyebrow: { color: '#70DDF7', fontSize: 9, fontWeight: '900' }, heading: { color: '#F3F0FF', fontSize: 24, fontWeight: '900' }, cloudIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C1B24', borderWidth: 1, borderColor: '#285A69' },
  loadingState: { minHeight: 300, alignItems: 'center', justifyContent: 'center' }, noticePanel: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: 11, padding: 20, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#30364D' }, noticeTitle: { color: '#F0EEFF', fontSize: 18, fontWeight: '900', textAlign: 'center' }, noticeText: { color: '#8F98B0', fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 17 },
  identityPanel: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#2B344C' }, identityIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C1D28', borderWidth: 1, borderColor: '#285A69' }, identityBody: { flex: 1, minWidth: 0 }, identityEmail: { color: '#ECEAF7', fontSize: 13, fontWeight: '900' }, identityMeta: { color: '#7C859E', fontSize: 8, fontWeight: '900', marginTop: 4 },
  syncPanel: { padding: 14, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#2B344C', gap: 13 }, syncTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, syncStatusIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', borderWidth: 1 }, syncBody: { flex: 1, minWidth: 0 }, syncStatus: { fontSize: 9, fontWeight: '900' }, syncDate: { color: '#8A93AA', fontSize: 10, fontWeight: '700', marginTop: 4 }, syncActions: { flexDirection: 'row', gap: 8 },
  secondaryButton: { minHeight: 42, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#111827', borderWidth: 1, borderColor: '#334158' }, secondaryButtonText: { color: '#DCE1EF', fontSize: 10, fontWeight: '900' }, primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#7EE7FF' }, primaryButtonText: { color: '#071018', fontSize: 12, fontWeight: '900' }, disabled: { opacity: 0.38 },
  adminLink: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 8, backgroundColor: '#17140E', borderWidth: 1, borderColor: '#5A4924' }, adminIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#241D0D', borderWidth: 1, borderColor: '#665328' }, adminBody: { flex: 1, minWidth: 0 }, adminLabel: { color: '#FFD166', fontSize: 8, fontWeight: '900' }, adminTitle: { color: '#F1E8CD', fontSize: 14, fontWeight: '900', marginTop: 3 }, signOutButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, borderWidth: 1, borderColor: '#59303A', backgroundColor: '#1D1016' }, signOutText: { color: '#FF9EAA', fontSize: 11, fontWeight: '900' }, textButton: { padding: 9 }, textButtonText: { color: '#7EE7FF', fontSize: 11, fontWeight: '900' },
  segmentedControl: { minHeight: 44, flexDirection: 'row', gap: 5, padding: 5, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#292E44' }, segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 }, segmentSelected: { backgroundColor: '#7EE7FF' }, segmentText: { color: '#838CA5', fontSize: 10, fontWeight: '900' }, segmentTextSelected: { color: '#071018' },
  form: { gap: 9, padding: 14, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#292E44' }, inputLabel: { color: '#7D86A0', fontSize: 8, fontWeight: '900', marginTop: 3 }, input: { minHeight: 48, color: '#F0EEF8', fontSize: 13, fontWeight: '700', paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#080C16', borderWidth: 1, borderColor: '#30364D' }, passwordInput: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderRadius: 8, backgroundColor: '#080C16', borderWidth: 1, borderColor: '#30364D' }, passwordTextInput: { flex: 1, minWidth: 0, color: '#F0EEF8', fontSize: 13, fontWeight: '700', paddingHorizontal: 12 }, passwordToggle: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' }, errorText: { color: '#FF9EAA', fontSize: 10, fontWeight: '700', lineHeight: 15 }, successText: { color: '#68E1A8', fontSize: 10, fontWeight: '700', lineHeight: 15 },
});
