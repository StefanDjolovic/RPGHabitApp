import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { HabitAttribute } from '@/src/database/habit-repository';

export const habitIconOptions = [
  { key: 'target', label: 'Target' },
  { key: 'run-fast', label: 'Movement' },
  { key: 'dumbbell', label: 'Training' },
  { key: 'book-open-variant', label: 'Reading' },
  { key: 'brain', label: 'Learning' },
  { key: 'briefcase-check-outline', label: 'Work' },
  { key: 'meditation', label: 'Mindfulness' },
  { key: 'food-apple-outline', label: 'Nutrition' },
  { key: 'water-outline', label: 'Hydration' },
  { key: 'moon-waning-crescent', label: 'Sleep' },
  { key: 'heart-pulse', label: 'Health' },
  { key: 'palette-outline', label: 'Creativity' },
] as const satisfies readonly {
  key: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
}[];

export const habitColorOptions = [
  { key: 'cyan', label: 'Cyan', color: '#61D4FF' },
  { key: 'violet', label: 'Violet', color: '#B493FF' },
  { key: 'pink', label: 'Pink', color: '#FF8FC7' },
  { key: 'green', label: 'Green', color: '#68E1A8' },
  { key: 'gold', label: 'Gold', color: '#FFD166' },
  { key: 'red', label: 'Red', color: '#FF7B72' },
] as const;

export type HabitIconKey = (typeof habitIconOptions)[number]['key'];
export type HabitColorKey = (typeof habitColorOptions)[number]['key'];

const attributeIcons: Record<HabitAttribute, HabitIconKey> = {
  strength: 'dumbbell',
  intelligence: 'brain',
  discipline: 'target',
  vitality: 'heart-pulse',
  creativity: 'palette-outline',
};

export function normalizeHabitIconKey(value: string | null | undefined): HabitIconKey | null {
  return habitIconOptions.some((option) => option.key === value)
    ? value as HabitIconKey
    : null;
}

export function normalizeHabitColorKey(value: string | null | undefined): HabitColorKey | null {
  return habitColorOptions.some((option) => option.key === value)
    ? value as HabitColorKey
    : null;
}

export function getHabitAppearance(
  iconKey: HabitIconKey | null | undefined,
  colorKey: HabitColorKey | null | undefined,
  attribute: HabitAttribute,
  fallbackColor: string,
) {
  return {
    icon: iconKey ?? attributeIcons[attribute],
    color: habitColorOptions.find((option) => option.key === colorKey)?.color ?? fallbackColor,
  };
}
