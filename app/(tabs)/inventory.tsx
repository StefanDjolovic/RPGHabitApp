import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getInventoryItems,
  type InventoryItem,
} from '@/src/database/inventory-repository';
import { rarityMeta, type ItemRarity } from '@/src/inventory/item-catalog';

const categoryLabels: Record<InventoryItem['category'], string> = {
  equipment: 'Equipment',
  material: 'Material',
  consumable: 'Consumable',
};

function formatRarity(rarity: ItemRarity) {
  return rarityMeta[rarity].label.toUpperCase();
}

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInventory = useCallback(async () => {
    try {
      const inventoryItems = await getInventoryItems(db);
      setItems(inventoryItems);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadInventory();
    }, [loadInventory]),
  );

  const summary = useMemo(() => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const equipmentCount = items
      .filter((item) => item.category === 'equipment')
      .reduce((sum, item) => sum + item.quantity, 0);
    const rarest = items[0]?.rarity ?? 'common';

    return {
      stacks: items.length,
      totalQuantity,
      equipmentCount,
      rarest,
    };
  }, [items]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundGlowGold} />
      <View style={styles.backgroundGlowBlue} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <View style={styles.systemRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.systemLabel}>ITEM STORAGE</Text>
            </View>
            <Text style={styles.heading}>Inventory</Text>
          </View>

          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="treasure-chest" size={27} color="#FFD27A" />
          </View>
        </View>

        <LinearGradient
          colors={['rgba(50, 35, 24, 0.96)', 'rgba(13, 20, 38, 0.98)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.summaryPanel}>
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryEyebrow}>VAULT STATUS</Text>
              <Text style={styles.summaryTitle}>
                {summary.totalQuantity > 0 ? `${summary.totalQuantity} stored items` : 'Vault empty'}
              </Text>
            </View>
            <View style={styles.rarityBadge}>
              <Text style={[styles.rarityBadgeText, { color: rarityMeta[summary.rarest].color }]}>
                {summary.totalQuantity > 0 ? rarityMeta[summary.rarest].label : 'Empty'}
              </Text>
            </View>
          </View>

          <View style={styles.statGrid}>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{summary.stacks}</Text>
              <Text style={styles.statLabel}>Stacks</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{summary.equipmentCount}</Text>
              <Text style={styles.statLabel}>Gear</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{Math.max(0, summary.totalQuantity - summary.equipmentCount)}</Text>
              <Text style={styles.statLabel}>Supplies</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>LOOT</Text>
            <Text style={styles.sectionTitle}>Stored rewards</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#FFD27A" />
            <Text style={styles.loadingText}>Scanning vault...</Text>
          </View>
        ) : null}

        {!loading && items.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="treasure-chest-outline" size={34} color="#FFD27A" />
            </View>
            <Text style={styles.emptyTitle}>No loot stored yet</Text>
            <Text style={styles.emptyText}>
              Claim a Daily Clear chest after finishing every required objective.
            </Text>
            <Pressable
              onPress={() => router.push('/' as Href)}
              style={({ pressed }) => [styles.todayButton, pressed && styles.todayButtonPressed]}>
              <MaterialCommunityIcons name="view-dashboard" size={18} color="#061018" />
              <Text style={styles.todayButtonText}>Open Today</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && items.length > 0 ? (
          <View style={styles.itemList}>
            {items.map((item) => {
              const rarity = rarityMeta[item.rarity];
              return (
                <View key={item.itemKey} style={styles.itemCard}>
                  <View style={[styles.itemIcon, { borderColor: `${rarity.color}66` }]}>
                    <MaterialCommunityIcons name={item.icon} size={25} color={rarity.color} />
                  </View>

                  <View style={styles.itemBody}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={[styles.itemRarity, { color: rarity.color }]}>
                        {formatRarity(item.rarity)}
                      </Text>
                    </View>
                    <Text style={styles.itemDescription}>{item.description}</Text>
                    <View style={styles.itemMetaRow}>
                      <Text style={styles.itemMeta}>{categoryLabels[item.category]}</Text>
                      <View style={styles.itemMetaDot} />
                      <Text style={styles.itemMeta}>{item.slot}</Text>
                    </View>
                  </View>

                  <View style={styles.quantityBadge}>
                    <Text style={styles.quantityText}>x{item.quantity}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050711' },
  backgroundGlowGold: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#A96E18',
    opacity: 0.12,
    top: -100,
    right: -100,
  },
  backgroundGlowBlue: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#00B8D9',
    opacity: 0.07,
    top: 280,
    left: -150,
  },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 110 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFD27A' },
  systemLabel: { color: '#D8AA57', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  heading: { color: '#F5F2FF', fontSize: 31, fontWeight: '800', letterSpacing: 0 },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141322',
    borderWidth: 1,
    borderColor: '#3C3145',
  },
  summaryPanel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#473A45',
    padding: 17,
    marginBottom: 24,
    overflow: 'hidden',
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryEyebrow: { color: '#C99C55', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  summaryTitle: { color: '#F2EDFF', fontSize: 18, fontWeight: '900', marginTop: 5 },
  rarityBadge: {
    minWidth: 78,
    height: 31,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 11, 24, 0.78)',
    borderWidth: 1,
    borderColor: '#403B55',
  },
  rarityBadgeText: { fontSize: 10, fontWeight: '900' },
  statGrid: { flexDirection: 'row', gap: 9, marginTop: 18 },
  statTile: {
    flex: 1,
    minHeight: 62,
    borderRadius: 15,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(8, 11, 24, 0.64)',
    borderWidth: 1,
    borderColor: 'rgba(124, 132, 169, 0.18)',
  },
  statValue: { color: '#F7F2FF', fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLabel: { color: '#858CA8', fontSize: 10, fontWeight: '700', marginTop: 4 },
  sectionHeader: { marginBottom: 12 },
  sectionEyebrow: { color: '#FFD27A', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  sectionTitle: { color: '#F1EFFF', fontSize: 19, fontWeight: '800', marginTop: 4 },
  loadingState: {
    minHeight: 100,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: 'rgba(12, 16, 31, 0.7)',
    borderWidth: 1,
    borderColor: '#28273D',
  },
  loadingText: { color: '#868BA4', fontSize: 11, fontWeight: '700' },
  emptyState: {
    minHeight: 230,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(12, 16, 31, 0.88)',
    borderWidth: 1,
    borderColor: '#28273D',
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111323',
    borderWidth: 1,
    borderColor: '#4C3F4B',
  },
  emptyTitle: { color: '#F0EEFF', fontSize: 16, fontWeight: '900', marginTop: 16 },
  emptyText: {
    color: '#858CA8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 7,
  },
  todayButton: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#FFD27A',
    marginTop: 18,
  },
  todayButtonPressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  todayButtonText: { color: '#061018', fontSize: 12, fontWeight: '900' },
  itemList: { gap: 10 },
  itemCard: {
    minHeight: 94,
    borderRadius: 17,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 16, 31, 0.94)',
    borderWidth: 1,
    borderColor: '#222842',
  },
  itemIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11172A',
    borderWidth: 1,
  },
  itemBody: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { color: '#EDEDF8', fontSize: 14, fontWeight: '900', flex: 1 },
  itemRarity: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  itemDescription: { color: '#747D9A', fontSize: 10, fontWeight: '700', marginTop: 5 },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  itemMeta: { color: '#8C94AD', fontSize: 9, fontWeight: '800' },
  itemMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#4D536D' },
  quantityBadge: {
    minWidth: 38,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12172A',
    borderWidth: 1,
    borderColor: '#2D334F',
  },
  quantityText: { color: '#FFD27A', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
