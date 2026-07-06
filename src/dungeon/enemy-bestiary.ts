import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { dungeons, getDungeonDefinition, type DungeonKey } from '@/src/dungeon/dungeon-catalog';

export type DungeonEnemyRole = 'scout' | 'elite' | 'boss';

export type DungeonEnemyPhase = {
  name: string;
  thresholdRatio: number;
  powerBonus: number;
  intentOffsetBonus: number;
  message: string;
};

export type DungeonEnemyDefinition = {
  key: string;
  dungeonKey: DungeonKey;
  role: DungeonEnemyRole;
  roleLabel: string;
  name: string;
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  combatStyle: string;
  weakness: string;
  tactic: string;
  description: string;
  hpMultiplier: number;
  powerBonus: number;
  intentOffset: number;
  phase: DungeonEnemyPhase | null;
};

type EnemyLore = Omit<DungeonEnemyDefinition, 'key' | 'dungeonKey' | 'role' | 'roleLabel' | 'name'>;

const roleLabels: Record<DungeonEnemyRole, string> = {
  scout: 'Scout',
  elite: 'Elite',
  boss: 'Boss',
};

const roomTypeToRole: Record<string, DungeonEnemyRole | null> = {
  combat: 'scout',
  elite: 'elite',
  boss: 'boss',
  path_choice: null,
  event: null,
  boss_ready: null,
};

const enemyLore: Record<DungeonKey, Record<DungeonEnemyRole, EnemyLore>> = {
  'ashen-ruins': {
    scout: {
      title: 'Cinder Ambusher',
      icon: 'fire',
      accent: '#FF9A62',
      combatStyle: 'Fast burn pressure',
      weakness: 'Defend before Cinder Breaker',
      tactic: 'Opens with quick strikes and tries to tag the hunter with Burn.',
      description: 'Low-rank ash spirits that test positioning before the real gate opens.',
      hpMultiplier: 0.58,
      powerBonus: -1,
      intentOffset: 0,
      phase: null,
    },
    elite: {
      title: 'Ashen Vanguard',
      icon: 'shield-sword-outline',
      accent: '#FFB36B',
      combatStyle: 'Heavy strike setup',
      weakness: 'Burst it after charge turns',
      tactic: 'Alternates guard-breaking swings with windows where it gathers cinders.',
      description: 'A brute formed from collapsed armor and hot stone.',
      hpMultiplier: 0.9,
      powerBonus: 1,
      intentOffset: 1,
      phase: null,
    },
    boss: {
      title: 'Ruins Gatekeeper',
      icon: 'crown-outline',
      accent: '#FF7D68',
      combatStyle: 'Burn and weaken cycle',
      weakness: 'Clean fights and steady potions',
      tactic: 'Uses the full ash cycle and becomes furious under half HP.',
      description: 'The central ward of the burned halls, bound to the first gate.',
      hpMultiplier: 1,
      powerBonus: 2,
      intentOffset: 2,
      phase: {
        name: 'Cinder Crown',
        thresholdRatio: 0.5,
        powerBonus: 2,
        intentOffsetBonus: 1,
        message: 'The Cinder Crown ignites. Enemy damage increases and its pattern shifts.',
      },
    },
  },
  'verdant-wilds': {
    scout: {
      title: 'Briar Harrier',
      icon: 'leaf',
      accent: '#6BE7A1',
      combatStyle: 'Poison harassment',
      weakness: 'Short fights before poison stacks',
      tactic: 'Uses roots to slow the hunter before toxic blooms land.',
      description: 'Small territorial beasts that mark intruders for the forest.',
      hpMultiplier: 0.6,
      powerBonus: 0,
      intentOffset: 0,
      phase: null,
    },
    elite: {
      title: 'Wilds Packlord',
      icon: 'paw',
      accent: '#8DE36D',
      combatStyle: 'Thorns and heavy bursts',
      weakness: 'Shield its Thorn Crush turns',
      tactic: 'Forces defensive turns, then punishes greedy attacks.',
      description: 'The dominant beast of the living maze.',
      hpMultiplier: 0.92,
      powerBonus: 2,
      intentOffset: 1,
      phase: null,
    },
    boss: {
      title: 'Ancient Root Tyrant',
      icon: 'tree-outline',
      accent: '#58E0A0',
      combatStyle: 'Poison sustain check',
      weakness: 'High burst or healing support',
      tactic: 'Turns the field into a poison garden once wounded.',
      description: 'A gate-root that remembers every hunter it has buried.',
      hpMultiplier: 1.02,
      powerBonus: 3,
      intentOffset: 2,
      phase: {
        name: 'Overgrowth',
        thresholdRatio: 0.5,
        powerBonus: 2,
        intentOffsetBonus: 1,
        message: 'Overgrowth floods the chamber. The boss pattern accelerates.',
      },
    },
  },
  'sunken-citadel': {
    scout: {
      title: 'Drowned Patrol',
      icon: 'waves-arrow-up',
      accent: '#72D7FF',
      combatStyle: 'Pressure cuts',
      weakness: 'Avoid long vulnerable windows',
      tactic: 'Cuts through armor with tide pressure and exposed wounds.',
      description: 'Citadel guards still marching below impossible water.',
      hpMultiplier: 0.62,
      powerBonus: 0,
      intentOffset: 1,
      phase: null,
    },
    elite: {
      title: 'Leviathan Bulwark',
      icon: 'shield-half-full',
      accent: '#4EC9FF',
      combatStyle: 'Vulnerable punish',
      weakness: 'Defend after pressure gathers',
      tactic: 'Crushes the hunter after exposing weak points.',
      description: 'A deep-sea guardian built to protect drowned royalty.',
      hpMultiplier: 0.94,
      powerBonus: 2,
      intentOffset: 2,
      phase: null,
    },
    boss: {
      title: 'Abyssal Royalty',
      icon: 'crown',
      accent: '#61D4FF',
      combatStyle: 'Bleed and pressure',
      weakness: 'Barrier before Abyssal Crash',
      tactic: 'Raises the tide, then turns every mistake into lasting damage.',
      description: 'A drowned regent whose throne room moves like a living sea.',
      hpMultiplier: 1.03,
      powerBonus: 3,
      intentOffset: 3,
      phase: {
        name: 'High Tide',
        thresholdRatio: 0.5,
        powerBonus: 3,
        intentOffsetBonus: 1,
        message: 'High Tide rises. The boss hits harder through the final stretch.',
      },
    },
  },
  'obsidian-depths': {
    scout: {
      title: 'Blackglass Worker',
      icon: 'pickaxe',
      accent: '#C4A1FF',
      combatStyle: 'Bleed pressure',
      weakness: 'Finish before wounds build',
      tactic: 'Uses mining claws to open small but dangerous cuts.',
      description: 'A miner-shaped shadow still carving the blackforge.',
      hpMultiplier: 0.64,
      powerBonus: 0,
      intentOffset: 0,
      phase: null,
    },
    elite: {
      title: 'Obsidian Breaker',
      icon: 'hammer',
      accent: '#B493FF',
      combatStyle: 'Armor crusher',
      weakness: 'Defensive turns matter',
      tactic: 'Compresses its forge core before huge impacts.',
      description: 'A towering guardian plated in black volcanic glass.',
      hpMultiplier: 0.96,
      powerBonus: 3,
      intentOffset: 1,
      phase: null,
    },
    boss: {
      title: 'Nightforge Core',
      icon: 'anvil',
      accent: '#C09AFF',
      combatStyle: 'Weakening impacts',
      weakness: 'Cleanse weakened with rest paths',
      tactic: 'Turns the whole chamber into a pressure furnace below half HP.',
      description: 'A living forge that manufactures its own armor mid-fight.',
      hpMultiplier: 1.05,
      powerBonus: 4,
      intentOffset: 2,
      phase: {
        name: 'Molten Core',
        thresholdRatio: 0.5,
        powerBonus: 3,
        intentOffsetBonus: 1,
        message: 'Molten Core exposed. Enemy pressure spikes.',
      },
    },
  },
  'frozen-crown': {
    scout: {
      title: 'Rime Hunter',
      icon: 'snowflake',
      accent: '#A7F0FF',
      combatStyle: 'Vulnerable frost cuts',
      weakness: 'Do not race while vulnerable',
      tactic: 'Uses cold precision to create fragile openings.',
      description: 'Silent hunters that move through ice without sound.',
      hpMultiplier: 0.66,
      powerBonus: 1,
      intentOffset: 1,
      phase: null,
    },
    elite: {
      title: 'Glacial Judge',
      icon: 'axe',
      accent: '#9EEBFF',
      combatStyle: 'Stun threat',
      weakness: 'Barrier before sentence turns',
      tactic: 'Locks the hunter down with frozen execution swings.',
      description: 'An executioner from the throne road.',
      hpMultiplier: 0.98,
      powerBonus: 3,
      intentOffset: 2,
      phase: null,
    },
    boss: {
      title: 'Frost Monarch',
      icon: 'chess-king',
      accent: '#B6F3FF',
      combatStyle: 'Control and burst',
      weakness: 'Defend against Glacial Sentence',
      tactic: 'Below half HP, every attack feels like a royal decree.',
      description: 'A frozen sovereign guarding the crown beyond A rank.',
      hpMultiplier: 1.06,
      powerBonus: 4,
      intentOffset: 3,
      phase: {
        name: 'Frozen Decree',
        thresholdRatio: 0.5,
        powerBonus: 3,
        intentOffsetBonus: 1,
        message: 'Frozen Decree activates. The sovereign changes tempo.',
      },
    },
  },
  'celestial-rift': {
    scout: {
      title: 'Star Watcher',
      icon: 'star-outline',
      accent: '#FFB0D1',
      combatStyle: 'Burning starlight',
      weakness: 'Burst through prism turns',
      tactic: 'Bends light until the hunter is exposed.',
      description: 'A sentry made from drifting star fragments.',
      hpMultiplier: 0.68,
      powerBonus: 1,
      intentOffset: 1,
      phase: null,
    },
    elite: {
      title: 'Comet Knight',
      icon: 'creation',
      accent: '#FF99CB',
      combatStyle: 'Explosive charges',
      weakness: 'Hold cooldowns for charge windows',
      tactic: 'Turns charge turns into sudden starfire bursts.',
      description: 'A knight orbiting the rift with impossible speed.',
      hpMultiplier: 1,
      powerBonus: 4,
      intentOffset: 2,
      phase: null,
    },
    boss: {
      title: 'Rift Seraphim',
      icon: 'star-four-points-outline',
      accent: '#FF8FC4',
      combatStyle: 'Burn and vulnerability',
      weakness: 'High skill damage wins races',
      tactic: 'The rift destabilizes once the Seraph is wounded.',
      description: 'A starborn guardian that fights from broken angles.',
      hpMultiplier: 1.08,
      powerBonus: 5,
      intentOffset: 3,
      phase: {
        name: 'Starfall',
        thresholdRatio: 0.5,
        powerBonus: 4,
        intentOffsetBonus: 1,
        message: 'Starfall begins. The chamber fractures under radiant pressure.',
      },
    },
  },
  'void-bastion': {
    scout: {
      title: 'Null Shade',
      icon: 'ghost-outline',
      accent: '#B98CFF',
      combatStyle: 'Momentum drain',
      weakness: 'Keep pressure consistent',
      tactic: 'Marks the hunter for heavier void hits.',
      description: 'A silent scout that barely exists between attacks.',
      hpMultiplier: 0.7,
      powerBonus: 2,
      intentOffset: 1,
      phase: null,
    },
    elite: {
      title: 'Void Devourer',
      icon: 'hexagram-outline',
      accent: '#C6A2FF',
      combatStyle: 'Gravity bursts',
      weakness: 'Guard gravity turns',
      tactic: 'Compresses the room, then tears through the center.',
      description: 'A bastion beast that eats distance and light.',
      hpMultiplier: 1.02,
      powerBonus: 5,
      intentOffset: 2,
      phase: null,
    },
    boss: {
      title: 'Null Monarch',
      icon: 'circle-off-outline',
      accent: '#B88BFF',
      combatStyle: 'Weaken and punish',
      weakness: 'Avoid fighting while weakened',
      tactic: 'Below half HP, the Null King bends gravity against every action.',
      description: 'A ruler of empty halls, strongest when the hunter hesitates.',
      hpMultiplier: 1.1,
      powerBonus: 6,
      intentOffset: 3,
      phase: {
        name: 'Event Horizon',
        thresholdRatio: 0.5,
        powerBonus: 4,
        intentOffsetBonus: 1,
        message: 'Event Horizon opens. The Null King pulls the fight inward.',
      },
    },
  },
  'astral-dominion': {
    scout: {
      title: 'Constellation Pursuer',
      icon: 'star-four-points-outline',
      accent: '#FF94D8',
      combatStyle: 'Bleed from orbit',
      weakness: 'Do not let long fights snowball',
      tactic: 'Uses comet trails to keep pressure after each hit.',
      description: 'A hunter from the royal constellation.',
      hpMultiplier: 0.72,
      powerBonus: 2,
      intentOffset: 1,
      phase: null,
    },
    elite: {
      title: 'Nebula Colossus',
      icon: 'meteor',
      accent: '#FF7FD1',
      combatStyle: 'Massive astral falls',
      weakness: 'Time skills after charge turns',
      tactic: 'Drops celestial weight after short setup windows.',
      description: 'A titan whose armor is a moving night sky.',
      hpMultiplier: 1.04,
      powerBonus: 6,
      intentOffset: 2,
      phase: null,
    },
    boss: {
      title: 'Dominion Sovereign',
      icon: 'crown-circle-outline',
      accent: '#FF72CE',
      combatStyle: 'Burn and bleed cycle',
      weakness: 'Balanced damage and sustain',
      tactic: 'The throne changes the laws of the fight under half HP.',
      description: 'A sovereign who treats the arena as a personal constellation.',
      hpMultiplier: 1.12,
      powerBonus: 7,
      intentOffset: 3,
      phase: {
        name: 'Cosmic Law',
        thresholdRatio: 0.5,
        powerBonus: 5,
        intentOffsetBonus: 1,
        message: 'Cosmic Law is rewritten. The Sovereign moves ahead of schedule.',
      },
    },
  },
  'final-eclipse': {
    scout: {
      title: 'Umbral Prophet',
      icon: 'weather-night',
      accent: '#FF7A8E',
      combatStyle: 'Poisoned darkness',
      weakness: 'Enter with potions ready',
      tactic: 'Tests whether the hunter can survive mythic pressure.',
      description: 'A herald of the last light, carrying the gate warning.',
      hpMultiplier: 0.74,
      powerBonus: 3,
      intentOffset: 1,
      phase: null,
    },
    elite: {
      title: 'Endbringer Knight',
      icon: 'sword-cross',
      accent: '#FF647C',
      combatStyle: 'Stun and execution',
      weakness: 'Defend before Totality windows',
      tactic: 'Punishes every low-HP gamble with eclipse steel.',
      description: 'The final guard before a forbidden boss chamber.',
      hpMultiplier: 1.06,
      powerBonus: 7,
      intentOffset: 2,
      phase: null,
    },
    boss: {
      title: 'Eclipse Apex',
      icon: 'weather-sunset',
      accent: '#FF5C73',
      combatStyle: 'Mythic control fight',
      weakness: 'Use every prep advantage',
      tactic: 'At half HP, the Tyrant enters Total Eclipse and the final race begins.',
      description: 'A gate entity beyond standard rank measurement.',
      hpMultiplier: 1.15,
      powerBonus: 8,
      intentOffset: 3,
      phase: {
        name: 'Total Eclipse',
        thresholdRatio: 0.5,
        powerBonus: 6,
        intentOffsetBonus: 1,
        message: 'Total Eclipse consumes the arena. The Tyrant reaches full pressure.',
      },
    },
  },
};

export function getDungeonEnemyRole(roomType: string): DungeonEnemyRole | null {
  return roomTypeToRole[roomType] ?? null;
}

export function getDungeonEnemy(dungeonKey: string, role: DungeonEnemyRole): DungeonEnemyDefinition {
  const dungeon = getDungeonDefinition(dungeonKey);
  const key = dungeon.key as DungeonKey;
  const lore = enemyLore[key][role];
  const name = role === 'scout'
    ? dungeon.scoutName
    : role === 'elite'
      ? dungeon.eliteName
      : dungeon.bossName;

  return {
    key: `${dungeon.key}-${role}`,
    dungeonKey: key,
    role,
    roleLabel: roleLabels[role],
    name,
    ...lore,
  };
}

export function getAllDungeonEnemies() {
  return dungeons.flatMap((dungeon) =>
    (['scout', 'elite', 'boss'] as const).map((role) => getDungeonEnemy(dungeon.key, role)),
  );
}
