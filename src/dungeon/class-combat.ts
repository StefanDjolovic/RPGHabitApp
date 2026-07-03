import { getStarterClass, isStarterClassKey } from '@/src/classes/class-catalog';

export type ClassSkillCombatEffect = 'damage' | 'barrier' | 'recovery';

export type ClassCombatProfile = {
  classKey: string;
  className: string;
  resourceName: string | null;
  maxResource: number;
  startingResource: number;
  attackResourceGain: number;
  defendResourceGain: number;
  skillKey: string;
  skillName: string;
  skillCost: number;
  skillEffect: ClassSkillCombatEffect;
  skillPower: number;
  skillDefenseMultiplier: number;
  skillHealing: number;
  skillResourceGain: number;
  accent: string;
};

type SkillCombatValues = Pick<
  ClassCombatProfile,
  | 'skillName'
  | 'skillCost'
  | 'skillEffect'
  | 'skillPower'
  | 'skillDefenseMultiplier'
  | 'skillHealing'
  | 'skillResourceGain'
>;

const unawakenedProfile: ClassCombatProfile = {
  classKey: 'unawakened',
  className: 'Unawakened',
  resourceName: null,
  maxResource: 0,
  startingResource: 0,
  attackResourceGain: 0,
  defendResourceGain: 0,
  skillKey: 'system-break',
  skillName: 'System Break',
  skillCost: 0,
  skillEffect: 'damage',
  skillPower: 1,
  skillDefenseMultiplier: 1,
  skillHealing: 0,
  skillResourceGain: 0,
  accent: '#62DFFF',
};

const classCombatValues = {
  warrior: { maxResource: 100, startingResource: 20, attackResourceGain: 20, defendResourceGain: 15 },
  mage: { maxResource: 100, startingResource: 70, attackResourceGain: 10, defendResourceGain: 18 },
  assassin: { maxResource: 5, startingResource: 1, attackResourceGain: 1, defendResourceGain: 1 },
  guardian: { maxResource: 100, startingResource: 25, attackResourceGain: 10, defendResourceGain: 30 },
  summoner: { maxResource: 100, startingResource: 50, attackResourceGain: 12, defendResourceGain: 20 },
} as const;

const skillCombatValues: Record<string, SkillCombatValues> = {
  'warrior-cleave': {
    skillName: 'Cleave', skillCost: 40, skillEffect: 'damage', skillPower: 1.15,
    skillDefenseMultiplier: 1, skillHealing: 0, skillResourceGain: 0,
  },
  'warrior-iron-guard': {
    skillName: 'Iron Guard', skillCost: 35, skillEffect: 'barrier', skillPower: 0,
    skillDefenseMultiplier: 0.2, skillHealing: 0, skillResourceGain: 0,
  },
  'mage-arc-bolt': {
    skillName: 'Arc Bolt', skillCost: 30, skillEffect: 'damage', skillPower: 1.15,
    skillDefenseMultiplier: 1, skillHealing: 0, skillResourceGain: 0,
  },
  'mage-mana-ward': {
    skillName: 'Mana Ward', skillCost: 25, skillEffect: 'barrier', skillPower: 0,
    skillDefenseMultiplier: 0.25, skillHealing: 0, skillResourceGain: 0,
  },
  'assassin-quick-cut': {
    skillName: 'Quick Cut', skillCost: 2, skillEffect: 'damage', skillPower: 1,
    skillDefenseMultiplier: 1, skillHealing: 0, skillResourceGain: 0,
  },
  'assassin-venom-edge': {
    skillName: 'Venom Edge', skillCost: 3, skillEffect: 'damage', skillPower: 1.25,
    skillDefenseMultiplier: 1, skillHealing: 0, skillResourceGain: 0,
  },
  'guardian-shield-bash': {
    skillName: 'Shield Bash', skillCost: 20, skillEffect: 'damage', skillPower: 1,
    skillDefenseMultiplier: 0.55, skillHealing: 0, skillResourceGain: 0,
  },
  'guardian-aegis': {
    skillName: 'Aegis', skillCost: 45, skillEffect: 'barrier', skillPower: 0,
    skillDefenseMultiplier: 0.12, skillHealing: 0, skillResourceGain: 0,
  },
  'summoner-wolf': {
    skillName: 'Summon Wolf', skillCost: 35, skillEffect: 'damage', skillPower: 1.15,
    skillDefenseMultiplier: 1, skillHealing: 0, skillResourceGain: 0,
  },
  'summoner-wisp': {
    skillName: 'Summon Wisp', skillCost: 20, skillEffect: 'recovery', skillPower: 0,
    skillDefenseMultiplier: 1, skillHealing: 18, skillResourceGain: 10,
  },
  'summoner-spirit-link': {
    skillName: 'Spirit Link', skillCost: 30, skillEffect: 'barrier', skillPower: 0,
    skillDefenseMultiplier: 0.3, skillHealing: 0, skillResourceGain: 0,
  },
  'summoner-command-focus': {
    skillName: 'Command: Focus', skillCost: 40, skillEffect: 'damage', skillPower: 1.35,
    skillDefenseMultiplier: 1, skillHealing: 0, skillResourceGain: 0,
  },
  'summoner-reclaim-essence': {
    skillName: 'Reclaim Essence', skillCost: 0, skillEffect: 'recovery', skillPower: 0,
    skillDefenseMultiplier: 1, skillHealing: 8, skillResourceGain: 30,
  },
};

export function getClassCombatProfile(classKey: string, requestedSkillKey?: string): ClassCombatProfile {
  if (!isStarterClassKey(classKey)) return unawakenedProfile;

  const definition = getStarterClass(classKey);
  const fallbackSkill = definition.starterSkills.find((skill) => skill.type === 'active');
  const selectedSkill = definition.starterSkills.find(
    (skill) => skill.type === 'active' && skill.key === requestedSkillKey,
  ) ?? fallbackSkill;
  if (!selectedSkill) return unawakenedProfile;

  return {
    classKey,
    className: definition.name,
    resourceName: definition.resource,
    accent: definition.accent,
    ...classCombatValues[classKey],
    skillKey: selectedSkill.key,
    ...skillCombatValues[selectedSkill.key],
  };
}

