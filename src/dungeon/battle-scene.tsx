import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
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
import type { CombatAction } from '@/src/dungeon/unawakened-combat';

export type BattleAnimationEvent = {
  id: number;
  action: CombatAction;
  skillKey?: string;
  playerDamage: number;
  enemyDamage: number;
  healing: number;
};

const classIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  unawakened: 'account-outline',
  warrior: 'axe-battle',
  mage: 'auto-fix',
  assassin: 'knife-military',
  guardian: 'shield-sword-outline',
  summoner: 'paw-outline',
};

export function BattleScene({
  battle,
  event,
  reduceMotion,
}: {
  battle: DungeonBattle;
  event: BattleAnimationEvent | null;
  reduceMotion: boolean;
}) {
  const playerOffset = useSharedValue(0);
  const enemyOffset = useSharedValue(0);
  const playerShake = useSharedValue(0);
  const enemyShake = useSharedValue(0);
  const enemyFlash = useSharedValue(0);
  const skillPulse = useSharedValue(0);

  useEffect(() => {
    if (!event || reduceMotion) return;

    if (event.action === 'attack') {
      playerOffset.value = withSequence(
        withTiming(38, { duration: 110, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 13, stiffness: 220 }),
      );
    } else if (event.action === 'skill') {
      skillPulse.value = withSequence(
        withTiming(1, { duration: 130 }),
        withTiming(0, { duration: 220 }),
      );
      playerOffset.value = withSequence(
        withTiming(20, { duration: 100 }),
        withSpring(0, { damping: 14, stiffness: 200 }),
      );
    } else if (event.action === 'defend') {
      skillPulse.value = withSequence(
        withTiming(0.7, { duration: 110 }),
        withTiming(0, { duration: 240 }),
      );
    }

    if (event.playerDamage > 0) {
      enemyShake.value = withDelay(
        90,
        withSequence(
          withTiming(-8, { duration: 45 }),
          withTiming(7, { duration: 45 }),
          withTiming(-4, { duration: 45 }),
          withSpring(0),
        ),
      );
      enemyFlash.value = withDelay(
        85,
        withSequence(withTiming(1, { duration: 55 }), withTiming(0, { duration: 150 })),
      );
    }

    if (event.enemyDamage > 0) {
      enemyOffset.value = withDelay(
        280,
        withSequence(
          withTiming(-24, { duration: 100 }),
          withSpring(0, { damping: 14, stiffness: 220 }),
        ),
      );
      playerShake.value = withDelay(
        360,
        withSequence(
          withTiming(-7, { duration: 45 }),
          withTiming(6, { duration: 45 }),
          withTiming(-3, { duration: 45 }),
          withSpring(0),
        ),
      );
    }
  }, [enemyFlash, enemyOffset, enemyShake, event, playerOffset, playerShake, reduceMotion, skillPulse]);

  const playerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: playerOffset.value + playerShake.value }],
  }));
  const enemyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: enemyOffset.value + enemyShake.value }],
  }));
  const enemyFlashStyle = useAnimatedStyle(() => ({ opacity: enemyFlash.value }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: skillPulse.value,
    transform: [{ scale: 0.65 + skillPulse.value * 0.85 }],
  }));

  return (
    <View style={styles.scene}>
      <Image
        contentFit="contain"
        source={require('../../assets/images/habit-rpg-emblem.png')}
        style={styles.emblem}
      />

      <Animated.View style={[styles.playerActor, playerStyle]}>
        <View style={[styles.actorCore, { borderColor: `${battle.combatProfile.accent}99` }]}>
          <MaterialCommunityIcons
            color={battle.combatProfile.accent}
            name={classIcons[battle.classKey] ?? 'account-outline'}
            size={30}
          />
        </View>
        <Text style={styles.actorLabel}>HUNTER</Text>
      </Animated.View>

      <Animated.View style={[styles.skillPulse, { borderColor: battle.combatProfile.accent }, pulseStyle]}>
        <MaterialCommunityIcons
          color={battle.combatProfile.accent}
          name={event?.action === 'defend' ? 'shield-outline' : 'lightning-bolt'}
          size={23}
        />
      </Animated.View>

      <View style={styles.summonRow}>
        {battle.snapshot.summons.map((summon) => (
          <Animated.View
            entering={reduceMotion ? undefined : ZoomIn.springify().damping(14)}
            exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
            key={summon.key}
            layout={reduceMotion ? undefined : LinearTransition.duration(180)}
            style={styles.summonUnit}>
            <View style={styles.summonCore}>
              <MaterialCommunityIcons
                color={summon.key === 'wolf' ? '#FFD166' : '#7EE7FF'}
                name={summon.key === 'wolf' ? 'dog-side' : 'fire-circle'}
                size={21}
              />
            </View>
            <View style={styles.summonHealthTrack}>
              <View
                style={[
                  styles.summonHealthFill,
                  { width: `${Math.max(0, Math.min(1, summon.hp / summon.maxHp)) * 100}%` },
                ]}
              />
            </View>
          </Animated.View>
        ))}
      </View>

      <Animated.View style={[styles.enemyActor, enemyStyle]}>
        <View style={[styles.enemyCore, { borderColor: `${battle.dungeon.accent}99` }]}>
          <MaterialCommunityIcons
            color={battle.dungeon.accent}
            name={battle.dungeon.icon}
            size={43}
          />
          <Animated.View style={[styles.enemyFlash, enemyFlashStyle]} />
        </View>
        <Text numberOfLines={1} style={styles.actorLabel}>ENEMY</Text>
      </Animated.View>

      {event && event.playerDamage > 0 ? (
        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.duration(150)}
          exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
          key={`${event.id}-enemy-damage`}
          style={styles.enemyDamage}>
          -{event.playerDamage}
        </Animated.Text>
      ) : null}
      {event && event.enemyDamage > 0 ? (
        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.delay(300).duration(150)}
          exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
          key={`${event.id}-player-damage`}
          style={styles.playerDamage}>
          -{event.enemyDamage}
        </Animated.Text>
      ) : null}
      {event && event.healing > 0 ? (
        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.delay(170).duration(160)}
          exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
          key={`${event.id}-healing`}
          style={styles.healing}>
          +{event.healing}
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    width: '100%',
    height: 150,
    position: 'relative',
    overflow: 'hidden',
  },
  emblem: {
    position: 'absolute',
    width: 210,
    height: 210,
    left: '50%',
    top: -30,
    marginLeft: -105,
    opacity: 0.06,
  },
  playerActor: { position: 'absolute', left: 8, bottom: 8, alignItems: 'center', gap: 4 },
  enemyActor: { position: 'absolute', right: 8, top: 4, alignItems: 'center', gap: 4 },
  actorCore: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#10212C',
    borderWidth: 1,
  },
  enemyCore: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2A1721',
    borderWidth: 1,
    overflow: 'hidden',
  },
  enemyFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  actorLabel: { color: '#8991A7', fontSize: 7, fontWeight: '900' },
  skillPulse: {
    position: 'absolute',
    left: '50%',
    top: 54,
    width: 54,
    height: 54,
    marginLeft: -27,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: '#101A26',
    borderWidth: 2,
  },
  summonRow: {
    position: 'absolute',
    left: 76,
    bottom: 10,
    flexDirection: 'row',
    gap: 6,
  },
  summonUnit: { width: 40, alignItems: 'center', gap: 3 },
  summonCore: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#171827',
    borderWidth: 1,
    borderColor: '#3A3B56',
  },
  summonHealthTrack: {
    width: 36,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#282B3A',
  },
  summonHealthFill: { height: '100%', backgroundColor: '#68E1A8' },
  enemyDamage: {
    position: 'absolute',
    right: 33,
    top: 4,
    color: '#FF8B7F',
    fontSize: 20,
    fontWeight: '900',
    zIndex: 4,
  },
  playerDamage: {
    position: 'absolute',
    left: 26,
    bottom: 60,
    color: '#FF8B7F',
    fontSize: 17,
    fontWeight: '900',
    zIndex: 4,
  },
  healing: {
    position: 'absolute',
    left: 26,
    bottom: 84,
    color: '#68E1A8',
    fontSize: 16,
    fontWeight: '900',
    zIndex: 4,
  },
});
