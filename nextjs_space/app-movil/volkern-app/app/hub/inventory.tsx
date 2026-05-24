import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  inventoryService, type InventoryItem, type StockMovement,
  INVENTORY_CATEGORIES,
} from '../../src/services/inventory';

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [movementModal, setMovementModal] = useState<InventoryItem | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ totalItems: 0, lowStock: 0, totalValue: 0 });

  const [formData, setFormData] = useState({ sku: '', name: '', description: '', category: '', quantity: '', minStock: '', unitPrice: '', location: '' });
  const [moveData, setMoveData] = useState({ type: 'in' as 'in' | 'out' | 'adjustment', quantity: '', reason: '', reference: '' });

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [data, st] = await Promise.all([
        inventoryService.getAll(),
        inventoryService.getStats(),
      ]);
      setItems(data);
      setStats(st);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
    );
  }, [items, search]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ sku: '', name: '', description: '', category: 'raw_materials', quantity: '', minStock: '10', unitPrice: '', location: '' });
    setModalVisible(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setFormData({
      sku: item.sku, name: item.name, description: item.description,
      category: item.category, quantity: item.quantity.toString(),
      minStock: item.minStock.toString(), unitPrice: item.unitPrice.toString(),
      location: item.location,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.sku) {
      Alert.alert(t('common', 'error'), t('inventory', 'requiredFields'));
      return;
    }
    const quantity = parseInt(formData.quantity) || 0;
    const minStock = parseInt(formData.minStock) || 0;
    const unitPrice = parseFloat(formData.unitPrice) || 0;
    try {
      if (editing) {
        await inventoryService.update(editing.id, { ...formData, quantity, minStock, unitPrice });
      } else {
        await inventoryService.create({ ...formData, quantity, minStock, unitPrice });
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('inventory', 'saveError'));
    }
  };

  const handleDelete = (item: InventoryItem) => {
    Alert.alert(
      t('inventory', 'deleteItem'),
      t('inventory', 'deleteConfirm', { name: item.name }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await inventoryService.delete(item.id); loadData(); },
        },
      ]
    );
  };

  const handleMovement = async () => {
    if (!movementModal || !moveData.quantity) return;
    const qty = parseInt(moveData.quantity);
    if (isNaN(qty) || qty <= 0) return;
    try {
      await inventoryService.recordMovement({
        itemId: movementModal.id,
        type: moveData.type,
        quantity: qty,
        reason: moveData.reason,
        reference: moveData.reference,
      });
      setMovementModal(null);
      setMoveData({ type: 'in', quantity: '', reason: '', reference: '' });
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('inventory', 'saveError'));
    }
  };

  const getCatDef = (cat: string) =>
    INVENTORY_CATEGORIES.find(c => c.value === cat) || INVENTORY_CATEGORIES[0];

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const cat = getCatDef(item.category);
    const isLow = item.quantity <= item.minStock;
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: colors.surface }]} onPress={() => openEdit(item)} activeOpacity={0.7}>
        <View style={s.cardRow}>
          <View style={[s.catIcon, { backgroundColor: cat.color + '15' }]}>
            <Ionicons name={cat.icon as any} size={20} color={cat.color} />
          </View>
          <View style={s.cardInfo}>
            <Text style={[s.cardName, { color: colors.textPrimary }]}>{item.name}</Text>
            <Text style={[s.cardSku, { color: colors.textTertiary }]}>{item.sku}</Text>
          </View>
          <View style={s.cardRight}>
            <Text style={[s.cardQty, { color: isLow ? '#EF4444' : colors.textPrimary }]}>{item.quantity}</Text>
            {isLow && <Ionicons name="warning" size={14} color="#EF4444" />}
            <TouchableOpacity style={[s.moveBtn, { backgroundColor: colors.primaryBg }]} onPress={() => { setMovementModal(item); setMoveData({ type: 'in', quantity: '', reason: '', reference: '' }); }}>
              <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <Text style={s.title}>{t('inventory', 'title')}</Text>
              <TouchableOpacity style={s.addBtn} onPress={openCreate}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.totalItems}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('inventory', 'total')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: stats.lowStock > 0 ? '#EF4444' : '#10B981' }]}>{stats.lowStock}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('inventory', 'lowStock')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#10B981' }]}>${stats.totalValue.toFixed(0)}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('inventory', 'stockValue')}</Text>
              </View>
            </View>

            <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={[s.searchInput, { color: colors.textPrimary }]}
                value={search}
                onChangeText={setSearch}
                placeholder={t('inventory', 'search')}
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="cube-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('inventory', 'noItems')}</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>{t('inventory', 'noItemsSub')}</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? t('inventory', 'editItem') : t('inventory', 'newItem')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('inventory', 'sku')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.sku} onChangeText={v => setFormData(p => ({ ...p, sku: v }))} placeholder="SKU-001" placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('inventory', 'name')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.name} onChangeText={v => setFormData(p => ({ ...p, name: v }))} placeholder={t('inventory', 'name')} placeholderTextColor={colors.textTertiary} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('inventory', 'quantity')}</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.quantity} onChangeText={v => setFormData(p => ({ ...p, quantity: v }))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('inventory', 'minStock')}</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.minStock} onChangeText={v => setFormData(p => ({ ...p, minStock: v }))} keyboardType="number-pad" placeholder="10" placeholderTextColor={colors.textTertiary} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('inventory', 'unitPrice')}</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.unitPrice} onChangeText={v => setFormData(p => ({ ...p, unitPrice: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('inventory', 'location')}</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.location} onChangeText={v => setFormData(p => ({ ...p, location: v }))} placeholder="A-1" placeholderTextColor={colors.textTertiary} />
              </View>
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => setModalVisible(false)}>
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }]} onPress={handleSave}>
                <Text style={s.modalSaveText}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>
            {editing && (
              <TouchableOpacity style={s.deleteBtn} onPress={() => { setModalVisible(false); handleDelete(editing); }}>
                <Text style={s.deleteText}>{t('inventory', 'deleteItem')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!movementModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('inventory', 'recordMovement')}</Text>
              <TouchableOpacity onPress={() => setMovementModal(null)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>SKU: {movementModal?.sku} — {movementModal?.name}</Text>
            <View style={s.typeRow}>
              {(['in', 'out', 'adjustment'] as const).map(type => (
                <TouchableOpacity key={type} style={[s.typeChip, moveData.type === type && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setMoveData(p => ({ ...p, type }))}>
                  <Text style={[s.typeText, { color: moveData.type === type ? '#fff' : colors.textSecondary }]}>
                    {type === 'in' ? t('inventory', 'movementIn') : type === 'out' ? t('inventory', 'movementOut') : t('inventory', 'movementAdjustment')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('inventory', 'quantity')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={moveData.quantity} onChangeText={v => setMoveData(p => ({ ...p, quantity: v }))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('inventory', 'reason')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={moveData.reason} onChangeText={v => setMoveData(p => ({ ...p, reason: v }))} placeholder={t('inventory', 'reason')} placeholderTextColor={colors.textTertiary} />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => setMovementModal(null)}>
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }]} onPress={handleMovement}>
                <Text style={s.modalSaveText}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  card: { borderRadius: 12, marginBottom: 8, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600' },
  cardSku: { fontSize: 12, marginTop: 1 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardQty: { fontSize: 18, fontWeight: '700' },
  moveBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15, marginTop: 12, marginBottom: 4 },
  emptySub: { fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  typeText: { fontSize: 13, fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  modalCancelText: { fontSize: 16, fontWeight: '600' },
  modalSave: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12 },
  modalSaveText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  deleteBtn: { alignItems: 'center', padding: 14, marginTop: 12 },
  deleteText: { fontSize: 15, color: '#EF4444', fontWeight: '600' },
});
