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
  },
} as const satisfies Record<string, DungeonDefinition>;

export type DungeonKey = keyof typeof dungeonCatalog;

export function getDungeonDefinition(dungeonKey: string): DungeonDefinition {
  return dungeonCatalog[dungeonKey as DungeonKey] ?? dungeonCatalog['ashen-ruins'];
}
