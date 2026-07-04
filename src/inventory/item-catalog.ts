import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type ItemCategory = 'equipment' | 'material' | 'consumable';
export type EquipmentSlot =
  | 'Main Hand'
  | 'Off-hand'
  | 'Helmet'
  | 'Chestplate'
  | 'Gloves'
  | 'Leggings'
  | 'Boots'
  | 'Necklace'
  | 'Ring'
  | 'Material'
  | 'Consumable';

export type EquipmentCombatBonus = {
  maxHp?: number;
  basicDamage?: number;
  skillDamage?: number;
  defense?: number;
};

export type ItemDefinition = {
  name: string;
  rarity: ItemRarity;
  category: ItemCategory;
  slot: EquipmentSlot;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  description: string;
  combatBonus?: EquipmentCombatBonus;
};

export type LootReward = {
  itemKey: ItemKey;
  quantity: number;
};

type LootTableEntry = LootReward & { weight: number };

export const rarityMeta: Record<ItemRarity, { label: string; color: string; rank: number }> = {
  common: { label: 'Common', color: '#8EA0B9', rank: 1 },
  uncommon: { label: 'Uncommon', color: '#68E1A8', rank: 2 },
  rare: { label: 'Rare', color: '#61D4FF', rank: 3 },
  epic: { label: 'Epic', color: '#C68CFF', rank: 4 },
  legendary: { label: 'Legendary', color: '#FFD166', rank: 5 },
  mythic: { label: 'Mythic', color: '#FF647C', rank: 6 },
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
    combatBonus: { maxHp: 4, defense: 1 },
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
    combatBonus: { basicDamage: 1, skillDamage: 1 },
  },
  'ember-core': {
    name: 'Ember Core',
    rarity: 'rare',
    category: 'material',
    slot: 'Material',
    icon: 'star-four-points',
    description: 'A hot core that hints at stronger dungeon crafting.',
  },
  'verdant-spore': {
    name: 'Verdant Spore',
    rarity: 'common',
    category: 'material',
    slot: 'Material',
    icon: 'leaf',
    description: 'A living crafting reagent gathered in Verdant Wilds.',
  },
  'thornhide-boots': {
    name: 'Thornhide Boots',
    rarity: 'uncommon',
    category: 'equipment',
    slot: 'Boots',
    icon: 'shoe-cleat',
    description: 'Flexible wild hide that softens blows from hostile terrain.',
    combatBonus: { maxHp: 6, defense: 1 },
  },
  'heartwood-charm': {
    name: 'Heartwood Charm',
    rarity: 'rare',
    category: 'equipment',
    slot: 'Necklace',
    icon: 'necklace',
    description: 'A pulsing wooden charm that amplifies awakened abilities.',
    combatBonus: { maxHp: 5, skillDamage: 2 },
  },
  'abyssal-scale': {
    name: 'Abyssal Scale',
    rarity: 'common',
    category: 'material',
    slot: 'Material',
    icon: 'fish',
    description: 'A pressure-hardened scale recovered from the Sunken Citadel.',
  },
  'tideglass-amulet': {
    name: 'Tideglass Amulet',
    rarity: 'rare',
    category: 'equipment',
    slot: 'Necklace',
    icon: 'necklace',
    description: 'Deep-water glass that strengthens health and awakened techniques.',
    combatBonus: { maxHp: 10, skillDamage: 3 },
  },
  'obsidian-fragment': {
    name: 'Obsidian Fragment',
    rarity: 'uncommon',
    category: 'material',
    slot: 'Material',
    icon: 'hexagon-multiple',
    description: 'A blackforge shard with heat trapped beneath its surface.',
  },
  'nightguard-plate': {
    name: 'Nightguard Plate',
    rarity: 'epic',
    category: 'equipment',
    slot: 'Chestplate',
    icon: 'tshirt-crew',
    description: 'Obsidian armor built to withstand crushing elite attacks.',
    combatBonus: { maxHp: 16, defense: 4 },
  },
  'frost-sigil': {
    name: 'Frost Sigil',
    rarity: 'rare',
    category: 'material',
    slot: 'Material',
    icon: 'snowflake',
    description: 'A rune that remains frozen outside the Winter Gate.',
  },
  'crownwalker-helm': {
    name: 'Crownwalker Helm',
    rarity: 'epic',
    category: 'equipment',
    slot: 'Helmet',
    icon: 'crown-outline',
    description: 'A royal ice helm that protects focus under extreme pressure.',
    combatBonus: { maxHp: 12, skillDamage: 4, defense: 3 },
  },
  'celestial-thread': {
    name: 'Celestial Thread',
    rarity: 'rare',
    category: 'material',
    slot: 'Material',
    icon: 'creation',
    description: 'A strand of condensed starlight from the Celestial Rift.',
  },
  'riftbound-ring': {
    name: 'Riftbound Ring',
    rarity: 'legendary',
    category: 'equipment',
    slot: 'Ring',
    icon: 'ring',
    description: 'A ring anchored across two dimensions, amplifying every attack form.',
    combatBonus: { basicDamage: 5, skillDamage: 6, defense: 2 },
  },
  'void-crystal': {
    name: 'Void Crystal',
    rarity: 'epic',
    category: 'material',
    slot: 'Material',
    icon: 'hexagram-outline',
    description: 'A stable absence shaped into a Blacksmith material.',
  },
  'voidwalker-blade': {
    name: 'Voidwalker Blade',
    rarity: 'legendary',
    category: 'equipment',
    slot: 'Main Hand',
    icon: 'sword',
    description: 'A superior-rank weapon that cuts through physical and magical defense.',
    combatBonus: { basicDamage: 8, skillDamage: 5 },
  },
  'astral-core': {
    name: 'Astral Core',
    rarity: 'epic',
    category: 'material',
    slot: 'Material',
    icon: 'star-four-points',
    description: 'The condensed heart of an SSS-rank constellation beast.',
  },
  'sovereign-mantle': {
    name: 'Sovereign Mantle',
    rarity: 'legendary',
    category: 'equipment',
    slot: 'Chestplate',
    icon: 'tshirt-crew-outline',
    description: 'Royal astral armor made for hunters who command impossible gates.',
    combatBonus: { maxHp: 24, skillDamage: 7, defense: 5 },
  },
  'eclipse-shard': {
    name: 'Eclipse Shard',
    rarity: 'legendary',
    category: 'material',
    slot: 'Material',
    icon: 'weather-sunset',
    description: 'A fragment holding the final instant before total darkness.',
  },
  'final-gate-crown': {
    name: 'Final Gate Crown',
    rarity: 'mythic',
    category: 'equipment',
    slot: 'Helmet',
    icon: 'crown',
    description: 'A Mythic crown recognized only by gates beyond standard ranking.',
    combatBonus: { maxHp: 30, basicDamage: 8, skillDamage: 10, defense: 6 },
  },
  'dungeon-key': {
    name: 'Dungeon Key',
    rarity: 'rare',
    category: 'material',
    slot: 'Material',
    icon: 'key-variant',
    description: 'A system-issued key earned by defeating a real-life Boss Quest.',
  },
  'boss-quest-chest': {
    name: 'Boss Quest Chest',
    rarity: 'epic',
    category: 'consumable',
    slot: 'Consumable',
    icon: 'treasure-chest',
    description: 'A sealed reward chest granted for completing every boss milestone.',
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

const verdantWildsLootTable: LootTableEntry[] = [
  { itemKey: 'verdant-spore', quantity: 4, weight: 30 },
  { itemKey: 'minor-health-potion', quantity: 2, weight: 18 },
  { itemKey: 'thornhide-boots', quantity: 1, weight: 22 },
  { itemKey: 'focus-crystal', quantity: 2, weight: 14 },
  { itemKey: 'heartwood-charm', quantity: 1, weight: 11 },
  { itemKey: 'ember-core', quantity: 2, weight: 5 },
];

const sunkenCitadelLootTable: LootTableEntry[] = [
  { itemKey: 'abyssal-scale', quantity: 4, weight: 30 },
  { itemKey: 'minor-health-potion', quantity: 2, weight: 16 },
  { itemKey: 'tideglass-amulet', quantity: 1, weight: 20 },
  { itemKey: 'focus-crystal', quantity: 2, weight: 14 },
  { itemKey: 'heartwood-charm', quantity: 1, weight: 10 },
  { itemKey: 'ember-core', quantity: 2, weight: 10 },
];

const obsidianDepthsLootTable: LootTableEntry[] = [
  { itemKey: 'obsidian-fragment', quantity: 4, weight: 30 },
  { itemKey: 'minor-health-potion', quantity: 2, weight: 14 },
  { itemKey: 'nightguard-plate', quantity: 1, weight: 22 },
  { itemKey: 'ember-core', quantity: 2, weight: 16 },
  { itemKey: 'tideglass-amulet', quantity: 1, weight: 10 },
  { itemKey: 'focus-crystal', quantity: 3, weight: 8 },
];

const frozenCrownLootTable: LootTableEntry[] = [
  { itemKey: 'frost-sigil', quantity: 3, weight: 28 },
  { itemKey: 'minor-health-potion', quantity: 2, weight: 14 },
  { itemKey: 'crownwalker-helm', quantity: 1, weight: 22 },
  { itemKey: 'ember-core', quantity: 2, weight: 14 },
  { itemKey: 'nightguard-plate', quantity: 1, weight: 10 },
  { itemKey: 'focus-crystal', quantity: 3, weight: 12 },
];

const celestialRiftLootTable: LootTableEntry[] = [
  { itemKey: 'celestial-thread', quantity: 3, weight: 28 },
  { itemKey: 'minor-health-potion', quantity: 2, weight: 12 },
  { itemKey: 'riftbound-ring', quantity: 1, weight: 15 },
  { itemKey: 'crownwalker-helm', quantity: 1, weight: 18 },
  { itemKey: 'focus-crystal', quantity: 4, weight: 15 },
  { itemKey: 'ember-core', quantity: 3, weight: 12 },
];

const voidBastionLootTable: LootTableEntry[] = [
  { itemKey: 'void-crystal', quantity: 3, weight: 30 },
  { itemKey: 'minor-health-potion', quantity: 3, weight: 10 },
  { itemKey: 'voidwalker-blade', quantity: 1, weight: 15 },
  { itemKey: 'riftbound-ring', quantity: 1, weight: 15 },
  { itemKey: 'celestial-thread', quantity: 3, weight: 16 },
  { itemKey: 'ember-core', quantity: 4, weight: 14 },
];

const astralDominionLootTable: LootTableEntry[] = [
  { itemKey: 'astral-core', quantity: 3, weight: 30 },
  { itemKey: 'minor-health-potion', quantity: 3, weight: 8 },
  { itemKey: 'sovereign-mantle', quantity: 1, weight: 15 },
  { itemKey: 'voidwalker-blade', quantity: 1, weight: 16 },
  { itemKey: 'void-crystal', quantity: 3, weight: 16 },
  { itemKey: 'celestial-thread', quantity: 4, weight: 15 },
];

const finalEclipseLootTable: LootTableEntry[] = [
  { itemKey: 'eclipse-shard', quantity: 3, weight: 30 },
  { itemKey: 'minor-health-potion', quantity: 4, weight: 8 },
  { itemKey: 'final-gate-crown', quantity: 1, weight: 10 },
  { itemKey: 'sovereign-mantle', quantity: 1, weight: 17 },
  { itemKey: 'astral-core', quantity: 3, weight: 18 },
  { itemKey: 'voidwalker-blade', quantity: 1, weight: 17 },
];

const dungeonLootTables: Record<string, LootTableEntry[]> = {
  'ashen-ruins': ashenRuinsLootTable,
  'verdant-wilds': verdantWildsLootTable,
  'sunken-citadel': sunkenCitadelLootTable,
  'obsidian-depths': obsidianDepthsLootTable,
  'frozen-crown': frozenCrownLootTable,
  'celestial-rift': celestialRiftLootTable,
  'void-bastion': voidBastionLootTable,
  'astral-dominion': astralDominionLootTable,
  'final-eclipse': finalEclipseLootTable,
};

export function rollDungeonReward(dungeonKey: string): LootReward {
  const lootTable = dungeonLootTables[dungeonKey] ?? dailyClearLootTable;
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
