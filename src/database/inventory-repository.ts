import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getItemDefinition,
  rarityMeta,
  rollDailyClearReward,
  type ItemCategory,
  type ItemRarity,
} from '@/src/inventory/item-catalog';

export type InventoryItem = {
  itemKey: string;
  name: string;
  rarity: ItemRarity;
  category: ItemCategory;
  slot: string;
  icon: ReturnType<typeof getItemDefinition>['icon'];
  description: string;
  quantity: number;
  firstAcquiredAt: string;
  lastAcquiredAt: string;
};

export type GrantedLoot = {
  itemKey: string;
  name: string;
  rarity: ItemRarity;
  quantity: number;
};

type InventoryItemRow = {
  itemKey: string;
  quantity: number;
  firstAcquiredAt: string;
  lastAcquiredAt: string;
};

export async function getInventoryItems(db: SQLiteDatabase): Promise<InventoryItem[]> {
  const rows = await db.getAllAsync<InventoryItemRow>(
    `SELECT
       item_key AS itemKey,
       quantity,
       first_acquired_at AS firstAcquiredAt,
       last_acquired_at AS lastAcquiredAt
     FROM inventory_items
     WHERE quantity > 0`,
  );

  return rows
    .map((row) => {
      const definition = getItemDefinition(row.itemKey);
      return {
        itemKey: row.itemKey,
        ...definition,
        quantity: row.quantity,
        firstAcquiredAt: row.firstAcquiredAt,
        lastAcquiredAt: row.lastAcquiredAt,
      };
    })
    .sort((first, second) => {
      const rarityDelta = rarityMeta[second.rarity].rank - rarityMeta[first.rarity].rank;
      if (rarityDelta !== 0) return rarityDelta;
      return second.lastAcquiredAt.localeCompare(first.lastAcquiredAt);
    });
}

export async function grantInventoryItem(
  db: SQLiteDatabase,
  itemKey: string,
  quantity: number,
  source: string,
  sourceRef: string,
  clientEventId: string,
) {
  const safeQuantity = Math.floor(quantity);
  if (safeQuantity <= 0) {
    throw new Error('Loot quantity must be positive.');
  }

  const result = await db.runAsync(
    `INSERT OR IGNORE INTO loot_events (
       client_event_id,
       source,
       source_ref,
       item_key,
       quantity
     )
     VALUES (?, ?, ?, ?, ?)`,
    clientEventId,
    source,
    sourceRef,
    itemKey,
    safeQuantity,
  );

  if (result.changes === 0) {
    return false;
  }

  await db.runAsync(
    `INSERT OR IGNORE INTO inventory_items (item_key, quantity)
     VALUES (?, 0)`,
    itemKey,
  );
  await db.runAsync(
    `UPDATE inventory_items
     SET quantity = quantity + ?,
         last_acquired_at = CURRENT_TIMESTAMP
     WHERE item_key = ?`,
    safeQuantity,
    itemKey,
  );

  return true;
}

export async function grantDailyClearReward(
  db: SQLiteDatabase,
  dateKey: string,
): Promise<GrantedLoot | null> {
  const reward = rollDailyClearReward();
  const granted = await grantInventoryItem(
    db,
    reward.itemKey,
    reward.quantity,
    'daily_clear',
    dateKey,
    `daily-clear-${dateKey}`,
  );

  if (!granted) {
    return null;
  }

  const definition = getItemDefinition(reward.itemKey);
  return {
    itemKey: reward.itemKey,
    name: definition.name,
    rarity: definition.rarity,
    quantity: reward.quantity,
  };
}
