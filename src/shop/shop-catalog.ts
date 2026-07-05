import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { ItemKey } from '@/src/inventory/item-catalog';
import type { RankKey } from '@/src/progression/rank-catalog';

export type ShopReward = {
  itemKey: ItemKey;
  quantity: number;
};

export type ShopOfferDefinition = {
  key: string;
  name: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  price: number;
  dailyLimit: number;
  requiredRank: RankKey;
  rewards: ShopReward[];
};

export const shopOffers: ShopOfferDefinition[] = [
  {
    key: 'field-medic-kit',
    name: 'Field Medic Kit',
    description: 'Emergency healing supplies for difficult dungeon rooms.',
    icon: 'medical-bag',
    accent: '#68E1A8',
    price: 20,
    dailyLimit: 3,
    requiredRank: 'unawakened',
    rewards: [{ itemKey: 'minor-health-potion', quantity: 2 }],
  },
  {
    key: 'ash-cache',
    name: 'Ash Cache',
    description: 'Starter Blacksmith materials recovered from low-rank gates.',
    icon: 'package-variant-closed',
    accent: '#A7B2C6',
    price: 25,
    dailyLimit: 2,
    requiredRank: 'unawakened',
    rewards: [{ itemKey: 'ash-shard', quantity: 5 }],
  },
  {
    key: 'focus-crystal',
    name: 'Focus Crystal',
    description: 'A controlled crystal for mid-stage equipment forging.',
    icon: 'diamond-stone',
    accent: '#61D4FF',
    price: 32,
    dailyLimit: 2,
    requiredRank: 'e_rank',
    rewards: [{ itemKey: 'focus-crystal', quantity: 1 }],
  },
  {
    key: 'ember-core',
    name: 'Ember Core',
    description: 'Rare forging fuel reserved for awakened hunters.',
    icon: 'fire-circle',
    accent: '#FF9A62',
    price: 75,
    dailyLimit: 1,
    requiredRank: 'd_rank',
    rewards: [{ itemKey: 'ember-core', quantity: 1 }],
  },
  {
    key: 'forge-supply-crate',
    name: 'Forge Supply Crate',
    description: 'A balanced resupply for healing and early equipment upgrades.',
    icon: 'treasure-chest-outline',
    accent: '#FFD166',
    price: 95,
    dailyLimit: 1,
    requiredRank: 'd_rank',
    rewards: [
      { itemKey: 'minor-health-potion', quantity: 1 },
      { itemKey: 'ash-shard', quantity: 3 },
      { itemKey: 'focus-crystal', quantity: 2 },
    ],
  },
  {
    key: 'elite-core-cache',
    name: 'Elite Core Cache',
    description: 'High-grade materials for the final Blacksmith upgrade stages.',
    icon: 'hexagram-outline',
    accent: '#C68CFF',
    price: 180,
    dailyLimit: 1,
    requiredRank: 'b_rank',
    rewards: [
      { itemKey: 'focus-crystal', quantity: 2 },
      { itemKey: 'ember-core', quantity: 2 },
    ],
  },
];

export function getShopOffer(offerKey: string) {
  return shopOffers.find((offer) => offer.key === offerKey) ?? null;
}
