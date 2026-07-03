import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { RankKey } from '@/src/progression/rank-catalog';

export type DungeonDifficulty = 'Normal' | 'Elite';

export type DungeonDefinition = {
  key: string;
  name: string;
  region: string;
  rank: string;
  difficulty: DungeonDifficulty;
  energyCost: number;
  bossName: string;
  description: string;
  requiredRankKey: RankKey;
  accent: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  enemyHpMultiplier: number;
  enemyPowerBonus: number;
  scoutName: string;
  eliteName: string;
  eventName: string;
  treasureItemKey: string;
  treasureItemQuantity: number;
  eliteItemKey: string;
};

export const dungeonCatalog = {
  'ashen-ruins': {
    key: 'ashen-ruins',
    name: 'Ashen Ruins',
    region: 'First Gate',
    rank: 'E Rank',
    difficulty: 'Normal',
    energyCost: 6,
    bossName: 'Cinder Warden',
    description: 'A short scouting run through burned stone halls and low-rank echoes.',
    requiredRankKey: 'unawakened',
    accent: '#C8A6FF',
    icon: 'gate',
    enemyHpMultiplier: 1,
    enemyPowerBonus: 0,
    scoutName: 'Ashbound Scout',
    eliteName: 'Ashen Brute',
    eventName: 'Whispering Shrine',
    treasureItemKey: 'ash-shard',
    treasureItemQuantity: 2,
    eliteItemKey: 'focus-crystal',
  },
  'verdant-wilds': {
    key: 'verdant-wilds',
    name: 'Verdant Wilds',
    region: 'Wild Gate',
    rank: 'D Rank',
    difficulty: 'Normal',
    energyCost: 7,
    bossName: 'Thornmaw Ancient',
    description: 'A living maze of poisonous blooms, roots and territorial beasts.',
    requiredRankKey: 'd_rank',
    accent: '#68E1A8',
    icon: 'pine-tree',
    enemyHpMultiplier: 1.22,
    enemyPowerBonus: 2,
    scoutName: 'Briarling Stalker',
    eliteName: 'Thornback Alpha',
    eventName: 'Moonlit Grove',
    treasureItemKey: 'verdant-spore',
    treasureItemQuantity: 2,
    eliteItemKey: 'thornhide-boots',
  },
} as const satisfies Record<string, DungeonDefinition>;

export type DungeonKey = keyof typeof dungeonCatalog;
export const dungeons = Object.values(dungeonCatalog);

export function getDungeonDefinition(dungeonKey: string): DungeonDefinition {
  return dungeonCatalog[dungeonKey as DungeonKey] ?? dungeonCatalog['ashen-ruins'];
}
