import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ClassSkillType } from '@/src/classes/class-catalog';
import {
  ACTIVE_SKILL_SLOTS,
  equipClassSkill,
  getActiveClassSkillLoadout,
  PASSIVE_SKILL_SLOTS,
  unequipClassSkill,
  type ClassSkillLoadout,
  type UserSkillProgress,
} from '@/src/database/class-repository';
import { playSelectionHaptic } from '@/src/settings/haptic-feedback';

type SelectedSlot = { type: ClassSkillType; slot: number };

const skillIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  'warrior-cleave': 'axe-battle',
  'warrior-iron-guard': 'shield-sword-outline',
  'warrior-battle-rhythm': 'sword-cross',
  'mage-arc-bolt': 'lightning-bolt',
  'mage-mana-ward': 'shield-moon-outline',
  'mage-elemental-insight': 'atom-variant',
  'assassin-quick-cut': 'knife-military',
  'assassin-venom-edge': 'skull-crossbones-outline',
  'assassin-predators-focus': 'target',
  'guardian-shield-bash': 'shield-sword-outline',
  'guardian-aegis': 'shield-crown-outline',
  'guardian-unbroken': 'shield-star-outline',
  'summoner-wolf': 'dog-side',
  'summoner-wisp': 'weather-windy',
  'summoner-spirit-link': 'link-variant',
  'summoner-command-focus': 'target-account',
  'summoner-reclaim-essence': 'creation-outline',
  'summoner-bonded-souls': 'account-group-outline',
};

function SkillSlot({
  accent,
  selected,
  skill,
  slot,
  type,
  onSelect,
  onUnequip,
}: {
  accent: string;
  selected: boolean;
  skill: UserSkillProgress | null;
  slot: number;
  type: ClassSkillType;
  onSelect: () => void;
  onUnequip: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${type} skill slot ${slot}${skill ? `, ${skill.name}` : ', empty'}`}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.slot,
        selected && { borderColor: accent, backgroundColor: `${accent}14` },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.slotNumber, selected && { borderColor: `${accent}88` }]}>
        <Text style={[styles.slotNumberText, selected && { color: accent }]}>{slot}</Text>
      </View>
      {skill ? (
        <>
          <View style={[styles.slotIcon, { backgroundColor: `${accent}14` }]}>
            <MaterialCommunityIcons
              color={accent}
              name={skillIcons[skill.key] ?? 'star-four-points-outline'}
              size={20}
            />
          </View>
          <View style={styles.slotBody}>
            <Text numberOfLines={1} style={styles.slotTitle}>{skill.name}</Text>
            <Text numberOfLines={1} style={styles.slotDescription}>{skill.description}</Text>
          </View>
          <Pressable
            accessibilityLabel={`Unequip ${skill.name}`}
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              onUnequip();
            }}
            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons color="#8C94AA" name="close" size={17} />
          </Pressable>
        </>
      ) : (
        <View style={styles.emptySlotBody}>
          <MaterialCommunityIcons color="#525B72" name="plus" size={19} />
          <Text style={styles.emptySlotText}>Empty {type} slot</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function ClassSkillsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [loadout, setLoadout] = useState<ClassSkillLoadout | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot>({ type: 'active', slot: 1 });
  const [loading, setLoading] = useState(true);
  const [savingSkillKey, setSavingSkillKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const nextLoadout = await getActiveClassSkillLoadout(db);
      if (!nextLoadout) {
        router.back();
        return;
      }
      setLoadout(nextLoadout);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void load();
  }, [load]);

  const equipSkill = async (skill: UserSkillProgress) => {
    if (!loadout || savingSkillKey) return;

    let targetSlot = selectedSlot;
    if (selectedSlot.type !== skill.type) {
      const slots = skill.type === 'active' ? loadout.activeSlots : loadout.passiveSlots;
      const availableIndex = slots.findIndex((entry) => entry === null);
      if (availableIndex < 0) {
        setErrorMessage(`Select a ${skill.type} slot to replace.`);
        return;
      }
      targetSlot = { type: skill.type, slot: availableIndex + 1 };
    }

    setSavingSkillKey(skill.key);
    setErrorMessage('');
    try {
      const nextLoadout = await equipClassSkill(db, skill.key, targetSlot.slot);
      setLoadout(nextLoadout);
      setSelectedSlot(targetSlot);
      void playSelectionHaptic();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The skill could not be equipped.');
    } finally {
      setSavingSkillKey('');
    }
  };

  const unequipSkill = async (skill: UserSkillProgress) => {
    if (savingSkillKey) return;
    setSavingSkillKey(skill.key);
    setErrorMessage('');
    try {
      setLoadout(await unequipClassSkill(db, skill.key));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The skill could not be unequipped.');
    } finally {
      setSavingSkillKey('');
    }
  };

  if (loading || !loadout) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#8DEAFF" />
        <Text style={styles.loadingText}>Loading skill resonance...</Text>
      </View>
    );
  }

  const sections: { type: ClassSkillType; slots: (UserSkillProgress | null)[]; maximum: number }[] = [
    { type: 'active', slots: loadout.activeSlots, maximum: ACTIVE_SKILL_SLOTS },
    { type: 'passive', slots: loadout.passiveSlots, maximum: PASSIVE_SKILL_SLOTS },
  ];

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Return to Profile"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons color="#D5D9E8" name="arrow-left" size={21} />
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={styles.eyebrow}>CLASS CONFIGURATION</Text>
          <Text style={styles.heading}>Skill Loadout</Text>
        </View>
        <View style={[styles.classIcon, { borderColor: `${loadout.class.accent}88` }]}>
          <MaterialCommunityIcons
            color={loadout.class.accent}
            name={loadout.class.icon}
            size={24}
          />
        </View>
      </View>

      <View style={[styles.classSummary, { borderColor: `${loadout.class.accent}66` }]}>
        <View style={styles.classSummaryBody}>
          <Text style={[styles.className, { color: loadout.class.accent }]}>{loadout.class.name}</Text>
          <Text style={styles.classIdentity}>{loadout.class.identity}</Text>
        </View>
        <View style={styles.resourceBadge}>
          <MaterialCommunityIcons color={loadout.class.accent} name="lightning-bolt" size={14} />
          <Text style={styles.resourceText}>{loadout.class.resource}</Text>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons color="#F19AB0" name="alert-circle-outline" size={17} />
          <Text selectable style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {sections.map((section) => (
        <View key={section.type} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>{section.type.toUpperCase()} SLOTS</Text>
              <Text style={styles.sectionTitle}>
                {section.type === 'active' ? 'Combat abilities' : 'Always-on effects'}
              </Text>
            </View>
            <Text style={styles.slotCount}>
              {section.slots.filter(Boolean).length}/{section.maximum}
            </Text>
          </View>
          <View style={styles.slotList}>
            {section.slots.map((skill, index) => (
              <SkillSlot
                accent={loadout.class.accent}
                key={`${section.type}-${index + 1}`}
                onSelect={() => setSelectedSlot({ type: section.type, slot: index + 1 })}
                onUnequip={() => skill && void unequipSkill(skill)}
                selected={selectedSlot.type === section.type && selectedSlot.slot === index + 1}
                skill={skill}
                slot={index + 1}
                type={section.type}
              />
            ))}
          </View>
        </View>
      ))}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>UNLOCKED SKILLS</Text>
            <Text style={styles.sectionTitle}>Skill archive</Text>
          </View>
          <MaterialCommunityIcons color="#8B83A9" name="book-open-variant" size={20} />
        </View>
        <View style={styles.skillLibrary}>
          {[...loadout.activeSkills, ...loadout.passiveSkills].map((skill) => {
            const busy = savingSkillKey === skill.key;
            return (
              <Pressable
                accessibilityLabel={`Equip ${skill.name}`}
                disabled={Boolean(savingSkillKey)}
                key={skill.key}
                onPress={() => void equipSkill(skill)}
                style={({ pressed }) => [
                  styles.skillCard,
                  skill.isEquipped && { borderColor: `${loadout.class.accent}66` },
                  pressed && styles.pressed,
                ]}>
                <View style={[styles.skillIcon, { backgroundColor: `${loadout.class.accent}14` }]}>
                  {busy ? (
                    <ActivityIndicator color={loadout.class.accent} size="small" />
                  ) : (
                    <MaterialCommunityIcons
                      color={loadout.class.accent}
                      name={skillIcons[skill.key] ?? 'star-four-points-outline'}
                      size={21}
                    />
                  )}
                </View>
                <View style={styles.skillBody}>
                  <View style={styles.skillNameRow}>
                    <Text numberOfLines={1} style={styles.skillName}>{skill.name}</Text>
                    <Text style={styles.skillType}>{skill.type.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.skillDescription}>{skill.description}</Text>
                </View>
                <MaterialCommunityIcons
                  color={skill.isEquipped ? loadout.class.accent : '#596278'}
                  name={skill.isEquipped ? 'check-circle' : 'plus-circle-outline'}
                  size={19}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050711' },
  content: { flexGrow: 1, paddingHorizontal: 16, gap: 16 },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#050711',
  },
  loadingText: { color: '#777F98', fontSize: 11, fontWeight: '700' },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  headerBody: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#9D83F6', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  heading: { color: '#F2F0FA', fontSize: 21, fontWeight: '900' },
  classIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
  },
  classSummary: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#0D121E',
    borderWidth: 1,
  },
  classSummaryBody: { flex: 1, minWidth: 0 },
  className: { fontSize: 17, fontWeight: '900' },
  classIdentity: { color: '#8991A7', fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 3 },
  resourceBadge: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 7,
    backgroundColor: '#151B2A',
  },
  resourceText: { color: '#B6BDCF', fontSize: 8, fontWeight: '900' },
  errorBanner: {
    minHeight: 42,
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
  section: { gap: 10 },
  sectionHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionEyebrow: { color: '#8F84B7', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: '#ECEAF4', fontSize: 15, fontWeight: '900', marginTop: 2 },
  slotCount: { color: '#7B849D', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  slotList: { gap: 8 },
  slot: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 9,
    borderRadius: 8,
    backgroundColor: '#0C101B',
    borderWidth: 1,
    borderColor: '#252B3D',
  },
  slotNumber: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#343B50',
  },
  slotNumberText: { color: '#778097', fontSize: 9, fontWeight: '900' },
  slotIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  slotBody: { flex: 1, minWidth: 0 },
  slotTitle: { color: '#E9EDF8', fontSize: 11, fontWeight: '900' },
  slotDescription: { color: '#747D92', fontSize: 8, fontWeight: '700', marginTop: 3 },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: '#151925',
  },
  emptySlotBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  emptySlotText: { color: '#596278', fontSize: 10, fontWeight: '800' },
  skillLibrary: { gap: 8 },
  skillCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0D111D',
    borderWidth: 1,
    borderColor: '#252B3D',
  },
  skillIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  skillBody: { flex: 1, minWidth: 0 },
  skillNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  skillName: { flex: 1, color: '#E9EDF8', fontSize: 11, fontWeight: '900' },
  skillType: { color: '#777F98', fontSize: 7, fontWeight: '900' },
  skillDescription: { color: '#747D92', fontSize: 8, lineHeight: 12, fontWeight: '700', marginTop: 4 },
  pressed: { opacity: 0.72 },
});
