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
  vendorsService, type Vendor,
  VENDOR_CATEGORIES, type VendorStatus,
} from '../../src/services/vendors';

export default function VendorsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<VendorStatus | 'all'>('all');
  const [stats, setStats] = useState({ total: 0, active: 0, avgRating: 0 });

  const [formData, setFormData] = useState({ name: '', contactName: '', email: '', phone: '', category: '', rating: '3', notes: '', paymentTerms: '' });

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [data, st] = await Promise.all([
        vendorsService.getAll(),
        vendorsService.getStats(),
      ]);
      setVendors(data);
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
    let items = vendors;
    if (filterStatus !== 'all') items = items.filter(v => v.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(v =>
        v.name.toLowerCase().includes(q) || v.contactName.toLowerCase().includes(q)
      );
    }
    return items;
  }, [vendors, filterStatus, search]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ name: '', contactName: '', email: '', phone: '', category: 'supplier', rating: '3', notes: '', paymentTerms: '' });
    setModalVisible(true);
  };

  const openEdit = (item: Vendor) => {
    setEditing(item);
    setFormData({
      name: item.name, contactName: item.contactName, email: item.email,
      phone: item.phone, category: item.category, rating: item.rating.toString(),
      notes: item.notes, paymentTerms: item.paymentTerms,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      Alert.alert(t('common', 'error'), t('vendors', 'requiredFields'));
      return;
    }
    const rating = parseInt(formData.rating) || 3;
    try {
      if (editing) {
        await vendorsService.update(editing.id, { ...formData, rating, status: 'active' });
      } else {
        await vendorsService.create({ ...formData, rating, status: 'active' } as any);
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('vendors', 'saveError'));
    }
  };

  const handleDelete = (item: Vendor) => {
    Alert.alert(
      t('vendors', 'deleteVendor'),
      t('vendors', 'deleteConfirm', { name: item.name }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await vendorsService.delete(item.id); loadData(); },
        },
      ]
    );
  };

  const getCatDef = (cat: string) =>
    VENDOR_CATEGORIES.find(c => c.value === cat) || VENDOR_CATEGORIES[0];

  const renderItem = ({ item }: { item: Vendor }) => {
    const cat = getCatDef(item.category);
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: colors.surface }]} onPress={() => openEdit(item)} activeOpacity={0.7}>
        <View style={s.cardRow}>
          <View style={[s.catIcon, { backgroundColor: cat.color + '15' }]}>
            <Ionicons name={cat.icon as any} size={20} color={cat.color} />
          </View>
          <View style={s.cardInfo}>
            <Text style={[s.cardName, { color: colors.textPrimary }]}>{item.name}</Text>
            <Text style={[s.cardContact, { color: colors.textSecondary }]}>{item.contactName}</Text>
          </View>
          <View style={s.cardRight}>
            <Text style={[s.cardRating, { color: colors.warning }]}>{'★'.repeat(item.rating)}</Text>
            <View style={[s.statusDot, { backgroundColor: item.status === 'active' ? '#10B981' : '#64748B' }]} />
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
              <Text style={s.title}>{t('vendors', 'title')}</Text>
              <TouchableOpacity style={s.addBtn} onPress={openCreate}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.total}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('vendors', 'total')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#10B981' }]}>{stats.active}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('vendors', 'active')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: colors.warning }]}>{stats.avgRating.toFixed(1)}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('vendors', 'avgRating')}</Text>
              </View>
            </View>
            <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={[s.searchInput, { color: colors.textPrimary }]}
                value={search}
                onChangeText={setSearch}
                placeholder={t('vendors', 'search')}
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="business-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('vendors', 'noVendors')}</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>{t('vendors', 'noVendorsSub')}</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? t('vendors', 'editVendor') : t('vendors', 'newVendor')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('vendors', 'name')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.name} onChangeText={v => setFormData(p => ({ ...p, name: v }))} placeholder={t('vendors', 'name')} placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('vendors', 'contactName')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.contactName} onChangeText={v => setFormData(p => ({ ...p, contactName: v }))} placeholder={t('vendors', 'contactName')} placeholderTextColor={colors.textTertiary} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('vendors', 'email')}</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.email} onChangeText={v => setFormData(p => ({ ...p, email: v }))} placeholder="email@example.com" placeholderTextColor={colors.textTertiary} keyboardType="email-address" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('vendors', 'phone')}</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.phone} onChangeText={v => setFormData(p => ({ ...p, phone: v }))} placeholder="+52 555..." placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
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
                <Text style={s.deleteText}>{t('vendors', 'deleteVendor')}</Text>
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
  card: { borderRadius: 12, marginBottom: 8, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600' },
  cardContact: { fontSize: 13, marginTop: 1 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardRating: { fontSize: 14 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
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
