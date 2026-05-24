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
  supportService, type Ticket,
  TICKET_STATUSES, TICKET_PRIORITIES,
  type TicketStatus, type TicketPriority,
} from '../../src/services/support';

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [stats, setStats] = useState({ total: 0, open: 0, critical: 0 });

  const [formData, setFormData] = useState({ subject: '', description: '', priority: 'medium' as TicketPriority, category: '', requester: '', requesterEmail: '', assignee: '' });

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [data, st] = await Promise.all([
        supportService.getAll(),
        supportService.getStats(),
      ]);
      setTickets(data);
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
    let items = tickets;
    if (statusFilter !== 'all') items = items.filter(t => t.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(t =>
        t.subject.toLowerCase().includes(q) ||
        t.number.toLowerCase().includes(q) ||
        t.requester.toLowerCase().includes(q)
      );
    }
    return items;
  }, [tickets, statusFilter, search]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ subject: '', description: '', priority: 'medium', category: '', requester: '', requesterEmail: '', assignee: '' });
    setModalVisible(true);
  };

  const openEdit = (item: Ticket) => {
    setEditing(item);
    setFormData({
      subject: item.subject, description: item.description, priority: item.priority,
      category: item.category, requester: item.requester, requesterEmail: item.requesterEmail,
      assignee: item.assignee,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.subject || !formData.requester) {
      Alert.alert(t('common', 'error'), t('support', 'requiredFields'));
      return;
    }
    try {
      if (editing) {
        await supportService.update(editing.id, formData);
      } else {
        await supportService.create({ ...formData, status: 'open' });
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('support', 'saveError'));
    }
  };

  const handleDelete = (item: Ticket) => {
    Alert.alert(
      t('support', 'deleteTicket'),
      t('support', 'deleteConfirm', { n: item.number }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await supportService.delete(item.id); loadData(); },
        },
      ]
    );
  };

  const handleStatusChange = (item: Ticket) => {
    const currentIdx = TICKET_STATUSES.findIndex(s => s.value === item.status);
    const next = TICKET_STATUSES[(currentIdx + 1) % TICKET_STATUSES.length].value;
    supportService.update(item.id, { status: next });
    loadData();
  };

  const getStatusDef = (status: TicketStatus) =>
    TICKET_STATUSES.find(s => s.value === status) || TICKET_STATUSES[0];
  const getPriorityDef = (priority: TicketPriority) =>
    TICKET_PRIORITIES.find(p => p.value === priority) || TICKET_PRIORITIES[1];

  const renderItem = ({ item }: { item: Ticket }) => {
    const sd = getStatusDef(item.status);
    const pd = getPriorityDef(item.priority);
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: colors.surface }]} onPress={() => openEdit(item)} activeOpacity={0.7}>
        <View style={s.cardRow}>
          <View style={[s.statusIcon, { backgroundColor: sd.color + '15' }]}>
            <Ionicons name={sd.icon as any} size={20} color={sd.color} />
          </View>
          <View style={s.cardInfo}>
            <Text style={[s.cardNumber, { color: colors.textPrimary }]}>{item.number}</Text>
            <Text style={[s.cardSubject, { color: colors.textSecondary }]} numberOfLines={1}>{item.subject}</Text>
          </View>
          <View style={s.cardRight}>
            <View style={[s.priorityBadge, { backgroundColor: pd.color + '15' }]}>
              <Text style={[s.priorityText, { color: pd.color }]}>{t('support', `priority${pd.label}`)}</Text>
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
              <Text style={s.title}>{t('support', 'title')}</Text>
              <TouchableOpacity style={s.addBtn} onPress={openCreate}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.total}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('support', 'total')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#F59E0B' }]}>{stats.open}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('support', 'openTickets')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#EF4444' }]}>{stats.critical}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('support', 'criticalTickets')}</Text>
              </View>
            </View>
            <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={[s.searchInput, { color: colors.textPrimary }]}
                value={search}
                onChangeText={setSearch}
                placeholder={t('support', 'search')}
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="headset-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('support', 'noTickets')}</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>{t('support', 'noTicketsSub')}</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? t('support', 'editTicket') : t('support', 'newTicket')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('support', 'subject')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.subject} onChangeText={v => setFormData(p => ({ ...p, subject: v }))} placeholder={t('support', 'subject')} placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('support', 'requester')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.requester} onChangeText={v => setFormData(p => ({ ...p, requester: v }))} placeholder={t('support', 'requester')} placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('support', 'description')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, height: 80 }]} value={formData.description} onChangeText={v => setFormData(p => ({ ...p, description: v }))} placeholder={t('support', 'description')} placeholderTextColor={colors.textTertiary} multiline />
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
                <Text style={s.deleteText}>{t('support', 'deleteTicket')}</Text>
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
  statusIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardNumber: { fontSize: 15, fontWeight: '600' },
  cardSubject: { fontSize: 13, marginTop: 1 },
  cardRight: { alignItems: 'flex-end' },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 2 },
  priorityText: { fontSize: 11, fontWeight: '600' },
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
