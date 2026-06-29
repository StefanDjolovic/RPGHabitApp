import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { HabitAttribute } from '@/src/database/habit-repository';
import {
  getPlayerProgress,
  INITIAL_PLAYER_PROGRESS,
  MAX_DUNGEON_ENERGY,
  type PlayerProgress,
} from '@/src/progression/player-progression';

const attributeOrder: HabitAttribute[] = [
  'strength',
  'intelligence',
  'discipline',
  'vitality',
  'creativity',
];

const attributeMeta: Record<
  HabitAttribute,
  {
    color: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
  }
> = {
  strength: { color: '#FF7B8A', icon: 'dumbbell', label: 'Strength' },
  intelligence: { color: '#67D7FF', icon: 'brain', label: 'Intelligence' },
  discipline: { color: '#B493FF', icon: 'shield-check', label: 'Discipline' },
  vitality: { color: '#63E0A2', icon: 'heart-pulse', label: 'Vitality' },
  creativity: { color: '#FFD166', icon: 'palette', label: 'Creativity' },
};

function formatNumber(value: number) {
  return value.toLocaleString();
}

function getProgressRatio(value: number, max: number) {
  if (max <= 0) return 1;
  return Math.min(1, Math.max(0, value / max));
}

export default function ProfileScreen() {
  const db = useSQLiteContext();
  const [playerProgress, setPlayerProgress] = useState<PlayerProgress>(INITIAL_PLAYER_PROGRESS);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setPlayerProgress(await getPlayerProgress(db));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const xpRatio = getProgressRatio(playerProgress.xpIntoLevel, playerProgress.xpForNextLevel);
  const energyRatio = getProgressRatio(playerProgress.dungeonEnergy, MAX_DUNGEON_ENERGY);
  const xpRemaining = Math.max(playerProgress.xpForNextLevel - playerProgress.xpIntoLevel, 0);
  const attributeMax = useMemo(
    () => Math.max(1, ...attributeOrder.map((attribute) => playerProgress.attributeXp[attribute])),
    [playerProgress.attributeXp],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundGlowPink} />
      <View style={styles.backgroundGlowCyan} />

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <View style={styles.systemRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.systemLabel}>HUNTER RECORD</Text>
            </View>
            <Text style={styles.heading}>Profile</Text>
          </View>

          <View style={styles.rankSeal}>
            <Text style={styles.rankSealText}>{playerProgress.rankShort}</Text>
          </View>
        </View>

        <LinearGradient
          colors={['rgba(56, 28, 70, 0.98)', 'rgba(14, 25, 50, 0.98)', 'rgba(8, 11, 24, 0.98)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.heroCard}>
          <View style={styles.cardAccent} />
          <View style={styles.identityRow}>
            <View style={styles.avatarFrame}>
              <MaterialCommunityIcons name="account" size={42} color="#FF9BCB" />
            </View>
            <View style={styles.identityText}>
              <Text style={styles.playerName}>Shadow Candidate</Text>
              <Text style={styles.rankTitle}>{playerProgress.rankLabel}</Text>
            </View>
          </View>

          <View style={styles.levelRow}>
            <View>
              <Text style={styles.levelLabel}>LEVEL</Text>
              <Text style={styles.levelValue}>{String(playerProgress.level).padStart(2, '0')}</Text>
            </View>
            <View style={styles.totalXpBox}>
              <Text style={styles.totalXpValue}>{formatNumber(playerProgress.totalXp)}</Text>
              <Text style={styles.totalXpLabel}>TOTAL XP</Text>
            </View>
          </View>

          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>PLAYER EXP</Text>
            <Text style={styles.progressValue}>
              {playerProgress.xpForNextLevel > 0
                ? `${formatNumber(playerProgress.xpIntoLevel)} / ${formatNumber(playerProgress.xpForNextLevel)}`
                : 'MAX LEVEL'}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={['#FF74B7', '#56D9FF']}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[styles.progressFill, { width: `${xpRatio * 100}%` }]}
            />
          </View>
          <Text style={styles.progressHint}>
            {playerProgress.xpForNextLevel > 0
              ? `${formatNumber(xpRemaining)} XP until next level`
              : 'The hunter has reached the level cap'}
          </Text>
        </LinearGradient>

        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="lightning-bolt" size={22} color="#63E4FF" />
            <Text style={styles.statValue}>
              {playerProgress.dungeonEnergy} / {MAX_DUNGEON_ENERGY}
            </Text>
            <Text style={styles.statLabel}>Dungeon energy</Text>
            <View style={styles.smallTrack}>
              <View style={[styles.energyFill, { width: `${energyRatio * 100}%` }]} />
            </View>
          </View>

          <View style={styles.statCard}>
            <MaterialCommunityIcons name="medal-outline" size={22} color="#FFD166" />
            <Text style={styles.statValue}>{playerProgress.rankLabel}</Text>
            <Text style={styles.statLabel}>Current rank</Text>
            <View style={styles.rankCode}>
              <Text style={styles.rankCodeText}>CLASS {playerProgress.rankShort}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>ATTRIBUTE XP</Text>
            <Text style={styles.sectionTitle}>Hunter stats</Text>
          </View>
        </View>

        <View style={styles.attributeList}>
          {attributeOrder.map((attribute) => {
            const meta = attributeMeta[attribute];
            const value = playerProgress.attributeXp[attribute];
            const ratio = getProgressRatio(value, attributeMax);

            return (
              <View key={attribute} style={styles.attributeCard}>
                <View style={[styles.attributeIcon, { borderColor: `${meta.color}66` }]}>
                  <MaterialCommunityIcons name={meta.icon} size={21} color={meta.color} />
                </View>
                <View style={styles.attributeBody}>
                  <View style={styles.attributeTopRow}>
                    <Text style={styles.attributeName}>{meta.label}</Text>
                    <Text style={styles.attributeValue}>{formatNumber(value)} XP</Text>
                  </View>
                  <View style={styles.attributeTrack}>
                    <View
                      style={[
                        styles.attributeFill,
                        { backgroundColor: meta.color, width: `${ratio * 100}%` },
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#FF8FC7" />
            <Text style={styles.loadingText}>Syncing hunter record...</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  backgroundGlowPink: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#B53A7A',
    opacity: 0.12,
    top: -95,
    right: -95,
  },
  backgroundGlowCyan: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#00B8D9',
    opacity: 0.08,
    top: 290,
    left: -145,
  },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 110 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF8FC7' },
  systemLabel: { color: '#F08ABD', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  heading: { color: '#F5F2FF', fontSize: 31, fontWeight: '800' },
  rankSeal: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161025',
    borderWidth: 1,
    borderColor: '#563059',
  },
  rankSealText: { color: '#FF9BCB', fontSize: 18, fontWeight: '900' },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#513553',
    padding: 17,
    overflow: 'hidden',
    marginBottom: 14,
  },
  cardAccent: {
    position: 'absolute',
    width: 95,
    height: 170,
    right: -28,
    top: -48,
    backgroundColor: '#FF74B7',
    opacity: 0.07,
    transform: [{ rotate: '23deg' }],
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarFrame: {
    width: 66,
    height: 66,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 9, 22, 0.76)',
    borderWidth: 1,
    borderColor: '#774163',
  },
  identityText: { flex: 1, paddingLeft: 13 },
  playerName: { color: '#F1EEFF', fontSize: 17, fontWeight: '900', marginBottom: 5 },
  rankTitle: { color: '#B9A4C8', fontSize: 12, fontWeight: '700' },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  levelLabel: { color: '#9A88B2', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  levelValue: { color: '#FFFFFF', fontSize: 42, fontWeight: '900', lineHeight: 48 },
  totalXpBox: {
    minWidth: 118,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: 'rgba(6, 10, 23, 0.58)',
    borderWidth: 1,
    borderColor: '#34324F',
  },
  totalXpValue: { color: '#7EE7FF', fontSize: 15, fontWeight: '900', textAlign: 'right' },
  totalXpLabel: { color: '#737B98', fontSize: 8, fontWeight: '900', marginTop: 3, textAlign: 'right' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { color: '#8D91AD', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  progressValue: { color: '#C9D0EA', fontSize: 10, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#11152A', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressHint: { color: '#767E9C', fontSize: 10, marginTop: 9 },
  statGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1,
    minHeight: 122,
    borderRadius: 17,
    padding: 14,
    backgroundColor: 'rgba(12, 16, 31, 0.92)',
    borderWidth: 1,
    borderColor: '#252A48',
  },
  statValue: { color: '#EDF0FF', fontSize: 15, fontWeight: '900', marginTop: 11 },
  statLabel: { color: '#777E9C', fontSize: 10, fontWeight: '700', marginTop: 4 },
  smallTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#080B18',
    overflow: 'hidden',
    marginTop: 14,
  },
  energyFill: { height: '100%', borderRadius: 3, backgroundColor: '#63E4FF' },
  rankCode: {
    alignSelf: 'flex-start',
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#181629',
    borderWidth: 1,
    borderColor: '#3D365D',
    marginTop: 14,
  },
  rankCodeText: { color: '#FFD166', fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  sectionEyebrow: { color: '#F08ABD', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  sectionTitle: { color: '#F1EFFF', fontSize: 19, fontWeight: '800', marginTop: 4 },
  attributeList: { gap: 10 },
  attributeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    borderRadius: 17,
    padding: 13,
    backgroundColor: 'rgba(12, 16, 31, 0.94)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  attributeIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11172A',
    borderWidth: 1,
  },
  attributeBody: { flex: 1, paddingLeft: 12 },
  attributeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  attributeName: { color: '#E8E9F4', fontSize: 13, fontWeight: '800', flexShrink: 1 },
  attributeValue: { color: '#B9C1DA', fontSize: 11, fontWeight: '800', marginLeft: 10 },
  attributeTrack: { height: 6, borderRadius: 3, backgroundColor: '#080B18', overflow: 'hidden' },
  attributeFill: { height: '100%', borderRadius: 3 },
  loadingOverlay: {
    marginTop: 12,
    minHeight: 72,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(12, 16, 31, 0.72)',
    borderWidth: 1,
    borderColor: '#252A48',
  },
  loadingText: { color: '#A998B5', fontSize: 11, fontWeight: '700' },
});
