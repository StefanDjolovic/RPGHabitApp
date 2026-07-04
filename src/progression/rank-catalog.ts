export type RankKey =
  | 'unawakened'
  | 'e_rank'
  | 'd_rank'
  | 'c_rank'
  | 'b_rank'
  | 'a_rank'
  | 's_rank'
  | 'ss_rank'
  | 'sss_rank'
  | 'sss_plus_rank'
  | 'transcendent';

export type RankDefinition = {
  key: RankKey;
  label: string;
  shortLabel: string;
  minimumLevel: number;
  requiredDungeonClears: number;
  trialName: string;
  milestone: string;
  accent: string;
};

export const rankCatalog: RankDefinition[] = [
  {
    key: 'unawakened', label: 'Unawakened', shortLabel: 'U', minimumLevel: 1,
    requiredDungeonClears: 0, trialName: 'Unawakened Path',
    milestone: 'Prepare for Awakening.', accent: '#8D96AA',
  },
  {
    key: 'e_rank', label: 'E Rank', shortLabel: 'E', minimumLevel: 10,
    requiredDungeonClears: 0, trialName: 'Awakening',
    milestone: 'Awaken a starter class.', accent: '#7EE7FF',
  },
  {
    key: 'd_rank', label: 'D Rank', shortLabel: 'D', minimumLevel: 20,
    requiredDungeonClears: 3, trialName: 'Trial of Embers',
    milestone: 'Unlock advanced skills and a new region.', accent: '#68E1A8',
  },
  {
    key: 'c_rank', label: 'C Rank', shortLabel: 'C', minimumLevel: 30,
    requiredDungeonClears: 10, trialName: 'Trial of the Sunken Seal',
    milestone: 'Enter more complex dungeons.', accent: '#61D4FF',
  },
  {
    key: 'b_rank', label: 'B Rank', shortLabel: 'B', minimumLevel: 40,
    requiredDungeonClears: 25, trialName: 'Trial of Obsidian',
    milestone: 'Unlock powerful class skills.', accent: '#B493FF',
  },
  {
    key: 'a_rank', label: 'A Rank', shortLabel: 'A', minimumLevel: 50,
    requiredDungeonClears: 35, trialName: 'Trial of the Frozen Crown',
    milestone: 'Unlock class specialization.', accent: '#FFD166',
  },
  {
    key: 's_rank', label: 'S Rank', shortLabel: 'S', minimumLevel: 60,
    requiredDungeonClears: 55, trialName: 'Trial of the Celestial Rift',
    milestone: 'Enter endgame regions.', accent: '#FF9BCB',
  },
  {
    key: 'ss_rank', label: 'SS Rank', shortLabel: 'SS', minimumLevel: 70,
    requiredDungeonClears: 80, trialName: 'Trial of the Void Bastion',
    milestone: 'Break into superior-rank gates.', accent: '#B98CFF',
  },
  {
    key: 'sss_rank', label: 'SSS Rank', shortLabel: 'SSS', minimumLevel: 80,
    requiredDungeonClears: 120, trialName: 'Trial of Astral Dominion',
    milestone: 'Command the highest standard gate tier.', accent: '#FF7FD1',
  },
  {
    key: 'sss_plus_rank', label: 'SSS+ Rank', shortLabel: 'SSS+', minimumLevel: 90,
    requiredDungeonClears: 170, trialName: 'Trial of the Final Eclipse',
    milestone: 'Unlock Mythic gates beyond normal ranking.', accent: '#FF647C',
  },
  {
    key: 'transcendent', label: 'Transcendent', shortLabel: 'T', minimumLevel: 100,
    requiredDungeonClears: 250, trialName: 'The Final Trial',
    milestone: 'Unlock the final signature skill.', accent: '#FFF0A8',
  },
];

const legacyRankAliases: Record<string, RankKey> = {
  ascendant: 'sss_rank',
};

export function isRankKey(value: string): value is RankKey {
  return rankCatalog.some((rank) => rank.key === value);
}

export function getRankDefinition(rankKey: string) {
  const normalizedRankKey = legacyRankAliases[rankKey] ?? rankKey;
  return rankCatalog.find((rank) => rank.key === normalizedRankKey) ?? rankCatalog[0];
}

export function getNextRank(rankKey: RankKey) {
  const index = rankCatalog.findIndex((rank) => rank.key === rankKey);
  return rankCatalog[index + 1] ?? null;
}

export function getRankOrder(rankKey: string) {
  const normalizedRankKey = legacyRankAliases[rankKey] ?? rankKey;
  const index = rankCatalog.findIndex((rank) => rank.key === normalizedRankKey);
  return Math.max(0, index);
}
