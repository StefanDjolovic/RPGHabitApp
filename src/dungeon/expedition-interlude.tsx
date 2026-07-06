import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DungeonBattle } from '@/src/database/dungeon-repository';
import {
  finalGateChoices,
  sanctuaryChoices,
  type DungeonInterludeAction,
} from '@/src/dungeon/expedition-events';

export function DungeonExpeditionStatus({ battle }: { battle: DungeonBattle }) {
  const route = battle.routeKey === 'safe'
    ? 'SAFE'
    : battle.routeKey === 'risky'
      ? 'RISKY'
      : 'UNSET';
  const stats = [
    { label: 'HP', value: `${battle.snapshot.playerHp}/${battle.stats.maxPlayerHp}` },
    { label: 'POTIONS', value: String(battle.potionCount) },
    { label: 'SECURED', value: `${battle.interimGold}G` },
    { label: 'ROUTE', value: route },
  ];
  const preparationMessage = battle.snapshot.turnNumber === 1
    ? battle.snapshot.log.find((entry) => entry.id.endsWith('-preparation'))?.message
    : null;

  return (
    <>
      <View style={styles.statusBand}>
        {stats.map((stat, index) => (
          <View key={stat.label} style={styles.statusSlot}>
            {index > 0 ? <View style={styles.statusDivider} /> : null}
            <Text numberOfLines={1} style={styles.statusValue}>{stat.value}</Text>
            <Text style={styles.statusLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
      {preparationMessage ? (
        <View style={styles.outcomeBanner}>
          <MaterialCommunityIcons color="#FFD166" name="map-marker-star-outline" size={19} />
          <Text style={styles.outcomeText}>{preparationMessage}</Text>
        </View>
      ) : null}
    </>
  );
}

export function DungeonInterlude({
  battle,
  workingAction,
  errorMessage,
  onChoose,
  onFlee,
}: {
  battle: DungeonBattle;
  workingAction: DungeonInterludeAction | null;
  errorMessage: string;
  onChoose: (action: DungeonInterludeAction) => void;
  onFlee: () => void;
}) {
  const sanctuary = battle.roomType === 'event';
  const choices = sanctuary ? sanctuaryChoices : finalGateChoices;
  const acting = workingAction !== null;

  return (
    <View style={styles.interlude}>
      <View style={[styles.interludeIcon, sanctuary ? styles.sanctuaryIcon : styles.finalGateIcon]}>
        <MaterialCommunityIcons
          color={sanctuary ? '#C79CFF' : '#FFD166'}
          name={sanctuary ? 'compass-rose' : 'gate-open'}
          size={31}
        />
      </View>
      <Text style={styles.eyebrow}>
        {sanctuary ? battle.enemyName.toUpperCase() : 'FINAL GATE'}
      </Text>
      <Text style={styles.title}>
        {sanctuary ? 'Choose an expedition action' : 'Prepare for the boss'}
      </Text>
      <Text style={styles.description}>
        {sanctuary
          ? 'Only one opportunity can be used before the final chamber.'
          : 'Your Elite rewards are secured. Choose how to enter the boss chamber.'}
      </Text>

      <View style={styles.choiceList}>
        {choices.map((choice) => {
          const fullHealth = battle.snapshot.playerHp >= battle.stats.maxPlayerHp;
          const unavailable =
            (choice.key === 'rest' || choice.key === 'field-dressing') && fullHealth
            || choice.key === 'blood-oath' && battle.snapshot.playerHp <= 1;
          const loading = workingAction === choice.key;
          return (
            <Pressable
              accessibilityLabel={choice.title}
              disabled={acting || unavailable}
              key={choice.key}
              onPress={() => onChoose(choice.key)}
              style={({ pressed }) => [
                styles.choice,
                unavailable && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <View style={[styles.choiceIcon, { borderColor: `${choice.accent}66` }]}>
                {loading ? (
                  <ActivityIndicator color={choice.accent} size="small" />
                ) : (
                  <MaterialCommunityIcons color={choice.accent} name={choice.icon} size={22} />
                )}
              </View>
              <View style={styles.choiceBody}>
                <Text style={[styles.choiceEyebrow, { color: choice.accent }]}>{choice.eyebrow}</Text>
                <Text style={styles.choiceTitle}>{choice.title}</Text>
                <Text style={styles.choiceDescription}>
                  {unavailable ? 'Already at full HP.' : choice.description}
                </Text>
              </View>
              <MaterialCommunityIcons color="#7E879C" name="chevron-right" size={20} />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        disabled={acting}
        onPress={onFlee}
        style={({ pressed }) => [styles.fleeButton, acting && styles.disabled, pressed && styles.pressed]}>
        <MaterialCommunityIcons color="#C87C96" name="exit-run" size={16} />
        <Text style={styles.fleeText}>Leave Run</Text>
      </Pressable>
      {errorMessage ? <Text selectable style={styles.errorText}>{errorMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statusBand: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#292F42',
  },
  statusSlot: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  statusDivider: { position: 'absolute', left: 0, width: 1, height: 28, backgroundColor: '#292F42' },
  statusValue: { maxWidth: '92%', color: '#E9E7F2', fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statusLabel: { color: '#687189', fontSize: 7, fontWeight: '900', marginTop: 3 },
  outcomeBanner: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 8, backgroundColor: '#1B170D', borderWidth: 1, borderColor: '#514320' },
  outcomeText: { flex: 1, color: '#D8CAA0', fontSize: 9, fontWeight: '700', lineHeight: 14 },
  interlude: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  interludeIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1 },
  sanctuaryIcon: { backgroundColor: '#171021', borderColor: '#5D4273' },
  finalGateIcon: { backgroundColor: '#211A0D', borderColor: '#5A4924' },
  eyebrow: { color: '#9C83F4', fontSize: 8, fontWeight: '900' },
  title: { color: '#F2EFFA', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  description: { maxWidth: 330, color: '#8A92A8', fontSize: 10, fontWeight: '700', lineHeight: 15, textAlign: 'center' },
  choiceList: { width: '100%', gap: 8 },
  choice: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#293047' },
  choiceIcon: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111827', borderWidth: 1 },
  choiceBody: { flex: 1, minWidth: 0 },
  choiceEyebrow: { fontSize: 7, fontWeight: '900' },
  choiceTitle: { color: '#ECEAF5', fontSize: 12, fontWeight: '900', marginTop: 2 },
  choiceDescription: { color: '#7D869D', fontSize: 9, fontWeight: '700', lineHeight: 13, marginTop: 3 },
  fleeButton: { minHeight: 42, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 8, backgroundColor: '#140D13', borderWidth: 1, borderColor: '#482C38' },
  fleeText: { color: '#C87C96', fontSize: 10, fontWeight: '900' },
  errorText: { color: '#F19AB0', fontSize: 10, fontWeight: '700', lineHeight: 15, textAlign: 'center' },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.72 },
});
