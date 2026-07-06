import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  adminRankPresets,
  applyAdminRankPreset,
  getAdminSandboxSummary,
  refillAdminResources,
  setAdminActiveClass,
  type AdminRankPreset,
  unlockAdminSandbox,
} from '@/src/admin/admin-sandbox';
import { useAuth } from '@/src/auth/auth-context';
import { starterClasses, type StarterClassKey } from '@/src/classes/class-catalog';
import { useCloudSync } from '@/src/cloud/cloud-sync-context';

type SandboxSummary = Awaited<ReturnType<typeof getAdminSandboxSummary>>;
type AdminWork = 'unlock' | 'refill' | 'class' | `preset:${AdminRankPreset['key']}`;

const initialSummary: SandboxSummary = {
  items: 0,
  gold: 0,
  classes: 0,
  activeClass: null,
  level: 1,
  rankKey: 'unawakened',
  rankLabel: 'Unawakened',
  energy: 0,
};

export default function AdminLabScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { role } = useAuth();
  const cloud = useCloudSync();
  const [summary, setSummary] = useState<SandboxSummary>(initialSummary);
  const [working, setWorking] = useState<AdminWork | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setSummary(await getAdminSandboxSummary(db));
  }, [db]);

  useEffect(() => {
    if (role === 'admin') void load();
  }, [load, role]);

  const runUnlock = async () => {
    setWorking('unlock');
    setMessage('');
    try {
      await unlockAdminSandbox(db);
      await load();
      setMessage('All test content is unlocked. Summoner is active by default.');
      await cloud.backupNow().catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Admin unlock failed.');
    } finally {
      setWorking(null);
    }
  };

  const runRefill = async () => {
    setWorking('refill');
    setMessage('');
    try {
      await refillAdminResources(db);
      await load();
      setMessage('Gold, inventory and dungeon energy were refilled.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Admin refill failed.');
    } finally {
      setWorking(null);
    }
  };

  const runPreset = async (preset: AdminRankPreset) => {
    const workKey: AdminWork = `preset:${preset.key}`;
    setWorking(workKey);
    setMessage('');
    try {
      setSummary(await applyAdminRankPreset(db, preset.key));
      setMessage(`${preset.label} preset applied at level ${preset.level}. Dungeon energy is full.`);
      await cloud.backupNow().catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Rank preset failed.');
    } finally {
      setWorking(null);
    }
  };

  const switchClass = async (classKey: StarterClassKey) => {
    setWorking('class');
    setMessage('');
    try {
      await setAdminActiveClass(db, classKey);
      await load();
      const selectedClass = starterClasses.find((classDefinition) => classDefinition.key === classKey);
      setMessage(`${selectedClass?.name ?? 'Class'} is now active.`);
      await cloud.backupNow().catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Class switch failed.');
    } finally {
      setWorking(null);
    }
  };

  const confirmUnlock = () => {
    Alert.alert(
      'Unlock complete sandbox?',
      'This grants maximum level, every rank, class, skill, achievement and item to this admin account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlock', onPress: () => void runUnlock() },
      ],
    );
  };

  if (role !== 'admin') {
    return (
      <View style={styles.blockedScreen}>
        <MaterialCommunityIcons color="#FF8191" name="shield-lock-outline" size={42} />
        <Text style={styles.blockedTitle}>Admin access required</Text>
        <Pressable onPress={() => router.back()} style={styles.returnButton}><Text style={styles.returnButtonText}>Return</Text></Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Return" onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialCommunityIcons color="#D8DCE8" name="arrow-left" size={21} /></Pressable>
        <View style={styles.headerBody}><Text style={styles.eyebrow}>ADMIN SANDBOX</Text><Text style={styles.heading}>System Lab</Text></View>
        <View style={styles.labIcon}><MaterialCommunityIcons color="#FFD166" name="flask-outline" size={24} /></View>
      </View>

      <View style={styles.summaryBand}>
        <View style={styles.summaryStat}><Text style={styles.summaryValue}>{summary.level}</Text><Text style={styles.summaryLabel}>LEVEL</Text></View>
        <View style={styles.divider} />
        <View style={styles.summaryStat}><Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryValue}>{adminRankPresets.find((preset) => preset.key === summary.rankKey)?.shortLabel ?? 'U'}</Text><Text style={styles.summaryLabel}>RANK</Text></View>
        <View style={styles.divider} />
        <View style={styles.summaryStat}><Text style={styles.summaryValue}>{summary.energy}/30</Text><Text style={styles.summaryLabel}>ENERGY</Text></View>
        <View style={styles.divider} />
        <View style={styles.summaryStat}><Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryValue}>{summary.gold.toLocaleString()}</Text><Text style={styles.summaryLabel}>GOLD</Text></View>
      </View>

      <View style={styles.warningPanel}>
        <MaterialCommunityIcons color="#FFD166" name="alert-outline" size={22} />
        <Text style={styles.warningText}>Rank presets replace the test level and clear the active battle, equipped loadout and manual stat allocation. Habits and history stay untouched.</Text>
      </View>

      <View style={styles.presetSection}>
        <View style={styles.presetHeading}>
          <View>
            <Text style={styles.presetEyebrow}>BALANCE SIMULATOR</Text>
            <Text style={styles.presetTitle}>Rank presets</Text>
          </View>
          <MaterialCommunityIcons color="#7EE7FF" name="chart-timeline-variant-shimmer" size={22} />
        </View>
        <Text style={styles.presetMeta}>Each rank uses its exact minimum level, balanced base stats and maximum dungeon energy.</Text>
        <View style={styles.presetGrid}>
          {adminRankPresets.map((preset) => {
            const workKey: AdminWork = `preset:${preset.key}`;
            const selected = summary.rankKey === preset.key && summary.level === preset.level;
            return (
              <Pressable
                accessibilityLabel={`Apply ${preset.label} level ${preset.level} preset`}
                disabled={working !== null}
                key={preset.key}
                onPress={() => void runPreset(preset)}
                style={({ pressed }) => [
                  styles.presetButton,
                  selected && { borderColor: preset.accent, backgroundColor: '#151A28' },
                  pressed && styles.pressed,
                  working !== null && styles.disabled,
                ]}>
                {working === workKey ? (
                  <ActivityIndicator color={preset.accent} size="small" />
                ) : (
                  <Text style={[styles.presetRank, { color: preset.accent }]}>{preset.shortLabel}</Text>
                )}
                <Text style={styles.presetLevel}>LV {preset.level}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.actionList}>
        <Pressable disabled={working !== null} onPress={confirmUnlock} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed, working !== null && styles.disabled]}>
          <View style={[styles.actionIcon, { borderColor: '#5A4924' }]}>{working === 'unlock' ? <ActivityIndicator color="#FFD166" /> : <MaterialCommunityIcons color="#FFD166" name="lock-open-variant-outline" size={24} />}</View>
          <View style={styles.actionBody}><Text style={styles.actionTitle}>Unlock Everything</Text><Text style={styles.actionMeta}>Level 100 · Transcendent rank · all classes, skills and achievements</Text></View>
          <MaterialCommunityIcons color="#8B94A9" name="chevron-right" size={22} />
        </Pressable>

        <Pressable disabled={working !== null} onPress={() => void runRefill()} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed, working !== null && styles.disabled]}>
          <View style={[styles.actionIcon, { borderColor: '#285A69' }]}>{working === 'refill' ? <ActivityIndicator color="#7EE7FF" /> : <MaterialCommunityIcons color="#7EE7FF" name="infinity" size={25} />}</View>
          <View style={styles.actionBody}><Text style={styles.actionTitle}>Refill Resources</Text><Text style={styles.actionMeta}>999,999 Gold · 99 of every item · maximum dungeon energy</Text></View>
          <MaterialCommunityIcons color="#8B94A9" name="chevron-right" size={22} />
        </Pressable>

        <Pressable onPress={() => router.push('/dungeon')} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <View style={[styles.actionIcon, { borderColor: '#663441' }]}><MaterialCommunityIcons color="#FF8191" name="gate-open" size={24} /></View>
          <View style={styles.actionBody}><Text style={styles.actionTitle}>Dungeon Tester</Text><Text style={styles.actionMeta}>Open every gate from E Rank through Transcendent</Text></View>
          <MaterialCommunityIcons color="#8B94A9" name="chevron-right" size={22} />
        </Pressable>

        <Pressable onPress={() => router.push('/inventory')} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <View style={[styles.actionIcon, { borderColor: '#2E634E' }]}><MaterialCommunityIcons color="#68E1A8" name="treasure-chest-outline" size={24} /></View>
          <View style={styles.actionBody}><Text style={styles.actionTitle}>Item Tester</Text><Text style={styles.actionMeta}>Inspect, equip, upgrade and salvage every item</Text></View>
          <MaterialCommunityIcons color="#8B94A9" name="chevron-right" size={22} />
        </Pressable>
      </View>

      <View style={styles.classSection}>
        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.sectionEyebrow}>CLASS TESTER</Text>
            <Text style={styles.sectionTitle}>Active class</Text>
          </View>
          <Pressable
            accessibilityLabel="Open class details"
            onPress={() => router.push('/awakening')}
            style={({ pressed }) => [styles.classDetailsButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons color="#C79CFF" name="tune-variant" size={18} />
          </Pressable>
        </View>
        <View style={styles.classGrid}>
          {starterClasses.map((classDefinition) => {
            const selected = summary.activeClass === classDefinition.key;
            const classDisabled = working !== null || summary.rankKey === 'unawakened';
            return (
              <Pressable
                accessibilityLabel={`Use ${classDefinition.name}`}
                disabled={classDisabled}
                key={classDefinition.key}
                onPress={() => void switchClass(classDefinition.key)}
                style={({ pressed }) => [
                  styles.classButton,
                  selected && { borderColor: classDefinition.accent, backgroundColor: '#171B29' },
                  pressed && styles.pressed,
                  classDisabled && styles.disabled,
                ]}>
                {working === 'class' && selected ? (
                  <ActivityIndicator color={classDefinition.accent} size="small" />
                ) : (
                  <MaterialCommunityIcons color={classDefinition.accent} name={classDefinition.icon} size={24} />
                )}
                <Text numberOfLines={1} style={[styles.className, selected && { color: classDefinition.accent }]}>
                  {classDefinition.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {message ? <Text selectable style={styles.message}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' }, content: { flexGrow: 1, paddingHorizontal: 17, gap: 15 }, header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11 }, iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111522', borderWidth: 1, borderColor: '#282E40' }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.4 }, headerBody: { flex: 1, minWidth: 0 }, eyebrow: { color: '#FFD166', fontSize: 9, fontWeight: '900' }, heading: { color: '#F3F0FF', fontSize: 25, fontWeight: '900' }, labIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#211A0D', borderWidth: 1, borderColor: '#5A4924' },
  summaryBand: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#2B3043' }, summaryStat: { flex: 1, alignItems: 'center', minWidth: 0 }, summaryValue: { color: '#F0EEF8', fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] }, summaryLabel: { color: '#778098', fontSize: 7, fontWeight: '900', marginTop: 4 }, divider: { width: 1, height: 32, backgroundColor: '#2B3043' },
  warningPanel: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, backgroundColor: '#1B170D', borderWidth: 1, borderColor: '#514320' }, warningText: { flex: 1, color: '#CBBE93', fontSize: 10, fontWeight: '700', lineHeight: 15 }, actionList: { gap: 8 }, actionRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#2A3044' }, actionIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#111827', borderWidth: 1 }, actionBody: { flex: 1, minWidth: 0 }, actionTitle: { color: '#ECEAF5', fontSize: 13, fontWeight: '900' }, actionMeta: { color: '#8089A0', fontSize: 9, fontWeight: '700', lineHeight: 13, marginTop: 4 }, message: { color: '#68E1A8', fontSize: 10, fontWeight: '700', lineHeight: 15, padding: 12, borderRadius: 8, backgroundColor: '#0D1B17', borderWidth: 1, borderColor: '#285344' },
  presetSection: { gap: 10, paddingVertical: 2 }, presetHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, presetEyebrow: { color: '#7EE7FF', fontSize: 8, fontWeight: '900' }, presetTitle: { color: '#ECEAF5', fontSize: 16, fontWeight: '900', marginTop: 3 }, presetMeta: { color: '#8089A0', fontSize: 9, fontWeight: '700', lineHeight: 14 }, presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, presetButton: { width: '31%', minWidth: 82, height: 62, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#2A3044' }, presetRank: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] }, presetLevel: { color: '#7F899F', fontSize: 8, fontWeight: '900', fontVariant: ['tabular-nums'] },
  classSection: { gap: 11, paddingTop: 2 }, sectionHeadingRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionEyebrow: { color: '#C79CFF', fontSize: 8, fontWeight: '900' }, sectionTitle: { color: '#ECEAF5', fontSize: 16, fontWeight: '900', marginTop: 3 }, classDetailsButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#171220', borderWidth: 1, borderColor: '#5A3F70' }, classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, classButton: { width: '31%', minWidth: 88, height: 76, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 8, backgroundColor: '#0D111D', borderWidth: 1, borderColor: '#2A3044' }, className: { maxWidth: '90%', color: '#9AA2B7', fontSize: 9, fontWeight: '900' },
  blockedScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#050711' }, blockedTitle: { color: '#F0EEF8', fontSize: 18, fontWeight: '900' }, returnButton: { minHeight: 42, minWidth: 120, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#7EE7FF' }, returnButtonText: { color: '#071018', fontSize: 11, fontWeight: '900' },
});
