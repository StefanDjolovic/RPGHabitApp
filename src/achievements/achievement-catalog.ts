import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type AchievementMetric =
  | 'questCompletions'
  | 'activityStreak'
  | 'dailyClears'
  | 'dungeonClears'
  | 'combatLosses'
  | 'lowHealthWins'
  | 'flawlessClears'
  | 'inventoryItems'
  | 'equipmentEquips'
  | 'equipmentUpgrades'
  | 'equipmentSalvages'
  | 'equippedSlots'
  | 'uniqueRarities'
  | 'classesUnlocked'
  | 'classMasteryXp'
  | 'recoveryCompletions'
  | 'playerLevel';

export type AchievementCategory =
  | 'Beginnings'
  | 'Consistency'
  | 'Habit Mastery'
  | 'Dungeon'
  | 'Combat'
  | 'Equipment'
  | 'Class Mastery'
  | 'Recovery'
  | 'Growth'
  | 'Secret';

export type AchievementDefinition = {
  key: string;
  title: string;
  category: AchievementCategory;
  description: string;
  metric: AchievementMetric;
  target: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  secret?: boolean;
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
    key: 'quest-hunter',
    title: 'Quest Hunter',
    category: 'Habit Mastery',
    description: 'Clear 100 total quests.',
    metric: 'questCompletions',
    target: 100,
    icon: 'sword',
    accent: '#7EE7FF',
  },
  {
    key: 'relentless',
    title: 'Relentless',
    category: 'Habit Mastery',
    description: 'Clear 1,000 total quests.',
    metric: 'questCompletions',
    target: 1000,
    icon: 'shield-sword',
    accent: '#B493FF',
  },
  {
    key: 'living-legend',
    title: 'Living Legend',
    category: 'Habit Mastery',
    description: 'Clear 10,000 total quests.',
    metric: 'questCompletions',
    target: 10000,
    icon: 'crown',
    accent: '#FFD27A',
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
    key: 'gate-veteran',
    title: 'Gate Veteran',
    category: 'Dungeon',
    description: 'Clear 10 dungeon runs.',
    metric: 'dungeonClears',
    target: 10,
    icon: 'gate-open',
    accent: '#9D83F6',
  },
  {
    key: 'battle-tested',
    title: 'Battle Tested',
    category: 'Combat',
    description: 'Return after your first dungeon defeat.',
    metric: 'combatLosses',
    target: 1,
    icon: 'shield-off-outline',
    accent: '#E78AA5',
  },
  {
    key: 'against-all-odds',
    title: 'Against All Odds',
    category: 'Secret',
    description: 'Defeat a dungeon boss with 20% HP or less.',
    metric: 'lowHealthWins',
    target: 1,
    icon: 'heart-flash',
    accent: '#FF7F9F',
    secret: true,
  },
  {
    key: 'untouchable',
    title: 'Untouchable',
    category: 'Secret',
    description: 'Clear a dungeon without taking damage.',
    metric: 'flawlessClears',
    target: 1,
    icon: 'shield-star-outline',
    accent: '#7EE7FF',
    secret: true,
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
    key: 'armed-and-ready',
    title: 'Armed and Ready',
    category: 'Equipment',
    description: 'Equip your first piece of gear.',
    metric: 'equipmentEquips',
    target: 1,
    icon: 'shield-sword-outline',
    accent: '#68E1A8',
  },
  {
    key: 'tempered-steel',
    title: 'Tempered Steel',
    category: 'Equipment',
    description: 'Complete your first guaranteed upgrade.',
    metric: 'equipmentUpgrades',
    target: 1,
    icon: 'hammer',
    accent: '#FFD27A',
  },
  {
    key: 'master-smith',
    title: 'Master Smith',
    category: 'Equipment',
    description: 'Complete 10 equipment upgrades.',
    metric: 'equipmentUpgrades',
    target: 10,
    icon: 'anvil',
    accent: '#FFB66E',
  },
  {
    key: 'nothing-wasted',
    title: 'Nothing Wasted',
    category: 'Equipment',
    description: 'Salvage your first spare item.',
    metric: 'equipmentSalvages',
    target: 1,
    icon: 'recycle',
    accent: '#D98BA4',
  },
  {
    key: 'full-kit',
    title: 'Full Kit',
    category: 'Equipment',
    description: 'Fill every slot in one loadout.',
    metric: 'equippedSlots',
    target: 10,
    icon: 'account-hard-hat-outline',
    accent: '#61D4FF',
  },
  {
    key: 'the-collector',
    title: 'The Collector',
    category: 'Secret',
    description: 'Find Common, Uncommon, Rare, and Epic items.',
    metric: 'uniqueRarities',
    target: 4,
    icon: 'diamond-stone',
    accent: '#C68CFF',
    secret: true,
  },
  {
    key: 'mythic-collector',
    title: 'Beyond Rarity',
    category: 'Secret',
    description: 'Find an item from all six rarity tiers.',
    metric: 'uniqueRarities',
    target: 6,
    icon: 'crown-circle-outline',
    accent: '#FF647C',
    secret: true,
  },
  {
    key: 'second-wind',
    title: 'Second Wind',
    category: 'Recovery',
    description: 'Complete your first Recovery Quest.',
    metric: 'recoveryCompletions',
    target: 1,
    icon: 'weather-windy',
    accent: '#7EE7FF',
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
  {
    key: 'the-awakening',
    title: 'The Awakening',
    category: 'Class Mastery',
    description: 'Complete Awakening and unlock your first class.',
    metric: 'classesUnlocked',
    target: 1,
    icon: 'star-four-points-circle-outline',
    accent: '#8DEAFF',
  },
  {
    key: 'another-path',
    title: 'Another Path',
    category: 'Class Mastery',
    description: 'Unlock a second starter class.',
    metric: 'classesUnlocked',
    target: 2,
    icon: 'source-branch',
    accent: '#B493FF',
  },
  {
    key: 'first-mastery',
    title: 'First Mastery',
    category: 'Class Mastery',
    description: 'Earn your first 25 Class Mastery XP.',
    metric: 'classMasteryXp',
    target: 25,
    icon: 'shield-star-outline',
    accent: '#FFD166',
  },
  {
    key: 'proven-specialist',
    title: 'Proven Specialist',
    category: 'Class Mastery',
    description: 'Earn 250 Class Mastery XP across all classes.',
    metric: 'classMasteryXp',
    target: 250,
    icon: 'medal-outline',
    accent: '#68E1A8',
  },
] as const satisfies AchievementDefinition[];
