import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  formatClassAttribute,
  starterClasses,
  type StarterClassKey,
} from '@/src/classes/class-catalog';
import {
  awakenPlayer,
  AWAKENING_LEVEL,
  changeClassDuringFreeWindow,
  getPlayerClassState,
  INITIAL_PLAYER_CLASS_STATE,
  type PlayerClassState,
} from '@/src/database/class-repository';
import {
  notifySkillsUnlocked,
  syncProgressNotifications,
} from '@/src/notifications/system-notifications';
import {
  getPlayerProgress,
  INITIAL_PLAYER_PROGRESS,
  type PlayerProgress,
} from '@/src/progression/player-progression';

export default function AwakeningScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<PlayerProgress>(INITIAL_PLAYER_PROGRESS);
  const [classState, setClassState] =
    useState<PlayerClassState>(INITIAL_PLAYER_CLASS_STATE);
  const [selectedClassKey, setSelectedClassKey] = useState<StarterClassKey>('warrior');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completionWasChange, setCompletionWasChange] = useState(false);

  useEffect(() => {
    void Promise.all([getPlayerProgress(db), getPlayerClassState(db)])
      .then(([nextProgress, nextClassState]) => {
        setProgress(nextProgress);
        setClassState(nextClassState);
        if (nextClassState.activeClass) setSelectedClassKey(nextClassState.activeClass.key);
      })
      .finally(() => setLoading(false));
  }, [db]);

  const selectedClass = useMemo(
    () => starterClasses.find((definition) => definition.key === selectedClassKey)!,
    [selectedClassKey],
  );
  const isChangingClass = classState.awakened;
  const selectedIsActive = classState.activeClass?.key === selectedClass.key;
  const canConfirm =
    classState.eligible &&
    !saving &&
    (!isChangingClass || (classState.freeChangeAvailable && !selectedIsActive));

  const saveClass = async () => {
    if (!canConfirm) return;
    setSaving(true);
    try {
      setCompletionWasChange(isChangingClass);
      const nextState = isChangingClass
        ? await changeClassDuringFreeWindow(db, selectedClass.key)
        : await awakenPlayer(db, selectedClass.key);
      setClassState(nextState);
      await Promise.all([
        notifySkillsUnlocked(
          db,
          selectedClass.key,
          selectedClass.name,
          selectedClass.starterSkills.length,
        ).catch(() => false),
        syncProgressNotifications(db).catch(() => 0),
      ]);
      setCompleted(true);
      if (process.env.EXPO_OS === 'ios') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      Alert.alert(
        'Awakening not completed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmClass = () => {
    if (!canConfirm) return;
    Alert.alert(
      isChangingClass ? `Change to ${selectedClass.name}?` : `Awaken as ${selectedClass.name}?`,
      isChangingClass
        ? 'This uses your one free class change. Your previous class, mastery and skills remain saved.'
        : 'Your Player Level, attributes, Inventory and achievements remain unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isChangingClass ? 'Change Class' : 'Awaken',
          onPress: () => void saveClass(),
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#8DEAFF" />
        <Text style={styles.loadingText}>Reading System resonance...</Text>
      </View>
    );
  }

  if (completed && classState.activeClass) {
    return (
      <ScrollView
        contentContainerStyle={[
          styles.resultContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}>
        <LinearGradient
          colors={[`${classState.activeClass.accent}33`, '#121725', '#080B13']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.resultPanel}>
          <Image
            contentFit="contain"
            source={require('../assets/images/habit-rpg-emblem.png')}
            style={styles.resultEmblem}
          />
          <View
            style={[
              styles.resultIcon,
              { borderColor: `${classState.activeClass.accent}88` },
            ]}>
            <MaterialCommunityIcons
              name={classState.activeClass.icon}
              size={52}
              color={classState.activeClass.accent}
            />
          </View>
          <Text style={styles.resultEyebrow}>
            {completionWasChange ? 'CLASS RESONANCE COMPLETE' : 'AWAKENING COMPLETE'}
          </Text>
          <Text style={styles.resultTitle}>{classState.activeClass.name}</Text>
          <Text style={styles.resultDescription}>{classState.activeClass.identity}</Text>
          <View style={styles.resultMetaRow}>
            <View style={styles.resultMetaTile}>
              <Text style={styles.resultMetaValue}>{classState.activeClass.resource}</Text>
              <Text style={styles.resultMetaLabel}>RESOURCE</Text>
            </View>
            <View style={styles.resultMetaTile}>
              <Text style={styles.resultMetaValue}>{classState.activeSkills.length}</Text>
              <Text style={styles.resultMetaLabel}>SKILLS</Text>
            </View>
            <View style={styles.resultMetaTile}>
              <Text style={styles.resultMetaValue}>{classState.masteryLevel}</Text>
              <Text style={styles.resultMetaLabel}>MASTERY</Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.returnButton, pressed && styles.buttonPressed]}>
            <MaterialCommunityIcons name="account" size={19} color="#071018" />
            <Text style={styles.returnButtonText}>Return to Hunter Record</Text>
          </Pressable>
        </LinearGradient>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Return"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}>
          <MaterialCommunityIcons name="arrow-left" size={21} color="#D8DCE8" />
        </Pressable>
        <View style={styles.topBarBody}>
          <Text style={styles.systemLabel}>SYSTEM QUEST</Text>
          <Text style={styles.heading}>{isChangingClass ? 'Class Resonance' : 'Awakening'}</Text>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeLabel}>LEVEL</Text>
          <Text style={styles.levelBadgeValue}>{progress.level}</Text>
        </View>
      </View>

      {!classState.eligible ? (
        <View style={styles.lockedBanner}>
          <MaterialCommunityIcons name="lock-outline" size={24} color="#7D8499" />
          <View style={styles.lockedBody}>
            <Text style={styles.lockedTitle}>Awakening locked</Text>
            <Text style={styles.lockedText}>
              Reach level {AWAKENING_LEVEL}. Current level: {progress.level}.
            </Text>
          </View>
        </View>
      ) : null}

      {isChangingClass ? (
        <View style={styles.changeBanner}>
          <MaterialCommunityIcons
            name={classState.freeChangeAvailable ? 'timer-sand' : 'shield-lock-outline'}
            size={22}
            color={classState.freeChangeAvailable ? '#FFD166' : '#8A91A5'}
          />
          <View style={styles.changeBannerBody}>
            <Text style={styles.changeBannerTitle}>
              {classState.freeChangeAvailable
                ? 'One free class change available'
                : 'Reawakening Quest required'}
            </Text>
            <Text style={styles.changeBannerText}>
              {classState.freeChangeAvailable
                ? `${classState.freeChangeDaysRemaining} days remaining in the resonance window.`
                : 'Your active class, mastery and unlocked skills remain saved.'}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>STARTER CLASSES</Text>
        <Text style={styles.sectionTitle}>Choose your path</Text>
      </View>

      <View style={styles.classGrid}>
        {starterClasses.map((definition) => {
          const selected = definition.key === selectedClass.key;
          const active = definition.key === classState.activeClass?.key;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !classState.eligible }}
              disabled={!classState.eligible}
              key={definition.key}
              onPress={() => setSelectedClassKey(definition.key)}
              style={({ pressed }) => [
                styles.classCard,
                selected && { borderColor: definition.accent, backgroundColor: `${definition.accent}12` },
                pressed && styles.buttonPressed,
              ]}>
              <View style={[styles.classIcon, { borderColor: `${definition.accent}66` }]}>
                <MaterialCommunityIcons
                  name={definition.icon}
                  size={27}
                  color={definition.accent}
                />
              </View>
              <Text style={styles.className}>{definition.name}</Text>
              <Text style={styles.classResource}>{definition.resource}</Text>
              {active ? (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIVE</Text>
                </View>
              ) : selected ? (
                <MaterialCommunityIcons name="check-circle" size={17} color={definition.accent} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <LinearGradient
        colors={[`${selectedClass.accent}22`, '#111623', '#0A0D16']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.detailPanel}>
        <View style={styles.detailHeader}>
          <View style={[styles.detailIcon, { borderColor: `${selectedClass.accent}88` }]}>
            <MaterialCommunityIcons
              name={selectedClass.icon}
              size={31}
              color={selectedClass.accent}
            />
          </View>
          <View style={styles.detailTitleBody}>
            <Text style={styles.detailName}>{selectedClass.name}</Text>
            <Text style={[styles.detailResource, { color: selectedClass.accent }]}>
              {selectedClass.resource.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.detailIdentity}>{selectedClass.identity}</Text>

        <View style={styles.attributeRow}>
          <View style={styles.attributeTile}>
            <Text style={styles.attributeValue}>
              {formatClassAttribute(selectedClass.primaryAttribute)}
            </Text>
            <Text style={styles.attributeLabel}>PRIMARY</Text>
          </View>
          <View style={styles.attributeTile}>
            <Text style={styles.attributeValue}>
              {formatClassAttribute(selectedClass.secondaryAttribute)}
            </Text>
            <Text style={styles.attributeLabel}>SECONDARY</Text>
          </View>
        </View>

        <Text style={styles.skillSectionLabel}>STARTER SKILLS</Text>
        <View style={styles.skillList}>
          {selectedClass.starterSkills.map((skill) => (
            <View key={skill.key} style={styles.skillRow}>
              <View style={[styles.skillTypeIcon, { borderColor: `${selectedClass.accent}55` }]}>
                <MaterialCommunityIcons
                  name={skill.type === 'active' ? 'lightning-bolt' : 'shield-star-outline'}
                  size={17}
                  color={selectedClass.accent}
                />
              </View>
              <View style={styles.skillBody}>
                <View style={styles.skillTitleRow}>
                  <Text style={styles.skillName}>{skill.name}</Text>
                  <Text style={styles.skillType}>{skill.type.toUpperCase()}</Text>
                </View>
                <Text style={styles.skillDescription}>{skill.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </LinearGradient>

      <Pressable
        disabled={!canConfirm}
        onPress={confirmClass}
        style={({ pressed }) => [
          styles.confirmButton,
          !canConfirm && styles.confirmButtonDisabled,
          pressed && canConfirm && styles.buttonPressed,
        ]}>
        {saving ? (
          <ActivityIndicator color="#071018" />
        ) : (
          <MaterialCommunityIcons
            name={isChangingClass ? 'sync' : 'star-four-points'}
            size={19}
            color={canConfirm ? '#071018' : '#555D71'}
          />
        )}
        <Text style={[styles.confirmText, !canConfirm && styles.confirmTextDisabled]}>
          {!classState.eligible
            ? `Reach Level ${AWAKENING_LEVEL}`
            : selectedIsActive
              ? `${selectedClass.name} Active`
              : isChangingClass
                ? classState.freeChangeAvailable
                  ? 'Use Free Class Change'
                  : 'Reawakening Required'
                : `Awaken as ${selectedClass.name}`}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' },
  content: { flexGrow: 1, paddingHorizontal: 16, gap: 14 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#050711' },
  loadingText: { color: '#8189A0', fontSize: 10, fontWeight: '700' },
  topBar: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111522', borderWidth: 1, borderColor: '#282E40' },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  topBarBody: { flex: 1, minWidth: 0 },
  systemLabel: { color: '#8DEAFF', fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  heading: { color: '#F2F0FA', fontSize: 20, fontWeight: '900', marginTop: 2 },
  levelBadge: { minWidth: 52, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#121522', borderWidth: 1, borderColor: '#30374B' },
  levelBadgeLabel: { color: '#737B94', fontSize: 7, fontWeight: '900' },
  levelBadgeValue: { color: '#EDF0FA', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lockedBanner: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 8, backgroundColor: '#11141D', borderWidth: 1, borderColor: '#303443' },
  lockedBody: { flex: 1 },
  lockedTitle: { color: '#BFC4D1', fontSize: 12, fontWeight: '900' },
  lockedText: { color: '#777F94', fontSize: 9, fontWeight: '700', marginTop: 3 },
  changeBanner: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 8, backgroundColor: '#191721', borderWidth: 1, borderColor: '#4A4035' },
  changeBannerBody: { flex: 1 },
  changeBannerTitle: { color: '#E8D6A7', fontSize: 11, fontWeight: '900' },
  changeBannerText: { color: '#8F8991', fontSize: 9, lineHeight: 14, fontWeight: '700', marginTop: 3 },
  sectionHeader: { gap: 3, paddingTop: 2 },
  sectionEyebrow: { color: '#9182D2', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: '#F0EDFA', fontSize: 18, fontWeight: '900' },
  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classCard: { width: '31%', minHeight: 125, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 9, borderRadius: 8, backgroundColor: '#0D111B', borderWidth: 1, borderColor: '#272D40' },
  classIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#131827', borderWidth: 1 },
  className: { color: '#ECEEF6', fontSize: 11, fontWeight: '900' },
  classResource: { color: '#757E94', fontSize: 8, fontWeight: '800' },
  activeBadge: { height: 18, justifyContent: 'center', paddingHorizontal: 6, borderRadius: 5, backgroundColor: '#1C4639' },
  activeBadgeText: { color: '#73E3AD', fontSize: 7, fontWeight: '900' },
  detailPanel: { padding: 14, gap: 12, borderRadius: 8, borderWidth: 1, borderColor: '#343A50', overflow: 'hidden' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  detailIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111724', borderWidth: 1 },
  detailTitleBody: { flex: 1 },
  detailName: { color: '#F2F0FA', fontSize: 19, fontWeight: '900' },
  detailResource: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 3 },
  detailIdentity: { color: '#9299AD', fontSize: 10, lineHeight: 16, fontWeight: '700' },
  attributeRow: { flexDirection: 'row', gap: 8 },
  attributeTile: { flex: 1, minHeight: 52, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#0C111C', borderWidth: 1, borderColor: '#262D40' },
  attributeValue: { color: '#E7E9F2', fontSize: 11, fontWeight: '900' },
  attributeLabel: { color: '#687188', fontSize: 7, fontWeight: '900', marginTop: 3 },
  skillSectionLabel: { color: '#858DA6', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  skillList: { gap: 7 },
  skillRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: 8, backgroundColor: '#0B0F19', borderWidth: 1, borderColor: '#23293B' },
  skillTypeIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#121725', borderWidth: 1 },
  skillBody: { flex: 1, minWidth: 0 },
  skillTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skillName: { flex: 1, color: '#E8EAF3', fontSize: 10, fontWeight: '900' },
  skillType: { color: '#6E778D', fontSize: 7, fontWeight: '900' },
  skillDescription: { color: '#7C8499', fontSize: 8, lineHeight: 13, fontWeight: '700', marginTop: 3 },
  confirmButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, backgroundColor: '#8DEAFF' },
  confirmButtonDisabled: { backgroundColor: '#171B28', borderWidth: 1, borderColor: '#2B3040' },
  confirmText: { color: '#071018', fontSize: 11, fontWeight: '900' },
  confirmTextDisabled: { color: '#555D71' },
  resultContent: { flexGrow: 1, paddingHorizontal: 16 },
  resultPanel: { flex: 1, minHeight: 620, alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 8, borderWidth: 1, borderColor: '#343A50', overflow: 'hidden' },
  resultEmblem: { position: 'absolute', width: 300, height: 300, opacity: 0.06 },
  resultIcon: { width: 102, height: 102, alignItems: 'center', justifyContent: 'center', borderRadius: 51, backgroundColor: '#111724', borderWidth: 1 },
  resultEyebrow: { color: '#8DEAFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginTop: 21 },
  resultTitle: { color: '#F4F1FA', fontSize: 29, fontWeight: '900', marginTop: 5 },
  resultDescription: { maxWidth: 310, color: '#8B93A8', fontSize: 11, lineHeight: 17, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  resultMetaRow: { alignSelf: 'stretch', flexDirection: 'row', gap: 8, marginTop: 22 },
  resultMetaTile: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#0C111C', borderWidth: 1, borderColor: '#293044' },
  resultMetaValue: { color: '#EEF0F8', fontSize: 12, fontWeight: '900' },
  resultMetaLabel: { color: '#697289', fontSize: 7, fontWeight: '900', marginTop: 4 },
  returnButton: { alignSelf: 'stretch', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, backgroundColor: '#8DEAFF', marginTop: 24 },
  returnButtonText: { color: '#071018', fontSize: 11, fontWeight: '900' },
});
