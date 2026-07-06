import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type DungeonInterludeAction =
  | 'rest'
  | 'invoke-shrine'
  | 'search-cache'
  | 'enter-boss'
  | 'field-dressing'
  | 'blood-oath';

export type DungeonInterludeChoice = {
  key: DungeonInterludeAction;
  eyebrow: string;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
};

export const sanctuaryChoices: DungeonInterludeChoice[] = [
  {
    key: 'rest',
    eyebrow: 'RECOVERY',
    title: 'Make Camp',
    description: 'Restore 40% HP and cleanse harmful effects before the boss.',
    icon: 'campfire',
    accent: '#68E1A8',
  },
  {
    key: 'invoke-shrine',
    eyebrow: 'BLESSING',
    title: 'Invoke the Shrine',
    description: 'Gain attack, skill power and defense for the rest of this run.',
    icon: 'star-four-points-outline',
    accent: '#C79CFF',
  },
  {
    key: 'search-cache',
    eyebrow: 'GAMBLE',
    title: 'Search the Cache',
    description: 'Chance to secure Gold and material, but a hidden trap may deal damage.',
    icon: 'treasure-chest-outline',
    accent: '#FFD166',
  },
];

export const finalGateChoices: DungeonInterludeChoice[] = [
  {
    key: 'enter-boss',
    eyebrow: 'STANDARD',
    title: 'Open the Gate',
    description: 'Enter the boss chamber with your current HP and combat stats.',
    icon: 'gate-open',
    accent: '#7EE7FF',
  },
  {
    key: 'field-dressing',
    eyebrow: 'RECOVER',
    title: 'Treat Wounds',
    description: 'Restore 20% HP before entering the final chamber.',
    icon: 'medical-bag',
    accent: '#68E1A8',
  },
  {
    key: 'blood-oath',
    eyebrow: 'HIGH RISK',
    title: 'Take a Blood Oath',
    description: 'Sacrifice 15% max HP to gain 20% attack and skill power for the boss.',
    icon: 'water-alert-outline',
    accent: '#FF8191',
  },
];

export function isSanctuaryAction(
  action: DungeonInterludeAction,
): action is 'rest' | 'invoke-shrine' | 'search-cache' {
  return sanctuaryChoices.some((choice) => choice.key === action);
}

export function isFinalGateAction(
  action: DungeonInterludeAction,
): action is 'enter-boss' | 'field-dressing' | 'blood-oath' {
  return finalGateChoices.some((choice) => choice.key === action);
}
