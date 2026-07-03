import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type CombatStatusType =
  | 'burn'
  | 'poison'
  | 'bleed'
  | 'stun'
  | 'vulnerable'
  | 'weakened'
  | 'barrier';

export type CombatStatus = {
  type: CombatStatusType;
  turns: number;
  potency: number;
};

export const combatStatusCatalog: Record<
  CombatStatusType,
  {
    label: string;
    accent: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    damageOverTime: boolean;
  }
> = {
  burn: { label: 'Burn', accent: '#FF8A62', icon: 'fire', damageOverTime: true },
  poison: { label: 'Poison', accent: '#A8E063', icon: 'bottle-tonic-skull-outline', damageOverTime: true },
  bleed: { label: 'Bleed', accent: '#FF6F91', icon: 'water-outline', damageOverTime: true },
  stun: { label: 'Stun', accent: '#FFD166', icon: 'lightning-bolt', damageOverTime: false },
  vulnerable: { label: 'Vulnerable', accent: '#FF9F7A', icon: 'shield-alert-outline', damageOverTime: false },
  weakened: { label: 'Weakened', accent: '#A99BC9', icon: 'sword-cross', damageOverTime: false },
  barrier: { label: 'Barrier', accent: '#6DD6FF', icon: 'shield-outline', damageOverTime: false },
};

export function applyCombatStatus(statuses: CombatStatus[], incoming: CombatStatus) {
  const existing = statuses.find((status) => status.type === incoming.type);
  if (!existing) return [...statuses, { ...incoming }];

  return statuses.map((status) => {
    if (status.type !== incoming.type) return status;
    const stacks = combatStatusCatalog[incoming.type].damageOverTime || incoming.type === 'barrier';
    return {
      ...status,
      turns: Math.max(status.turns, incoming.turns),
      potency: stacks
        ? Math.min(incoming.type === 'barrier' ? 999 : 25, status.potency + incoming.potency)
        : Math.max(status.potency, incoming.potency),
    };
  });
}

export function hasCombatStatus(statuses: CombatStatus[], type: CombatStatusType) {
  return statuses.some((status) => status.type === type && status.turns > 0);
}

export function getCombatStatusPotency(statuses: CombatStatus[], type: CombatStatusType) {
  return statuses.find((status) => status.type === type && status.turns > 0)?.potency ?? 0;
}

export function consumeBarrier(statuses: CombatStatus[], incomingDamage: number) {
  const barrier = statuses.find((status) => status.type === 'barrier' && status.potency > 0);
  if (!barrier || incomingDamage <= 0) {
    return { statuses, damage: incomingDamage, absorbed: 0 };
  }

  const absorbed = Math.min(barrier.potency, incomingDamage);
  const remaining = barrier.potency - absorbed;
  return {
    statuses: statuses.flatMap((status) => {
      if (status !== barrier) return [status];
      return remaining > 0 ? [{ ...status, potency: remaining }] : [];
    }),
    damage: incomingDamage - absorbed,
    absorbed,
  };
}

export function advanceCombatStatuses(statuses: CombatStatus[]) {
  const ticks: { type: CombatStatusType; damage: number }[] = [];
  const nextStatuses: CombatStatus[] = [];

  for (const status of statuses) {
    if (combatStatusCatalog[status.type].damageOverTime && status.potency > 0) {
      ticks.push({ type: status.type, damage: status.potency });
    }
    if (status.turns > 1) {
      nextStatuses.push({ ...status, turns: status.turns - 1 });
    }
  }

  return {
    statuses: nextStatuses,
    ticks,
    damage: ticks.reduce((total, tick) => total + tick.damage, 0),
  };
}

