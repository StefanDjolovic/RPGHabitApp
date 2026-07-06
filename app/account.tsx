import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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

import { AccountActionRow } from '@/src/account/account-action-row';
import { useAuth } from '@/src/auth/auth-context';
import { useCloudSync, type CloudSyncStatus } from '@/src/cloud/cloud-sync-context';

type AuthMode = 'sign-in' | 'sign-up';
type SignedOutFlow = 'auth' | 'reset' | 'reset-sent';
type SecurityAction = 'email' | 'password' | 'delete' | null;

const syncMeta: Record<
  CloudSyncStatus,
  { label: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
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
  const [signedOutFlow, setSignedOutFlow] = useState<SignedOutFlow>('auth');
  const [securityAction, setSecurityAction] = useState<SecurityAction>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const currentSync = syncMeta[cloud.status];

  useEffect(() => {
    if (!auth.recoveryMode) return;
    setSecurityAction('password');
    setMessage('Recovery link verified. Choose a new password.');
    setError('');
  }, [auth.recoveryMode]);

  const canSubmit = useMemo(() => {
    if (!email.trim() || password.length < 8) return false;
    return mode === 'sign-in' || password === confirmPassword;
  }, [confirmPassword, email, mode, password]);

  const clearFeedback = () => {
    setError('');
    setMessage('');
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    clearFeedback();
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
      setPassword('');
      setConfirmPassword('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Account request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    const targetEmail = pendingEmail || auth.user?.email || email.trim().toLowerCase();
    if (!targetEmail || submitting) return;
    setSubmitting(true);
    clearFeedback();
    try {
      await auth.resendVerification(targetEmail);
      setMessage('A new verification email was sent.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Email could not be sent.');
    } finally {
      setSubmitting(false);
    }
  };

  const sendPasswordReset = async (targetEmail: string, signedIn: boolean) => {
    if (!targetEmail.trim() || submitting) return;
    setSubmitting(true);
    clearFeedback();
    try {
      await auth.requestPasswordReset(targetEmail);
      if (signedIn) {
        setMessage('Password recovery email sent.');
      } else {
        setSignedOutFlow('reset-sent');
      }
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Recovery email could not be sent.');
    } finally {
      setSubmitting(false);
    }
  };

  const changeEmail = async () => {
    if (!newEmail.trim() || submitting) return;
    setSubmitting(true);
    clearFeedback();
    try {
      await auth.updateEmail(newEmail);
      setSecurityAction(null);
      setNewEmail('');
      setMessage('Email change requested. Check both inboxes to confirm it.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Email could not be changed.');
    } finally {
      setSubmitting(false);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8 || newPassword !== newPasswordConfirm || submitting) return;
    setSubmitting(true);
    clearFeedback();
    try {
      await auth.updatePassword(newPassword);
      setSecurityAction(null);
      setNewPassword('');
      setNewPasswordConfirm('');
      setMessage('Password updated successfully.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Password could not be changed.');
    } finally {
      setSubmitting(false);
    }
  };

  const performDelete = async () => {
    setSubmitting(true);
    clearFeedback();
    try {
      await auth.deleteAccount(currentPassword);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Account could not be deleted.');
      setSubmitting(false);
    }
  };

  const confirmDelete = () => {
    if (deletePhrase !== 'DELETE' || !currentPassword || submitting) return;
    Alert.alert(
      'Delete account permanently?',
      'Your account, cloud backup and local account data will be removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: () => void performDelete() },
      ],
    );
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
    clearFeedback();
    try {
      if (auth.emailVerified && cloud.status !== 'cloud-newer') await cloud.backupNow();
      await auth.signOut();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Sign out failed.');
      setSubmitting(false);
    }
  };

  const toggleSecurityAction = (action: Exclude<SecurityAction, null>) => {
    if (auth.recoveryMode) {
      if (action === 'password') setSecurityAction('password');
      return;
    }
    clearFeedback();
    setSecurityAction((current) => current === action ? null : action);
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Return"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons color="#D8DCE8" name="arrow-left" size={21} />
          </Pressable>
          <View style={styles.headerBody}>
            <Text style={styles.eyebrow}>HUNTER IDENTITY</Text>
            <Text style={styles.heading}>Account & Cloud</Text>
          </View>
          <View style={styles.cloudIcon}>
            <MaterialCommunityIcons color="#7EE7FF" name="shield-account-outline" size={23} />
          </View>
        </View>

        {auth.recoveryError ? <Feedback tone="error" text={auth.recoveryError} /> : null}
        {error ? <Feedback tone="error" text={error} /> : null}
        {message ? <Feedback tone="success" text={message} /> : null}

        {!auth.configured ? (
          <NoticePanel
            icon="database-cog-outline"
            title="Cloud setup required"
            text="Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the project environment."
          />
        ) : auth.loading ? (
          <View style={styles.loadingState}><ActivityIndicator color="#7EE7FF" /></View>
        ) : auth.user ? (
          <>
            <View style={styles.identityPanel}>
              <View style={styles.identityIcon}>
                <MaterialCommunityIcons color="#7EE7FF" name="account-check-outline" size={25} />
              </View>
              <View style={styles.identityBody}>
                <Text numberOfLines={1} selectable style={styles.identityEmail}>{auth.user.email}</Text>
                <Text style={styles.identityMeta}>
                  {auth.emailVerified ? 'VERIFIED' : 'VERIFICATION REQUIRED'} / {auth.role.toUpperCase()}
                </Text>
              </View>
              <MaterialCommunityIcons
                color={auth.emailVerified ? '#68E1A8' : '#FFD166'}
                name={auth.emailVerified ? 'check-decagram' : 'alert-decagram-outline'}
                size={21}
              />
            </View>

            {auth.recoveryMode ? (
              <View style={styles.recoveryBanner}>
                <MaterialCommunityIcons color="#FFD166" name="key-change" size={22} />
                <Text style={styles.recoveryText}>Recovery session active. Set a new password below.</Text>
              </View>
            ) : null}

            <SectionHeading eyebrow="CLOUD PROTECTION" title="Progress backup" icon="cloud-lock-outline" />
            <View style={styles.syncPanel}>
              <View style={styles.syncTopRow}>
                <View style={[styles.syncStatusIcon, { borderColor: `${currentSync.color}66` }]}>
                  {cloud.status === 'syncing' ? (
                    <ActivityIndicator color={currentSync.color} size="small" />
                  ) : (
                    <MaterialCommunityIcons color={currentSync.color} name={currentSync.icon} size={23} />
                  )}
                </View>
                <View style={styles.syncBody}>
                  <Text style={[styles.syncStatus, { color: currentSync.color }]}>{currentSync.label}</Text>
                  <Text style={styles.syncDate}>{formatSyncDate(cloud.lastSyncedAt)}</Text>
                </View>
              </View>
              {cloud.error ? <Text selectable style={styles.errorText}>{cloud.error}</Text> : null}
              <View style={styles.syncActions}>
                <Pressable
                  disabled={!auth.emailVerified || cloud.status === 'syncing'}
                  onPress={confirmBackup}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    (!auth.emailVerified || cloud.status === 'syncing') && styles.disabled,
                    pressed && styles.pressed,
                  ]}>
                  <MaterialCommunityIcons color="#7EE7FF" name="cloud-upload-outline" size={19} />
                  <Text style={styles.secondaryButtonText}>Backup</Text>
                </Pressable>
                <Pressable
                  disabled={!auth.emailVerified || !cloud.lastSyncedAt || cloud.status === 'syncing'}
                  onPress={confirmRestore}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    (!auth.emailVerified || !cloud.lastSyncedAt || cloud.status === 'syncing') && styles.disabled,
                    pressed && styles.pressed,
                  ]}>
                  <MaterialCommunityIcons color="#FFD166" name="cloud-download-outline" size={19} />
                  <Text style={styles.secondaryButtonText}>Restore</Text>
                </Pressable>
              </View>
            </View>

            {auth.role === 'admin' ? (
              <AccountActionRow
                accent="#FFD166"
                description="Test ranks, classes, items and dungeon balance"
                icon="flask-outline"
                onPress={() => router.push('/admin-lab' as Href)}
                title="Open Admin Lab"
              />
            ) : null}

            {!auth.emailVerified ? (
              <AccountActionRow
                accent="#FFD166"
                description="Send a fresh verification link to your inbox"
                disabled={submitting}
                icon="email-fast-outline"
                loading={submitting}
                onPress={() => void resend()}
                title="Verify email"
              />
            ) : null}

            <SectionHeading eyebrow="SECURITY" title="Account controls" icon="shield-key-outline" />
            <View style={styles.actionList}>
              <AccountActionRow
                accent="#7EE7FF"
                description="Move this account to a different email address"
                disabled={submitting || auth.recoveryMode}
                icon="email-edit-outline"
                onPress={() => toggleSecurityAction('email')}
                title="Change email"
              />
              {securityAction === 'email' ? (
                <InlineForm>
                  <FieldLabel text="NEW EMAIL" />
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    onChangeText={setNewEmail}
                    placeholder="new@email.com"
                    placeholderTextColor="#596176"
                    style={styles.input}
                    value={newEmail}
                  />
                  <FormButton
                    disabled={!newEmail.trim() || submitting}
                    label="Request email change"
                    loading={submitting}
                    onPress={() => void changeEmail()}
                  />
                </InlineForm>
              ) : null}

              <AccountActionRow
                accent="#C79CFF"
                description="Set a new password for this account"
                disabled={submitting}
                icon="lock-reset"
                onPress={() => toggleSecurityAction('password')}
                title="Change password"
              />
              {securityAction === 'password' ? (
                <InlineForm>
                  <FieldLabel text="NEW PASSWORD" />
                  <PasswordField
                    onChangeText={setNewPassword}
                    placeholder="At least 8 characters"
                    show={showPassword}
                    toggle={() => setShowPassword((current) => !current)}
                    value={newPassword}
                  />
                  <FieldLabel text="CONFIRM PASSWORD" />
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={setNewPasswordConfirm}
                    placeholder="Repeat new password"
                    placeholderTextColor="#596176"
                    secureTextEntry={!showPassword}
                    style={styles.input}
                    value={newPasswordConfirm}
                  />
                  <FormButton
                    disabled={
                      newPassword.length < 8
                      || newPassword !== newPasswordConfirm
                      || submitting
                    }
                    label="Update password"
                    loading={submitting}
                    onPress={() => void changePassword()}
                  />
                </InlineForm>
              ) : null}

              <AccountActionRow
                accent="#68E1A8"
                description="Receive a secure recovery link by email"
                disabled={submitting || auth.recoveryMode || !auth.user.email}
                icon="email-lock-outline"
                onPress={() => void sendPasswordReset(auth.user?.email ?? '', true)}
                title="Send recovery email"
              />
              <AccountActionRow
                accent="#FF8191"
                description="Back up progress and leave this account"
                disabled={submitting}
                icon="logout"
                onPress={() => void signOut()}
                title="Sign out"
              />
            </View>

            <SectionHeading eyebrow="DANGER ZONE" title="Permanent actions" icon="alert-octagon-outline" danger />
            <AccountActionRow
              accent="#FF8191"
              description="Permanently remove the account, cloud backup and local account data"
              destructive
              disabled={submitting || auth.recoveryMode}
              icon="delete-forever-outline"
              onPress={() => toggleSecurityAction('delete')}
              title="Delete account"
            />
            {securityAction === 'delete' ? (
              <InlineForm danger>
                <Text style={styles.dangerCopy}>
                  Enter your current password and type DELETE. This action cannot be undone.
                </Text>
                <FieldLabel text="CURRENT PASSWORD" />
                <PasswordField
                  current
                  onChangeText={setCurrentPassword}
                  placeholder="Current password"
                  show={showPassword}
                  toggle={() => setShowPassword((current) => !current)}
                  value={currentPassword}
                />
                <FieldLabel text='TYPE "DELETE"' />
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={setDeletePhrase}
                  placeholder="DELETE"
                  placeholderTextColor="#6E4C55"
                  style={[styles.input, styles.dangerInput]}
                  value={deletePhrase}
                />
                <Pressable
                  disabled={deletePhrase !== 'DELETE' || !currentPassword || submitting}
                  onPress={confirmDelete}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    (deletePhrase !== 'DELETE' || !currentPassword || submitting) && styles.disabled,
                    pressed && styles.pressed,
                  ]}>
                  {submitting ? (
                    <ActivityIndicator color="#FFE8EC" />
                  ) : (
                    <MaterialCommunityIcons color="#FFE8EC" name="delete-forever-outline" size={20} />
                  )}
                  <Text style={styles.deleteButtonText}>Delete forever</Text>
                </Pressable>
              </InlineForm>
            ) : null}
          </>
        ) : pendingEmail ? (
          <NoticePanel
            icon="email-check-outline"
            title="Verify your email"
            text={pendingEmail}
            action={(
              <>
                <Pressable
                  disabled={submitting}
                  onPress={() => void resend()}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <MaterialCommunityIcons color="#7EE7FF" name="email-fast-outline" size={19} />
                  <Text style={styles.secondaryButtonText}>Send again</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setPendingEmail(''); setMode('sign-in'); }}
                  style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                  <Text style={styles.textButtonText}>Return to sign in</Text>
                </Pressable>
              </>
            )}
          />
        ) : signedOutFlow === 'reset-sent' ? (
          <NoticePanel
            icon="email-arrow-right-outline"
            title="Check your inbox"
            text={`A password recovery link was sent to ${email.trim().toLowerCase()}.`}
            action={(
              <Pressable
                onPress={() => setSignedOutFlow('auth')}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <MaterialCommunityIcons color="#071018" name="login" size={20} />
                <Text style={styles.primaryButtonText}>Return to sign in</Text>
              </Pressable>
            )}
          />
        ) : signedOutFlow === 'reset' ? (
          <>
            <SectionHeading eyebrow="ACCOUNT RECOVERY" title="Reset password" icon="lock-reset" />
            <View style={styles.form}>
              <Text style={styles.formIntro}>
                Enter your account email. The recovery link will open this app so you can choose a new password.
              </Text>
              <FieldLabel text="EMAIL" />
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="hunter@example.com"
                placeholderTextColor="#596176"
                style={styles.input}
                value={email}
              />
              <FormButton
                disabled={!email.trim() || submitting}
                label="Send recovery link"
                loading={submitting}
                onPress={() => void sendPasswordReset(email, false)}
              />
              <Pressable
                onPress={() => { setSignedOutFlow('auth'); clearFeedback(); }}
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                <Text style={styles.textButtonText}>Return to sign in</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.segmentedControl}>
              {(['sign-in', 'sign-up'] as const).map((item) => {
                const selected = mode === item;
                return (
                  <Pressable
                    accessibilityState={{ selected }}
                    key={item}
                    onPress={() => { setMode(item); clearFeedback(); }}
                    style={[styles.segment, selected && styles.segmentSelected]}>
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {item === 'sign-in' ? 'Sign in' : 'Create account'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.form}>
              <Text style={styles.formIntro}>
                {mode === 'sign-in'
                  ? 'Continue with your protected hunter profile.'
                  : 'Create a verified account to protect progress across devices.'}
              </Text>
              <FieldLabel text="EMAIL" />
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="hunter@example.com"
                placeholderTextColor="#596176"
                style={styles.input}
                value={email}
              />
              <FieldLabel text="PASSWORD" />
              <PasswordField
                current={mode === 'sign-in'}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                show={showPassword}
                toggle={() => setShowPassword((current) => !current)}
                value={password}
              />
              {mode === 'sign-up' ? (
                <>
                  <FieldLabel text="CONFIRM PASSWORD" />
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={setConfirmPassword}
                    placeholder="Repeat password"
                    placeholderTextColor="#596176"
                    secureTextEntry={!showPassword}
                    style={styles.input}
                    value={confirmPassword}
                  />
                </>
              ) : null}
              <FormButton
                disabled={!canSubmit || submitting}
                icon={mode === 'sign-in' ? 'login' : 'account-plus-outline'}
                label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
                loading={submitting}
                onPress={() => void submit()}
              />
              {mode === 'sign-in' ? (
                <Pressable
                  onPress={() => { setSignedOutFlow('reset'); clearFeedback(); }}
                  style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                  <Text style={styles.textButtonText}>Forgot password?</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionHeading({
  eyebrow,
  title,
  icon,
  danger = false,
}: {
  eyebrow: string;
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  danger?: boolean;
}) {
  const accent = danger ? '#FF8191' : '#7EE7FF';
  return (
    <View style={styles.sectionHeading}>
      <View>
        <Text style={[styles.sectionEyebrow, { color: accent }]}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <MaterialCommunityIcons color={accent} name={icon} size={21} />
    </View>
  );
}

function FieldLabel({ text }: { text: string }) {
  return <Text style={styles.inputLabel}>{text}</Text>;
}

function InlineForm({
  children,
  danger = false,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return <View style={[styles.inlineForm, danger && styles.dangerForm]}>{children}</View>;
}

function PasswordField({
  value,
  onChangeText,
  placeholder,
  show,
  toggle,
  current = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  show: boolean;
  toggle: () => void;
  current?: boolean;
}) {
  return (
    <View style={styles.passwordInput}>
      <TextInput
        autoCapitalize="none"
        autoComplete={current ? 'current-password' : 'new-password'}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#596176"
        secureTextEntry={!show}
        style={styles.passwordTextInput}
        value={value}
      />
      <Pressable
        accessibilityLabel={show ? 'Hide password' : 'Show password'}
        onPress={toggle}
        style={styles.passwordToggle}>
        <MaterialCommunityIcons
          color="#8B94A9"
          name={show ? 'eye-off-outline' : 'eye-outline'}
          size={20}
        />
      </Pressable>
    </View>
  );
}

function FormButton({
  label,
  onPress,
  disabled,
  loading,
  icon = 'check',
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color="#071018" />
      ) : (
        <MaterialCommunityIcons color="#071018" name={icon} size={20} />
      )}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function Feedback({ tone, text }: { tone: 'error' | 'success'; text: string }) {
  const errorTone = tone === 'error';
  return (
    <View style={[styles.feedback, errorTone ? styles.feedbackError : styles.feedbackSuccess]}>
      <MaterialCommunityIcons
        color={errorTone ? '#FF9EAA' : '#68E1A8'}
        name={errorTone ? 'alert-circle-outline' : 'check-circle-outline'}
        size={19}
      />
      <Text selectable style={[styles.feedbackText, errorTone && styles.feedbackErrorText]}>{text}</Text>
    </View>
  );
}

function NoticePanel({
  icon,
  title,
  text,
  action,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.noticePanel}>
      <MaterialCommunityIcons color="#7EE7FF" name={icon} size={34} />
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text selectable style={styles.noticeText}>{text}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' },
  content: { flexGrow: 1, paddingHorizontal: 17, gap: 14 },
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111522', borderWidth: 1, borderColor: '#282E40' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.38 },
  headerBody: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#70DDF7', fontSize: 9, fontWeight: '900' },
  heading: { color: '#F3F0FF', fontSize: 24, fontWeight: '900' },
  cloudIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C1B24', borderWidth: 1, borderColor: '#285A69' },
  loadingState: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  noticePanel: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 11, padding: 20, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#30364D' },
  noticeTitle: { color: '#F0EEFF', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  noticeText: { color: '#8F98B0', fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 17 },
  identityPanel: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#2B344C' },
  identityIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C1D28', borderWidth: 1, borderColor: '#285A69' },
  identityBody: { flex: 1, minWidth: 0 },
  identityEmail: { color: '#ECEAF7', fontSize: 13, fontWeight: '900' },
  identityMeta: { color: '#7C859E', fontSize: 8, fontWeight: '900', marginTop: 4 },
  recoveryBanner: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 8, backgroundColor: '#1B170D', borderWidth: 1, borderColor: '#514320' },
  recoveryText: { flex: 1, color: '#D4C798', fontSize: 10, fontWeight: '700', lineHeight: 15 },
  sectionHeading: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 3 },
  sectionEyebrow: { fontSize: 8, fontWeight: '900' },
  sectionTitle: { color: '#ECEAF5', fontSize: 16, fontWeight: '900', marginTop: 3 },
  syncPanel: { padding: 14, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#2B344C', gap: 13 },
  syncTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  syncStatusIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', borderWidth: 1 },
  syncBody: { flex: 1, minWidth: 0 },
  syncStatus: { fontSize: 9, fontWeight: '900' },
  syncDate: { color: '#8A93AA', fontSize: 10, fontWeight: '700', marginTop: 4 },
  syncActions: { flexDirection: 'row', gap: 8 },
  actionList: { gap: 8 },
  secondaryButton: { minHeight: 42, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#111827', borderWidth: 1, borderColor: '#334158' },
  secondaryButtonText: { color: '#DCE1EF', fontSize: 10, fontWeight: '900' },
  primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#7EE7FF' },
  primaryButtonText: { color: '#071018', fontSize: 12, fontWeight: '900' },
  segmentedControl: { minHeight: 44, flexDirection: 'row', gap: 5, padding: 5, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#292E44' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  segmentSelected: { backgroundColor: '#7EE7FF' },
  segmentText: { color: '#838CA5', fontSize: 10, fontWeight: '900' },
  segmentTextSelected: { color: '#071018' },
  form: { gap: 9, padding: 14, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#292E44' },
  inlineForm: { gap: 9, padding: 13, borderRadius: 8, backgroundColor: '#090D18', borderWidth: 1, borderColor: '#30364D' },
  dangerForm: { backgroundColor: '#150C11', borderColor: '#59303A' },
  formIntro: { color: '#929BB1', fontSize: 10, fontWeight: '700', lineHeight: 16 },
  inputLabel: { color: '#7D86A0', fontSize: 8, fontWeight: '900', marginTop: 3 },
  input: { minHeight: 48, color: '#F0EEF8', fontSize: 13, fontWeight: '700', paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#080C16', borderWidth: 1, borderColor: '#30364D' },
  dangerInput: { borderColor: '#6A3541', backgroundColor: '#11090D' },
  passwordInput: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderRadius: 8, backgroundColor: '#080C16', borderWidth: 1, borderColor: '#30364D' },
  passwordTextInput: { flex: 1, minWidth: 0, color: '#F0EEF8', fontSize: 13, fontWeight: '700', paddingHorizontal: 12 },
  passwordToggle: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  dangerCopy: { color: '#D49AA5', fontSize: 10, fontWeight: '700', lineHeight: 16 },
  deleteButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, backgroundColor: '#8C3347', borderWidth: 1, borderColor: '#BE5269' },
  deleteButtonText: { color: '#FFE8EC', fontSize: 11, fontWeight: '900' },
  textButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  textButtonText: { color: '#7EE7FF', fontSize: 11, fontWeight: '900' },
  feedback: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderRadius: 8, borderWidth: 1 },
  feedbackSuccess: { backgroundColor: '#0D1B17', borderColor: '#285344' },
  feedbackError: { backgroundColor: '#1D1016', borderColor: '#59303A' },
  feedbackText: { flex: 1, color: '#68E1A8', fontSize: 10, fontWeight: '700', lineHeight: 15 },
  feedbackErrorText: { color: '#FF9EAA' },
  errorText: { color: '#FF9EAA', fontSize: 10, fontWeight: '700', lineHeight: 15 },
});
