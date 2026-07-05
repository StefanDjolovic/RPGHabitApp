import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getGoldBalance,
  grantGold,
  grantInventoryItem,
} from '@/src/database/inventory-repository';
import { getItemDefinition } from '@/src/inventory/item-catalog';
import { getRankDefinition, getRankOrder } from '@/src/progression/rank-catalog';
import { getShopOffer, shopOffers, type ShopOfferDefinition } from '@/src/shop/shop-catalog';

export type ShopOffer = ShopOfferDefinition & {
  purchasedToday: number;
  remainingToday: number;
  unlocked: boolean;
  canAfford: boolean;
  requiredRankLabel: string;
  rewardSummary: string;
  ownedSummary: string;
};

export type ShopPurchase = {
  id: number;
  offerName: string;
  goldSpent: number;
  purchasedAt: string;
};

export type ShopOverview = {
  gold: number;
  currentRankLabel: string;
  offers: ShopOffer[];
  recentPurchases: ShopPurchase[];
};

type CountRow = { offerKey: string; total: number };
type QuantityRow = { itemKey: string; quantity: number };

async function runInTransaction(db: SQLiteDatabase, task: (txn: SQLiteDatabase) => Promise<void>) {
  if (process.env.EXPO_OS === 'web') await db.withTransactionAsync(() => task(db));
  else await db.withExclusiveTransactionAsync(task);
}

async function getEventId(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ eventId: string }>(
    'SELECT lower(hex(randomblob(16))) AS eventId',
  );
  if (!row?.eventId) throw new Error('Could not create a Shop purchase.');
  return row.eventId;
}

export async function getShopOverview(db: SQLiteDatabase): Promise<ShopOverview> {
  const [gold, rankRow, countRows, quantityRows, recentPurchases] = await Promise.all([
    getGoldBalance(db),
    db.getFirstAsync<{ rankKey: string }>(
      'SELECT current_rank_key AS rankKey FROM player_rank_state WHERE id = 1',
    ),
    db.getAllAsync<CountRow>(
      `SELECT offer_key AS offerKey, COUNT(*) AS total
       FROM shop_purchase_events
       WHERE date(purchased_at, 'localtime') = date('now', 'localtime')
       GROUP BY offer_key`,
    ),
    db.getAllAsync<QuantityRow>(
      'SELECT item_key AS itemKey, quantity FROM inventory_items WHERE quantity > 0',
    ),
    db.getAllAsync<ShopPurchase>(
      `SELECT
         id,
         offer_name AS offerName,
         gold_spent AS goldSpent,
         purchased_at AS purchasedAt
       FROM shop_purchase_events
       ORDER BY id DESC
       LIMIT 5`,
    ),
  ]);
  const currentRank = getRankDefinition(rankRow?.rankKey ?? 'unawakened');
  const currentRankOrder = getRankOrder(currentRank.key);
  const countByOffer = new Map(countRows.map((row) => [row.offerKey, row.total]));
  const quantityByItem = new Map(quantityRows.map((row) => [row.itemKey, row.quantity]));

  return {
    gold,
    currentRankLabel: currentRank.label,
    recentPurchases,
    offers: shopOffers.map((offer) => {
      const purchasedToday = countByOffer.get(offer.key) ?? 0;
      return {
        ...offer,
        purchasedToday,
        remainingToday: Math.max(0, offer.dailyLimit - purchasedToday),
        unlocked: currentRankOrder >= getRankOrder(offer.requiredRank),
        canAfford: gold >= offer.price,
        requiredRankLabel: getRankDefinition(offer.requiredRank).label,
        rewardSummary: offer.rewards
          .map((reward) => `${reward.quantity}x ${getItemDefinition(reward.itemKey).name}`)
          .join(' + '),
        ownedSummary: offer.rewards
          .map((reward) => `${quantityByItem.get(reward.itemKey) ?? 0} ${getItemDefinition(reward.itemKey).name}`)
          .join(' | '),
      };
    }),
  };
}

export async function purchaseShopOffer(db: SQLiteDatabase, offerKey: string) {
  const offer = getShopOffer(offerKey);
  if (!offer) throw new Error('This Shop offer does not exist.');

  await runInTransaction(db, async (txn) => {
    const rankRow = await txn.getFirstAsync<{ rankKey: string }>(
      'SELECT current_rank_key AS rankKey FROM player_rank_state WHERE id = 1',
    );
    const purchaseCount = await txn.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM shop_purchase_events
       WHERE offer_key = ?
         AND date(purchased_at, 'localtime') = date('now', 'localtime')`,
      offer.key,
    );
    if (getRankOrder(rankRow?.rankKey ?? 'unawakened') < getRankOrder(offer.requiredRank)) {
      throw new Error(`${getRankDefinition(offer.requiredRank).label} is required for this offer.`);
    }
    if ((purchaseCount?.total ?? 0) >= offer.dailyLimit) {
      throw new Error('This offer is sold out until tomorrow.');
    }

    const eventId = await getEventId(txn);
    await grantGold(txn, -offer.price, 'shop_purchase', offer.key, `shop-gold-${eventId}`);
    for (const [index, reward] of offer.rewards.entries()) {
      await grantInventoryItem(
        txn,
        reward.itemKey,
        reward.quantity,
        'hunter_shop',
        eventId,
        `shop-loot-${eventId}-${index}`,
      );
    }
    await txn.runAsync(
      `INSERT INTO shop_purchase_events (
         client_event_id, offer_key, offer_name, gold_spent
       ) VALUES (?, ?, ?, ?)`,
      `shop-purchase-${eventId}`,
      offer.key,
      offer.name,
      offer.price,
    );
  });
}
