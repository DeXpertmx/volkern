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
  ordersService, type Order,
  ORDER_STATUSES, type OrderStatus,
} from '../../src/services/orders';

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  const [formData, setFormData] = useState({ customer: '', customerEmail: '', total: '', notes: '' });

  const [stats, setStats] = useState({ total: 0, pending: 0, revenue: 0 });

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [data, st] = await Promise.all([
        ordersService.getAll(),
        ordersService.getStats(),
      ]);
      setOrders(data);
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
    let items = orders;
    if (statusFilter !== 'all') items = items.filter(o => o.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(o =>
        o.number.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q)
      );
    }
    return items;
  }, [orders, statusFilter, search]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ customer: '', customerEmail: '', total: '', notes: '' });
    setModalVisible(true);
  };

  const openEdit = (item: Order) => {
    setEditing(item);
    setFormData({
      customer: item.customer,
      customerEmail: item.customerEmail,
      total: item.total.toString(),
      notes: item.notes,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.customer || !formData.total) {
      Alert.alert(t('common', 'error'), t('orders', 'requiredFields'));
      return;
    }
    const total = parseFloat(formData.total);
    if (isNaN(total)) {
      Alert.alert(t('common', 'error'), t('orders', 'requiredFields'));
      return;
    }
    try {
      if (editing) {
        await ordersService.update(editing.id, {
          customer: formData.customer,
          customerEmail: formData.customerEmail,
          total,
          notes: formData.notes,
        });
      } else {
        await ordersService.create({
          customer: formData.customer,
          customerEmail: formData.customerEmail,
          items: [],
          subtotal: total,
          tax: 0,
          shipping: 0,
          total,
          status: 'pending',
          notes: formData.notes,
        });
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('orders', 'saveError'));
    }
  };

  const handleDelete = (item: Order) => {
    Alert.alert(
      t('orders', 'deleteOrder'),
      t('orders', 'deleteConfirm', { n: item.number }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await ordersService.delete(item.id); loadData(); },
        },
      ]
    );
  };

  const handleStatusChange = (item: Order) => {
    const currentIdx = ORDER_STATUSES.findIndex(s => s.value === item.status);
    const nextStatuses = ORDER_STATUSES.slice(currentIdx + 1);
    if (nextStatuses.length === 0) return;
    const next = nextStatuses[0].value;
    ordersService.update(item.id, { status: next });
    loadData();
  };

  const getStatusDef = (status: OrderStatus) =>
    ORDER_STATUSES.find(s => s.value === status) || ORDER_STATUSES[0];

  const renderItem = ({ item }: { item: Order }) => {
    const def = getStatusDef(item.status);
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: colors.surface }]} onPress={() => openEdit(item)} activeOpacity={0.7}>
        <View style={s.cardRow}>
          <View style={[s.statusIcon, { backgroundColor: def.color + '15' }]}>
            <Ionicons name={def.icon as any} size={20} color={def.color} />
          </View>
          <View style={s.cardInfo}>
            <Text style={[s.cardNumber, { color: colors.textPrimary }]}>{item.number}</Text>
            <Text style={[s.cardCustomer, { color: colors.textSecondary }]}>{item.customer}</Text>
          </View>
          <View style={s.cardRight}>
            <Text style={[s.cardAmount, { color: colors.textPrimary }]}>${item.total.toFixed(2)}</Text>
            <View style={[s.statusBadge, { backgroundColor: def.color + '15' }]}>
              <Text style={[s.statusText, { color: def.color }]}>{t('orders', `status${def.label}`)}</Text>
            </View>
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
              <Text style={s.title}>{t('orders', 'title')}</Text>
              <TouchableOpacity style={s.addBtn} onPress={openCreate}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.total}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('orders', 'total')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#F59E0B' }]}>{stats.pending}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('orders', 'statusPending')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#10B981' }]}>${stats.revenue.toFixed(0)}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('orders', 'revenue')}</Text>
              </View>
            </View>

            <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={[s.searchInput, { color: colors.textPrimary }]}
                value={search}
                onChangeText={setSearch}
                placeholder={t('orders', 'search')}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <FlatList
              horizontal
              data={[{ value: 'all' as const, label: 'all' }, ...ORDER_STATUSES]}
              keyExtractor={item => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.filterChip, statusFilter === item.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setStatusFilter(item.value as OrderStatus | 'all')}
                >
                  <Text style={[s.filterText, { color: statusFilter === item.value ? '#fff' : colors.textSecondary }]}>
                    {item.value === 'all' ? t('orders', 'total') : t('orders', `status${item.label}`)}
                  </Text>
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
              style={s.filterRow}
            />
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="cart-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('orders', 'noOrders')}</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>{t('orders', 'noOrdersSub')}</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? t('orders', 'editOrder') : t('orders', 'newOrder')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('orders', 'customer')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.customer} onChangeText={v => setFormData(p => ({ ...p, customer: v }))} placeholder={t('orders', 'customer')} placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('orders', 'customerEmail')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.customerEmail} onChangeText={v => setFormData(p => ({ ...p, customerEmail: v }))} placeholder="email@example.com" placeholderTextColor={colors.textTertiary} keyboardType="email-address" />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('orders', 'total')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.total} onChangeText={v => setFormData(p => ({ ...p, total: v }))} placeholder="0.00" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('orders', 'notes')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, height: 80 }]} value={formData.notes} onChangeText={v => setFormData(p => ({ ...p, notes: v }))} placeholder={t('orders', 'notes')} placeholderTextColor={colors.textTertiary} multiline />
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
                <Text style={s.deleteText}>{t('orders', 'deleteOrder')}</Text>
              </TouchableOpacity>
            )}
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
  filterRow: { marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  filterText: { fontSize: 13, fontWeight: '500' },
  card: { borderRadius: 12, marginBottom: 8, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardNumber: { fontSize: 15, fontWeight: '600' },
  cardCustomer: { fontSize: 13, marginTop: 1 },
  cardRight: { alignItems: 'flex-end' },
  cardAmount: { fontSize: 16, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 2 },
  statusText: { fontSize: 11, fontWeight: '600' },
  emptyText: { fontSize: 15, marginTop: 12, marginBottom: 4 },
  emptySub: { fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  modalCancelText: { fontSize: 16, fontWeight: '600' },
  modalSave: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12 },
  modalSaveText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  deleteBtn: { alignItems: 'center', padding: 14, marginTop: 12 },
  deleteText: { fontSize: 15, color: '#EF4444', fontWeight: '600' },
});
