import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';
export type ItemCategory = 'equipment' | 'material' | 'consumable';
export type EquipmentSlot =
  | 'Main Hand'
  | 'Off-hand'
  | 'Gloves'
  | 'Ring'
  | 'Material'
  | 'Consumable';

export type ItemDefinition = {
  name: string;
  rarity: ItemRarity;
  category: ItemCategory;
  slot: EquipmentSlot;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  description: string;
};

export type LootReward = {
  itemKey: string;
  quantity: number;
};

type LootTableEntry = LootReward & { weight: number };

export const rarityMeta: Record<ItemRarity, { label: string; color: string; rank: number }> = {
  common: { label: 'Common', color: '#8EA0B9', rank: 1 },
  uncommon: { label: 'Uncommon', color: '#68E1A8', rank: 2 },
  rare: { label: 'Rare', color: '#61D4FF', rank: 3 },
  epic: { label: 'Epic', color: '#C68CFF', rank: 4 },
};

export const itemCatalog = {
  'ash-shard': {
    name: 'Ash Shard',
    rarity: 'common',
    category: 'material',
    slot: 'Material',
    icon: 'cube',
    description: 'Basic crafting residue from low-rank gates.',
  },
  'minor-health-potion': {
    name: 'Minor Health Potion',
    rarity: 'common',
    category: 'consumable',
    slot: 'Consumable',
    icon: 'flask',
    description: 'A simple potion reserved for early dungeon runs.',
  },
  'worn-iron-gloves': {
    name: 'Worn Iron Gloves',
    rarity: 'common',
    category: 'equipment',
    slot: 'Gloves',
    icon: 'shield',
    description: 'Rough starter gear with a small defensive edge.',
  },
  'focus-crystal': {
    name: 'Focus Crystal',
    rarity: 'uncommon',
    category: 'material',
    slot: 'Material',
    icon: 'diamond',
    description: 'A bright fragment used for skill and gear upgrades.',
  },
  'training-ring': {
    name: 'Training Ring',
    rarity: 'uncommon',
    category: 'equipment',
    slot: 'Ring',
    icon: 'ring',
    description: 'A practice ring for the first awakened builds.',
  },
  'ember-core': {
    name: 'Ember Core',
    rarity: 'rare',
    category: 'material',
    slot: 'Material',
    icon: 'star-four-points',
    description: 'A hot core that hints at stronger dungeon crafting.',
  },
} as const satisfies Record<string, ItemDefinition>;

export type ItemKey = keyof typeof itemCatalog;

const dailyClearLootTable: LootTableEntry[] = [
  { itemKey: 'ash-shard', quantity: 2, weight: 34 },
  { itemKey: 'minor-health-potion', quantity: 1, weight: 24 },
  { itemKey: 'worn-iron-gloves', quantity: 1, weight: 14 },
  { itemKey: 'focus-crystal', quantity: 1, weight: 14 },
  { itemKey: 'training-ring', quantity: 1, weight: 10 },
  { itemKey: 'ember-core', quantity: 1, weight: 4 },
];

export function getItemDefinition(itemKey: string): ItemDefinition {
  return (
    itemCatalog[itemKey as ItemKey] ?? {
      name: itemKey,
      rarity: 'common',
      category: 'material',
      slot: 'Material',
      icon: 'cube-outline',
      description: 'Unknown item recovered from local inventory data.',
    }
  );
}

export function rollDailyClearReward(): LootReward {
  const totalWeight = dailyClearLootTable.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of dailyClearLootTable) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { itemKey: entry.itemKey, quantity: entry.quantity };
    }
  }

  const fallback = dailyClearLootTable[0];
  return { itemKey: fallback.itemKey, quantity: fallback.quantity };
}

const ashenRuinsLootTable: LootTableEntry[] = [
  { itemKey: 'ash-shard', quantity: 4, weight: 30 },
  { itemKey: 'minor-health-potion', quantity: 2, weight: 20 },
  { itemKey: 'worn-iron-gloves', quantity: 1, weight: 18 },
  { itemKey: 'focus-crystal', quantity: 2, weight: 16 },
  { itemKey: 'training-ring', quantity: 1, weight: 11 },
  { itemKey: 'ember-core', quantity: 1, weight: 5 },
];

export function rollDungeonReward(dungeonKey: string): LootReward {
  const lootTable = dungeonKey === 'ashen-ruins' ? ashenRuinsLootTable : dailyClearLootTable;
  const totalWeight = lootTable.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of lootTable) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { itemKey: entry.itemKey, quantity: entry.quantity };
    }
  }

  const fallback = lootTable[0];
  return { itemKey: fallback.itemKey, quantity: fallback.quantity };
}
