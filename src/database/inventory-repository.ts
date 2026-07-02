import type { SQLiteDatabase } from 'expo-sqlite';

import {
  equipmentSlots,
  formatCombatBonus,
  getBlacksmithQuote,
  getCompatibleSlots,
  getSalvageReward,
  scaleCombatBonus,
  UNAWAKENED_LOADOUT,
  type EquipmentSlotKey,
} from '@/src/inventory/equipment';
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
  upgradeLevel: number;
  isLocked: boolean;
  equippedSlots: EquipmentSlotKey[];
  combatBonusLabel: string;
  firstAcquiredAt: string;
  lastAcquiredAt: string;
};

export type EquipmentLoadoutSlot = {
  key: EquipmentSlotKey;
  label: string;
  icon: (typeof equipmentSlots)[number]['icon'];
  item: InventoryItem | null;
};

export type InventoryOverview = {
  items: InventoryItem[];
  gold: number;
  loadout: EquipmentLoadoutSlot[];
};

export type EquipmentCombatBonuses = {
  maxHp: number;
  basicDamage: number;
  skillDamage: number;
  defense: number;
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
  upgradeLevel: number;
  isLocked: number;
  equippedSlots: string | null;
  firstAcquiredAt: string;
  lastAcquiredAt: string;
};

type TotalRow = { total: number };

async function runInTransaction(db: SQLiteDatabase, task: (txn: SQLiteDatabase) => Promise<void>) {
  if (process.env.EXPO_OS === 'web') {
    await db.withTransactionAsync(() => task(db));
  } else {
    await db.withExclusiveTransactionAsync(task);
  }
}

async function getEventId(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ eventId: string }>(
    'SELECT lower(hex(randomblob(16))) AS eventId',
  );
  if (!row?.eventId) throw new Error('Could not create an inventory event.');
  return row.eventId;
}

export async function getInventoryItems(db: SQLiteDatabase): Promise<InventoryItem[]> {
  const rows = await db.getAllAsync<InventoryItemRow>(
    `SELECT
       ii.item_key AS itemKey,
       ii.quantity,
       COALESCE(ep.upgrade_level, 0) AS upgradeLevel,
       COALESCE(ep.is_locked, 0) AS isLocked,
       GROUP_CONCAT(el.slot) AS equippedSlots,
       ii.first_acquired_at AS firstAcquiredAt,
       ii.last_acquired_at AS lastAcquiredAt
     FROM inventory_items ii
     LEFT JOIN equipment_progress ep ON ep.item_key = ii.item_key
     LEFT JOIN equipment_loadouts el
       ON el.item_key = ii.item_key AND el.loadout_key = ?
     WHERE ii.quantity > 0
     GROUP BY ii.item_key
     ORDER BY ii.last_acquired_at DESC`,
    UNAWAKENED_LOADOUT,
  );

  return rows
    .map((row) => {
      const definition = getItemDefinition(row.itemKey);
      return {
        itemKey: row.itemKey,
        ...definition,
        quantity: row.quantity,
        upgradeLevel: row.upgradeLevel,
        isLocked: row.isLocked === 1,
        equippedSlots: (row.equippedSlots?.split(',').filter(Boolean) ?? []) as EquipmentSlotKey[],
        combatBonusLabel:
          definition.category === 'equipment'
            ? formatCombatBonus(definition, row.upgradeLevel)
            : '',
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

export async function getGoldBalance(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<TotalRow>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM gold_events',
  );
  return Math.max(0, row?.total ?? 0);
}

export async function getInventoryOverview(db: SQLiteDatabase): Promise<InventoryOverview> {
  const [items, gold] = await Promise.all([getInventoryItems(db), getGoldBalance(db)]);
  const equippedBySlot = new Map<EquipmentSlotKey, InventoryItem>();
  for (const item of items) {
    for (const slot of item.equippedSlots) equippedBySlot.set(slot, item);
  }

  return {
    items,
    gold,
    loadout: equipmentSlots.map((slot) => ({
      ...slot,
      item: equippedBySlot.get(slot.key) ?? null,
    })),
  };
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
  if (safeQuantity <= 0) throw new Error('Loot quantity must be positive.');

  const result = await db.runAsync(
    `INSERT OR IGNORE INTO loot_events (
       client_event_id,
       source,
       source_ref,
       item_key,
       quantity
     ) VALUES (?, ?, ?, ?, ?)`,
    clientEventId,
    source,
    sourceRef,
    itemKey,
    safeQuantity,
  );

  if (result.changes === 0) return false;

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

  if (getItemDefinition(itemKey).category === 'equipment') {
    await db.runAsync(
      `INSERT OR IGNORE INTO equipment_progress (item_key)
       VALUES (?)`,
      itemKey,
    );
  }

  return true;
}

export async function consumeInventoryItem(
  db: SQLiteDatabase,
  itemKey: string,
  quantity = 1,
) {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const result = await db.runAsync(
    `UPDATE inventory_items
     SET quantity = quantity - ?,
         last_acquired_at = CURRENT_TIMESTAMP
     WHERE item_key = ? AND quantity >= ?`,
    safeQuantity,
    itemKey,
    safeQuantity,
  );

  if (result.changes === 0) throw new Error('The required item is not available.');
}

export async function grantGold(
  db: SQLiteDatabase,
  amount: number,
  reason: string,
  sourceRef: string,
  clientEventId: string,
) {
  const safeAmount = Math.trunc(amount);
  if (safeAmount === 0) throw new Error('Gold event amount cannot be zero.');

  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM gold_events WHERE client_event_id = ?',
    clientEventId,
  );
  if (existing) return false;

  if (safeAmount < 0) {
    const balance = await getGoldBalance(db);
    if (balance < Math.abs(safeAmount)) throw new Error('Not enough Gold.');
  }

  await db.runAsync(
    `INSERT INTO gold_events (client_event_id, amount, reason, source_ref)
     VALUES (?, ?, ?, ?)`,
    clientEventId,
    safeAmount,
    reason,
    sourceRef,
  );
  return true;
}

export async function equipInventoryItem(
  db: SQLiteDatabase,
  itemKey: string,
  loadoutKey = UNAWAKENED_LOADOUT,
) {
  const definition = getItemDefinition(itemKey);
  const compatibleSlots = getCompatibleSlots(definition.slot);
  if (definition.category !== 'equipment' || compatibleSlots.length === 0) {
    throw new Error('This item cannot be equipped.');
  }

  await runInTransaction(db, async (txn) => {
    const quantityRow = await txn.getFirstAsync<{ quantity: number }>(
      'SELECT quantity FROM inventory_items WHERE item_key = ?',
      itemKey,
    );
    if (!quantityRow || quantityRow.quantity <= 0) throw new Error('This item is not in Inventory.');

    const equippedRows = await txn.getAllAsync<{ slot: EquipmentSlotKey; itemKey: string }>(
      `SELECT slot, item_key AS itemKey
       FROM equipment_loadouts
       WHERE loadout_key = ?`,
      loadoutKey,
    );
    const sameItemCount = equippedRows.filter((row) => row.itemKey === itemKey).length;
    if (sameItemCount >= quantityRow.quantity) throw new Error('Every copy is already equipped.');

    const openSlot = compatibleSlots.find(
      (slot) => !equippedRows.some((row) => row.slot === slot),
    );
    const replacementSlot = compatibleSlots.find(
      (slot) => equippedRows.find((row) => row.slot === slot)?.itemKey !== itemKey,
    );
    const targetSlot = openSlot ?? replacementSlot ?? compatibleSlots[0];
    const replacedItem = equippedRows.find((row) => row.slot === targetSlot)?.itemKey;
    const eventId = await getEventId(txn);

    await txn.runAsync(
      `INSERT INTO equipment_loadouts (loadout_key, slot, item_key)
       VALUES (?, ?, ?)
       ON CONFLICT(loadout_key, slot) DO UPDATE SET
         item_key = excluded.item_key,
         equipped_at = CURRENT_TIMESTAMP`,
      loadoutKey,
      targetSlot,
      itemKey,
    );
    if (replacedItem) {
      await txn.runAsync(
        `INSERT INTO equipment_events (
           client_event_id, action, item_key, loadout_key, slot
         ) VALUES (?, 'unequip', ?, ?, ?)`,
        `replace-unequip-${eventId}`,
        replacedItem,
        loadoutKey,
        targetSlot,
      );
    }
    await txn.runAsync(
      `INSERT INTO equipment_events (
         client_event_id, action, item_key, loadout_key, slot
       ) VALUES (?, 'equip', ?, ?, ?)`,
      `equip-${eventId}`,
      itemKey,
      loadoutKey,
      targetSlot,
    );
    await txn.runAsync(
      'INSERT OR IGNORE INTO equipment_progress (item_key) VALUES (?)',
      itemKey,
    );
  });

  return getInventoryOverview(db);
}

export async function unequipLoadoutSlot(
  db: SQLiteDatabase,
  slot: EquipmentSlotKey,
  loadoutKey = UNAWAKENED_LOADOUT,
) {
  await runInTransaction(db, async (txn) => {
    const row = await txn.getFirstAsync<{ itemKey: string }>(
      `SELECT item_key AS itemKey
       FROM equipment_loadouts
       WHERE loadout_key = ? AND slot = ?`,
      loadoutKey,
      slot,
    );
    if (!row) return;

    const eventId = await getEventId(txn);
    await txn.runAsync(
      'DELETE FROM equipment_loadouts WHERE loadout_key = ? AND slot = ?',
      loadoutKey,
      slot,
    );
    await txn.runAsync(
      `INSERT INTO equipment_events (
         client_event_id, action, item_key, loadout_key, slot
       ) VALUES (?, 'unequip', ?, ?, ?)`,
      `unequip-${eventId}`,
      row.itemKey,
      loadoutKey,
      slot,
    );
  });
  return getInventoryOverview(db);
}

export async function toggleEquipmentLock(db: SQLiteDatabase, itemKey: string) {
  const definition = getItemDefinition(itemKey);
  if (definition.category !== 'equipment') throw new Error('Only equipment can be locked.');

  await db.runAsync('INSERT OR IGNORE INTO equipment_progress (item_key) VALUES (?)', itemKey);
  await db.runAsync(
    `UPDATE equipment_progress
     SET is_locked = CASE is_locked WHEN 1 THEN 0 ELSE 1 END,
         updated_at = CURRENT_TIMESTAMP
     WHERE item_key = ?`,
    itemKey,
  );
  return getInventoryOverview(db);
}

export async function upgradeEquipment(db: SQLiteDatabase, itemKey: string) {
  const definition = getItemDefinition(itemKey);
  if (definition.category !== 'equipment') throw new Error('Only equipment can be upgraded.');

  await runInTransaction(db, async (txn) => {
    const row = await txn.getFirstAsync<{ quantity: number; upgradeLevel: number }>(
      `SELECT
         ii.quantity,
         COALESCE(ep.upgrade_level, 0) AS upgradeLevel
       FROM inventory_items ii
       LEFT JOIN equipment_progress ep ON ep.item_key = ii.item_key
       WHERE ii.item_key = ?`,
      itemKey,
    );
    if (!row || row.quantity <= 0) throw new Error('This item is not in Inventory.');

    const quote = getBlacksmithQuote(row.upgradeLevel);
    if (!quote) throw new Error('This item is already at maximum level.');
    const eventId = await getEventId(txn);
    await consumeInventoryItem(txn, quote.materialKey, quote.materialQuantity);
    await grantGold(txn, -quote.goldCost, 'blacksmith_upgrade', itemKey, `upgrade-gold-${eventId}`);
    await txn.runAsync(
      `INSERT INTO equipment_progress (item_key, upgrade_level)
       VALUES (?, ?)
       ON CONFLICT(item_key) DO UPDATE SET
         upgrade_level = excluded.upgrade_level,
         updated_at = CURRENT_TIMESTAMP`,
      itemKey,
      quote.nextLevel,
    );
    await txn.runAsync(
      `INSERT INTO blacksmith_events (
         client_event_id,
         action,
         item_key,
         level_before,
         level_after,
         gold_delta,
         material_key,
         material_delta
       ) VALUES (?, 'upgrade', ?, ?, ?, ?, ?, ?)`,
      `upgrade-${eventId}`,
      itemKey,
      row.upgradeLevel,
      quote.nextLevel,
      -quote.goldCost,
      quote.materialKey,
      -quote.materialQuantity,
    );
  });

  return getInventoryOverview(db);
}

export async function salvageEquipment(db: SQLiteDatabase, itemKey: string) {
  const definition = getItemDefinition(itemKey);
  if (definition.category !== 'equipment') throw new Error('Only equipment can be salvaged.');

  await runInTransaction(db, async (txn) => {
    const row = await txn.getFirstAsync<{
      quantity: number;
      upgradeLevel: number;
      isLocked: number;
      equippedCount: number;
    }>(
      `SELECT
         ii.quantity,
         COALESCE(ep.upgrade_level, 0) AS upgradeLevel,
         COALESCE(ep.is_locked, 0) AS isLocked,
         (
           SELECT COUNT(*)
           FROM equipment_loadouts el
           WHERE el.item_key = ii.item_key
         ) AS equippedCount
       FROM inventory_items ii
       LEFT JOIN equipment_progress ep ON ep.item_key = ii.item_key
       WHERE ii.item_key = ?`,
      itemKey,
    );
    if (!row || row.quantity <= 0) throw new Error('This item is not in Inventory.');
    if (row.isLocked === 1) throw new Error('Unlock this item before salvaging it.');
    if (row.quantity <= row.equippedCount) throw new Error('Unequip an item before salvaging it.');

    const reward = getSalvageReward(definition.rarity);
    const eventId = await getEventId(txn);
    await consumeInventoryItem(txn, itemKey, 1);
    if (row.quantity === 1) {
      await txn.runAsync('DELETE FROM equipment_progress WHERE item_key = ?', itemKey);
    }
    await grantInventoryItem(
      txn,
      reward.materialKey,
      reward.materialQuantity,
      'blacksmith_salvage',
      itemKey,
      `salvage-material-${eventId}`,
    );
    await grantGold(txn, reward.gold, 'blacksmith_salvage', itemKey, `salvage-gold-${eventId}`);
    await txn.runAsync(
      `INSERT INTO blacksmith_events (
         client_event_id,
         action,
         item_key,
         level_before,
         level_after,
         gold_delta,
         material_key,
         material_delta
       ) VALUES (?, 'salvage', ?, ?, NULL, ?, ?, ?)`,
      `salvage-${eventId}`,
      itemKey,
      row.upgradeLevel,
      reward.gold,
      reward.materialKey,
      reward.materialQuantity,
    );
  });

  return getInventoryOverview(db);
}

export async function getEquippedCombatBonuses(
  db: SQLiteDatabase,
  loadoutKey = UNAWAKENED_LOADOUT,
): Promise<EquipmentCombatBonuses> {
  const rows = await db.getAllAsync<{ itemKey: string; upgradeLevel: number }>(
    `SELECT
       el.item_key AS itemKey,
       COALESCE(ep.upgrade_level, 0) AS upgradeLevel
     FROM equipment_loadouts el
     JOIN inventory_items ii ON ii.item_key = el.item_key AND ii.quantity > 0
     LEFT JOIN equipment_progress ep ON ep.item_key = el.item_key
     WHERE el.loadout_key = ?`,
    loadoutKey,
  );
  const total: EquipmentCombatBonuses = {
    maxHp: 0,
    basicDamage: 0,
    skillDamage: 0,
    defense: 0,
  };

  for (const row of rows) {
    const bonus = scaleCombatBonus(getItemDefinition(row.itemKey), row.upgradeLevel);
    total.maxHp += bonus.maxHp;
    total.basicDamage += bonus.basicDamage;
    total.skillDamage += bonus.skillDamage;
    total.defense += bonus.defense;
  }
  return total;
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
  if (!granted) return null;

  const definition = getItemDefinition(reward.itemKey);
  return {
    itemKey: reward.itemKey,
    name: definition.name,
    rarity: definition.rarity,
    quantity: reward.quantity,
  };
}
