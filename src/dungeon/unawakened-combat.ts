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
import {
  getDungeonDefinition,
  type DungeonCombatTheme,
} from '@/src/dungeon/dungeon-catalog';
import type { PlayerProgress } from '@/src/progression/player-progression';

export type CombatAction = 'attack' | 'skill' | 'defend' | 'item';
export type CombatOutcome = 'active' | 'cleared' | 'failed';
export type SummonKey = 'wolf' | 'wisp';

export type SummonUnit = {
  key: SummonKey;
  name: string;
  hp: number;
  maxHp: number;
};

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
  summons: SummonUnit[];
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

const SUNKEN_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Tidal Spear', detail: 'A compressed current cuts through armor.', status: null },
  { type: 'charge', name: 'Rising Pressure', detail: 'The enemy gathers the weight of the deep.', status: null },
  { type: 'heavy', name: 'Abyssal Crash', detail: 'Heavy pressure leaves the target Vulnerable.', status: { type: 'vulnerable', turns: 3, potency: 20 } },
  { type: 'attack', name: 'Drowned Edge', detail: 'A corroded blade opens a lasting wound.', status: { type: 'bleed', turns: 3, potency: 4 } },
];

const OBSIDIAN_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Blackglass Claw', detail: 'A jagged strike tears through the dark.', status: null },
  { type: 'charge', name: 'Forge Compression', detail: 'Obsidian plates lock around a molten core.', status: null },
  { type: 'heavy', name: 'Nightforge Impact', detail: 'A crushing blow weakens the target.', status: { type: 'weakened', turns: 3, potency: 25 } },
  { type: 'attack', name: 'Shadow Shard', detail: 'A splintered edge inflicts Bleed.', status: { type: 'bleed', turns: 3, potency: 5 } },
];

const FROZEN_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Rime Fang', detail: 'A precise strike wrapped in killing frost.', status: null },
  { type: 'charge', name: 'Absolute Zero', detail: 'The air freezes around the enemy.', status: null },
  { type: 'heavy', name: 'Glacial Sentence', detail: 'A frozen impact briefly Stuns the target.', status: { type: 'stun', turns: 2, potency: 0 } },
  { type: 'attack', name: 'Icebrand Cut', detail: 'A brittle wound leaves the target Vulnerable.', status: { type: 'vulnerable', turns: 3, potency: 20 } },
];

const CELESTIAL_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Star Lance', detail: 'Focused starlight pierces the battlefield.', status: null },
  { type: 'charge', name: 'Constellation Shift', detail: 'The gate aligns around a forming star.', status: null },
  { type: 'heavy', name: 'Supernova Brand', detail: 'A stellar detonation inflicts Burn.', status: { type: 'burn', turns: 4, potency: 5 } },
  { type: 'attack', name: 'Rift Prism', detail: 'Bent light exposes a dimensional weakness.', status: { type: 'vulnerable', turns: 3, potency: 25 } },
];

const VOID_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Null Rend', detail: 'A silent fracture cuts through space.', status: null },
  { type: 'charge', name: 'Gravity Well', detail: 'The bastion collapses power into one point.', status: null },
  { type: 'heavy', name: 'Event Horizon', detail: 'A crushing void leaves the target Weakened.', status: { type: 'weakened', turns: 4, potency: 30 } },
  { type: 'attack', name: 'Entropy Mark', detail: 'Unstable energy opens the target to damage.', status: { type: 'vulnerable', turns: 3, potency: 25 } },
];

const ASTRAL_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Astral Blade', detail: 'A sovereign weapon falls from above.', status: null },
  { type: 'charge', name: 'Nebula Crown', detail: 'Cosmic matter gathers around the throne.', status: null },
  { type: 'heavy', name: 'Dominion Fall', detail: 'Starfire crashes down and inflicts Burn.', status: { type: 'burn', turns: 4, potency: 6 } },
  { type: 'attack', name: 'Comet Trail', detail: 'A passing strike leaves a deep Bleed.', status: { type: 'bleed', turns: 4, potency: 6 } },
];

const ECLIPSE_INTENT_CYCLE: Omit<EnemyIntent, 'damage'>[] = [
  { type: 'attack', name: 'Last Light', detail: 'A razor-thin horizon cuts across the gate.', status: null },
  { type: 'charge', name: 'Totality', detail: 'Light and shadow collapse into the enemy.', status: null },
  { type: 'heavy', name: 'Eclipse Cataclysm', detail: 'A forbidden impact Stuns the target.', status: { type: 'stun', turns: 2, potency: 0 } },
  { type: 'attack', name: 'Umbral Venom', detail: 'Living darkness inflicts Poison.', status: { type: 'poison', turns: 4, potency: 7 } },
];

const INTENT_CYCLES: Record<DungeonCombatTheme, Omit<EnemyIntent, 'damage'>[]> = {
  ashen: ASHEN_INTENT_CYCLE,
  verdant: VERDANT_INTENT_CYCLE,
  sunken: SUNKEN_INTENT_CYCLE,
  obsidian: OBSIDIAN_INTENT_CYCLE,
  frozen: FROZEN_INTENT_CYCLE,
  celestial: CELESTIAL_INTENT_CYCLE,
  void: VOID_INTENT_CYCLE,
  astral: ASTRAL_INTENT_CYCLE,
  eclipse: ECLIPSE_INTENT_CYCLE,
};

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
  intentOffset = 0,
): EnemyIntent {
  const safeTurn = Math.max(1, Math.floor(turnNumber) + Math.floor(intentOffset));
  const cycle = INTENT_CYCLES[getDungeonDefinition(dungeonKey).combatTheme];
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
    summons: [],
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
  enemyIntentOffset = 0,
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
  let summons = snapshot.summons.map((summon) => ({ ...summon }));
  const entries: Omit<CombatLogEntry, 'id'>[] = [];

  if (action === 'skill' && profile?.classKey === 'summoner') {
    const summonKey = profile.skillKey === 'summoner-wolf'
      ? 'wolf'
      : profile.skillKey === 'summoner-wisp'
        ? 'wisp'
        : null;
    if (summonKey && summons.some((summon) => summon.key === summonKey)) {
      throw new Error(`${summonKey === 'wolf' ? 'Wolf' : 'Wisp'} is already active.`);
    }
    if (summonKey && summons.length >= 2) {
      throw new Error('Only two summons can be active at once.');
    }
    if (
      ['summoner-command-focus', 'summoner-spirit-link'].includes(profile.skillKey) &&
      summons.length === 0
    ) {
      throw new Error('An active summon is required for this command.');
    }
    if (profile.skillKey === 'summoner-reclaim-essence' && summons.length === 0) {
      throw new Error('There is no summon to reclaim.');
    }
  }

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
    if (profile?.skillKey === 'summoner-wolf') {
      const maxHp = Math.max(18, Math.round(stats.maxPlayerHp * 0.38));
      summons.push({ key: 'wolf', name: 'Spirit Wolf', hp: maxHp, maxHp });
      entries.push({ message: 'Spirit Wolf joins the battle.', tone: 'system' });
    } else if (profile?.skillKey === 'summoner-wisp') {
      const maxHp = Math.max(14, Math.round(stats.maxPlayerHp * 0.28));
      summons.push({ key: 'wisp', name: 'Astral Wisp', hp: maxHp, maxHp });
      entries.push({ message: 'Astral Wisp joins the battle.', tone: 'system' });
    } else if (profile?.skillKey === 'summoner-command-focus') {
      playerDamage = Math.round(playerDamage * (1 + summons.length * 0.22));
      enemyHp = Math.max(0, snapshot.enemyHp - playerDamage);
      entries.push({
        message: `${summons.length} summon${summons.length === 1 ? '' : 's'} focus the target.`,
        tone: 'system',
      });
    } else if (profile?.skillKey === 'summoner-reclaim-essence') {
      const reclaimed = [...summons].sort((first, second) => first.hp - second.hp)[0];
      summons = summons.filter((summon) => summon.key !== reclaimed.key);
      entries.push({ message: `${reclaimed.name} returns to Essence.`, tone: 'system' });
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

  if (profile?.classKey === 'summoner' && profile.skillKey !== 'summoner-command-focus') {
    const wolf = summons.find((summon) => summon.key === 'wolf');
    if (wolf && enemyHp > 0) {
      const bondedMultiplier = passiveSkillKeys.includes('summoner-bonded-souls') ? 0.45 : 0.35;
      const wolfDamage = getModifiedDamage(
        Math.max(1, Math.round(stats.skillDamage * bondedMultiplier)),
        playerStatuses,
        enemyStatuses,
      );
      enemyHp = Math.max(0, enemyHp - wolfDamage);
      playerDamage += wolfDamage;
      entries.push({ message: `${wolf.name} deals ${wolfDamage} damage.`, tone: 'player' });
    }

    const wisp = summons.find((summon) => summon.key === 'wisp');
    if (wisp) {
      const wispHealing = Math.min(
        Math.max(3, Math.round(stats.skillDamage * 0.12)),
        stats.maxPlayerHp - playerHp,
      );
      const essenceGain = Math.min(6, Math.max(0, (profile.maxResource ?? 0) - classResource));
      playerHp += wispHealing;
      healing += wispHealing;
      classResource += essenceGain;
      entries.push({
        message: `${wisp.name} restores ${wispHealing} HP and ${essenceGain} Essence.`,
        tone: 'player',
      });
    }
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
        summons,
        log: appendLog(snapshot, entries),
      },
      outcome: 'cleared',
      playerDamage,
      enemyDamage,
      healing,
    };
  }

  const intent = getEnemyIntent(snapshot.turnNumber, stats.enemyPower, dungeonKey, enemyIntentOffset);
  if (hasCombatStatus(enemyStatuses, 'stun')) {
    entries.push({ message: `Stun interrupts ${enemyName}'s action.`, tone: 'system' });
  } else {
    const modifiedIntentDamage = getModifiedDamage(intent.damage, enemyStatuses, playerStatuses);
    const damageAfterDefense = Math.max(0, modifiedIntentDamage - stats.defense);
    let incomingMultiplier = action === 'defend' ? 0.35 : 1;
    if (passiveSkillKeys.includes('guardian-unbroken')) incomingMultiplier *= 0.85;
    if (action === 'skill') incomingMultiplier *= profile?.skillDefenseMultiplier ?? 1;
    let playerIncomingDamage = Math.ceil(damageAfterDefense * incomingMultiplier);
    if (
      action === 'skill' &&
      profile?.skillKey === 'summoner-spirit-link' &&
      summons.length > 0
    ) {
      const sharedDamage = Math.floor(playerIncomingDamage * 0.5);
      playerIncomingDamage -= sharedDamage;
      if (sharedDamage > 0) {
        const perSummonDamage = Math.ceil(sharedDamage / summons.length);
        summons = summons
          .map((summon) => ({ ...summon, hp: Math.max(0, summon.hp - perSummonDamage) }))
          .filter((summon) => {
            if (summon.hp > 0) return true;
            entries.push({ message: `${summon.name} is dispersed.`, tone: 'enemy' });
            return false;
          });
        entries.push({
          message: `Spirit Link redirects ${sharedDamage} damage to the summons.`,
          tone: 'system',
        });
      }
    }
    const barrierResult = consumeBarrier(
      playerStatuses,
      playerIncomingDamage,
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
          ? `${enemyName} gathers power and deals no damage.`
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
      summons,
      log: appendLog(snapshot, entries),
    },
    outcome,
    playerDamage,
    enemyDamage,
    healing,
  };
}
