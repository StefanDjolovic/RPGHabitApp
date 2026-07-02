import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { HabitAttribute } from '@/src/database/habit-repository';

export type StarterClassKey = 'warrior' | 'mage' | 'assassin' | 'guardian' | 'summoner';
export type ClassSkillType = 'active' | 'passive';

export type ClassSkillDefinition = {
  key: string;
  name: string;
  type: ClassSkillType;
  description: string;
  equippedByDefault: boolean;
  slotOrder: number | null;
};

export type StarterClassDefinition = {
  key: StarterClassKey;
  name: string;
  resource: string;
  primaryAttribute: HabitAttribute;
  secondaryAttribute: HabitAttribute;
  identity: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  starterSkills: ClassSkillDefinition[];
};

export const starterClassCatalog = {
  warrior: {
    key: 'warrior',
    name: 'Warrior',
    resource: 'Rage',
    primaryAttribute: 'strength',
    secondaryAttribute: 'vitality',
    identity: 'Stable physical damage, armor breaks and endurance.',
    icon: 'sword',
    accent: '#FF7B72',
    starterSkills: [
      {
        key: 'warrior-cleave',
        name: 'Cleave',
        type: 'active',
        description: 'A dependable heavy strike that builds Rage.',
        equippedByDefault: true,
        slotOrder: 1,
      },
      {
        key: 'warrior-iron-guard',
        name: 'Iron Guard',
        type: 'active',
        description: 'Convert Rage into a short defensive barrier.',
        equippedByDefault: true,
        slotOrder: 2,
      },
      {
        key: 'warrior-battle-rhythm',
        name: 'Battle Rhythm',
        type: 'passive',
        description: 'Repeated attacks steadily improve physical pressure.',
        equippedByDefault: true,
        slotOrder: 1,
      },
    ],
  },
  mage: {
    key: 'mage',
    name: 'Mage',
    resource: 'Mana',
    primaryAttribute: 'intelligence',
    secondaryAttribute: 'creativity',
    identity: 'Burst magic, elemental effects and flexible control.',
    icon: 'wizard-hat',
    accent: '#6DD6FF',
    starterSkills: [
      {
        key: 'mage-arc-bolt',
        name: 'Arc Bolt',
        type: 'active',
        description: 'Focused magic damage with a low Mana cost.',
        equippedByDefault: true,
        slotOrder: 1,
      },
      {
        key: 'mage-mana-ward',
        name: 'Mana Ward',
        type: 'active',
        description: 'Spend Mana to absorb the next incoming strike.',
        equippedByDefault: true,
        slotOrder: 2,
      },
      {
        key: 'mage-elemental-insight',
        name: 'Elemental Insight',
        type: 'passive',
        description: 'Elemental status effects become more reliable.',
        equippedByDefault: true,
        slotOrder: 1,
      },
    ],
  },
  assassin: {
    key: 'assassin',
    name: 'Assassin',
    resource: 'Combo Points',
    primaryAttribute: 'discipline',
    secondaryAttribute: 'strength',
    identity: 'Critical strikes, bleed effects and deliberate sequencing.',
    icon: 'knife-military',
    accent: '#D99BFF',
    starterSkills: [
      {
        key: 'assassin-quick-cut',
        name: 'Quick Cut',
        type: 'active',
        description: 'A fast hit that starts a Combo chain.',
        equippedByDefault: true,
        slotOrder: 1,
      },
      {
        key: 'assassin-venom-edge',
        name: 'Venom Edge',
        type: 'active',
        description: 'Consume Combo Points to apply poison.',
        equippedByDefault: true,
        slotOrder: 2,
      },
      {
        key: 'assassin-predators-focus',
        name: "Predator's Focus",
        type: 'passive',
        description: 'Critical chance rises against weakened enemies.',
        equippedByDefault: true,
        slotOrder: 1,
      },
    ],
  },
  guardian: {
    key: 'guardian',
    name: 'Guardian',
    resource: 'Guard',
    primaryAttribute: 'vitality',
    secondaryAttribute: 'discipline',
    identity: 'Blocks, barriers, counters and reliable survival.',
    icon: 'shield-half-full',
    accent: '#68E1A8',
    starterSkills: [
      {
        key: 'guardian-shield-bash',
        name: 'Shield Bash',
        type: 'active',
        description: 'Deal damage and generate Guard.',
        equippedByDefault: true,
        slotOrder: 1,
      },
      {
        key: 'guardian-aegis',
        name: 'Aegis',
        type: 'active',
        description: 'Consume Guard to form a strong barrier.',
        equippedByDefault: true,
        slotOrder: 2,
      },
      {
        key: 'guardian-unbroken',
        name: 'Unbroken',
        type: 'passive',
        description: 'Low health improves block and status resistance.',
        equippedByDefault: true,
        slotOrder: 1,
      },
    ],
  },
  summoner: {
    key: 'summoner',
    name: 'Summoner',
    resource: 'Essence',
    primaryAttribute: 'creativity',
    secondaryAttribute: 'intelligence',
    identity: 'Two spirit companions, commands and shared survival.',
    icon: 'paw-outline',
    accent: '#FFD166',
    starterSkills: [
      {
        key: 'summoner-wolf',
        name: 'Summon Wolf',
        type: 'active',
        description: 'Call a wolf that attacks after your turn.',
        equippedByDefault: true,
        slotOrder: 1,
      },
      {
        key: 'summoner-wisp',
        name: 'Summon Wisp',
        type: 'active',
        description: 'Call a wisp that supports and restores Essence.',
        equippedByDefault: true,
        slotOrder: 2,
      },
      {
        key: 'summoner-spirit-link',
        name: 'Spirit Link',
        type: 'active',
        description: 'Share incoming damage with active summons.',
        equippedByDefault: true,
        slotOrder: 3,
      },
      {
        key: 'summoner-command-focus',
        name: 'Command: Focus',
        type: 'active',
        description: 'Order every summon to focus one target.',
        equippedByDefault: true,
        slotOrder: 4,
      },
      {
        key: 'summoner-reclaim-essence',
        name: 'Reclaim Essence',
        type: 'active',
        description: 'Dismiss a summon to recover Essence.',
        equippedByDefault: false,
        slotOrder: null,
      },
      {
        key: 'summoner-bonded-souls',
        name: 'Bonded Souls',
        type: 'passive',
        description: 'Active summons gain health and damage together.',
        equippedByDefault: true,
        slotOrder: 1,
      },
    ],
  },
} as const satisfies Record<StarterClassKey, StarterClassDefinition>;

export const starterClasses = Object.values(starterClassCatalog);

export function isStarterClassKey(value: string): value is StarterClassKey {
  return value in starterClassCatalog;
}

export function getStarterClass(classKey: string): StarterClassDefinition {
  return isStarterClassKey(classKey)
    ? starterClassCatalog[classKey]
    : starterClassCatalog.warrior;
}

export function formatClassAttribute(attribute: HabitAttribute) {
  return attribute.charAt(0).toUpperCase() + attribute.slice(1);
}
