import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  chooseDungeonPath,
  continueDungeonRoute,
  fleeDungeonBattle,
  getActiveDungeonBattle,
  performDungeonBattleAction,
  type DungeonBattle,
  type DungeonPath,
  type DungeonRun,
} from '@/src/database/dungeon-repository';
import {
  BattleScene,
  getBattleAnimationDuration,
  type BattleAnimationEvent,
  type BattleAnimationSpeed,
} from '@/src/dungeon/battle-scene';
import {
  combatStatusCatalog,
  type CombatStatus,
} from '@/src/dungeon/combat-statuses';
import type { CombatAction } from '@/src/dungeon/unawakened-combat';
import { playImpactHaptic, playNotificationHaptic } from '@/src/settings/haptic-feedback';
import {
  getRuntimeUserSettings,
  subscribeUserSettings,
} from '@/src/settings/user-settings';

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

const classSkillIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  warrior: 'axe-battle',
  mage: 'auto-fix',
  assassin: 'knife-military',
  guardian: 'shield-sword-outline',
  summoner: 'paw-outline',
};

function HealthBar({
  current,
  maximum,
  color,
  reduceMotion = false,
}: {
  current: number;
  maximum: number;
  color: string;
  reduceMotion?: boolean;
}) {
  const ratio = maximum > 0 ? Math.max(0, Math.min(1, current / maximum)) : 0;
  const progress = useSharedValue(ratio);
  useEffect(() => {
    progress.value = reduceMotion ? ratio : withTiming(ratio, { duration: 260 });
  }, [progress, ratio, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));
  return (
    <View style={styles.healthTrack}>
      <Animated.View
        style={[
          styles.healthFill,
          { backgroundColor: color, transformOrigin: 'left center' },
          animatedStyle,
        ]}
      />
    </View>
  );
}

function CombatStatusRow({ statuses }: { statuses: CombatStatus[] }) {
  if (statuses.length === 0) return null;

  return (
    <View style={styles.statusRow}>
      {statuses.map((status) => {
        const definition = combatStatusCatalog[status.type];
        return (
          <View
            key={status.type}
            style={[styles.statusBadge, { borderColor: `${definition.accent}66` }]}>
            <MaterialCommunityIcons
              color={definition.accent}
              name={definition.icon}
              size={12}
            />
            <Text style={[styles.statusName, { color: definition.accent }]}>
              {definition.label}
            </Text>
            <Text style={styles.statusValue}>
              {status.type === 'barrier' ? status.potency : `${status.turns}T`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function DungeonRouteProgress({ battle }: { battle: DungeonBattle }) {
  const routeLabels = [
    'Combat',
    battle.routeKey === 'safe' ? 'Rest' : battle.routeKey === 'risky' ? 'Treasure' : 'Fork',
    battle.routeKey === 'safe' ? 'Event' : battle.routeKey === 'risky' ? 'Elite' : 'Unknown',
    'Boss',
  ];
  const routeIcons: (keyof typeof MaterialCommunityIcons.glyphMap)[] = [
    'sword',
    battle.routeKey === 'safe' ? 'campfire' : battle.routeKey === 'risky' ? 'treasure-chest' : 'source-fork',
    battle.routeKey === 'safe' ? 'star-four-points-outline' : 'skull-crossbones-outline',
    'crown-outline',
  ];

  return (
    <View style={styles.routeMap}>
      {routeLabels.map((label, index) => {
        const roomNumber = index + 1;
        const complete = roomNumber <= battle.roomsCleared;
        const current = roomNumber === battle.roomIndex;
        return (
          <View key={roomNumber} style={styles.routeStepWrap}>
            {index > 0 ? (
              <View style={[styles.routeLine, complete && styles.routeLineComplete]} />
            ) : null}
            <View style={styles.routeStep}>
              <View
                style={[
                  styles.routeNode,
                  complete && styles.routeNodeComplete,
                  current && styles.routeNodeCurrent,
                ]}>
                <MaterialCommunityIcons
                  color={complete ? '#071018' : current ? '#FFD27A' : '#626A80'}
                  name={complete ? 'check' : routeIcons[index]}
                  size={14}
                />
              </View>
              <Text numberOfLines={1} style={[styles.routeLabel, current && styles.routeLabelCurrent]}>
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function DungeonRunScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const settings = useSyncExternalStore(
    subscribeUserSettings,
    getRuntimeUserSettings,
    getRuntimeUserSettings,
  );
  const reduceMotion = settings.reduceMotionEnabled;
  const [battle, setBattle] = useState<DungeonBattle | null>(null);
  const [outcome, setOutcome] = useState<BattleOutcome>(null);
  const [completedRun, setCompletedRun] = useState<DungeonRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [animationEvent, setAnimationEvent] = useState<BattleAnimationEvent | null>(null);
  const [animationSpeed, setAnimationSpeed] = useState<BattleAnimationSpeed>(1);
  const animationSequence = useRef(0);
  const animationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (animationTimeout.current) clearTimeout(animationTimeout.current);
  }, []);

  const showCombatFeedback = useCallback((
    action: CombatAction,
    skillKey: string | undefined,
    feedback: Pick<BattleAnimationEvent, 'playerDamage' | 'enemyDamage' | 'healing'> | null,
    previousBattle: DungeonBattle,
    nextBattle: DungeonBattle | null,
    resultOutcome: 'active' | 'path-choice' | 'room-cleared' | 'cleared' | 'failed' | 'fled',
  ) => {
    if (!feedback) return 0;
    const skillProfile = previousBattle.activeSkillProfiles.find(
      (profile) => profile.skillKey === skillKey,
    ) ?? previousBattle.combatProfile;
    const summonsBefore = previousBattle.snapshot.summons.map((summon) => summon.key);
    const summonsAfter = nextBattle?.snapshot.summons.map((summon) => summon.key) ?? summonsBefore;
    const summonCreated = skillKey === 'summoner-wolf'
      ? 'wolf'
      : skillKey === 'summoner-wisp'
        ? 'wisp'
        : null;
    const summonDismissed = skillKey === 'summoner-reclaim-essence'
      ? [...previousBattle.snapshot.summons].sort((first, second) => first.hp - second.hp)[0]?.key ?? null
      : summonsBefore.find((summon) => !summonsAfter.includes(summon)) ?? null;
    const summonActors = previousBattle.classKey === 'summoner'
      ? summonsBefore.filter((summon) =>
          summon === 'wolf'
            ? feedback.playerDamage > 0
            : summon === 'wisp' && feedback.healing > 0,
        )
      : [];
    const enemyActs = resultOutcome === 'active' || resultOutcome === 'failed';
    const event: BattleAnimationEvent = {
      ...feedback,
      id: ++animationSequence.current,
      action,
      skillKey,
      actionName: action === 'skill'
        ? skillProfile.skillName
        : action === 'attack'
          ? 'Basic Attack'
          : action === 'defend'
            ? 'Defensive Stance'
            : 'Health Potion',
      classKey: previousBattle.classKey,
      accent: skillProfile.accent,
      enemyIntent: {
        name: previousBattle.enemyIntent.name,
        type: previousBattle.enemyIntent.type,
      },
      enemyActs,
      summonActors,
      summonCreated,
      summonDismissed,
      enemyStatus: action === 'skill' && resultOutcome === 'active'
        ? skillProfile.skillStatus?.type ?? null
        : null,
      playerStatus: enemyActs && feedback.enemyDamage > 0
        ? previousBattle.enemyIntent.status?.type ?? null
        : null,
    };
    setAnimationEvent(event);
    if (animationTimeout.current) clearTimeout(animationTimeout.current);
    const duration = getBattleAnimationDuration(reduceMotion, animationSpeed);
    animationTimeout.current = setTimeout(
      () => setAnimationEvent((current) => current?.id === event.id ? null : current),
      duration + 80,
    );
    return duration;
  }, [animationSpeed, reduceMotion]);

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

  const battleActions = useMemo(() => {
    if (!battle) return [];
    const skillProfiles = battle.combatProfile.resourceName
      ? battle.activeSkillProfiles
      : [battle.combatProfile];

    return [
      { key: 'attack', action: 'attack' as const, profile: null },
      ...skillProfiles.map((profile) => ({
        key: profile.skillKey,
        action: 'skill' as const,
        profile,
      })),
      { key: 'defend', action: 'defend' as const, profile: null },
      { key: 'item', action: 'item' as const, profile: null },
    ];
  }, [battle]);

  const isActionDisabled = (action: CombatAction, skillKey?: string) => {
    if (acting || !battle) return true;
    if (action === 'item') {
      return battle.potionCount <= 0 || battle.snapshot.playerHp >= battle.stats.maxPlayerHp;
    }
    if (action !== 'skill') return false;

    const profile = battle.activeSkillProfiles.find((skill) => skill.skillKey === skillKey)
      ?? battle.combatProfile;
    if (profile.classKey === 'summoner') {
      const summonKey = profile.skillKey === 'summoner-wolf'
        ? 'wolf'
        : profile.skillKey === 'summoner-wisp'
          ? 'wisp'
          : null;
      if (summonKey && battle.snapshot.summons.some((summon) => summon.key === summonKey)) {
        return true;
      }
      if (summonKey && battle.snapshot.summons.length >= 2) return true;
      if (
        ['summoner-command-focus', 'summoner-spirit-link', 'summoner-reclaim-essence']
          .includes(profile.skillKey) &&
        battle.snapshot.summons.length === 0
      ) {
        return true;
      }
    }
    return profile.resourceName
      ? battle.snapshot.classResource < profile.skillCost
      : battle.snapshot.skillCooldown > 0;
  };

  const performAction = async (action: CombatAction, skillKey?: string) => {
    if (isActionDisabled(action, skillKey)) return;
    const previousBattle = battle;
    if (!previousBattle) return;
    setActing(true);
    setErrorMessage('');
    try {
      const result = await performDungeonBattleAction(db, action, skillKey);
      const animationDuration = showCombatFeedback(
        action,
        skillKey,
        result.feedback,
        previousBattle,
        result.battle,
        result.outcome,
      );
      void playImpactHaptic('light');
      if (animationDuration > 0) {
        await new Promise((resolve) => setTimeout(resolve, animationDuration));
      }
      if (result.outcome === 'active') {
        setBattle(result.battle);
      } else if (result.outcome === 'path-choice' || result.outcome === 'room-cleared') {
        setBattle(result.battle);
      } else {
        setBattle(null);
        setOutcome(result.outcome);
        setCompletedRun(result.run);
        void playNotificationHaptic(result.outcome === 'cleared' ? 'success' : 'error');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The action could not be completed.');
    } finally {
      setActing(false);
    }
  };

  const choosePath = async (path: DungeonPath) => {
    if (acting) return;
    setActing(true);
    setErrorMessage('');
    try {
      setBattle(await chooseDungeonPath(db, path));
      void playNotificationHaptic('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The path could not be opened.');
    } finally {
      setActing(false);
    }
  };

  const continueRoute = async () => {
    if (acting) return;
    setActing(true);
    setErrorMessage('');
    try {
      setBattle(await continueDungeonRoute(db));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The next room could not be opened.');
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
            {battle
              ? `${battle.className.toUpperCase()} - ROOM ${battle.roomIndex}/4`
              : 'GATE COMBAT'}
          </Text>
          <Text numberOfLines={1} style={styles.runName}>{battle?.dungeonName ?? 'Gate Result'}</Text>
        </View>
        <Pressable
          accessibilityLabel={`Combat animation speed ${animationSpeed}x`}
          disabled={acting}
          onPress={() => setAnimationSpeed((current) => current === 1 ? 2 : 1)}
          style={({ pressed }) => [
            styles.speedButton,
            acting && styles.speedButtonDisabled,
            pressed && !acting && styles.buttonPressed,
          ]}>
          <MaterialCommunityIcons color="#8DEAFF" name="fast-forward-outline" size={15} />
          <Text style={styles.speedText}>{animationSpeed}x</Text>
        </Pressable>
        <View style={styles.turnBadge}>
          <Text style={styles.turnLabel}>
            {battle && ['combat', 'elite', 'boss'].includes(battle.roomType) ? 'TURN' : 'ROOM'}
          </Text>
          <Text style={styles.turnValue}>
            {battle
              ? ['combat', 'elite', 'boss'].includes(battle.roomType)
                ? battle.snapshot.turnNumber
                : battle.roomIndex
              : '-'}
          </Text>
        </View>
      </View>

      {battle ? (
        <>
          <DungeonRouteProgress battle={battle} />
          {battle.roomType === 'path_choice' ? (
            <View style={styles.pathPanel}>
              <View style={styles.interludeIcon}>
                <MaterialCommunityIcons color="#C8A8FF" name="source-fork" size={38} />
              </View>
              <Text style={styles.resultEyebrow}>THE FORKED HALL</Text>
              <Text style={styles.resultTitle}>Choose your route</Text>
              <Text style={styles.resultDescription}>
                The quiet passage offers recovery. The dangerous passage holds treasure and an Elite guardian.
              </Text>
              <View style={styles.pathOptions}>
                <Pressable
                  disabled={acting}
                  onPress={() => void choosePath('safe')}
                  style={({ pressed }) => [styles.pathOption, pressed && styles.actionButtonPressed]}>
                  <View style={[styles.pathOptionIcon, styles.pathOptionIconSafe]}>
                    <MaterialCommunityIcons color="#68E1A8" name="campfire" size={25} />
                  </View>
                  <View style={styles.pathOptionBody}>
                    <Text style={styles.pathOptionEyebrow}>SAFE PATH</Text>
                    <Text style={styles.pathOptionTitle}>Rest and Event</Text>
                    <Text style={styles.pathOptionDetail}>Restore 35% HP before the final encounter.</Text>
                  </View>
                  <MaterialCommunityIcons color="#8790A6" name="chevron-right" size={21} />
                </Pressable>
                <Pressable
                  disabled={acting}
                  onPress={() => void choosePath('risky')}
                  style={({ pressed }) => [styles.pathOption, pressed && styles.actionButtonPressed]}>
                  <View style={[styles.pathOptionIcon, styles.pathOptionIconRisky]}>
                    <MaterialCommunityIcons color="#FFD166" name="treasure-chest" size={25} />
                  </View>
                  <View style={styles.pathOptionBody}>
                    <Text style={[styles.pathOptionEyebrow, { color: '#FFD166' }]}>RISKY PATH</Text>
                    <Text style={styles.pathOptionTitle}>Treasure and Elite</Text>
                    <Text style={styles.pathOptionDetail}>Keep found loot even if the run later fails.</Text>
                  </View>
                  <MaterialCommunityIcons color="#8790A6" name="chevron-right" size={21} />
                </Pressable>
              </View>
              <Pressable
                disabled={acting}
                onPress={confirmFlee}
                style={({ pressed }) => [styles.interludeFleeButton, pressed && styles.buttonPressed]}>
                <MaterialCommunityIcons color="#C87C96" name="exit-run" size={16} />
                <Text style={styles.fleeText}>Leave Run</Text>
              </Pressable>
              {errorMessage ? <Text selectable style={styles.interludeError}>{errorMessage}</Text> : null}
            </View>
          ) : battle.roomType === 'event' || battle.roomType === 'boss_ready' ? (
            <View style={styles.pathPanel}>
              <View style={styles.interludeIcon}>
                <MaterialCommunityIcons
                  color={battle.roomType === 'event' ? '#68E1A8' : '#FFD166'}
                  name={battle.roomType === 'event' ? 'star-four-points-outline' : 'sword-cross'}
                  size={38}
                />
              </View>
              <Text style={styles.resultEyebrow}>
                {battle.roomType === 'event' ? battle.enemyName.toUpperCase() : 'ELITE CLEARED'}
              </Text>
              <Text style={styles.resultTitle}>
                {battle.roomType === 'event' ? 'A quiet cache remains' : 'The final gate opens'}
              </Text>
              <Text style={styles.resultDescription}>
                {battle.roomType === 'event'
                  ? 'The Rest Room restored your health. The shrine holds 2 Gold before the boss.'
                  : `The Elite reward is secured. ${battle.interimGold} Gold and found materials remain yours even after defeat.`}
              </Text>
              <Pressable
                disabled={acting}
                onPress={() => void continueRoute()}
                style={({ pressed }) => [styles.returnButton, pressed && styles.actionButtonPressed]}>
                {acting ? (
                  <ActivityIndicator color="#071018" />
                ) : (
                  <MaterialCommunityIcons color="#071018" name="gate" size={19} />
                )}
                <Text style={styles.returnButtonText}>Enter Boss Chamber</Text>
              </Pressable>
              <Pressable
                disabled={acting}
                onPress={confirmFlee}
                style={({ pressed }) => [styles.interludeFleeButton, pressed && styles.buttonPressed]}>
                <MaterialCommunityIcons color="#C87C96" name="exit-run" size={16} />
                <Text style={styles.fleeText}>Leave Run</Text>
              </Pressable>
              {errorMessage ? <Text selectable style={styles.interludeError}>{errorMessage}</Text> : null}
            </View>
          ) : (
            <>
          <LinearGradient
            colors={['#24172F', '#101422', '#090B13']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.enemyStage}>
            <BattleScene
              battle={battle}
              event={animationEvent}
              reduceMotion={reduceMotion}
              speed={animationSpeed}
            />
            <Text style={styles.enemyRank}>
              {battle.roomType === 'boss'
                ? `${battle.dungeon.rank.toUpperCase()} BOSS`
                : battle.roomType === 'elite'
                  ? 'ELITE ENCOUNTER'
                  : 'NORMAL ENCOUNTER'}
            </Text>
            <Text style={styles.enemyName}>{battle.enemyName}</Text>
            <View style={styles.hpHeader}>
              <Text style={styles.hpLabel}>ENEMY HP</Text>
              <Text style={styles.hpValue}>
                {battle.snapshot.enemyHp} / {battle.stats.maxEnemyHp}
              </Text>
            </View>
            <HealthBar
              color="#FF786D"
              current={battle.snapshot.enemyHp}
              maximum={battle.stats.maxEnemyHp}
              reduceMotion={reduceMotion}
            />
            <CombatStatusRow statuses={battle.snapshot.enemyStatuses} />
          </LinearGradient>

          <View style={styles.intentPanel}>
            <View style={styles.intentIcon}>
              <MaterialCommunityIcons
                name={
                  battle.enemyIntent.status?.type === 'poison'
                    ? 'bottle-tonic-skull-outline'
                    : battle.enemyIntent.status?.type === 'burn'
                      ? 'fire-alert'
                      : battle.enemyIntent.type === 'charge'
                        ? 'alert-octagram-outline'
                        : 'sword-cross'
                }
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
            <HealthBar
              color="#62DFFF"
              current={battle.snapshot.playerHp}
              maximum={battle.stats.maxPlayerHp}
              reduceMotion={reduceMotion}
            />
            {battle.combatProfile.resourceName ? (
              <View style={styles.resourceBlock}>
                <View style={styles.resourceHeader}>
                  <Text style={styles.resourceLabel}>{battle.combatProfile.resourceName.toUpperCase()}</Text>
                  <Text style={[styles.resourceValue, { color: battle.combatProfile.accent }]}>
                    {battle.snapshot.classResource} / {battle.combatProfile.maxResource}
                  </Text>
                </View>
                <HealthBar
                  color={battle.combatProfile.accent}
                  current={battle.snapshot.classResource}
                  maximum={battle.combatProfile.maxResource}
                  reduceMotion={reduceMotion}
                />
              </View>
            ) : null}
            <CombatStatusRow statuses={battle.snapshot.playerStatuses} />
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
            {battleActions.map(({ key, action, profile }) => {
              const baseMeta = actionMeta[action];
              const meta =
                action === 'skill'
                  ? {
                      ...baseMeta,
                      label: profile?.skillName ?? battle.combatProfile.skillName,
                      icon: classSkillIcons[battle.classKey] ?? baseMeta.icon,
                    }
                  : baseMeta;
              const skillProfile = profile ?? battle.combatProfile;
              const disabled = isActionDisabled(action, profile?.skillKey);
              const summonKey = skillProfile.skillKey === 'summoner-wolf'
                ? 'wolf'
                : skillProfile.skillKey === 'summoner-wisp'
                  ? 'wisp'
                  : null;
              const summonStatusText = action === 'skill' && skillProfile.classKey === 'summoner'
                ? summonKey && battle.snapshot.summons.some((summon) => summon.key === summonKey)
                  ? 'Active for this run'
                  : ['summoner-command-focus', 'summoner-spirit-link', 'summoner-reclaim-essence']
                      .includes(skillProfile.skillKey) && battle.snapshot.summons.length === 0
                    ? 'Summon required'
                    : null
                : null;
              const statusText =
                summonStatusText ?? (action === 'skill' && skillProfile.resourceName
                  ? skillProfile.skillResourceGain > skillProfile.skillCost
                    ? `+${skillProfile.skillResourceGain - skillProfile.skillCost} ${skillProfile.resourceName}`
                    : `${skillProfile.skillCost} ${skillProfile.resourceName}`
                  : action === 'skill' && battle.snapshot.skillCooldown > 0
                    ? `${battle.snapshot.skillCooldown} turn cooldown`
                    : action === 'defend' && battle.combatProfile.resourceName
                      ? `Guard +${battle.combatProfile.defendResourceGain} ${battle.combatProfile.resourceName}`
                  : action === 'item'
                    ? `${battle.potionCount} available`
                    : meta.detail);

              return (
                <Pressable
                  accessibilityLabel={meta.label}
                  disabled={disabled}
                  key={key}
                  onPress={() => void performAction(action, profile?.skillKey)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    disabled && styles.actionButtonDisabled,
                    pressed && !disabled && styles.actionButtonPressed,
                  ]}>
                  <View style={styles.actionIcon}>
                    <MaterialCommunityIcons
                      name={meta.icon}
                      size={22}
                      color={
                        disabled
                          ? '#555C73'
                          : action === 'skill'
                            ? battle.combatProfile.accent
                            : '#8DEAFF'
                      }
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
          )}
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
              ? 'Dungeon boss defeated'
              : outcome === 'fled'
                ? 'You escaped the gate'
                : 'The gate guardian prevailed'}
          </Text>
          <Text style={styles.resultDescription}>
            {outcome === 'cleared'
              ? completedRun?.rewardName
                ? `${completedRun.rewardQuantity ?? 1}x ${completedRun.rewardName}, ${completedRun.goldEarned} Gold and ${completedRun.masteryXpEarned} ${completedRun.className} Mastery XP were earned.`
                : `The final chest and ${completedRun?.masteryXpEarned ?? 0} Class Mastery XP were earned.`
              : `Your habits, Player EXP, stats and streaks remain unchanged.${(completedRun?.goldEarned ?? 0) > 0 ? ` ${completedRun?.goldEarned} found Gold remains in Inventory.` : ''} ${completedRun?.masteryXpEarned ?? 0} ${completedRun?.className ?? 'Class'} Mastery XP was earned for the attempt.`}
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
  speedButton: {
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderRadius: 8,
    backgroundColor: '#0D1820',
    borderWidth: 1,
    borderColor: '#285363',
  },
  speedButtonDisabled: { opacity: 0.45 },
  speedText: { color: '#8DEAFF', fontSize: 8, fontWeight: '900' },
  turnLabel: { color: '#737B94', fontSize: 7, fontWeight: '900' },
  turnValue: { color: '#E6E9F5', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  routeMap: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 6,
    paddingTop: 8,
    borderRadius: 8,
    backgroundColor: '#0B0E18',
    borderWidth: 1,
    borderColor: '#24293A',
  },
  routeStepWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  routeLine: {
    position: 'absolute',
    left: -18,
    right: 28,
    top: 15,
    height: 2,
    backgroundColor: '#292E40',
  },
  routeLineComplete: { backgroundColor: '#66D8ED' },
  routeStep: { flex: 1, alignItems: 'center', gap: 5 },
  routeNode: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#151927',
    borderWidth: 1,
    borderColor: '#343A4E',
  },
  routeNodeComplete: { backgroundColor: '#66D8ED', borderColor: '#8DEAFF' },
  routeNodeCurrent: { backgroundColor: '#2A2418', borderColor: '#8A7040' },
  routeLabel: { color: '#626A80', fontSize: 7, fontWeight: '900' },
  routeLabelCurrent: { color: '#FFD27A' },
  pathPanel: {
    flex: 1,
    minHeight: 520,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 8,
    backgroundColor: '#0C101B',
    borderWidth: 1,
    borderColor: '#2D3144',
  },
  interludeIcon: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 39,
    backgroundColor: '#171526',
    borderWidth: 1,
    borderColor: '#453B68',
  },
  pathOptions: { alignSelf: 'stretch', gap: 9, marginTop: 22 },
  pathOption: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 8,
    backgroundColor: '#111623',
    borderWidth: 1,
    borderColor: '#30374A',
  },
  pathOptionIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  pathOptionIconSafe: { backgroundColor: '#10251E', borderColor: '#285845' },
  pathOptionIconRisky: { backgroundColor: '#282113', borderColor: '#67552D' },
  pathOptionBody: { flex: 1, minWidth: 0 },
  pathOptionEyebrow: { color: '#68E1A8', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  pathOptionTitle: { color: '#EDF0FA', fontSize: 12, fontWeight: '900', marginTop: 2 },
  pathOptionDetail: { color: '#7D859B', fontSize: 8, lineHeight: 12, fontWeight: '700', marginTop: 3 },
  interludeError: { color: '#F1A7B9', fontSize: 9, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  interludeFleeButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    alignSelf: 'stretch',
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4E293A',
  },
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
  healthFill: { width: '100%', height: '100%', borderRadius: 5 },
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
  resourceBlock: { marginTop: 10 },
  resourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  resourceLabel: { color: '#8F96AA', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  resourceValue: { fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statusRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 8,
  },
  statusBadge: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: '#111522',
    borderWidth: 1,
  },
  statusName: { fontSize: 7, fontWeight: '900' },
  statusValue: { color: '#A4ABBD', fontSize: 7, fontWeight: '900', fontVariant: ['tabular-nums'] },
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
