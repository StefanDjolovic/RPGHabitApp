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
  log: CombatLogEntry[];
};

export type UnawakenedCombatStats = {
  maxPlayerHp: number;
  maxEnemyHp: number;
  basicDamage: number;
  skillDamage: number;
  potionHealing: number;
  enemyPower: number;
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

export function getUnawakenedCombatStats(progress: PlayerProgress): UnawakenedCombatStats {
  const strength = getAttributePoints(progress, 'strength');
  const intelligence = getAttributePoints(progress, 'intelligence');
  const discipline = getAttributePoints(progress, 'discipline');
  const vitality = getAttributePoints(progress, 'vitality');
  const creativity = getAttributePoints(progress, 'creativity');

  return {
    maxPlayerHp: 72 + progress.level * 2 + vitality * 4,
    maxEnemyHp: 68 + progress.level * 3,
    basicDamage: 9 + Math.floor(strength * 1.5) + Math.floor(discipline * 0.5),
    skillDamage: 15 + intelligence + creativity,
    potionHealing: 24 + vitality * 2,
    enemyPower: Math.floor(Math.max(0, progress.level - 1) / 5),
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

export function createCombatSnapshot(stats: UnawakenedCombatStats): CombatSnapshot {
  return {
    playerHp: stats.maxPlayerHp,
    enemyHp: stats.maxEnemyHp,
    turnNumber: 1,
    skillCooldown: 0,
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
): CombatResolution {
  if (snapshot.playerHp <= 0 || snapshot.enemyHp <= 0) {
    throw new Error('This battle has already ended.');
  }
  if (action === 'skill' && snapshot.skillCooldown > 0) {
    throw new Error('System Break is still on cooldown.');
  }

  let enemyHp = snapshot.enemyHp;
  let playerHp = snapshot.playerHp;
  let playerDamage = 0;
  let enemyDamage = 0;
  let healing = 0;
  let skillCooldown = Math.max(0, snapshot.skillCooldown - 1);
  const entries: Omit<CombatLogEntry, 'id'>[] = [];

  if (action === 'attack') {
    playerDamage = stats.basicDamage;
    enemyHp = Math.max(0, enemyHp - playerDamage);
    entries.push({ message: `Basic Attack deals ${playerDamage} damage.`, tone: 'player' });
  } else if (action === 'skill') {
    playerDamage = stats.skillDamage;
    enemyHp = Math.max(0, enemyHp - playerDamage);
    skillCooldown = 3;
    entries.push({ message: `System Break deals ${playerDamage} damage.`, tone: 'player' });
  } else if (action === 'defend') {
    entries.push({ message: 'You brace behind a System barrier.', tone: 'player' });
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
        log: appendLog(snapshot, entries),
      },
      outcome: 'cleared',
      playerDamage,
      enemyDamage,
      healing,
    };
  }

  const intent = getEnemyIntent(snapshot.turnNumber, stats.enemyPower);
  enemyDamage = action === 'defend' ? Math.ceil(intent.damage * 0.35) : intent.damage;
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
      log: appendLog(snapshot, entries),
    },
    outcome: playerHp <= 0 ? 'failed' : 'active',
    playerDamage,
    enemyDamage,
    healing,
  };
}
