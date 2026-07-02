import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  equipInventoryItem,
  getInventoryOverview,
  salvageEquipment,
  toggleEquipmentLock,
  unequipLoadoutSlot,
  upgradeEquipment,
  type InventoryItem,
  type InventoryOverview,
} from '@/src/database/inventory-repository';
import {
  equipmentSlots,
  getBlacksmithQuote,
  getSalvageReward,
  type EquipmentSlotKey,
} from '@/src/inventory/equipment';
import { getItemDefinition, rarityMeta, type ItemRarity } from '@/src/inventory/item-catalog';

type InventoryView = 'vault' | 'loadout' | 'smith';

const initialOverview: InventoryOverview = {
  items: [],
  gold: 0,
  loadout: equipmentSlots.map((slot) => ({ ...slot, item: null })),
};

const categoryLabels: Record<InventoryItem['category'], string> = {
  equipment: 'Equipment',
  material: 'Material',
  consumable: 'Consumable',
};

const viewMeta: Record<
  InventoryView,
  { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  vault: { label: 'Vault', icon: 'treasure-chest-outline' },
  loadout: { label: 'Loadout', icon: 'shield-sword-outline' },
  smith: { label: 'Smith', icon: 'anvil' },
};

function formatRarity(rarity: ItemRarity) {
  return rarityMeta[rarity].label.toUpperCase();
}

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const [overview, setOverview] = useState<InventoryOverview>(initialOverview);
  const [selectedView, setSelectedView] = useState<InventoryView>('vault');
  const [loading, setLoading] = useState(true);
  const [updatingItemKey, setUpdatingItemKey] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      setOverview(await getInventoryOverview(db));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadInventory();
    }, [loadInventory]),
  );

  const equipment = useMemo(
    () => overview.items.filter((item) => item.category === 'equipment'),
    [overview.items],
  );
  const summary = useMemo(() => {
    const totalQuantity = overview.items.reduce((sum, item) => sum + item.quantity, 0);
    const equippedSlots = overview.loadout.filter((slot) => slot.item !== null).length;
    const upgradeLevels = equipment.reduce((sum, item) => sum + item.upgradeLevel, 0);
    return { totalQuantity, equippedSlots, upgradeLevels };
  }, [equipment, overview.items, overview.loadout]);

  const runItemAction = async (
    itemKey: string,
    action: () => Promise<InventoryOverview>,
  ) => {
    if (updatingItemKey) return;
    setUpdatingItemKey(itemKey);
    try {
      setOverview(await action());
      if (process.env.EXPO_OS === 'ios') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      Alert.alert(
        'Inventory action failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setUpdatingItemKey(null);
    }
  };

  const unequipSlot = async (slot: EquipmentSlotKey) => {
    if (updatingItemKey) return;
    setUpdatingItemKey(slot);
    try {
      setOverview(await unequipLoadoutSlot(db, slot));
    } catch (error) {
      Alert.alert('Could not unequip item', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setUpdatingItemKey(null);
    }
  };

  const confirmSalvage = (item: InventoryItem) => {
    const reward = getSalvageReward(item.rarity);
    const material = getItemDefinition(reward.materialKey);
    Alert.alert(
      `Salvage ${item.name}?`,
      `You will receive ${reward.gold} Gold and ${reward.materialQuantity}x ${material.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Salvage',
          style: 'destructive',
          onPress: () =>
            void runItemAction(item.itemKey, () => salvageEquipment(db, item.itemKey)),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <View style={styles.systemRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.systemLabel}>ITEM STORAGE</Text>
            </View>
            <Text style={styles.heading}>Inventory</Text>
          </View>
          <View style={styles.goldBadge}>
            <MaterialCommunityIcons name="circle-multiple" size={18} color="#FFD27A" />
            <Text style={styles.goldValue}>{overview.gold}</Text>
            <Text style={styles.goldLabel}>Gold</Text>
          </View>
        </View>

        <LinearGradient
          colors={['#342719', '#172033', '#0D1220']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.summaryPanel}>
          <View style={styles.summaryTitleRow}>
            <View>
              <Text style={styles.summaryEyebrow}>UNAWAKENED ARMORY</Text>
              <Text style={styles.summaryTitle}>
                {summary.totalQuantity > 0 ? `${summary.totalQuantity} stored items` : 'Vault empty'}
              </Text>
            </View>
            <MaterialCommunityIcons name="shield-sword-outline" size={29} color="#8DEAFF" />
          </View>
          <View style={styles.statGrid}>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{overview.items.length}</Text>
              <Text style={styles.statLabel}>Stacks</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{summary.equippedSlots}</Text>
              <Text style={styles.statLabel}>Equipped</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>+{summary.upgradeLevels}</Text>
              <Text style={styles.statLabel}>Forge levels</Text>
            </View>
          </View>
        </LinearGradient>

        <View accessibilityRole="tablist" style={styles.segmentedControl}>
          {(Object.keys(viewMeta) as InventoryView[]).map((view) => {
            const selected = selectedView === view;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={view}
                onPress={() => setSelectedView(view)}
                style={[styles.segmentButton, selected && styles.segmentButtonSelected]}>
                <MaterialCommunityIcons
                  name={viewMeta[view].icon}
                  size={16}
                  color={selected ? '#071018' : '#858DA6'}
                />
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                  {viewMeta[view].label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#FFD27A" />
            <Text style={styles.loadingText}>Scanning vault...</Text>
          </View>
        ) : null}

        {!loading && selectedView === 'vault' ? (
          <VaultView
            items={overview.items}
            onEquip={(item) =>
              void runItemAction(item.itemKey, () => equipInventoryItem(db, item.itemKey))
            }
            onLock={(item) =>
              void runItemAction(item.itemKey, () => toggleEquipmentLock(db, item.itemKey))
            }
            updatingItemKey={updatingItemKey}
          />
        ) : null}

        {!loading && selectedView === 'loadout' ? (
          <LoadoutView
            loadout={overview.loadout}
            onUnequip={(slot) => void unequipSlot(slot)}
            updatingItemKey={updatingItemKey}
          />
        ) : null}

        {!loading && selectedView === 'smith' ? (
          <BlacksmithView
            equipment={equipment}
            gold={overview.gold}
            items={overview.items}
            onLock={(item) =>
              void runItemAction(item.itemKey, () => toggleEquipmentLock(db, item.itemKey))
            }
            onSalvage={confirmSalvage}
            onUpgrade={(item) =>
              void runItemAction(item.itemKey, () => upgradeEquipment(db, item.itemKey))
            }
            updatingItemKey={updatingItemKey}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyVault() {
  return (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="treasure-chest-outline" size={38} color="#FFD27A" />
      <Text style={styles.emptyTitle}>No loot stored yet</Text>
      <Text style={styles.emptyText}>Daily Clears, Boss Quests and dungeons will fill this vault.</Text>
      <Pressable
        onPress={() => router.push('/' as Href)}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
        <MaterialCommunityIcons name="view-dashboard" size={17} color="#071018" />
        <Text style={styles.primaryButtonText}>Open Today</Text>
      </Pressable>
    </View>
  );
}

function VaultView({
  items,
  updatingItemKey,
  onEquip,
  onLock,
}: {
  items: InventoryItem[];
  updatingItemKey: string | null;
  onEquip: (item: InventoryItem) => void;
  onLock: (item: InventoryItem) => void;
}) {
  if (items.length === 0) return <EmptyVault />;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>VAULT</Text>
        <Text style={styles.sectionTitle}>Stored rewards</Text>
      </View>
      <View style={styles.itemList}>
        {items.map((item) => {
          const rarity = rarityMeta[item.rarity];
          const fullyEquipped =
            item.category === 'equipment' && item.equippedSlots.length >= item.quantity;
          const updating = updatingItemKey === item.itemKey;
          return (
            <View key={item.itemKey} style={styles.itemCard}>
              <View style={styles.itemMainRow}>
                <View style={[styles.itemIcon, { borderColor: `${rarity.color}66` }]}>
                  <MaterialCommunityIcons name={item.icon} size={25} color={rarity.color} />
                </View>
                <View style={styles.itemBody}>
                  <View style={styles.itemTitleRow}>
                    <Text numberOfLines={1} style={styles.itemName}>
                      {item.name}{item.upgradeLevel > 0 ? ` +${item.upgradeLevel}` : ''}
                    </Text>
                    <Text style={[styles.itemRarity, { color: rarity.color }]}>
                      {formatRarity(item.rarity)}
                    </Text>
                  </View>
                  <Text numberOfLines={2} style={styles.itemDescription}>{item.description}</Text>
                  <View style={styles.itemMetaRow}>
                    <Text style={styles.itemMeta}>{categoryLabels[item.category]}</Text>
                    <View style={styles.itemMetaDot} />
                    <Text style={styles.itemMeta}>{item.slot}</Text>
                    <View style={styles.quantityBadge}>
                      <Text style={styles.quantityText}>x{item.quantity}</Text>
                    </View>
                  </View>
                  {item.combatBonusLabel ? (
                    <Text style={styles.bonusText}>{item.combatBonusLabel}</Text>
                  ) : null}
                </View>
              </View>

              {item.category === 'equipment' ? (
                <View style={styles.itemActionRow}>
                  <Pressable
                    accessibilityLabel={item.isLocked ? `Unlock ${item.name}` : `Lock ${item.name}`}
                    disabled={updating}
                    onPress={() => onLock(item)}
                    style={({ pressed }) => [styles.iconActionButton, pressed && styles.buttonPressed]}>
                    <MaterialCommunityIcons
                      name={item.isLocked ? 'lock' : 'lock-open-outline'}
                      size={17}
                      color={item.isLocked ? '#FFD27A' : '#8A92A9'}
                    />
                  </Pressable>
                  <View style={styles.equippedLabel}>
                    <MaterialCommunityIcons name="shield-check-outline" size={15} color="#70DFA7" />
                    <Text style={styles.equippedText}>
                      {item.equippedSlots.length > 0
                        ? `${item.equippedSlots.length} equipped`
                        : 'Stored'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Equip ${item.name}`}
                    disabled={updating || fullyEquipped}
                    onPress={() => onEquip(item)}
                    style={({ pressed }) => [
                      styles.smallPrimaryButton,
                      fullyEquipped && styles.disabledButton,
                      pressed && !fullyEquipped && styles.buttonPressed,
                    ]}>
                    {updating ? (
                      <ActivityIndicator color="#071018" size="small" />
                    ) : (
                      <MaterialCommunityIcons name="shield-plus-outline" size={16} color="#071018" />
                    )}
                    <Text style={styles.smallPrimaryText}>{fullyEquipped ? 'Equipped' : 'Equip'}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function LoadoutView({
  loadout,
  updatingItemKey,
  onUnequip,
}: {
  loadout: InventoryOverview['loadout'];
  updatingItemKey: string | null;
  onUnequip: (slot: EquipmentSlotKey) => void;
}) {
  const equippedCount = loadout.filter((slot) => slot.item).length;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View>
          <Text style={styles.sectionEyebrow}>UNAWAKENED LOADOUT</Text>
          <Text style={styles.sectionTitle}>Equipped gear</Text>
        </View>
        <Text style={styles.slotCount}>{equippedCount} / {loadout.length}</Text>
      </View>
      <View style={styles.loadoutGrid}>
        {loadout.map((slot) => {
          const rarity = slot.item ? rarityMeta[slot.item.rarity] : null;
          return (
            <View key={slot.key} style={[styles.slotCard, slot.item && styles.slotCardFilled]}>
              <View style={styles.slotTopRow}>
                <View style={styles.slotIcon}>
                  <MaterialCommunityIcons
                    name={slot.item?.icon ?? slot.icon}
                    size={22}
                    color={rarity?.color ?? '#555D73'}
                  />
                </View>
                {slot.item ? (
                  <Pressable
                    accessibilityLabel={`Unequip ${slot.item.name}`}
                    disabled={updatingItemKey === slot.key}
                    onPress={() => onUnequip(slot.key)}
                    style={({ pressed }) => [styles.slotRemoveButton, pressed && styles.buttonPressed]}>
                    <MaterialCommunityIcons name="close" size={16} color="#B67A91" />
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.slotLabel}>{slot.label}</Text>
              <Text numberOfLines={1} style={[styles.slotItemName, !slot.item && styles.slotEmptyText]}>
                {slot.item
                  ? `${slot.item.name}${slot.item.upgradeLevel > 0 ? ` +${slot.item.upgradeLevel}` : ''}`
                  : 'Empty'}
              </Text>
              {slot.item?.combatBonusLabel ? (
                <Text numberOfLines={2} style={styles.slotBonus}>{slot.item.combatBonusLabel}</Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function BlacksmithView({
  equipment,
  items,
  gold,
  updatingItemKey,
  onUpgrade,
  onSalvage,
  onLock,
}: {
  equipment: InventoryItem[];
  items: InventoryItem[];
  gold: number;
  updatingItemKey: string | null;
  onUpgrade: (item: InventoryItem) => void;
  onSalvage: (item: InventoryItem) => void;
  onLock: (item: InventoryItem) => void;
}) {
  if (equipment.length === 0) {
    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons name="anvil" size={38} color="#8E96AA" />
        <Text style={styles.emptyTitle}>No equipment to forge</Text>
        <Text style={styles.emptyText}>Recover equipment from Daily Clears and dungeon chests.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>BLACKSMITH</Text>
        <Text style={styles.sectionTitle}>Forge and salvage</Text>
      </View>
      <View style={styles.itemList}>
        {equipment.map((item) => {
          const rarity = rarityMeta[item.rarity];
          const quote = getBlacksmithQuote(item.upgradeLevel);
          const materialQuantity = quote
            ? items.find((candidate) => candidate.itemKey === quote.materialKey)?.quantity ?? 0
            : 0;
          const materialName = quote ? getItemDefinition(quote.materialKey).name : '';
          const canUpgrade =
            quote !== null && gold >= quote.goldCost && materialQuantity >= quote.materialQuantity;
          const salvage = getSalvageReward(item.rarity);
          const canSalvage = !item.isLocked && item.quantity > item.equippedSlots.length;
          const updating = updatingItemKey === item.itemKey;

          return (
            <View key={item.itemKey} style={styles.smithCard}>
              <View style={styles.smithHeader}>
                <View style={[styles.itemIcon, { borderColor: `${rarity.color}66` }]}>
                  <MaterialCommunityIcons name={item.icon} size={25} color={rarity.color} />
                </View>
                <View style={styles.smithTitleBody}>
                  <Text numberOfLines={1} style={styles.itemName}>{item.name}</Text>
                  <Text style={[styles.itemRarity, { color: rarity.color }]}>
                    {formatRarity(item.rarity)}  |  LEVEL +{item.upgradeLevel}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={item.isLocked ? `Unlock ${item.name}` : `Lock ${item.name}`}
                  disabled={updating}
                  onPress={() => onLock(item)}
                  style={({ pressed }) => [styles.iconActionButton, pressed && styles.buttonPressed]}>
                  <MaterialCommunityIcons
                    name={item.isLocked ? 'lock' : 'lock-open-outline'}
                    size={17}
                    color={item.isLocked ? '#FFD27A' : '#8A92A9'}
                  />
                </Pressable>
              </View>

              <Text style={styles.smithBonus}>{item.combatBonusLabel}</Text>

              <View style={styles.forgeRow}>
                <View style={styles.forgeCostBlock}>
                  <Text style={styles.forgeCostLabel}>{quote ? `UPGRADE TO +${quote.nextLevel}` : 'MAX LEVEL'}</Text>
                  <Text style={styles.forgeCostValue}>
                    {quote ? `${quote.goldCost} Gold  |  ${quote.materialQuantity}x ${materialName}` : 'Fully forged'}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={`Upgrade ${item.name}`}
                  disabled={!canUpgrade || updating}
                  onPress={() => onUpgrade(item)}
                  style={({ pressed }) => [
                    styles.forgeButton,
                    !canUpgrade && styles.disabledButton,
                    pressed && canUpgrade && styles.buttonPressed,
                  ]}>
                  {updating ? (
                    <ActivityIndicator color="#071018" size="small" />
                  ) : (
                    <MaterialCommunityIcons name="hammer" size={17} color="#071018" />
                  )}
                </Pressable>
              </View>

              <View style={styles.salvageRow}>
                <Text style={styles.salvageReward}>
                  Salvage: {salvage.gold} Gold + {salvage.materialQuantity}x{' '}
                  {getItemDefinition(salvage.materialKey).name}
                </Text>
                <Pressable
                  accessibilityLabel={`Salvage ${item.name}`}
                  disabled={!canSalvage || updating}
                  onPress={() => onSalvage(item)}
                  style={({ pressed }) => [
                    styles.salvageButton,
                    !canSalvage && styles.disabledButton,
                    pressed && canSalvage && styles.buttonPressed,
                  ]}>
                  <MaterialCommunityIcons name="recycle" size={16} color={canSalvage ? '#D98BA4' : '#535A6D'} />
                  <Text style={[styles.salvageText, !canSalvage && styles.disabledText]}>Salvage</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 112, gap: 14 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFD27A' },
  systemLabel: { color: '#D8AA57', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  heading: { color: '#F5F2FF', fontSize: 29, fontWeight: '900', marginTop: 3 },
  goldBadge: {
    minWidth: 96,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#171420',
    borderWidth: 1,
    borderColor: '#4B3B35',
  },
  goldValue: { color: '#FFD27A', fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  goldLabel: { color: '#8D8490', fontSize: 8, fontWeight: '800' },
  summaryPanel: { borderRadius: 8, padding: 15, borderWidth: 1, borderColor: '#493C44', overflow: 'hidden' },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summaryEyebrow: { color: '#D2A65D', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  summaryTitle: { color: '#F2EFFE', fontSize: 17, fontWeight: '900', marginTop: 4 },
  statGrid: { flexDirection: 'row', gap: 8, marginTop: 15 },
  statTile: { flex: 1, minHeight: 57, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#0C111E', borderWidth: 1, borderColor: '#293044' },
  statValue: { color: '#F1F2F8', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLabel: { color: '#7E879E', fontSize: 8, fontWeight: '800', marginTop: 3 },
  segmentedControl: { height: 44, flexDirection: 'row', gap: 4, padding: 4, borderRadius: 8, backgroundColor: '#0D111C', borderWidth: 1, borderColor: '#252B3D' },
  segmentButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 6 },
  segmentButtonSelected: { backgroundColor: '#7CDFF2' },
  segmentText: { color: '#858DA6', fontSize: 10, fontWeight: '900' },
  segmentTextSelected: { color: '#071018' },
  loadingState: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 8, backgroundColor: '#0C101B', borderWidth: 1, borderColor: '#272D40' },
  loadingText: { color: '#858DA4', fontSize: 10, fontWeight: '700' },
  section: { gap: 11 },
  sectionHeader: { gap: 3 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionEyebrow: { color: '#D7A95A', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: '#F1EFFF', fontSize: 18, fontWeight: '900' },
  slotCount: { color: '#7EDFF3', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  emptyState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', padding: 22, borderRadius: 8, backgroundColor: '#0C101B', borderWidth: 1, borderColor: '#272D40' },
  emptyTitle: { color: '#F0EEFF', fontSize: 16, fontWeight: '900', marginTop: 13 },
  emptyText: { color: '#858CA8', fontSize: 11, lineHeight: 17, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  primaryButton: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#7CDFF2', marginTop: 17 },
  primaryButtonText: { color: '#071018', fontSize: 11, fontWeight: '900' },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  itemList: { gap: 9 },
  itemCard: { padding: 12, gap: 10, borderRadius: 8, backgroundColor: '#0C101B', borderWidth: 1, borderColor: '#242A3D' },
  itemMainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  itemIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#11172A', borderWidth: 1 },
  itemBody: { flex: 1, minWidth: 0 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { flex: 1, minWidth: 0, color: '#EDEDF8', fontSize: 13, fontWeight: '900' },
  itemRarity: { fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  itemDescription: { color: '#747D9A', fontSize: 9, lineHeight: 14, fontWeight: '700', marginTop: 4 },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  itemMeta: { color: '#8C94AD', fontSize: 8, fontWeight: '800' },
  itemMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#4D536D' },
  quantityBadge: { minWidth: 29, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 6, backgroundColor: '#151A2B' },
  quantityText: { color: '#FFD27A', fontSize: 8, fontWeight: '900', fontVariant: ['tabular-nums'] },
  bonusText: { color: '#79D7EA', fontSize: 8, lineHeight: 13, fontWeight: '800', marginTop: 6 },
  itemActionRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#202638' },
  iconActionButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#131827', borderWidth: 1, borderColor: '#2B3145' },
  equippedLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  equippedText: { color: '#7E8A9C', fontSize: 8, fontWeight: '800' },
  smallPrimaryButton: { minWidth: 92, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 7, backgroundColor: '#7CDFF2' },
  smallPrimaryText: { color: '#071018', fontSize: 9, fontWeight: '900' },
  disabledButton: { backgroundColor: '#161A25', borderColor: '#292E3D', opacity: 0.66 },
  disabledText: { color: '#535A6D' },
  loadoutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotCard: { width: '48.5%', minHeight: 116, padding: 10, borderRadius: 8, backgroundColor: '#0B0E17', borderWidth: 1, borderColor: '#22283A' },
  slotCardFilled: { backgroundColor: '#0D1420', borderColor: '#2D5361' },
  slotTopRow: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#141927' },
  slotRemoveButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: '#21141C' },
  slotLabel: { color: '#737C94', fontSize: 7, fontWeight: '900', letterSpacing: 0.8, marginTop: 8 },
  slotItemName: { color: '#E9ECF5', fontSize: 10, fontWeight: '900', marginTop: 3 },
  slotEmptyText: { color: '#50576A' },
  slotBonus: { color: '#69C9DD', fontSize: 7, lineHeight: 11, fontWeight: '700', marginTop: 5 },
  smithCard: { padding: 12, gap: 10, borderRadius: 8, backgroundColor: '#0D101A', borderWidth: 1, borderColor: '#33303A' },
  smithHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smithTitleBody: { flex: 1, minWidth: 0, gap: 4 },
  smithBonus: { color: '#80DBED', fontSize: 9, lineHeight: 14, fontWeight: '800', paddingVertical: 2 },
  forgeRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 8, backgroundColor: '#17151A', borderWidth: 1, borderColor: '#45382D' },
  forgeCostBlock: { flex: 1, minWidth: 0 },
  forgeCostLabel: { color: '#D5A856', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  forgeCostValue: { color: '#B8B2B0', fontSize: 9, lineHeight: 14, fontWeight: '800', marginTop: 3 },
  forgeButton: { width: 42, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#FFD27A' },
  salvageRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8 },
  salvageReward: { flex: 1, color: '#777F94', fontSize: 8, lineHeight: 13, fontWeight: '700' },
  salvageButton: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 7, backgroundColor: '#24151D', borderWidth: 1, borderColor: '#563044' },
  salvageText: { color: '#D98BA4', fontSize: 8, fontWeight: '900' },
});
