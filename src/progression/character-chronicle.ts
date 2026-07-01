import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getItemDefinition, rarityMeta } from '@/src/inventory/item-catalog';
import { getLevelProgress } from '@/src/progression/player-progression';

export type ChronicleEventType =
  | 'journey'
  | 'level'
  | 'recovery'
  | 'boss'
  | 'dungeon'
  | 'loot';

export type ChronicleEvent = {
  id: string;
  type: ChronicleEventType;
  title: string;
  detail: string;
  occurredAt: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
};

type XpTimelineRow = {
  eventId: string;
  occurredAt: string;
  amount: number;
};
type ProfileCreatedRow = { createdAt: string };
type RecoveryRow = { id: number; missedDays: number; completedAt: string };
type BossRow = { id: number; title: string; completedAt: string };
type DungeonRow = {
  id: number;
  dungeonName: string;
  status: 'cleared' | 'failed';
  rewardItemKey: string | null;
  rewardQuantity: number | null;
  completedAt: string;
};
type LootRow = {
  id: number;
  itemKey: string;
  quantity: number;
  createdAt: string;
};

function getLevelEvents(rows: XpTimelineRow[]) {
  const events: ChronicleEvent[] = [];
  let totalXp = 0;
  let level = 1;

  for (const row of rows) {
    totalXp = Math.max(0, totalXp + row.amount);
    const nextLevel = getLevelProgress(totalXp).level;
    while (level < nextLevel) {
      level += 1;
      events.push({
        id: `level-${level}-${row.eventId}`,
        type: 'level',
        title: `Level ${level} reached`,
        detail: 'Player progression milestone achieved.',
        occurredAt: row.occurredAt,
        icon: 'arrow-up-bold-hexagon-outline',
        accent: '#FFD27A',
      });
    }
  }
  return events;
}

export async function getCharacterChronicle(db: SQLiteDatabase): Promise<ChronicleEvent[]> {
  const [profile, xpRows, recoveryRows, bossRows, dungeonRows, lootRows] = await Promise.all([
    db.getFirstAsync<ProfileCreatedRow>(
      'SELECT created_at AS createdAt FROM player_profile WHERE id = 1',
    ),
    db.getAllAsync<XpTimelineRow>(
      `SELECT eventId, occurredAt, amount
       FROM (
         SELECT
           client_event_id AS eventId,
           created_at AS occurredAt,
           amount,
           1 AS sourceOrder,
           id AS eventSequence
         FROM xp_events
         UNION ALL
         SELECT
           client_event_id AS eventId,
           created_at AS occurredAt,
           xp_amount AS amount,
           2 AS sourceOrder,
           id AS eventSequence
         FROM boss_quest_reward_events
         UNION ALL
         SELECT
           client_event_id AS eventId,
           completed_at AS occurredAt,
           xp_amount AS amount,
           3 AS sourceOrder,
           id AS eventSequence
         FROM recovery_quest_events
       )
       ORDER BY occurredAt ASC, sourceOrder ASC, eventSequence ASC`,
    ),
    db.getAllAsync<RecoveryRow>(
      `SELECT id, missed_days AS missedDays, completed_at AS completedAt
       FROM recovery_quest_events`,
    ),
    db.getAllAsync<BossRow>(
      `SELECT id, title, completed_at AS completedAt
       FROM boss_quests
       WHERE status = 'completed' AND completed_at IS NOT NULL`,
    ),
    db.getAllAsync<DungeonRow>(
      `SELECT
         id,
         dungeon_name AS dungeonName,
         status,
         reward_item_key AS rewardItemKey,
         reward_quantity AS rewardQuantity,
         completed_at AS completedAt
       FROM dungeon_runs`,
    ),
    db.getAllAsync<LootRow>(
      `SELECT id, item_key AS itemKey, quantity, created_at AS createdAt
       FROM loot_events`,
    ),
  ]);
  const events = getLevelEvents(xpRows);

  if (profile) {
    events.push({
      id: 'journey-began',
      type: 'journey',
      title: 'Hunter journey began',
      detail: 'Local hunter record created.',
      occurredAt: profile.createdAt,
      icon: 'flag-variant-outline',
      accent: '#B493FF',
    });
  }

  for (const recovery of recoveryRows) {
    events.push({
      id: `recovery-${recovery.id}`,
      type: 'recovery',
      title: 'Second Wind',
      detail: `Recovery Quest completed after ${recovery.missedDays} missed ${
        recovery.missedDays === 1 ? 'day' : 'days'
      }.`,
      occurredAt: recovery.completedAt,
      icon: 'weather-windy',
      accent: '#7EE7FF',
    });
  }

  for (const boss of bossRows) {
    events.push({
      id: `boss-${boss.id}`,
      type: 'boss',
      title: 'Boss Quest defeated',
      detail: boss.title,
      occurredAt: boss.completedAt,
      icon: 'skull-crossbones-outline',
      accent: '#FF8FC7',
    });
  }

  for (const dungeon of dungeonRows) {
    const reward = dungeon.rewardItemKey
      ? getItemDefinition(dungeon.rewardItemKey)
      : null;
    events.push({
      id: `dungeon-${dungeon.id}`,
      type: 'dungeon',
      title: dungeon.status === 'cleared' ? 'Dungeon cleared' : 'Dungeon attempt ended',
      detail:
        dungeon.status === 'cleared' && reward
          ? `${dungeon.dungeonName} - ${dungeon.rewardQuantity ?? 1}x ${reward.name}`
          : dungeon.dungeonName,
      occurredAt: dungeon.completedAt,
      icon: dungeon.status === 'cleared' ? 'gate-open' : 'gate-alert',
      accent: dungeon.status === 'cleared' ? '#68E1A8' : '#8E96AE',
    });
  }

  for (const loot of lootRows) {
    const item = getItemDefinition(loot.itemKey);
    if (rarityMeta[item.rarity].rank < rarityMeta.rare.rank) continue;
    events.push({
      id: `loot-${loot.id}`,
      type: 'loot',
      title: `${rarityMeta[item.rarity].label} loot acquired`,
      detail: `${loot.quantity}x ${item.name}`,
      occurredAt: loot.createdAt,
      icon: item.icon,
      accent: rarityMeta[item.rarity].color,
    });
  }

  return events
    .sort((first, second) => second.occurredAt.localeCompare(first.occurredAt))
    .slice(0, 20);
}
