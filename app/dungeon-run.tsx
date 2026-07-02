import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  fleeDungeonBattle,
  getActiveDungeonBattle,
  performDungeonBattleAction,
  type DungeonBattle,
  type DungeonRun,
} from '@/src/database/dungeon-repository';
import type { CombatAction } from '@/src/dungeon/unawakened-combat';

type BattleOutcome = 'cleared' | 'failed' | 'fled' | null;

const actionMeta: Record<
  CombatAction,
  { label: string; detail: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  attack: { label: 'Attack', detail: 'Reliable strike', icon: 'sword' },
  skill: { label: 'System Break', detail: 'Heavy damage', icon: 'lightning-bolt' },
  defend: { label: 'Defend', detail: 'Reduce next hit', icon: 'shield-outline' },
  item: { label: 'Potion', detail: 'Restore health', icon: 'flask' },
};

function HealthBar({
  current,
  maximum,
  color,
}: {
  current: number;
  maximum: number;
  color: string;
}) {
  const ratio = maximum > 0 ? Math.max(0, Math.min(1, current / maximum)) : 0;
  return (
    <View style={styles.healthTrack}>
      <View style={[styles.healthFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function DungeonRunScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [battle, setBattle] = useState<DungeonBattle | null>(null);
  const [outcome, setOutcome] = useState<BattleOutcome>(null);
  const [completedRun, setCompletedRun] = useState<DungeonRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadBattle = useCallback(async () => {
    try {
      const activeBattle = await getActiveDungeonBattle(db);
      if (!activeBattle) {
        router.replace('/(tabs)/dungeon' as Href);
        return;
      }
      setBattle(activeBattle);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void loadBattle();
  }, [loadBattle]);

  const actionDisabled = useMemo(
    () => ({
      attack: acting,
      defend: acting,
      skill: acting || !battle || battle.snapshot.skillCooldown > 0,
      item:
        acting ||
        !battle ||
        battle.potionCount <= 0 ||
        battle.snapshot.playerHp >= battle.stats.maxPlayerHp,
    }),
    [acting, battle],
  );

  const performAction = async (action: CombatAction) => {
    if (acting || actionDisabled[action]) return;
    setActing(true);
    setErrorMessage('');
    try {
      const result = await performDungeonBattleAction(db, action);
      if (result.outcome === 'active') {
        setBattle(result.battle);
        if (process.env.EXPO_OS === 'ios') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } else {
        setBattle(null);
        setOutcome(result.outcome);
        setCompletedRun(result.run);
        if (process.env.EXPO_OS === 'ios') {
          void Haptics.notificationAsync(
            result.outcome === 'cleared'
              ? Haptics.NotificationFeedbackType.Success
              : Haptics.NotificationFeedbackType.Error,
          );
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The action could not be completed.');
    } finally {
      setActing(false);
    }
  };

  const confirmFlee = () => {
    if (acting) return;
    Alert.alert('Leave this run?', 'The battle will end without a final chest.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Flee',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setActing(true);
            setErrorMessage('');
            try {
              const result = await fleeDungeonBattle(db);
              setBattle(null);
              setOutcome('fled');
              setCompletedRun(result.run);
            } catch (error) {
              setErrorMessage(
                error instanceof Error ? error.message : 'The gate could not be closed.',
              );
            } finally {
              setActing(false);
            }
          })();
        },
      },
    ]);
  };

  if (loading || (!battle && !outcome)) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#AA8AFF" />
        <Text style={styles.loadingText}>Restoring gate state...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Return to Dungeon"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}>
          <MaterialCommunityIcons name="arrow-left" size={21} color="#D5D9E8" />
        </Pressable>
        <View style={styles.topBarTitle}>
          <Text style={styles.systemLabel}>
            {battle ? `${battle.className.toUpperCase()} COMBAT` : 'GATE COMBAT'}
          </Text>
          <Text style={styles.runName}>{battle?.dungeonName ?? 'Gate Result'}</Text>
        </View>
        <View style={styles.turnBadge}>
          <Text style={styles.turnLabel}>TURN</Text>
          <Text style={styles.turnValue}>{battle?.snapshot.turnNumber ?? '-'}</Text>
        </View>
      </View>

      {battle ? (
        <>
          <LinearGradient
            colors={['#24172F', '#101422', '#090B13']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.enemyStage}>
            <Image
              contentFit="contain"
              source={require('../assets/images/habit-rpg-emblem.png')}
              style={styles.stageEmblem}
            />
            <View style={styles.enemySigil}>
              <MaterialCommunityIcons name="fire" size={46} color="#FF8A6A" />
            </View>
            <Text style={styles.enemyRank}>E-RANK BOSS</Text>
            <Text style={styles.enemyName}>{battle.bossName}</Text>
            <View style={styles.hpHeader}>
              <Text style={styles.hpLabel}>WARDEN HP</Text>
              <Text style={styles.hpValue}>
                {battle.snapshot.enemyHp} / {battle.stats.maxEnemyHp}
              </Text>
            </View>
            <HealthBar current={battle.snapshot.enemyHp} maximum={battle.stats.maxEnemyHp} color="#FF786D" />
          </LinearGradient>

          <View style={styles.intentPanel}>
            <View style={styles.intentIcon}>
              <MaterialCommunityIcons
                name={battle.enemyIntent.type === 'charge' ? 'fire-alert' : 'sword-cross'}
                size={22}
                color="#FFB272"
              />
            </View>
            <View style={styles.intentBody}>
              <Text style={styles.intentEyebrow}>ENEMY INTENT</Text>
              <Text style={styles.intentName}>{battle.enemyIntent.name}</Text>
              <Text style={styles.intentDetail}>{battle.enemyIntent.detail}</Text>
            </View>
            <View style={styles.intentDamage}>
              <Text style={styles.intentDamageValue}>{battle.enemyIntent.damage}</Text>
              <Text style={styles.intentDamageLabel}>DMG</Text>
            </View>
          </View>

          <View style={styles.playerPanel}>
            <View style={styles.hpHeader}>
              <View>
                <Text style={styles.hpLabel}>HUNTER HP</Text>
                <Text style={styles.playerState}>{battle.className}</Text>
              </View>
              <Text style={styles.hpValue}>
                {battle.snapshot.playerHp} / {battle.stats.maxPlayerHp}
              </Text>
            </View>
            <HealthBar current={battle.snapshot.playerHp} maximum={battle.stats.maxPlayerHp} color="#62DFFF" />
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={17} color="#F19AB0" />
              <Text selectable style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.actionHeader}>
            <Text style={styles.sectionEyebrow}>CHOOSE ACTION</Text>
            <Text style={styles.energyCostText}>
              {battle.isTrialEntry ? 'Trial entry' : `${battle.energyCost} Energy reserved`}
            </Text>
          </View>

          <View style={styles.actionGrid}>
            {(Object.keys(actionMeta) as CombatAction[]).map((action) => {
              const meta = actionMeta[action];
              const disabled = actionDisabled[action];
              const statusText =
                action === 'skill' && battle.snapshot.skillCooldown > 0
                  ? `${battle.snapshot.skillCooldown} turn cooldown`
                  : action === 'item'
                    ? `${battle.potionCount} available`
                    : meta.detail;

              return (
                <Pressable
                  accessibilityLabel={meta.label}
                  disabled={disabled}
                  key={action}
                  onPress={() => void performAction(action)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    disabled && styles.actionButtonDisabled,
                    pressed && !disabled && styles.actionButtonPressed,
                  ]}>
                  <View style={styles.actionIcon}>
                    <MaterialCommunityIcons
                      name={meta.icon}
                      size={22}
                      color={disabled ? '#555C73' : '#8DEAFF'}
                    />
                  </View>
                  <View style={styles.actionTextBlock}>
                    <Text style={[styles.actionLabel, disabled && styles.actionTextDisabled]}>
                      {meta.label}
                    </Text>
                    <Text style={[styles.actionDetail, disabled && styles.actionTextDisabled]}>
                      {statusText}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.logPanel}>
            <View style={styles.logHeader}>
              <MaterialCommunityIcons name="text-box-outline" size={17} color="#9A91BB" />
              <Text style={styles.sectionEyebrow}>BATTLE LOG</Text>
            </View>
            {battle.snapshot.log.slice(-4).map((entry) => (
              <View key={entry.id} style={styles.logRow}>
                <View
                  style={[
                    styles.logDot,
                    entry.tone === 'player'
                      ? styles.logDotPlayer
                      : entry.tone === 'enemy'
                        ? styles.logDotEnemy
                        : styles.logDotSystem,
                  ]}
                />
                <Text style={styles.logText}>{entry.message}</Text>
              </View>
            ))}
          </View>

          <Pressable
            disabled={acting}
            onPress={confirmFlee}
            style={({ pressed }) => [styles.fleeButton, pressed && styles.buttonPressed]}>
            <MaterialCommunityIcons name="exit-run" size={17} color="#C87C96" />
            <Text style={styles.fleeText}>Flee</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.resultPanel}>
          <View
            style={[
              styles.resultIcon,
              outcome === 'cleared' ? styles.resultIconVictory : styles.resultIconDefeat,
            ]}>
            <MaterialCommunityIcons
              name={outcome === 'cleared' ? 'treasure-chest' : 'shield-off-outline'}
              size={44}
              color={outcome === 'cleared' ? '#FFD27A' : '#E78AA5'}
            />
          </View>
          <Text style={styles.resultEyebrow}>
            {outcome === 'cleared' ? 'GATE CLEARED' : 'RUN ENDED'}
          </Text>
          <Text style={styles.resultTitle}>
            {outcome === 'cleared'
              ? 'Cinder Warden defeated'
              : outcome === 'fled'
                ? 'You escaped the gate'
                : 'The Warden prevailed'}
          </Text>
          <Text style={styles.resultDescription}>
            {outcome === 'cleared'
              ? completedRun?.rewardName
                ? `${completedRun.rewardQuantity ?? 1}x ${completedRun.rewardName} and ${completedRun.goldEarned} Gold were added to Inventory.`
                : 'The final chest was added to Inventory.'
              : 'Your habits, Player EXP, stats and streaks remain unchanged.'}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.returnButton, pressed && styles.actionButtonPressed]}>
            <MaterialCommunityIcons name="gate" size={19} color="#071018" />
            <Text style={styles.returnButtonText}>Return to Dungeon</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' },
  content: { flexGrow: 1, paddingHorizontal: 16, gap: 12 },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#050711',
  },
  loadingText: { color: '#777F98', fontSize: 11, fontWeight: '700' },
  topBar: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#111522',
    borderWidth: 1,
    borderColor: '#282E40',
  },
  buttonPressed: { opacity: 0.72 },
  topBarTitle: { flex: 1, minWidth: 0 },
  systemLabel: { color: '#9D83F6', fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  runName: { color: '#F2F0FA', fontSize: 16, fontWeight: '900', marginTop: 2 },
  turnBadge: {
    minWidth: 48,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#121522',
    borderWidth: 1,
    borderColor: '#2B3042',
  },
  turnLabel: { color: '#737B94', fontSize: 7, fontWeight: '900' },
  turnValue: { color: '#E6E9F5', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  enemyStage: {
    minHeight: 245,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#4A304B',
  },
  stageEmblem: {
    position: 'absolute',
    width: 230,
    height: 230,
    opacity: 0.08,
  },
  enemySigil: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 41,
    backgroundColor: '#2C1822',
    borderWidth: 1,
    borderColor: '#70404B',
  },
  enemyRank: { color: '#D98579', fontSize: 8, fontWeight: '900', letterSpacing: 1.5, marginTop: 13 },
  enemyName: { color: '#FFF1EE', fontSize: 23, fontWeight: '900', marginTop: 3 },
  hpHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 15,
  },
  hpLabel: { color: '#8F96AA', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  hpValue: { color: '#D9DCE8', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  healthTrack: {
    width: '100%',
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#191D2B',
    marginTop: 7,
  },
  healthFill: { height: '100%', borderRadius: 5 },
  intentPanel: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#181421',
    borderWidth: 1,
    borderColor: '#513641',
  },
  intentIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2A1D23',
  },
  intentBody: { flex: 1, minWidth: 0 },
  intentEyebrow: { color: '#D78F75', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  intentName: { color: '#F3E9E9', fontSize: 13, fontWeight: '900', marginTop: 2 },
  intentDetail: { color: '#8E8999', fontSize: 9, fontWeight: '700', marginTop: 2 },
  intentDamage: { minWidth: 42, alignItems: 'center' },
  intentDamageValue: { color: '#FF9C81', fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  intentDamageLabel: { color: '#8D6970', fontSize: 7, fontWeight: '900' },
  playerPanel: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#0E1721',
    borderWidth: 1,
    borderColor: '#244351',
  },
  playerPanelHpHeader: { marginTop: 0 },
  playerState: { color: '#71DDF5', fontSize: 11, fontWeight: '800', marginTop: 2 },
  errorBanner: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: '#26151E',
    borderWidth: 1,
    borderColor: '#633048',
  },
  errorText: { flex: 1, color: '#F1A7B9', fontSize: 10, fontWeight: '700' },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 4,
  },
  sectionEyebrow: { color: '#8F84B7', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  energyCostText: { color: '#737B94', fontSize: 9, fontWeight: '800' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: {
    width: '48.5%',
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#2A4C5D',
  },
  actionButtonDisabled: { backgroundColor: '#0C0F18', borderColor: '#202536' },
  actionButtonPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  actionIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: '#142938',
  },
  actionTextBlock: { flex: 1, minWidth: 0 },
  actionLabel: { color: '#EBF5FA', fontSize: 11, fontWeight: '900' },
  actionDetail: { color: '#748494', fontSize: 8, fontWeight: '700', marginTop: 3 },
  actionTextDisabled: { color: '#555C73' },
  logPanel: {
    gap: 7,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#0C0F19',
    borderWidth: 1,
    borderColor: '#24283A',
  },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  logRow: { minHeight: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  logDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
  logDotPlayer: { backgroundColor: '#62DFFF' },
  logDotEnemy: { backgroundColor: '#FF806E' },
  logDotSystem: { backgroundColor: '#AA8AFF' },
  logText: { flex: 1, color: '#9299AC', fontSize: 9, lineHeight: 14, fontWeight: '700' },
  fleeButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4E293A',
  },
  fleeText: { color: '#C87C96', fontSize: 10, fontWeight: '900' },
  resultPanel: {
    flex: 1,
    minHeight: 560,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 8,
    backgroundColor: '#0C101B',
    borderWidth: 1,
    borderColor: '#272D40',
  },
  resultIcon: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 45,
    borderWidth: 1,
  },
  resultIconVictory: { backgroundColor: '#2B2417', borderColor: '#665632' },
  resultIconDefeat: { backgroundColor: '#291721', borderColor: '#643147' },
  resultEyebrow: { color: '#9982ED', fontSize: 9, fontWeight: '900', letterSpacing: 1.6, marginTop: 20 },
  resultTitle: { color: '#F3F0FA', fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  resultDescription: { color: '#858DA4', fontSize: 11, lineHeight: 17, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  returnButton: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    borderRadius: 8,
    backgroundColor: '#71DFF5',
    marginTop: 24,
  },
  returnButtonText: { color: '#071018', fontSize: 12, fontWeight: '900' },
});
