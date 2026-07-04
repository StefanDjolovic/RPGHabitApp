import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerAvatar } from '@/components/player-avatar';
import {
  getPlayerClassState,
  INITIAL_PLAYER_CLASS_STATE,
} from '@/src/database/class-repository';
import {
  getPlayerProfile,
  INITIAL_PLAYER_PROFILE,
  updatePlayerProfile,
  type AvatarMode,
} from '@/src/database/profile-repository';
import {
  deleteStoredProfileAvatar,
  persistProfileAvatar,
} from '@/src/profile/avatar-storage';
import {
  getPlayerProgress,
  INITIAL_PLAYER_PROGRESS,
} from '@/src/progression/player-progression';

const avatarModes: {
  key: AvatarMode;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { key: 'system', label: 'Character', icon: 'account' },
  { key: 'initials', label: 'Initials', icon: 'format-letter-case' },
  { key: 'custom', label: 'Custom', icon: 'image-outline' },
];

export default function EditProfileScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(INITIAL_PLAYER_PROFILE);
  const [playerProgress, setPlayerProgress] = useState(INITIAL_PLAYER_PROGRESS);
  const [playerClassState, setPlayerClassState] = useState(INITIAL_PLAYER_CLASS_STATE);
  const [originalAvatarUri, setOriginalAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      getPlayerProfile(db),
      getPlayerProgress(db),
      getPlayerClassState(db),
    ])
      .then(([nextProfile, nextProgress, nextClassState]) => {
        setProfile(nextProfile);
        setPlayerProgress(nextProgress);
        setPlayerClassState(nextClassState);
        setOriginalAvatarUri(nextProfile.customAvatarUri);
      })
      .finally(() => setLoading(false));
  }, [db]);

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to choose a Custom Avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    setProfile((current) => ({
      ...current,
      avatarMode: 'custom',
      customAvatarUri: result.assets[0].uri,
    }));
  };

  const save = async () => {
    if (saving) return;
    const nickname = profile.nickname.trim();
    if (!nickname) {
      Alert.alert('Nickname required', 'Enter a nickname before saving the profile.');
      return;
    }
    if (profile.avatarMode === 'custom' && !profile.customAvatarUri) {
      Alert.alert('Choose an image', 'Select a photo for the Custom Avatar.');
      return;
    }

    setSaving(true);
    let persistedAvatarUri: string | null = null;
    try {
      const needsNewStoredImage =
        profile.avatarMode === 'custom' &&
        profile.customAvatarUri !== originalAvatarUri &&
        profile.customAvatarUri !== null;
      persistedAvatarUri = needsNewStoredImage
        ? process.env.EXPO_OS === 'web'
          ? profile.customAvatarUri
          : persistProfileAvatar(profile.customAvatarUri!)
        : profile.customAvatarUri;

      await updatePlayerProfile(db, {
        nickname,
        avatarMode: profile.avatarMode,
        customAvatarUri: persistedAvatarUri,
      });
      if (originalAvatarUri && originalAvatarUri !== persistedAvatarUri) {
        deleteStoredProfileAvatar(originalAvatarUri);
      }
      router.back();
    } catch (error) {
      if (persistedAvatarUri && persistedAvatarUri !== profile.customAvatarUri) {
        deleteStoredProfileAvatar(persistedAvatarUri);
      }
      Alert.alert(
        'Profile not saved',
        error instanceof Error ? error.message : 'Please try again.',
      );
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#FF9BCB" />
        <Text style={styles.loadingText}>Reading hunter identity...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Close profile editor"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}>
          <MaterialCommunityIcons color="#D8DCE8" name="close" size={21} />
        </Pressable>
        <View style={styles.topBarBody}>
          <Text style={styles.eyebrow}>HUNTER IDENTITY</Text>
          <Text style={styles.heading}>Edit Profile</Text>
        </View>
        <Pressable
          accessibilityLabel="Save profile"
          disabled={saving}
          onPress={() => void save()}
          style={({ pressed }) => [styles.saveButton, pressed && styles.buttonPressed]}>
          {saving ? (
            <ActivityIndicator color="#071018" size="small" />
          ) : (
            <MaterialCommunityIcons color="#071018" name="check" size={21} />
          )}
        </Pressable>
      </View>

      <LinearGradient
        colors={['rgba(58, 27, 70, 0.98)', 'rgba(15, 29, 52, 0.98)']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.previewPanel}>
        <PlayerAvatar
          activeClass={playerClassState.activeClass}
          profile={profile}
          rankKey={playerProgress.rankKey}
          size={112}
        />
        <Text numberOfLines={1} style={styles.previewName}>
          {profile.nickname.trim() || 'Shadow Candidate'}
        </Text>
        <Text style={styles.previewMeta}>HUNTER RECORD</Text>
      </LinearGradient>

      <View style={styles.fieldBlock}>
        <View style={styles.fieldHeader}>
          <Text style={styles.fieldLabel}>NICKNAME</Text>
          <Text style={styles.characterCount}>{profile.nickname.length}/30</Text>
        </View>
        <TextInput
          autoCapitalize="words"
          maxLength={30}
          onChangeText={(nickname) => setProfile((current) => ({ ...current, nickname }))}
          placeholder="Hunter nickname"
          placeholderTextColor="#596078"
          selectionColor="#7EE7FF"
          style={styles.input}
          value={profile.nickname}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>AVATAR MODE</Text>
        <View accessibilityRole="radiogroup" style={styles.modeGrid}>
          {avatarModes.map((mode) => {
            const selected = profile.avatarMode === mode.key;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={mode.key}
                onPress={() =>
                  setProfile((current) => ({
                    ...current,
                    avatarMode: mode.key,
                  }))
                }
                style={({ pressed }) => [
                  styles.modeButton,
                  selected && styles.modeButtonSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <MaterialCommunityIcons
                  color={selected ? '#7EE7FF' : '#747C94'}
                  name={mode.icon}
                  size={23}
                />
                <Text style={[styles.modeText, selected && styles.modeTextSelected]}>
                  {mode.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {profile.avatarMode === 'custom' ? (
        <Pressable
          accessibilityLabel="Choose Custom Avatar from gallery"
          onPress={() => void pickAvatar()}
          style={({ pressed }) => [styles.galleryButton, pressed && styles.buttonPressed]}>
          <MaterialCommunityIcons color="#DCCBFF" name="image-multiple-outline" size={21} />
          <View style={styles.galleryButtonBody}>
            <Text style={styles.galleryButtonTitle}>
              {profile.customAvatarUri ? 'Choose Different Image' : 'Choose From Gallery'}
            </Text>
            <Text style={styles.galleryButtonMeta}>Square crop</Text>
          </View>
          <MaterialCommunityIcons color="#7C849C" name="chevron-right" size={20} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' },
  content: { flexGrow: 1, paddingHorizontal: 17, gap: 18 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#050711' },
  loadingText: { color: '#8189A0', fontSize: 10, fontWeight: '700' },
  topBar: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconButton: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: '#282E40', backgroundColor: '#111522', alignItems: 'center', justifyContent: 'center' },
  saveButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#7EE7FF', alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  topBarBody: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#FF9BCB', fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  heading: { color: '#F3F1FA', fontSize: 23, fontWeight: '900', marginTop: 2 },
  previewPanel: { minHeight: 218, borderRadius: 8, borderWidth: 1, borderColor: '#563B6A', alignItems: 'center', justifyContent: 'center', padding: 18 },
  previewName: { color: '#F4F0FA', fontSize: 18, fontWeight: '900', marginTop: 14, maxWidth: '100%' },
  previewMeta: { color: '#8E789B', fontSize: 8, fontWeight: '900', letterSpacing: 1.3, marginTop: 4 },
  fieldBlock: { gap: 9 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { color: '#8B94AC', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  characterCount: { color: '#626B83', fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  input: { minHeight: 50, borderRadius: 8, borderWidth: 1, borderColor: '#2D344C', backgroundColor: '#0D111E', color: '#F1EFF7', paddingHorizontal: 14, fontSize: 15, fontWeight: '800' },
  modeGrid: { flexDirection: 'row', gap: 8 },
  modeButton: { flex: 1, minHeight: 76, borderRadius: 8, borderWidth: 1, borderColor: '#2A3046', backgroundColor: '#0D111E', alignItems: 'center', justifyContent: 'center', gap: 7 },
  modeButtonSelected: { borderColor: '#397A8D', backgroundColor: '#102631' },
  modeText: { color: '#747C94', fontSize: 9, fontWeight: '900' },
  modeTextSelected: { color: '#A5EDFF' },
  galleryButton: { minHeight: 66, borderRadius: 8, borderWidth: 1, borderColor: '#3B3152', backgroundColor: '#161226', flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13 },
  galleryButtonBody: { flex: 1, minWidth: 0 },
  galleryButtonTitle: { color: '#DCCBFF', fontSize: 12, fontWeight: '900' },
  galleryButtonMeta: { color: '#746987', fontSize: 8, fontWeight: '800', marginTop: 3 },
});
