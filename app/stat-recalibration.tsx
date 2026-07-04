import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HabitAttribute } from '@/src/database/habit-repository';
import {
  getPlayerProgress,
  getStatRecalibrationState,
  INITIAL_PLAYER_PROGRESS,
  recalibrateManualStatPoints,
  type PlayerProgress,
  type StatRecalibrationState,
} from '@/src/progression/player-progression';
import { playNotificationHaptic } from '@/src/settings/haptic-feedback';

const attributes: { key: HabitAttribute; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }[] = [
  { key: 'strength', label: 'Strength', icon: 'arm-flex', color: '#FF7B72' },
  { key: 'intelligence', label: 'Intelligence', icon: 'head-lightbulb-outline', color: '#6DD6FF' },
  { key: 'discipline', label: 'Discipline', icon: 'target', color: '#C79CFF' },
  { key: 'vitality', label: 'Vitality', icon: 'heart-pulse', color: '#68E1A8' },
  { key: 'creativity', label: 'Creativity', icon: 'palette-outline', color: '#FFD166' },
];

const initialState: StatRecalibrationState = {
  freeCredits: 0, allocatedPoints: 0, available: false, lastReturnedPoints: 0, lastCompletedAt: null,
};

export default function StatRecalibrationScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<PlayerProgress>(INITIAL_PLAYER_PROGRESS);
  const [state, setState] = useState<StatRecalibrationState>(initialState);
  const [loading, setLoading] = useState(true);
  const [recalibrating, setRecalibrating] = useState(false);
  const [returnedPoints, setReturnedPoints] = useState(0);

  const load = useCallback(async () => {
    const [nextProgress, nextState] = await Promise.all([
      getPlayerProgress(db), getStatRecalibrationState(db),
    ]);
    setProgress(nextProgress);
    setState(nextState);
  }, [db]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const recalibrate = async () => {
    if (!state.available || recalibrating) return;
    setRecalibrating(true);
    try {
      const result = await recalibrateManualStatPoints(db);
      setReturnedPoints(state.allocatedPoints);
      setProgress(result.progress);
      setState(result.state);
      void playNotificationHaptic('success');
    } catch (error) {
      Alert.alert('Recalibration not completed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRecalibrating(false);
    }
  };

  const confirmRecalibration = () => {
    if (!state.available) return;
    Alert.alert(
      'Return manual Stat Points?',
      `${state.allocatedPoints} manually allocated points will become available again. Natural attribute progress remains unchanged.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Recalibrate', onPress: () => void recalibrate() }],
    );
  };

  if (loading) {
    return <View style={styles.loadingScreen}><ActivityIndicator color="#7EE7FF" /><Text style={styles.loadingText}>Reading attribute ledger...</Text></View>;
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="Return" onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}>
          <MaterialCommunityIcons color="#D8DCE8" name="arrow-left" size={21} />
        </Pressable>
        <View style={styles.topBarBody}><Text style={styles.eyebrow}>SYSTEM QUEST</Text><Text style={styles.heading}>Stat Recalibration</Text></View>
      </View>

      <LinearGradient colors={['rgba(24, 50, 67, 0.98)', 'rgba(29, 21, 50, 0.98)']} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.summaryPanel}>
        <View style={styles.summaryIcon}><MaterialCommunityIcons color="#7EE7FF" name="chart-timeline-variant-shimmer" size={32} /></View>
        <View style={styles.summaryBody}><Text style={styles.summaryLabel}>FREE CREDITS</Text><Text style={styles.summaryValue}>{state.freeCredits}</Text></View>
        <View style={styles.returnBadge}><Text style={styles.returnBadgeValue}>{state.allocatedPoints}</Text><Text style={styles.returnBadgeLabel}>TO RETURN</Text></View>
      </LinearGradient>

      {returnedPoints > 0 ? <View style={styles.successBanner}><MaterialCommunityIcons color="#68E1A8" name="check-decagram" size={21} /><Text style={styles.successText}>{returnedPoints} Stat Points returned.</Text></View> : null}

      <View style={styles.sectionHeader}><Text style={styles.sectionEyebrow}>CURRENT ALLOCATION</Text><Text style={styles.sectionTitle}>Manual points by attribute</Text></View>
      <View style={styles.attributeList}>
        {attributes.map((attribute) => {
          const manualPoints = progress.manualStatPoints[attribute.key];
          const naturalPoints = progress.attributeProgression[attribute.key].naturalPoints;
          return (
            <View key={attribute.key} style={styles.attributeRow}>
              <View style={[styles.attributeIcon, { borderColor: `${attribute.color}66` }]}><MaterialCommunityIcons name={attribute.icon} size={20} color={attribute.color} /></View>
              <View style={styles.attributeBody}><Text style={styles.attributeName}>{attribute.label}</Text><Text style={styles.attributeNatural}>{naturalPoints} natural points retained</Text></View>
              <Text style={[styles.attributeManual, manualPoints > 0 && { color: attribute.color }]}>+{manualPoints}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.availablePanel}><Text style={styles.availableLabel}>AVAILABLE AFTER RECALIBRATION</Text><Text style={styles.availableValue}>{progress.availableStatPoints + state.allocatedPoints} Stat Points</Text></View>
      <Pressable disabled={!state.available || recalibrating} onPress={confirmRecalibration} style={({ pressed }) => [styles.confirmButton, !state.available && styles.confirmButtonDisabled, pressed && state.available && styles.buttonPressed]}>
        {recalibrating ? <ActivityIndicator color="#071018" /> : <MaterialCommunityIcons color={state.available ? '#071018' : '#626A80'} name={state.freeCredits > 0 ? 'restore' : 'lock-outline'} size={20} />}
        <Text style={[styles.confirmText, !state.available && styles.confirmTextDisabled]}>{state.freeCredits <= 0 ? 'Class Change Required' : state.allocatedPoints <= 0 ? 'No Manual Points Allocated' : `Return ${state.allocatedPoints} Stat Points`}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' }, content: { flexGrow: 1, paddingHorizontal: 17, gap: 14 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#050711' }, loadingText: { color: '#8189A0', fontSize: 10, fontWeight: '700' },
  topBar: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11 }, iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111522', borderWidth: 1, borderColor: '#282E40' }, buttonPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] }, topBarBody: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#7EE7FF', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 }, heading: { color: '#F3F1FA', fontSize: 23, fontWeight: '900', marginTop: 2 },
  summaryPanel: { minHeight: 112, borderRadius: 8, borderWidth: 1, borderColor: '#31536A', padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13 }, summaryIcon: { width: 54, height: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#102432', borderWidth: 1, borderColor: '#2F657D' }, summaryBody: { flex: 1, minWidth: 0 }, summaryLabel: { color: '#7EE7FF', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, summaryValue: { color: '#F3F8FF', fontSize: 31, fontWeight: '900', fontVariant: ['tabular-nums'] }, returnBadge: { alignItems: 'flex-end' }, returnBadgeValue: { color: '#C79CFF', fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] }, returnBadgeLabel: { color: '#7B8297', fontSize: 7, fontWeight: '900', marginTop: 2 },
  successBanner: { minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: '#2D674F', backgroundColor: '#10271F', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 }, successText: { color: '#9CEBC1', fontSize: 11, fontWeight: '900' },
  sectionHeader: { paddingTop: 8 }, sectionEyebrow: { color: '#8C94AA', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 }, sectionTitle: { color: '#F0EEF7', fontSize: 17, fontWeight: '900', marginTop: 3 }, attributeList: { gap: 8 },
  attributeRow: { minHeight: 66, borderRadius: 8, borderWidth: 1, borderColor: '#252B43', backgroundColor: '#0D111E', padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11 }, attributeIcon: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111727' }, attributeBody: { flex: 1, minWidth: 0 }, attributeName: { color: '#E9EAF2', fontSize: 12, fontWeight: '900' }, attributeNatural: { color: '#717A92', fontSize: 9, fontWeight: '700', marginTop: 4 }, attributeManual: { color: '#626A80', fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  availablePanel: { minHeight: 61, borderRadius: 8, borderWidth: 1, borderColor: '#332D4B', backgroundColor: '#141124', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, availableLabel: { color: '#8F82AD', fontSize: 8, fontWeight: '900', flex: 1 }, availableValue: { color: '#DCCBFF', fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  confirmButton: { minHeight: 50, borderRadius: 8, backgroundColor: '#7EE7FF', borderWidth: 1, borderColor: '#B0F3FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, confirmButtonDisabled: { backgroundColor: '#151927', borderColor: '#2B3042' }, confirmText: { color: '#071018', fontSize: 12, fontWeight: '900' }, confirmTextDisabled: { color: '#626A80' },
});
