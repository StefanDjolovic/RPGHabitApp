import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type AchievementMetric =
  | 'questCompletions'
  | 'activityStreak'
  | 'dailyClears'
  | 'dungeonClears'
  | 'inventoryItems'
  | 'playerLevel';

export type AchievementCategory =
  | 'Beginnings'
  | 'Consistency'
  | 'Habit Mastery'
  | 'Dungeon'
  | 'Equipment'
  | 'Growth';

export type AchievementDefinition = {
  key: string;
  title: string;
  category: AchievementCategory;
  description: string;
  metric: AchievementMetric;
  target: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
};

export const achievementCatalog = [
  {
    key: 'a-new-beginning',
    title: 'A New Beginning',
    category: 'Beginnings',
    description: 'Clear your first real quest.',
    metric: 'questCompletions',
    target: 1,
    icon: 'flag-checkered',
    accent: '#7EE7FF',
  },
  {
    key: 'building-momentum',
    title: 'Building Momentum',
    category: 'Habit Mastery',
    description: 'Clear 10 total quests.',
    metric: 'questCompletions',
    target: 10,
    icon: 'sword-cross',
    accent: '#B493FF',
  },
  {
    key: 'three-day-streak',
    title: 'Three Day Streak',
    category: 'Consistency',
    description: 'Hold a 3-day activity streak.',
    metric: 'activityStreak',
    target: 3,
    icon: 'fire',
    accent: '#FF8FC7',
  },
  {
    key: 'perfect-clear',
    title: 'Perfect Clear',
    category: 'Consistency',
    description: 'Claim your first Daily Clear chest.',
    metric: 'dailyClears',
    target: 1,
    icon: 'treasure-chest',
    accent: '#FFD27A',
  },
  {
    key: 'gate-initiate',
    title: 'Gate Initiate',
    category: 'Dungeon',
    description: 'Clear your first dungeon run.',
    metric: 'dungeonClears',
    target: 1,
    icon: 'gate',
    accent: '#AE8AFF',
  },
  {
    key: 'first-spoils',
    title: 'First Spoils',
    category: 'Equipment',
    description: 'Store your first item in Inventory.',
    metric: 'inventoryItems',
    target: 1,
    icon: 'diamond',
    accent: '#68E1A8',
  },
  {
    key: 'awakening-threshold',
    title: 'Awakening Threshold',
    category: 'Growth',
    description: 'Reach level 10 and prepare for Awakening.',
    metric: 'playerLevel',
    target: 10,
    icon: 'star-four-points',
    accent: '#61D4FF',
  },
] as const satisfies AchievementDefinition[];
