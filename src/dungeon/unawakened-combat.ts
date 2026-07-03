import type { ClassCombatProfile } from '@/src/dungeon/class-combat';
import {
  advanceCombatStatuses,
  applyCombatStatus,
  combatStatusCatalog,
  consumeBarrier,
  getCombatStatusPotency,
  hasCombatStatus,
  type CombatStatus,
} from '@/src/dungeon/combat-statuses';
import type { PlayerProgress } from '@/src/progression/player-progression';

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
  playerStatuses: CombatStatus[];
  enemyStatuses: CombatStatus[];
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
  status: CombatStatus | null;
};

export type CombatResolution = {
  snapshot: CombatSnapshot;
  outcome: CombatOutcome;
  playerDamage: number;
  enemyDamage: number;
  healing: number;
};

const ASHEN_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Ashen Slash', detail: 'A direct blade strike.', status: null },
  { type: 'charge', name: 'Gathering Cinders', detail: 'The enemy prepares a heavy blow.', status: null },
  { type: 'heavy', name: 'Cinder Breaker', detail: 'Heavy damage and Weakened.', status: { type: 'weakened', turns: 3, potency: 25 } },
  { type: 'attack', name: 'Ember Sweep', detail: 'A fast strike that inflicts Burn.', status: { type: 'burn', turns: 3, potency: 3 } },
];

const VERDANT_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Root Lash', detail: 'A quick strike through the undergrowth.', status: null },
  { type: 'charge', name: 'Coiling Growth', detail: 'Roots gather strength for a crushing blow.', status: null },
  { type: 'heavy', name: 'Thorn Crush', detail: 'Heavy damage and Weakened.', status: { type: 'weakened', turns: 3, potency: 20 } },
  { type: 'attack', name: 'Toxic Bloom', detail: 'A poisonous cloud follows the strike.', status: { type: 'poison', turns: 3, potency: 4 } },
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

export function getEnemyIntent(
  turnNumber: number,
  enemyPower = 0,
  dungeonKey = 'ashen-ruins',
): EnemyIntent {
  const safeTurn = Math.max(1, Math.floor(turnNumber));
  const cycle = dungeonKey === 'verdant-wilds' ? VERDANT_INTENT_CYCLE : ASHEN_INTENT_CYCLE;
  const definition = cycle[(safeTurn - 1) % cycle.length];
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
    playerStatuses: [],
    enemyStatuses: [],
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
  return [...snapshot.log, ...nextEntries].slice(-8);
}

function getModifiedDamage(
  damage: number,
  attackerStatuses: CombatStatus[],
  defenderStatuses: CombatStatus[],
) {
  const weakened = getCombatStatusPotency(attackerStatuses, 'weakened');
  const vulnerable = getCombatStatusPotency(defenderStatuses, 'vulnerable');
  return Math.max(0, Math.round(damage * (1 - weakened / 100) * (1 + vulnerable / 100)));
}

export function resolveCombatAction(
  snapshot: CombatSnapshot,
  stats: UnawakenedCombatStats,
  action: CombatAction,
  profile?: ClassCombatProfile,
  passiveSkillKeys: string[] = [],
  enemyName = 'Cinder Warden',
  dungeonKey = 'ashen-ruins',
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
  let playerStatuses = snapshot.playerStatuses.map((status) => ({ ...status }));
  let enemyStatuses = snapshot.enemyStatuses.map((status) => ({ ...status }));
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
    playerDamage = getModifiedDamage(playerDamage, playerStatuses, enemyStatuses);
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
      playerDamage = getModifiedDamage(playerDamage, playerStatuses, enemyStatuses);
      enemyHp = Math.max(0, enemyHp - playerDamage);
      if (profile.skillStatus && enemyHp > 0) {
        enemyStatuses = applyCombatStatus(enemyStatuses, profile.skillStatus);
        entries.push({
          message: `${combatStatusCatalog[profile.skillStatus.type].label} affects ${enemyName}.`,
          tone: 'system',
        });
      }
    } else if (profile?.skillEffect === 'barrier') {
      const barrierStrength = Math.max(
        10,
        Math.round(stats.skillDamage * 0.75 + stats.defense * 2),
      );
      playerStatuses = applyCombatStatus(playerStatuses, {
        type: 'barrier',
        turns: 3,
        potency: barrierStrength,
      });
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
    entries.push({ message: `${enemyName} collapses.`, tone: 'system' });
    return {
      snapshot: {
        ...snapshot,
        enemyHp,
        playerHp,
        skillCooldown,
        classResource,
        playerStatuses,
        enemyStatuses,
        log: appendLog(snapshot, entries),
      },
      outcome: 'cleared',
      playerDamage,
      enemyDamage,
      healing,
    };
  }

  const intent = getEnemyIntent(snapshot.turnNumber, stats.enemyPower, dungeonKey);
  if (hasCombatStatus(enemyStatuses, 'stun')) {
    entries.push({ message: `Stun interrupts ${enemyName}'s action.`, tone: 'system' });
  } else {
    const modifiedIntentDamage = getModifiedDamage(intent.damage, enemyStatuses, playerStatuses);
    const damageAfterDefense = Math.max(0, modifiedIntentDamage - stats.defense);
    let incomingMultiplier = action === 'defend' ? 0.35 : 1;
    if (passiveSkillKeys.includes('guardian-unbroken')) incomingMultiplier *= 0.85;
    if (action === 'skill') incomingMultiplier *= profile?.skillDefenseMultiplier ?? 1;
    const barrierResult = consumeBarrier(
      playerStatuses,
      Math.ceil(damageAfterDefense * incomingMultiplier),
    );
    playerStatuses = barrierResult.statuses;
    enemyDamage = barrierResult.damage;
    playerHp = Math.max(0, playerHp - enemyDamage);

    if (barrierResult.absorbed > 0) {
      entries.push({
        message: `Barrier absorbs ${barrierResult.absorbed} damage.`,
        tone: 'system',
      });
    }
    entries.push({
      message:
        intent.type === 'charge'
          ? 'The Warden gathers cinders and deals no damage.'
          : `${intent.name} deals ${enemyDamage} damage.`,
      tone: 'enemy',
    });

    if (enemyDamage > 0 && intent.status) {
      playerStatuses = applyCombatStatus(playerStatuses, intent.status);
      entries.push({
        message: `${intent.name} inflicts ${combatStatusCatalog[intent.status.type].label}.`,
        tone: 'enemy',
      });
    }
  }

  const enemyStatusAdvance = advanceCombatStatuses(enemyStatuses);
  const playerStatusAdvance = advanceCombatStatuses(playerStatuses);
  enemyStatuses = enemyStatusAdvance.statuses;
  playerStatuses = playerStatusAdvance.statuses;
  enemyHp = Math.max(0, enemyHp - enemyStatusAdvance.damage);
  playerHp = Math.max(0, playerHp - playerStatusAdvance.damage);
  playerDamage += enemyStatusAdvance.damage;
  enemyDamage += playerStatusAdvance.damage;

  for (const tick of enemyStatusAdvance.ticks) {
    entries.push({
      message: `${combatStatusCatalog[tick.type].label} deals ${tick.damage} damage to ${enemyName}.`,
      tone: 'system',
    });
  }
  for (const tick of playerStatusAdvance.ticks) {
    entries.push({
      message: `${combatStatusCatalog[tick.type].label} deals ${tick.damage} damage to you.`,
      tone: 'enemy',
    });
  }

  const outcome: CombatOutcome = playerHp <= 0 ? 'failed' : enemyHp <= 0 ? 'cleared' : 'active';
  if (outcome === 'cleared') {
    entries.push({ message: `${enemyName} collapses.`, tone: 'system' });
  } else if (outcome === 'failed') {
    entries.push({ message: 'Your gate trial has ended.', tone: 'system' });
  }

  return {
    snapshot: {
      playerHp,
      enemyHp,
      turnNumber: snapshot.turnNumber + 1,
      skillCooldown,
      classResource,
      playerStatuses,
      enemyStatuses,
      log: appendLog(snapshot, entries),
    },
    outcome,
    playerDamage,
    enemyDamage,
    healing,
  };
}
