import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  beginDungeonBattle,
  getDungeonOverview,
  type DungeonOverview,
} from '@/src/database/dungeon-repository';
import { getDungeonDefinition } from '@/src/dungeon/dungeon-catalog';
import { MAX_DUNGEON_ENERGY } from '@/src/progression/dungeon-energy';

const firstDungeon = getDungeonDefinition('ashen-ruins');

const initialOverview: DungeonOverview = {
  energyAvailable: 0,
  entryCost: firstDungeon.energyCost,
  isTrialEntry: false,
  hasActiveBattle: false,
  totalClears: 0,
  recentRuns: [],
};

export default function DungeonScreen() {
  const db = useSQLiteContext();
  const [overview, setOverview] = useState<DungeonOverview>(initialOverview);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);
  const canEnter =
    overview.hasActiveBattle || overview.energyAvailable >= overview.entryCost;

  const loadDungeon = useCallback(async () => {
    try {
      const nextOverview = await getDungeonOverview(db);
      setOverview(nextOverview);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadDungeon();
    }, [loadDungeon]),
  );

  const enterDungeon = async () => {
    if (!canEnter || entering) return;

    setEntering(true);
    try {
      await beginDungeonBattle(db, firstDungeon.key);
      router.push('/dungeon-run' as Href);
    } finally {
      setEntering(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundGlowPurple} />
      <View style={styles.backgroundGlowCyan} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <View style={styles.systemRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.systemLabel}>GATE DETECTED</Text>
            </View>
            <Text style={styles.heading}>Dungeon</Text>
          </View>

          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="gate" size={28} color="#C8A6FF" />
          </View>
        </View>

        <LinearGradient
          colors={['rgba(44, 30, 82, 0.98)', 'rgba(10, 22, 43, 0.98)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.energyPanel}>
          <View style={styles.energyTopRow}>
            <View>
              <Text style={styles.energyEyebrow}>DUNGEON ENERGY</Text>
              <Text style={styles.energyValue}>
                {overview.energyAvailable} / {MAX_DUNGEON_ENERGY}
              </Text>
            </View>
            <View style={styles.clearBadge}>
              <MaterialCommunityIcons name="sword-cross" size={16} color="#7EE7FF" />
              <Text style={styles.clearBadgeText}>{overview.totalClears} clears</Text>
            </View>
          </View>

          <View style={styles.energyTrack}>
            <LinearGradient
              colors={['#845DFF', '#4BE2FF']}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[
                styles.energyFill,
                { width: `${(overview.energyAvailable / MAX_DUNGEON_ENERGY) * 100}%` },
              ]}
            />
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>FIRST GATE</Text>
            <Text style={styles.sectionTitle}>Available dungeon</Text>
          </View>
        </View>

        <LinearGradient
          colors={['rgba(27, 24, 52, 0.96)', 'rgba(10, 14, 31, 0.98)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.gateCard}>
          <View style={styles.gateTopRow}>
            <View style={styles.gateIcon}>
              <MaterialCommunityIcons name="gate" size={30} color="#C8A6FF" />
            </View>
            <View style={styles.gateBody}>
              <Text style={styles.gateRegion}>{firstDungeon.region}</Text>
              <Text style={styles.gateName}>{firstDungeon.name}</Text>
              <Text style={styles.gateDescription}>{firstDungeon.description}</Text>
            </View>
          </View>

          <View style={styles.gateMetaRow}>
            <View style={styles.gateMetaTile}>
              <Text style={styles.gateMetaValue}>{firstDungeon.rank}</Text>
              <Text style={styles.gateMetaLabel}>Rank</Text>
            </View>
            <View style={styles.gateMetaTile}>
              <Text style={styles.gateMetaValue}>{firstDungeon.difficulty}</Text>
              <Text style={styles.gateMetaLabel}>Mode</Text>
            </View>
            <View style={styles.gateMetaTile}>
              <Text style={styles.gateMetaValue}>
                {overview.isTrialEntry ? 'Free' : overview.entryCost}
              </Text>
              <Text style={styles.gateMetaLabel}>Energy</Text>
            </View>
          </View>

          {overview.hasActiveBattle ? (
            <View style={styles.resultBanner}>
              <MaterialCommunityIcons name="sword-cross" size={17} color="#FFD27A" />
              <Text style={styles.resultText}>An unfinished gate battle is waiting.</Text>
            </View>
          ) : null}

          <Pressable
            disabled={!canEnter || entering || loading}
            onPress={() => void enterDungeon()}
            style={({ pressed }) => [
              styles.enterButton,
              !canEnter && styles.enterButtonLocked,
              pressed && canEnter && styles.enterButtonPressed,
            ]}>
            {entering ? (
              <ActivityIndicator color="#061018" />
            ) : (
              <MaterialCommunityIcons
                name={overview.hasActiveBattle ? 'play' : canEnter ? 'sword-cross' : 'lock-outline'}
                size={18}
                color={canEnter ? '#061018' : '#777E9C'}
              />
            )}
            <Text style={[styles.enterButtonText, !canEnter && styles.enterButtonTextLocked]}>
              {entering
                ? 'Entering'
                : overview.hasActiveBattle
                  ? 'Resume Battle'
                  : canEnter
                    ? 'Enter Gate'
                    : 'Need Energy'}
            </Text>
          </Pressable>

          {!canEnter ? (
            <Pressable
              onPress={() => router.push('/' as Href)}
              style={({ pressed }) => [styles.todayLink, pressed && styles.todayLinkPressed]}>
              <MaterialCommunityIcons name="lightning-bolt" size={16} color="#7EE7FF" />
              <Text style={styles.todayLinkText}>Earn Energy on Today</Text>
            </Pressable>
          ) : null}
        </LinearGradient>

        <View style={styles.sectionHeaderSecondary}>
          <Text style={styles.sectionEyebrow}>RUN LOG</Text>
          <Text style={styles.sectionTitle}>Recent runs</Text>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#AE8AFF" />
            <Text style={styles.loadingText}>Reading gate records...</Text>
          </View>
        ) : null}

        {!loading && overview.recentRuns.length === 0 ? (
          <View style={styles.emptyRunLog}>
            <MaterialCommunityIcons name="map-marker-path" size={28} color="#777E9C" />
            <Text style={styles.emptyRunTitle}>No dungeon clears yet</Text>
            <Text style={styles.emptyRunText}>Spend Energy to scout Ashen Ruins and store the loot.</Text>
          </View>
        ) : null}

        {!loading && overview.recentRuns.length > 0 ? (
          <View style={styles.runList}>
            {overview.recentRuns.map((run) => (
              <View key={run.id} style={styles.runCard}>
                <View style={[styles.runIcon, run.status === 'failed' && styles.runIconFailed]}>
                  <MaterialCommunityIcons
                    name={run.status === 'cleared' ? 'check-decagram' : 'close-octagon-outline'}
                    size={21}
                    color={run.status === 'cleared' ? '#7FE7A9' : '#E78AA5'}
                  />
                </View>
                <View style={styles.runBody}>
                  <Text style={styles.runTitle}>{run.dungeonName}</Text>
                  <Text style={styles.runMeta}>
                    {run.status === 'cleared' ? 'Cleared' : 'Defeated'} - {run.difficulty} -{' '}
                    {run.energyCost === 0 ? 'Trial entry' : `${run.energyCost} Energy spent`}
                  </Text>
                  <Text style={styles.runReward}>
                    {run.rewardName
                      ? `${run.rewardQuantity ?? 1}x ${run.rewardName}  |  ${run.goldEarned} Gold`
                      : run.status === 'cleared'
                        ? `Loot stored  |  ${run.goldEarned} Gold`
                        : 'No final chest'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  backgroundGlowPurple: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#5E2B97',
    opacity: 0.14,
    top: -100,
    right: -100,
  },
  backgroundGlowCyan: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#00B8D9',
    opacity: 0.07,
    top: 280,
    left: -150,
  },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 110 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#AE8AFF' },
  systemLabel: { color: '#A88FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  heading: { color: '#F5F2FF', fontSize: 31, fontWeight: '800', letterSpacing: 0 },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111229',
    borderWidth: 1,
    borderColor: '#37315A',
  },
  energyPanel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#453C73',
    padding: 17,
    marginBottom: 24,
    overflow: 'hidden',
  },
  energyTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  energyEyebrow: { color: '#9E8EFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  energyValue: { color: '#F2EDFF', fontSize: 28, fontWeight: '900', marginTop: 4 },
  clearBadge: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(8, 11, 24, 0.78)',
    borderWidth: 1,
    borderColor: '#333B5D',
  },
  clearBadgeText: { color: '#BFD9E8', fontSize: 10, fontWeight: '900' },
  energyTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(7, 9, 22, 0.86)',
    overflow: 'hidden',
    marginTop: 18,
  },
  energyFill: { height: '100%', borderRadius: 4 },
  sectionHeader: { marginBottom: 12 },
  sectionHeaderSecondary: { marginTop: 22, marginBottom: 12 },
  sectionEyebrow: { color: '#9E8EFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  sectionTitle: { color: '#F1EFFF', fontSize: 19, fontWeight: '800', marginTop: 4 },
  gateCard: {
    borderRadius: 19,
    padding: 15,
    borderWidth: 1,
    borderColor: '#2D2F54',
    overflow: 'hidden',
  },
  gateTopRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  gateIcon: {
    width: 56,
    height: 56,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 13, 29, 0.9)',
    borderWidth: 1,
    borderColor: '#4D3D7B',
  },
  gateBody: { flex: 1, minWidth: 0 },
  gateRegion: { color: '#8F83C9', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  gateName: { color: '#F1EEFF', fontSize: 17, fontWeight: '900', marginTop: 3 },
  gateDescription: { color: '#818AA9', fontSize: 11, fontWeight: '700', lineHeight: 17, marginTop: 5 },
  gateMetaRow: { flexDirection: 'row', gap: 9, marginTop: 17 },
  gateMetaTile: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(8, 11, 24, 0.64)',
    borderWidth: 1,
    borderColor: 'rgba(126, 133, 170, 0.16)',
  },
  gateMetaValue: { color: '#F4F1FF', fontSize: 13, fontWeight: '900' },
  gateMetaLabel: { color: '#7D86A3', fontSize: 9, fontWeight: '800', marginTop: 4 },
  resultBanner: {
    minHeight: 42,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 14,
    backgroundColor: 'rgba(255, 210, 122, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 210, 122, 0.24)',
  },
  resultText: { color: '#FFDFA3', fontSize: 11, fontWeight: '800', flex: 1 },
  enterButton: {
    height: 48,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 15,
    backgroundColor: '#9B7CFF',
    borderWidth: 1,
    borderColor: '#C0A8FF',
  },
  enterButtonLocked: {
    backgroundColor: 'rgba(20, 23, 42, 0.94)',
    borderColor: '#333852',
  },
  enterButtonPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  enterButtonText: { color: '#061018', fontSize: 13, fontWeight: '900' },
  enterButtonTextLocked: { color: '#777E9C' },
  todayLink: {
    height: 38,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    backgroundColor: 'rgba(11, 28, 41, 0.66)',
    borderWidth: 1,
    borderColor: '#25485D',
  },
  todayLinkPressed: { opacity: 0.76 },
  todayLinkText: { color: '#83DDF1', fontSize: 11, fontWeight: '900' },
  loadingState: {
    minHeight: 92,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: 'rgba(12, 16, 31, 0.7)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  loadingText: { color: '#737B98', fontSize: 11, fontWeight: '700' },
  emptyRunLog: {
    minHeight: 128,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(12, 16, 31, 0.7)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  emptyRunTitle: { color: '#EAE7F8', fontSize: 14, fontWeight: '900', marginTop: 10 },
  emptyRunText: {
    color: '#7C849D',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 5,
  },
  runList: { gap: 10 },
  runCard: {
    minHeight: 76,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(12, 16, 31, 0.92)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  runIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 36, 35, 0.82)',
    borderWidth: 1,
    borderColor: '#2D6557',
  },
  runIconFailed: {
    backgroundColor: 'rgba(51, 20, 34, 0.82)',
    borderColor: '#6A3048',
  },
  runBody: { flex: 1, paddingLeft: 11 },
  runTitle: { color: '#EBE9F8', fontSize: 13, fontWeight: '900' },
  runMeta: { color: '#7D86A3', fontSize: 10, fontWeight: '700', marginTop: 4 },
  runReward: { color: '#FFD27A', fontSize: 10, fontWeight: '800', marginTop: 4 },
});
