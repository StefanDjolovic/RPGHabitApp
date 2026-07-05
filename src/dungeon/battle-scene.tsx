import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { DungeonBattle } from '@/src/database/dungeon-repository';
import type { CombatStatusType } from '@/src/dungeon/combat-statuses';
import type { CombatAction, EnemyIntent, SummonKey } from '@/src/dungeon/unawakened-combat';

export type BattleAnimationSpeed = 1 | 2;

export type BattleAnimationEvent = {
  id: number;
  action: CombatAction;
  actionName: string;
  skillKey?: string;
  classKey: string;
  accent: string;
  playerDamage: number;
  enemyDamage: number;
  healing: number;
  enemyIntent: Pick<EnemyIntent, 'name' | 'type'>;
  enemyActs: boolean;
  summonActors: SummonKey[];
  summonCreated: SummonKey | null;
  summonDismissed: SummonKey | null;
  enemyStatus: CombatStatusType | null;
  playerStatus: CombatStatusType | null;
};

type BattlePhase = 'player' | 'impact' | 'summon' | 'enemy' | 'recovery' | null;

const classIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  unawakened: 'account-outline',
  warrior: 'axe-battle',
  mage: 'auto-fix',
  assassin: 'knife-military',
  guardian: 'shield-sword-outline',
  summoner: 'paw-outline',
};

const actionIcons: Record<CombatAction, keyof typeof MaterialCommunityIcons.glyphMap> = {
  attack: 'sword',
  skill: 'lightning-bolt',
  defend: 'shield-outline',
  item: 'flask',
};

export function getBattleAnimationDuration(
  reduceMotion: boolean,
  speed: BattleAnimationSpeed,
) {
  if (reduceMotion) return 80;
  return speed === 2 ? 560 : 940;
}

function SummonActor({
  summonKey,
  event,
  reduceMotion,
  speed,
  hpRatio,
}: {
  summonKey: SummonKey;
  event: BattleAnimationEvent | null;
  reduceMotion: boolean;
  speed: BattleAnimationSpeed;
  hpRatio: number;
}) {
  const offset = useSharedValue(0);
  const pulse = useSharedValue(1);
  const opacity = useSharedValue(1);
  const active = Boolean(
    event && (
      event.summonActors.includes(summonKey) ||
      event.summonCreated === summonKey ||
      event.summonDismissed === summonKey
    ),
  );

  useEffect(() => {
    if (!event || !active || reduceMotion) return;
    const factor = speed === 2 ? 0.58 : 1;
    opacity.value = 1;
    if (summonKey === 'wolf' && event.summonActors.includes(summonKey)) {
      offset.value = withDelay(
        330 * factor,
        withSequence(
          withTiming(72, { duration: 105 * factor, easing: Easing.out(Easing.quad) }),
          withSpring(0, { damping: 13, stiffness: 230 }),
        ),
      );
    } else if (summonKey === 'wisp' && event.summonActors.includes(summonKey)) {
      pulse.value = withDelay(
        330 * factor,
        withSequence(
          withTiming(1.34, { duration: 120 * factor }),
          withTiming(1, { duration: 180 * factor }),
        ),
      );
    }
    if (event.summonCreated === summonKey && !event.summonActors.includes(summonKey)) {
      pulse.value = withDelay(
        300 * factor,
        withSequence(
          withTiming(1.3, { duration: 120 * factor }),
          withTiming(1, { duration: 160 * factor }),
        ),
      );
    }
    if (event.summonDismissed === summonKey) {
      const dismissedByPlayer = event.skillKey === 'summoner-reclaim-essence';
      const dismissDelay = dismissedByPlayer ? 150 : 650;
      if (dismissedByPlayer) {
        pulse.value = withDelay(
          dismissDelay * factor,
          withTiming(0.5, { duration: 180 * factor }),
        );
      }
      opacity.value = withDelay(
        dismissDelay * factor,
        withTiming(0, { duration: 180 * factor }),
      );
    }
  }, [active, event, offset, opacity, pulse, reduceMotion, speed, summonKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: offset.value }, { scale: pulse.value }],
  }));
  const color = summonKey === 'wolf' ? '#FFD166' : '#7EE7FF';

  return (
    <Animated.View
      entering={reduceMotion ? undefined : ZoomIn.springify().damping(14)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
      layout={reduceMotion ? undefined : LinearTransition.duration(180)}
      style={[styles.summonUnit, animatedStyle]}>
      <View style={[styles.summonCore, active && { borderColor: color }]}>
        <MaterialCommunityIcons
          color={color}
          name={summonKey === 'wolf' ? 'dog-side' : 'fire-circle'}
          size={21}
        />
      </View>
      <View style={styles.summonHealthTrack}>
        <View style={[styles.summonHealthFill, { width: `${hpRatio * 100}%` }]} />
      </View>
    </Animated.View>
  );
}

function getPhaseContent(event: BattleAnimationEvent, phase: BattlePhase) {
  if (phase === 'player') return { eyebrow: 'HUNTER TURN', label: event.actionName };
  if (phase === 'impact') {
    return {
      eyebrow: event.enemyStatus ? 'STATUS APPLIED' : 'IMPACT',
      label: event.enemyStatus ? event.enemyStatus.toUpperCase() : `${event.playerDamage} DAMAGE`,
    };
  }
  if (phase === 'summon') {
    return {
      eyebrow: event.summonCreated ? 'SPIRIT CALLED' : 'SUMMON TURN',
      label: event.summonCreated
        ? event.summonCreated === 'wolf' ? 'SPIRIT WOLF' : 'ASTRAL WISP'
        : 'SPIRIT ASSAULT',
    };
  }
  if (phase === 'enemy') {
    return {
      eyebrow: event.enemyIntent.type === 'charge' ? 'ENEMY CHARGES' : 'ENEMY TURN',
      label: event.enemyIntent.name,
    };
  }
  if (phase === 'recovery') return { eyebrow: 'RECOVERY', label: `+${event.healing} HP` };
  return null;
}

export function BattleScene({
  battle,
  event,
  reduceMotion,
  speed,
}: {
  battle: DungeonBattle;
  event: BattleAnimationEvent | null;
  reduceMotion: boolean;
  speed: BattleAnimationSpeed;
}) {
  const [phase, setPhase] = useState<BattlePhase>(null);
  const playerOffset = useSharedValue(0);
  const playerScale = useSharedValue(1);
  const enemyOffset = useSharedValue(0);
  const playerShake = useSharedValue(0);
  const enemyShake = useSharedValue(0);
  const enemyFlash = useSharedValue(0);
  const enemyPulse = useSharedValue(1);
  const skillTravel = useSharedValue(0);
  const skillOpacity = useSharedValue(0);
  const shieldPulse = useSharedValue(0);
  const stageFlash = useSharedValue(0);

  useEffect(() => {
    if (!event) {
      setPhase(null);
      return;
    }
    const factor = speed === 2 ? 0.58 : 1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const setPhaseAt = (nextPhase: BattlePhase, delay: number) => {
      timers.push(setTimeout(() => setPhase(nextPhase), reduceMotion ? 0 : delay * factor));
    };

    setPhase('player');
    if (event.playerDamage > 0 || event.enemyStatus) setPhaseAt('impact', 185);
    if (event.summonActors.length > 0 || event.summonCreated) setPhaseAt('summon', 355);
    if (event.enemyActs) setPhaseAt('enemy', 540);
    if (event.healing > 0) setPhaseAt('recovery', event.enemyActs ? 755 : 555);
    setPhaseAt(null, getBattleAnimationDuration(reduceMotion, speed));

    if (!reduceMotion) {
      playerOffset.value = 0;
      playerScale.value = 1;
      enemyOffset.value = 0;
      playerShake.value = 0;
      enemyShake.value = 0;
      enemyFlash.value = 0;
      enemyPulse.value = 1;
      skillTravel.value = 0;
      skillOpacity.value = 0;
      shieldPulse.value = 0;
      stageFlash.value = 0;

      if (event.action === 'attack') {
        playerOffset.value = withSequence(
          withTiming(66, { duration: 125 * factor, easing: Easing.out(Easing.quad) }),
          withSpring(0, { damping: 14, stiffness: 240 }),
        );
      } else if (event.action === 'skill' && event.playerDamage > 0) {
        playerScale.value = withSequence(
          withTiming(1.12, { duration: 100 * factor }),
          withSpring(1, { damping: 14, stiffness: 210 }),
        );
        skillOpacity.value = withSequence(
          withTiming(1, { duration: 70 * factor }),
          withDelay(175 * factor, withTiming(0, { duration: 120 * factor })),
        );
        skillTravel.value = withTiming(120, {
          duration: 230 * factor,
          easing: Easing.inOut(Easing.quad),
        });
      } else if (event.action === 'defend' || event.action === 'skill' || event.action === 'item') {
        shieldPulse.value = withSequence(
          withTiming(1, { duration: 130 * factor }),
          withDelay(280 * factor, withTiming(0, { duration: 180 * factor })),
        );
      } else {
        playerScale.value = withSequence(
          withTiming(1.08, { duration: 120 * factor }),
          withSpring(1),
        );
      }

      if (event.playerDamage > 0) {
        enemyShake.value = withDelay(
          150 * factor,
          withSequence(
            withTiming(-9, { duration: 42 * factor }),
            withTiming(8, { duration: 42 * factor }),
            withTiming(-4, { duration: 42 * factor }),
            withSpring(0),
          ),
        );
        enemyFlash.value = withDelay(
          145 * factor,
          withSequence(withTiming(1, { duration: 55 * factor }), withTiming(0, { duration: 145 * factor })),
        );
        stageFlash.value = withDelay(
          145 * factor,
          withSequence(withTiming(0.16, { duration: 40 * factor }), withTiming(0, { duration: 150 * factor })),
        );
      }

      if (event.enemyActs) {
        if (event.enemyIntent.type === 'charge') {
          enemyPulse.value = withDelay(
            510 * factor,
            withSequence(
              withTiming(1.18, { duration: 120 * factor }),
              withTiming(1, { duration: 180 * factor }),
            ),
          );
        } else {
          enemyOffset.value = withDelay(
            500 * factor,
            withSequence(
              withTiming(-72, { duration: 120 * factor, easing: Easing.out(Easing.quad) }),
              withSpring(0, { damping: 14, stiffness: 230 }),
            ),
          );
        }
      }

      if (event.enemyDamage > 0) {
        playerShake.value = withDelay(
          620 * factor,
          withSequence(
            withTiming(-8, { duration: 42 * factor }),
            withTiming(7, { duration: 42 * factor }),
            withTiming(-3, { duration: 42 * factor }),
            withSpring(0),
          ),
        );
      }
    }

    return () => timers.forEach(clearTimeout);
  }, [
    enemyFlash,
    enemyOffset,
    enemyPulse,
    enemyShake,
    event,
    playerOffset,
    playerScale,
    playerShake,
    reduceMotion,
    shieldPulse,
    skillOpacity,
    skillTravel,
    speed,
    stageFlash,
  ]);

  const playerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: playerOffset.value + playerShake.value },
      { scale: playerScale.value },
    ],
  }));
  const enemyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: enemyOffset.value + enemyShake.value },
      { scale: enemyPulse.value },
    ],
  }));
  const enemyFlashStyle = useAnimatedStyle(() => ({ opacity: enemyFlash.value }));
  const projectileStyle = useAnimatedStyle(() => ({
    opacity: skillOpacity.value,
    transform: [{ translateX: skillTravel.value }, { rotate: '45deg' }, { scale: 0.8 + skillOpacity.value * 0.35 }],
  }));
  const shieldStyle = useAnimatedStyle(() => ({
    opacity: shieldPulse.value,
    transform: [{ scale: 0.65 + shieldPulse.value * 0.65 }],
  }));
  const stageFlashStyle = useAnimatedStyle(() => ({ opacity: stageFlash.value }));

  const displayedSummons = useMemo(() => {
    const summons = battle.snapshot.summons.map((summon) => ({
      key: summon.key,
      hpRatio: Math.max(0, Math.min(1, summon.hp / summon.maxHp)),
    }));
    if (event?.summonCreated && !summons.some((summon) => summon.key === event.summonCreated)) {
      summons.push({ key: event.summonCreated, hpRatio: 1 });
    }
    return summons;
  }, [battle.snapshot.summons, event?.summonCreated]);
  const phaseContent = event ? getPhaseContent(event, phase) : null;
  const factor = speed === 2 ? 0.58 : 1;

  return (
    <View style={styles.scene}>
      <Image
        contentFit="contain"
        source={require('../../assets/images/habit-rpg-emblem.png')}
        style={styles.emblem}
      />
      <View style={styles.horizon} />
      <Animated.View pointerEvents="none" style={[styles.stageFlash, stageFlashStyle]} />

      {phaseContent ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(90)}
          exiting={reduceMotion ? undefined : FadeOut.duration(90)}
          key={`${event?.id}-${phase}`}
          style={styles.phaseBanner}>
          <Text style={styles.phaseEyebrow}>{phaseContent.eyebrow}</Text>
          <Text numberOfLines={1} style={[styles.phaseLabel, { color: phase === 'enemy' ? '#FF9A89' : event?.accent }]}>
            {phaseContent.label}
          </Text>
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.playerActor, playerStyle]}>
        <Animated.View style={[styles.shieldEffect, { borderColor: event?.accent ?? battle.combatProfile.accent }, shieldStyle]}>
          <MaterialCommunityIcons
            color={event?.accent ?? battle.combatProfile.accent}
            name={event?.action === 'item' ? 'flask' : event?.healing ? 'heart-pulse' : 'shield-outline'}
            size={32}
          />
        </Animated.View>
        <View style={[styles.actorCore, { borderColor: `${battle.combatProfile.accent}99` }]}>
          <MaterialCommunityIcons
            color={battle.combatProfile.accent}
            name={classIcons[battle.classKey] ?? 'account-outline'}
            size={32}
          />
        </View>
        <Text style={styles.actorLabel}>HUNTER</Text>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[styles.projectile, { backgroundColor: event?.accent ?? battle.combatProfile.accent }, projectileStyle]}>
        <MaterialCommunityIcons
          color="#071018"
          name={event ? actionIcons[event.action] : 'lightning-bolt'}
          size={18}
        />
      </Animated.View>

      <View style={styles.summonRow}>
        {displayedSummons.map((summon) => (
          <SummonActor
            event={event}
            hpRatio={summon.hpRatio}
            key={summon.key}
            reduceMotion={reduceMotion}
            speed={speed}
            summonKey={summon.key}
          />
        ))}
      </View>

      <Animated.View style={[styles.enemyActor, enemyStyle]}>
        <View style={[styles.enemyCore, { borderColor: `${battle.dungeon.accent}99` }]}>
          <MaterialCommunityIcons color={battle.dungeon.accent} name={battle.dungeon.icon} size={47} />
          <Animated.View style={[styles.enemyFlash, enemyFlashStyle]} />
        </View>
        <Text numberOfLines={1} style={styles.actorLabel}>TARGET</Text>
      </Animated.View>

      {event && event.playerDamage > 0 ? (
        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.delay(150 * factor).duration(130)}
          exiting={reduceMotion ? undefined : FadeOutUp.duration(160)}
          key={`${event.id}-enemy-damage`}
          style={styles.enemyDamage}>
          -{event.playerDamage}
        </Animated.Text>
      ) : null}
      {event && event.enemyDamage > 0 ? (
        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.delay(610 * factor).duration(130)}
          exiting={reduceMotion ? undefined : FadeOutUp.duration(160)}
          key={`${event.id}-player-damage`}
          style={styles.playerDamage}>
          -{event.enemyDamage}
        </Animated.Text>
      ) : null}
      {event && event.healing > 0 ? (
        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.delay((event.enemyActs ? 745 : 545) * factor).duration(140)}
          exiting={reduceMotion ? undefined : FadeOutUp.duration(160)}
          key={`${event.id}-healing`}
          style={styles.healing}>
          +{event.healing}
        </Animated.Text>
      ) : null}
      {event?.playerStatus ? (
        <Animated.View
          entering={reduceMotion ? undefined : ZoomIn.delay(650 * factor).duration(140)}
          exiting={reduceMotion ? undefined : FadeOut.duration(140)}
          style={styles.playerStatusEffect}>
          <MaterialCommunityIcons color="#FF9A89" name="alert-decagram-outline" size={20} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: 210, position: 'relative', overflow: 'hidden' },
  emblem: { position: 'absolute', width: 250, height: 250, left: '50%', top: -18, marginLeft: -125, opacity: 0.055 },
  horizon: { position: 'absolute', left: 8, right: 8, bottom: 24, height: 1, backgroundColor: '#42344D' },
  stageFlash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF' },
  phaseBanner: { position: 'absolute', top: 2, left: '18%', right: '18%', minHeight: 35, alignItems: 'center', justifyContent: 'center', zIndex: 8 },
  phaseEyebrow: { color: '#8E95AA', fontSize: 7, fontWeight: '900' },
  phaseLabel: { maxWidth: '100%', fontSize: 11, fontWeight: '900', marginTop: 2 },
  playerActor: { position: 'absolute', left: 7, bottom: 12, alignItems: 'center', gap: 4, zIndex: 4 },
  enemyActor: { position: 'absolute', right: 7, top: 55, alignItems: 'center', gap: 4, zIndex: 4 },
  actorCore: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#10212C', borderWidth: 1 },
  enemyCore: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#2A1721', borderWidth: 1, overflow: 'hidden' },
  enemyFlash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF' },
  actorLabel: { color: '#8991A7', fontSize: 7, fontWeight: '900' },
  shieldEffect: { position: 'absolute', width: 86, height: 86, top: -10, alignItems: 'center', justifyContent: 'center', borderRadius: 43, backgroundColor: '#0B202D', borderWidth: 2 },
  projectile: { position: 'absolute', left: 78, top: 103, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 7, zIndex: 6 },
  summonRow: { position: 'absolute', left: 78, bottom: 11, flexDirection: 'row', gap: 6, zIndex: 5 },
  summonUnit: { width: 40, alignItems: 'center', gap: 3 },
  summonCore: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#171827', borderWidth: 1, borderColor: '#3A3B56' },
  summonHealthTrack: { width: 36, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: '#282B3A' },
  summonHealthFill: { height: '100%', backgroundColor: '#68E1A8' },
  enemyDamage: { position: 'absolute', right: 33, top: 47, color: '#FF8B7F', fontSize: 23, fontWeight: '900', zIndex: 9 },
  playerDamage: { position: 'absolute', left: 25, bottom: 70, color: '#FF8B7F', fontSize: 19, fontWeight: '900', zIndex: 9 },
  healing: { position: 'absolute', left: 25, bottom: 94, color: '#68E1A8', fontSize: 18, fontWeight: '900', zIndex: 9 },
  playerStatusEffect: { position: 'absolute', left: 53, bottom: 67, zIndex: 10 },
});
