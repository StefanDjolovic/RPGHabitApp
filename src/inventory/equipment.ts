import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type {
  EquipmentCombatBonus,
  EquipmentSlot,
  ItemDefinition,
  ItemRarity,
} from '@/src/inventory/item-catalog';

export type EquipmentSlotKey =
  | 'main-hand'
  | 'off-hand'
  | 'helmet'
  | 'chestplate'
  | 'gloves'
  | 'leggings'
  | 'boots'
  | 'necklace'
  | 'ring-1'
  | 'ring-2';

export type EquipmentSlotMeta = {
  key: EquipmentSlotKey;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

export type BlacksmithQuote = {
  nextLevel: number;
  maxLevel: number;
  goldCost: number;
  materialKey: 'ash-shard' | 'focus-crystal' | 'ember-core';
  materialQuantity: number;
};

export type SalvageReward = {
  gold: number;
  materialKey: 'ash-shard' | 'focus-crystal' | 'ember-core';
  materialQuantity: number;
};

export const UNAWAKENED_LOADOUT = 'unawakened';
export const MAX_EQUIPMENT_LEVEL = 5;

export const equipmentSlots: EquipmentSlotMeta[] = [
  { key: 'main-hand', label: 'Main Hand', icon: 'sword' },
  { key: 'off-hand', label: 'Off-hand', icon: 'shield-outline' },
  { key: 'helmet', label: 'Helmet', icon: 'roman-numeral-1' },
  { key: 'chestplate', label: 'Chestplate', icon: 'tshirt-crew-outline' },
  { key: 'gloves', label: 'Gloves', icon: 'hand-back-left-outline' },
  { key: 'leggings', label: 'Leggings', icon: 'human-male' },
  { key: 'boots', label: 'Boots', icon: 'shoe-cleat' },
  { key: 'necklace', label: 'Necklace', icon: 'necklace' },
  { key: 'ring-1', label: 'Ring I', icon: 'ring' },
  { key: 'ring-2', label: 'Ring II', icon: 'ring' },
];

const slotMap: Record<Exclude<EquipmentSlot, 'Material' | 'Consumable'>, EquipmentSlotKey[]> = {
  'Main Hand': ['main-hand'],
  'Off-hand': ['off-hand'],
  Helmet: ['helmet'],
  Chestplate: ['chestplate'],
  Gloves: ['gloves'],
  Leggings: ['leggings'],
  Boots: ['boots'],
  Necklace: ['necklace'],
  Ring: ['ring-1', 'ring-2'],
};

const salvageRewards: Record<ItemRarity, SalvageReward> = {
  common: { gold: 6, materialKey: 'ash-shard', materialQuantity: 2 },
  uncommon: { gold: 12, materialKey: 'focus-crystal', materialQuantity: 1 },
  rare: { gold: 22, materialKey: 'ember-core', materialQuantity: 1 },
  epic: { gold: 40, materialKey: 'ember-core', materialQuantity: 2 },
  legendary: { gold: 70, materialKey: 'ember-core', materialQuantity: 3 },
  mythic: { gold: 110, materialKey: 'ember-core', materialQuantity: 5 },
};

export function getCompatibleSlots(slot: EquipmentSlot): EquipmentSlotKey[] {
  if (slot === 'Material' || slot === 'Consumable') return [];
  return slotMap[slot];
}

export function getBlacksmithQuote(currentLevel: number): BlacksmithQuote | null {
  const level = Math.max(0, Math.floor(currentLevel));
  if (level >= MAX_EQUIPMENT_LEVEL) return null;

  const costs: Omit<BlacksmithQuote, 'nextLevel' | 'maxLevel'>[] = [
    { goldCost: 12, materialKey: 'ash-shard', materialQuantity: 2 },
    { goldCost: 20, materialKey: 'ash-shard', materialQuantity: 3 },
    { goldCost: 32, materialKey: 'focus-crystal', materialQuantity: 1 },
    { goldCost: 48, materialKey: 'focus-crystal', materialQuantity: 2 },
    { goldCost: 70, materialKey: 'ember-core', materialQuantity: 1 },
  ];

  return {
    ...costs[level],
    nextLevel: level + 1,
    maxLevel: MAX_EQUIPMENT_LEVEL,
  };
}

export function getSalvageReward(rarity: ItemRarity): SalvageReward {
  return salvageRewards[rarity];
}

export function scaleCombatBonus(
  definition: ItemDefinition,
  upgradeLevel: number,
): Required<EquipmentCombatBonus> {
  const multiplier = 1 + Math.max(0, Math.floor(upgradeLevel));
  return {
    maxHp: (definition.combatBonus?.maxHp ?? 0) * multiplier,
    basicDamage: (definition.combatBonus?.basicDamage ?? 0) * multiplier,
    skillDamage: (definition.combatBonus?.skillDamage ?? 0) * multiplier,
    defense: (definition.combatBonus?.defense ?? 0) * multiplier,
  };
}

export function formatCombatBonus(definition: ItemDefinition, upgradeLevel: number) {
  const bonus = scaleCombatBonus(definition, upgradeLevel);
  const parts = [
    bonus.maxHp > 0 ? `+${bonus.maxHp} HP` : '',
    bonus.basicDamage > 0 ? `+${bonus.basicDamage} Attack` : '',
    bonus.skillDamage > 0 ? `+${bonus.skillDamage} Skill` : '',
    bonus.defense > 0 ? `+${bonus.defense} Defense` : '',
  ].filter(Boolean);
  return parts.join('  |  ');
}
