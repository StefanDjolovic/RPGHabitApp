import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { ItemKey } from '@/src/inventory/item-catalog';
import type { RankKey } from '@/src/progression/rank-catalog';

export type DungeonDifficulty = 'Normal' | 'Elite';
export type DungeonCombatTheme =
  | 'ashen'
  | 'verdant'
  | 'sunken'
  | 'obsidian'
  | 'frozen'
  | 'celestial'
  | 'void'
  | 'astral'
  | 'eclipse';

export type DungeonDefinition = {
  key: string;
  name: string;
  region: string;
  rank: string;
  difficulty: DungeonDifficulty;
  combatTheme: DungeonCombatTheme;
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
  treasureItemKey: ItemKey;
  treasureItemQuantity: number;
  eliteItemKey: ItemKey;
};

export const dungeonCatalog = {
  'ashen-ruins': {
    key: 'ashen-ruins',
    name: 'Ashen Ruins',
    region: 'First Gate',
    rank: 'E Rank',
    difficulty: 'Normal',
    combatTheme: 'ashen',
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
    combatTheme: 'verdant',
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
  'sunken-citadel': {
    key: 'sunken-citadel',
    name: 'Sunken Citadel',
    region: 'Drowned Gate',
    rank: 'C Rank',
    difficulty: 'Normal',
    combatTheme: 'sunken',
    energyCost: 7,
    bossName: 'Abyssal Regent',
    description: 'Flooded halls where drowned sentinels weaponize pressure and ancient tides.',
    requiredRankKey: 'c_rank',
    accent: '#61D4FF',
    icon: 'waves',
    enemyHpMultiplier: 1.32,
    enemyPowerBonus: 2,
    scoutName: 'Drowned Sentinel',
    eliteName: 'Leviathan Guard',
    eventName: 'Tidebound Archive',
    treasureItemKey: 'abyssal-scale',
    treasureItemQuantity: 2,
    eliteItemKey: 'tideglass-amulet',
  },
  'obsidian-depths': {
    key: 'obsidian-depths',
    name: 'Obsidian Depths',
    region: 'Blackforge Gate',
    rank: 'B Rank',
    difficulty: 'Normal',
    combatTheme: 'obsidian',
    energyCost: 8,
    bossName: 'Nightforge Colossus',
    description: 'A volcanic fortress of living armor, black glass and crushing shadow.',
    requiredRankKey: 'b_rank',
    accent: '#B493FF',
    icon: 'terrain',
    enemyHpMultiplier: 1.48,
    enemyPowerBonus: 3,
    scoutName: 'Shadowbound Miner',
    eliteName: 'Obsidian Juggernaut',
    eventName: 'Black Flame Forge',
    treasureItemKey: 'obsidian-fragment',
    treasureItemQuantity: 2,
    eliteItemKey: 'nightguard-plate',
  },
  'frozen-crown': {
    key: 'frozen-crown',
    name: 'Frozen Crown',
    region: 'Winter Gate',
    rank: 'A Rank',
    difficulty: 'Normal',
    combatTheme: 'frozen',
    energyCost: 8,
    bossName: 'Frost Crown Sovereign',
    description: 'An icebound throne world where every turn tests defense and recovery.',
    requiredRankKey: 'a_rank',
    accent: '#9EEBFF',
    icon: 'snowflake',
    enemyHpMultiplier: 1.66,
    enemyPowerBonus: 4,
    scoutName: 'Rime Stalker',
    eliteName: 'Glacial Executioner',
    eventName: 'Aurora Sanctuary',
    treasureItemKey: 'frost-sigil',
    treasureItemQuantity: 2,
    eliteItemKey: 'crownwalker-helm',
  },
  'celestial-rift': {
    key: 'celestial-rift',
    name: 'Celestial Rift',
    region: 'Starfall Gate',
    rank: 'S Rank',
    difficulty: 'Elite',
    combatTheme: 'celestial',
    energyCost: 9,
    bossName: 'Rift Seraph',
    description: 'A fractured sky realm ruled by starfire, barriers and unstable magic.',
    requiredRankKey: 's_rank',
    accent: '#FF9BCB',
    icon: 'creation',
    enemyHpMultiplier: 1.85,
    enemyPowerBonus: 5,
    scoutName: 'Starborn Watcher',
    eliteName: 'Comet Vanguard',
    eventName: 'Celestial Observatory',
    treasureItemKey: 'celestial-thread',
    treasureItemQuantity: 2,
    eliteItemKey: 'riftbound-ring',
  },
  'void-bastion': {
    key: 'void-bastion',
    name: 'Void Bastion',
    region: 'Null Gate',
    rank: 'SS Rank',
    difficulty: 'Elite',
    combatTheme: 'void',
    energyCost: 9,
    bossName: 'The Null King',
    description: 'A silent fortress that drains momentum and punishes careless attacks.',
    requiredRankKey: 'ss_rank',
    accent: '#B98CFF',
    icon: 'hexagram-outline',
    enemyHpMultiplier: 2.05,
    enemyPowerBonus: 7,
    scoutName: 'Void Wraith',
    eliteName: 'Bastion Devourer',
    eventName: 'Silent Singularity',
    treasureItemKey: 'void-crystal',
    treasureItemQuantity: 2,
    eliteItemKey: 'voidwalker-blade',
  },
  'astral-dominion': {
    key: 'astral-dominion',
    name: 'Astral Dominion',
    region: 'Sovereign Gate',
    rank: 'SSS Rank',
    difficulty: 'Elite',
    combatTheme: 'astral',
    energyCost: 10,
    bossName: 'Astral Sovereign',
    description: 'A royal constellation where cosmic hunters fight under shifting laws.',
    requiredRankKey: 'sss_rank',
    accent: '#FF7FD1',
    icon: 'star-four-points-outline',
    enemyHpMultiplier: 2.25,
    enemyPowerBonus: 9,
    scoutName: 'Constellation Hunter',
    eliteName: 'Nebula Titan',
    eventName: 'Throne of Stars',
    treasureItemKey: 'astral-core',
    treasureItemQuantity: 2,
    eliteItemKey: 'sovereign-mantle',
  },
  'final-eclipse': {
    key: 'final-eclipse',
    name: 'Final Eclipse',
    region: 'Mythic Gate',
    rank: 'SSS+ Rank',
    difficulty: 'Elite',
    combatTheme: 'eclipse',
    energyCost: 10,
    bossName: 'Eclipse Tyrant',
    description: 'A forbidden gate beyond standard ranking, balanced on the edge of annihilation.',
    requiredRankKey: 'sss_plus_rank',
    accent: '#FF647C',
    icon: 'weather-sunset',
    enemyHpMultiplier: 2.5,
    enemyPowerBonus: 12,
    scoutName: 'Umbral Herald',
    eliteName: 'Endbringer',
    eventName: 'Last Light Altar',
    treasureItemKey: 'eclipse-shard',
    treasureItemQuantity: 2,
    eliteItemKey: 'final-gate-crown',
  },
} as const satisfies Record<string, DungeonDefinition>;

export type DungeonKey = keyof typeof dungeonCatalog;
export const dungeons = Object.values(dungeonCatalog);

export function getDungeonDefinition(dungeonKey: string): DungeonDefinition {
  return dungeonCatalog[dungeonKey as DungeonKey] ?? dungeonCatalog['ashen-ruins'];
}
