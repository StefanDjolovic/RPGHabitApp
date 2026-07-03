import type { PlayerProgress } from '@/src/progression/player-progression';
import type { ClassCombatProfile } from '@/src/dungeon/class-combat';

export type CombatAction = 'attack' | 'skill' | 'defend' | 'item';
export type CombatOutcome = 'active' | 'cleared' | 'failed';

export type CombatLogEntry = {
  id: string;
  message: string;
  tone: 'player' | 'enemy' | 'system';
};

export type CombatSnapshot = {
  playerHp: number;
  enemyHp: number;
  turnNumber: number;
  skillCooldown: number;
  classResource: number;
  log: CombatLogEntry[];
};

export type UnawakenedCombatStats = {
  maxPlayerHp: number;
  maxEnemyHp: number;
  basicDamage: number;
  skillDamage: number;
  potionHealing: number;
  enemyPower: number;
  defense: number;
};

export type CombatEquipmentBonuses = {
  maxHp: number;
  basicDamage: number;
  skillDamage: number;
  defense: number;
};

export type EnemyIntent = {
  type: 'attack' | 'heavy' | 'charge';
  name: string;
  detail: string;
  damage: number;
};

export type CombatResolution = {
  snapshot: CombatSnapshot;
  outcome: CombatOutcome;
  playerDamage: number;
  enemyDamage: number;
  healing: number;
};

const ENEMY_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Ashen Slash', detail: 'A direct blade strike.' },
  { type: 'charge', name: 'Gathering Cinders', detail: 'The Warden prepares a heavy blow.' },
  { type: 'heavy', name: 'Cinder Breaker', detail: 'A powerful attack is incoming.' },
  { type: 'attack', name: 'Ember Sweep', detail: 'A fast sweeping strike.' },
];

function getAttributePoints(progress: PlayerProgress, attribute: keyof PlayerProgress['attributeXp']) {
  return (
    progress.attributeProgression[attribute].naturalPoints + progress.manualStatPoints[attribute]
  );
}

export function getUnawakenedCombatStats(
  progress: PlayerProgress,
  equipment: CombatEquipmentBonuses = { maxHp: 0, basicDamage: 0, skillDamage: 0, defense: 0 },
): UnawakenedCombatStats {
  const strength = getAttributePoints(progress, 'strength');
  const intelligence = getAttributePoints(progress, 'intelligence');
  const discipline = getAttributePoints(progress, 'discipline');
  const vitality = getAttributePoints(progress, 'vitality');
  const creativity = getAttributePoints(progress, 'creativity');

  return {
    maxPlayerHp: 72 + progress.level * 2 + vitality * 4 + equipment.maxHp,
    maxEnemyHp: 68 + progress.level * 3,
    basicDamage:
      9 + Math.floor(strength * 1.5) + Math.floor(discipline * 0.5) + equipment.basicDamage,
    skillDamage: 15 + intelligence + creativity + equipment.skillDamage,
    potionHealing: 24 + vitality * 2,
    enemyPower: Math.floor(Math.max(0, progress.level - 1) / 5),
    defense: equipment.defense,
  };
}

export function getEnemyIntent(turnNumber: number, enemyPower = 0): EnemyIntent {
  const safeTurn = Math.max(1, Math.floor(turnNumber));
  const definition = ENEMY_INTENT_CYCLE[(safeTurn - 1) % ENEMY_INTENT_CYCLE.length];
  const baseDamage = definition.type === 'heavy' ? 17 : definition.type === 'attack' ? 9 : 0;

  return {
    ...definition,
    damage: baseDamage + (baseDamage > 0 ? enemyPower : 0),
  };
}

export function createCombatSnapshot(
  stats: UnawakenedCombatStats,
  profile?: ClassCombatProfile,
): CombatSnapshot {
  return {
    playerHp: stats.maxPlayerHp,
    enemyHp: stats.maxEnemyHp,
    turnNumber: 1,
    skillCooldown: 0,
    classResource: profile?.startingResource ?? 0,
    log: [
      {
        id: 'system-entry',
        message: 'The Cinder Warden blocks the gate.',
        tone: 'system',
      },
    ],
  };
}

function appendLog(snapshot: CombatSnapshot, entries: Omit<CombatLogEntry, 'id'>[]) {
  const nextEntries = entries.map((entry, index) => ({
    ...entry,
    id: `${snapshot.turnNumber}-${index}-${entry.tone}`,
  }));
  return [...snapshot.log, ...nextEntries].slice(-6);
}

export function resolveCombatAction(
  snapshot: CombatSnapshot,
  stats: UnawakenedCombatStats,
  action: CombatAction,
  profile?: ClassCombatProfile,
  passiveSkillKeys: string[] = [],
): CombatResolution {
  if (snapshot.playerHp <= 0 || snapshot.enemyHp <= 0) {
    throw new Error('This battle has already ended.');
  }
  const usesClassResource = Boolean(profile?.resourceName);
  if (action === 'skill' && !usesClassResource && snapshot.skillCooldown > 0) {
    throw new Error('System Break is still on cooldown.');
  }
  if (action === 'skill' && usesClassResource && snapshot.classResource < (profile?.skillCost ?? 0)) {
    throw new Error(`Not enough ${profile?.resourceName}.`);
  }

  let enemyHp = snapshot.enemyHp;
  let playerHp = snapshot.playerHp;
  let playerDamage = 0;
  let enemyDamage = 0;
  let healing = 0;
  let skillCooldown = Math.max(0, snapshot.skillCooldown - 1);
  let classResource = snapshot.classResource;
  const entries: Omit<CombatLogEntry, 'id'>[] = [];

  if (action === 'attack') {
    playerDamage = stats.basicDamage;
    if (passiveSkillKeys.includes('warrior-battle-rhythm')) {
      playerDamage = Math.round(playerDamage * (1 + Math.min(0.3, (snapshot.turnNumber - 1) * 0.05)));
    } else if (
      passiveSkillKeys.includes('assassin-predators-focus') &&
      enemyHp * 2 <= stats.maxEnemyHp
    ) {
      playerDamage = Math.round(playerDamage * 1.25);
    } else if (passiveSkillKeys.includes('summoner-bonded-souls')) {
      playerDamage += Math.round(stats.skillDamage * 0.35);
    }
    enemyHp = Math.max(0, enemyHp - playerDamage);
    entries.push({ message: `Basic Attack deals ${playerDamage} damage.`, tone: 'player' });
    if (profile?.resourceName) {
      const gained = Math.min(profile.attackResourceGain, profile.maxResource - classResource);
      classResource += gained;
      if (gained > 0) {
        entries.push({ message: `You gain ${gained} ${profile.resourceName}.`, tone: 'system' });
      }
    }
  } else if (action === 'skill') {
    const classKey = profile?.classKey;
    if (profile?.skillEffect === 'damage') {
      const baseSkillDamage =
        classKey === 'warrior'
          ? stats.basicDamage * 1.65
          : classKey === 'mage'
            ? stats.skillDamage * 1.8 + 4
            : classKey === 'assassin'
              ? stats.basicDamage * 1.45 + stats.skillDamage * 0.35
              : classKey === 'guardian'
                ? stats.basicDamage * 1.1 + stats.defense * 2 + 4
                : classKey === 'summoner'
                  ? stats.skillDamage * 1.2 + stats.basicDamage * 0.65
                  : stats.skillDamage;
      const passivePower = passiveSkillKeys.includes('mage-elemental-insight') ? 1.1 : 1;
      playerDamage = Math.round(baseSkillDamage * (profile?.skillPower ?? 1) * passivePower);
      enemyHp = Math.max(0, enemyHp - playerDamage);
    } else if (profile?.skillEffect === 'recovery') {
      healing = Math.min(profile.skillHealing, stats.maxPlayerHp - playerHp);
      playerHp += healing;
    }
    if (usesClassResource && profile) {
      classResource = Math.min(
        profile.maxResource,
        classResource - profile.skillCost + profile.skillResourceGain,
      );
    } else {
      skillCooldown = 3;
    }
    const skillName = profile?.skillName ?? 'System Break';
    entries.push(
      profile?.skillEffect === 'barrier'
        ? { message: `${skillName} forms a barrier against the next strike.`, tone: 'player' }
        : profile?.skillEffect === 'recovery'
          ? {
              message: `${skillName} restores ${healing} HP and ${profile.skillResourceGain} ${profile.resourceName}.`,
              tone: 'player',
            }
          : { message: `${skillName} deals ${playerDamage} damage.`, tone: 'player' },
    );
  } else if (action === 'defend') {
    entries.push({ message: 'You brace behind a System barrier.', tone: 'player' });
    if (profile?.resourceName) {
      const gained = Math.min(profile.defendResourceGain, profile.maxResource - classResource);
      classResource += gained;
      if (gained > 0) {
        entries.push({ message: `You gain ${gained} ${profile.resourceName}.`, tone: 'system' });
      }
    }
  } else {
    healing = Math.min(stats.potionHealing, stats.maxPlayerHp - playerHp);
    playerHp += healing;
    entries.push({ message: `Potion restores ${healing} HP.`, tone: 'player' });
  }

  if (enemyHp <= 0) {
    entries.push({ message: 'The Cinder Warden collapses.', tone: 'system' });
    return {
      snapshot: {
        ...snapshot,
        enemyHp,
        playerHp,
        skillCooldown,
        classResource,
        log: appendLog(snapshot, entries),
      },
      outcome: 'cleared',
      playerDamage,
      enemyDamage,
      healing,
    };
  }

  const intent = getEnemyIntent(snapshot.turnNumber, stats.enemyPower);
  const damageAfterDefense = Math.max(0, intent.damage - stats.defense);
  let incomingMultiplier = action === 'defend' ? 0.35 : 1;
  if (passiveSkillKeys.includes('guardian-unbroken')) incomingMultiplier *= 0.85;
  if (action === 'skill') incomingMultiplier *= profile?.skillDefenseMultiplier ?? 1;
  enemyDamage = Math.ceil(damageAfterDefense * incomingMultiplier);
  playerHp = Math.max(0, playerHp - enemyDamage);

  entries.push({
    message:
      intent.type === 'charge'
        ? 'The Warden gathers cinders and deals no damage.'
        : `${intent.name} deals ${enemyDamage} damage.`,
    tone: 'enemy',
  });

  if (playerHp <= 0) {
    entries.push({ message: 'Your gate trial has ended.', tone: 'system' });
  }

  return {
    snapshot: {
      playerHp,
      enemyHp,
      turnNumber: snapshot.turnNumber + 1,
      skillCooldown,
      classResource,
      log: appendLog(snapshot, entries),
    },
    outcome: playerHp <= 0 ? 'failed' : 'active',
    playerDamage,
    enemyDamage,
    healing,
  };
}
