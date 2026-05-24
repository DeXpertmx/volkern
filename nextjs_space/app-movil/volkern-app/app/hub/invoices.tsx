import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, Alert, RefreshControl, Animated, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { invoicesService, Invoice, InvoiceStatus, INVOICE_STATUSES, INVOICE_STATUS_COLORS, getNextInvoiceNumber } from '../../src/services/invoices';

const STATUS_ICONS: Record<InvoiceStatus, string> = {
  draft: 'document-outline',
  sent: 'send-outline',
  paid: 'checkmark-circle-outline',
  overdue: 'warning-outline',
  cancelled: 'close-circle-outline',
};

export default function InvoicesScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  // Form state
  const [editNumber, setEditNumber] = useState('');
  const [editClient, setEditClient] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('MXN');
  const [editStatus, setEditStatus] = useState<InvoiceStatus>('draft');
  const [editDueDate, setEditDueDate] = useState('');
  const [editConcept, setEditConcept] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTax, setEditTax] = useState('');
  const [editDiscount, setEditDiscount] = useState('');
  const [saving, setSaving] = useState(false);
  const [showStats, setShowStats] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const data = await invoicesService.getAll();
      setInvoices(data);
    } catch (e) {
      console.error('Error loading invoices:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const filteredInvoices = useMemo(() => {
    let result = invoices;
    if (statusFilter !== 'all') result = result.filter(i => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.clientEmail.toLowerCase().includes(q) ||
        i.number.toLowerCase().includes(q) ||
        i.notes.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }, [invoices, statusFilter, search]);

  const stats = useMemo(() => {
    const total = invoices.length;
    const paid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
    const pending = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0);
    const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);
    const draft = invoices.filter(i => i.status === 'draft').length;
    const sent = invoices.filter(i => i.status === 'sent').length;
    return { total, paid, pending, overdue, draft, sent };
  }, [invoices]);

  const openNewInvoice = () => {
    setEditingInvoice(null);
    setEditNumber(getNextInvoiceNumber(invoices));
    setEditClient('');
    setEditEmail('');
    setEditAmount('');
    setEditCurrency('MXN');
    setEditStatus('draft');
    setEditDueDate('');
    setEditConcept('');
    setEditNotes('');
    setEditTax('');
    setEditDiscount('');
    setModalVisible(true);
  };

  const openEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setEditNumber(inv.number);
    setEditClient(inv.clientName);
    setEditEmail(inv.clientEmail);
    setEditAmount(String(inv.total));
    setEditCurrency(inv.currency);
    setEditStatus(inv.status);
    setEditDueDate(inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '');
    setEditConcept(inv.notes);
    setEditNotes('');
    setEditTax(inv.taxRate ? String(inv.taxRate * 100) : '');
    setEditDiscount(inv.discount ? String(inv.discount) : '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!editClient.trim() || !editAmount.trim()) {
      Alert.alert(t('common', 'error'), t('invoices', 'requiredFields'));
      return;
    }
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('common', 'error'), t('invoices', 'invalidAmount'));
      return;
    }
    setSaving(true);
    const editTaxVal = editTax.trim() ? parseFloat(editTax) : 0;
    const editDiscountVal = editDiscount.trim() ? parseFloat(editDiscount) : 0;
    try {
      const invoiceData: Omit<Invoice, 'id' | 'number' | 'createdAt' | 'updatedAt'> = {
        clientName: editClient.trim(),
        clientEmail: editEmail.trim(),
        clientPhone: '',
        clientAddress: '',
        items: [],
        subtotal: amount,
        tax: editTaxVal ? (amount * editTaxVal / 100) : 0,
        taxRate: editTaxVal ? editTaxVal / 100 : 0,
        discount: editDiscountVal || 0,
        total: amount + (editTaxVal ? (amount * editTaxVal / 100) : 0) - (editDiscountVal || 0),
        currency: editCurrency,
        status: editStatus,
        notes: (editConcept.trim() ? editConcept.trim() + '\n' : '') + editNotes.trim(),
        terms: '',
        dueDate: editDueDate ? new Date(editDueDate).getTime() : Date.now() + 30 * 86400000,
        issuedAt: Date.now(),
        paidAt: null,
      };
      if (editingInvoice) {
        await invoicesService.update(editingInvoice.id, invoiceData);
      } else {
        await invoicesService.create(invoiceData);
      }
      setModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert(t('common', 'error'), t('common', 'unexpectedError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (inv: Invoice) => {
    Alert.alert(
      t('invoices', 'deleteConfirm'),
      t('invoices', 'deleteInvoiceConfirm', { number: inv.number }),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        { text: t('common', 'delete'), style: 'destructive', onPress: async () => {
          await invoicesService.delete(inv.id);
          loadData();
        }},
      ]
    );
  };

  const handleStatusChange = async (inv: Invoice, newStatus: InvoiceStatus) => {
    await invoicesService.updateStatus(inv.id, newStatus);
    loadData();
  };

  const formatCurrency = (amt: number, currency: string) => {
    try {
      return new Intl.NumberFormat((locale as string).startsWith('es') ? 'es-MX' : 'en-US', {
        style: 'currency', currency,
      }).format(amt);
    } catch { return `${currency} ${amt.toFixed(2)}`; }
  };

  const dateStr = (d: number | string) => {
    try {
      return new Date(d).toLocaleDateString((locale as string).startsWith('es') ? 'es-MX' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return String(d); }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: invoices.length };
    INVOICE_STATUSES.forEach(s => { counts[s] = invoices.filter(i => i.status === s).length; });
    return counts;
  }, [invoices]);

  const renderInvoiceCard = (inv: Invoice) => {
    const isOverdue = inv.status === 'overdue';
    return (
      <TouchableOpacity
        key={inv.id}
        style={[s.card, isOverdue && s.cardOverdue]}
        onPress={() => openEditInvoice(inv)}
        onLongPress={() => {
          Alert.alert(
            inv.number,
            t('invoices', 'changeStatus'),
            [
              ...INVOICE_STATUSES.filter(st => st !== inv.status).map(st => ({
                text: t('invoices', `status${st.charAt(0).toUpperCase() + st.slice(1)}`),
                onPress: () => handleStatusChange(inv, st),
              })),
              { text: t('common', 'cancel'), style: 'cancel' },
            ]
          );
        }}
        activeOpacity={0.7}
      >
        <View style={s.cardHeader}>
          <View style={[s.statusBadge, { backgroundColor: INVOICE_STATUS_COLORS[inv.status] + '20' }]}>
            <Ionicons name={STATUS_ICONS[inv.status] as any} size={14} color={INVOICE_STATUS_COLORS[inv.status]} />
            <Text style={[s.statusText, { color: INVOICE_STATUS_COLORS[inv.status] }]}>
              {t('invoices', `status${inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}`)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => handleDelete(inv)}>
            <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
        <Text style={s.invoiceNumber}>{inv.number}</Text>
        <Text style={s.clientName}>{inv.clientName}</Text>
        {inv.clientEmail ? <Text style={s.email}>{inv.clientEmail}</Text> : null}
        <View style={s.cardFooter}>
          <Text style={[s.amount, { color: isOverdue ? colors.error : colors.textPrimary }]}>
            {formatCurrency(inv.total, inv.currency)}
          </Text>
          {inv.dueDate ? (
            <Text style={[s.dueDate, isOverdue && { color: colors.error }]}>
              {t('invoices', 'dueDate')}: {dateStr(inv.dueDate)}
            </Text>
          ) : null}
        </View>
        {inv.notes ? <Text style={s.concept} numberOfLines={2}>{inv.notes}</Text> : null}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>{t('invoices', 'title')}</Text>
        <TouchableOpacity onPress={() => setShowStats(!showStats)} style={s.toggleBtn}>
          <Ionicons name={showStats ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {showStats && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statsScroll}>
          <View style={[s.statCard, { backgroundColor: colors.success + '15' }]}>
            <Text style={[s.statValue, { color: colors.success }]}>{formatCurrency(stats.paid, 'MXN')}</Text>
            <Text style={s.statLabel}>{t('invoices', 'paid')}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: colors.warning + '15' }]}>
            <Text style={[s.statValue, { color: colors.warning }]}>{formatCurrency(stats.pending, 'MXN')}</Text>
            <Text style={s.statLabel}>{t('invoices', 'pending')}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: colors.error + '15' }]}>
            <Text style={[s.statValue, { color: colors.error }]}>{formatCurrency(stats.overdue, 'MXN')}</Text>
            <Text style={s.statLabel}>{t('invoices', 'overdue')}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: colors.surface }]}>
            <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.total}</Text>
            <Text style={s.statLabel}>{t('invoices', 'total')}</Text>
          </View>
        </ScrollView>
      )}

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={[s.searchInput, { color: colors.textPrimary }]}
          placeholder={t('common', 'search')}
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')} style={{ marginLeft: 8 }}>
          <Ionicons name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Status Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
        {(['all', ...INVOICE_STATUSES] as const).map(st => (
          <TouchableOpacity
            key={st}
            style={[s.filterChip, statusFilter === st && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
            onPress={() => setStatusFilter(st)}
          >
            <Text style={[s.filterText, { color: statusFilter === st ? colors.primary : colors.textSecondary }]}>
              {st === 'all' ? t('common', 'all') : t('invoices', `status${st.charAt(0).toUpperCase() + st.slice(1)}`)}
            </Text>
            <View style={[s.filterCount, { backgroundColor: statusFilter === st ? colors.primary : colors.textTertiary + '40' }]}>
              <Text style={[s.filterCountText, { color: statusFilter === st ? '#fff' : colors.textSecondary }]}>
                {statusCounts[st]}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {viewMode === 'list' ? (
        <FlatList
          data={filteredInvoices}
          keyExtractor={item => item.id}
          renderItem={({ item }) => renderInvoiceCard(item)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={colors.textTertiary} />
              <Text style={s.emptyTitle}>{t('invoices', 'noInvoices')}</Text>
              <Text style={s.emptySub}>{search ? '' : t('invoices', 'noInvoicesSub')}</Text>
            </View>
          }
        />
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          <View style={s.grid}>
            {filteredInvoices.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={colors.textTertiary} />
                <Text style={s.emptyTitle}>{t('invoices', 'noInvoices')}</Text>
                <Text style={s.emptySub}>{search ? '' : t('invoices', 'noInvoicesSub')}</Text>
              </View>
            ) : filteredInvoices.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[s.gridCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => openEditInvoice(item)}
              >
                <View style={[s.gridStatusDot, { backgroundColor: INVOICE_STATUS_COLORS[item.status] }]} />
                <Text style={s.gridInvoiceNumber}>{item.number}</Text>
                <Text style={s.gridClient} numberOfLines={1}>{item.clientName}</Text>
                <Text style={[s.gridAmount, { color: item.status === 'overdue' ? colors.error : colors.textPrimary }]}>
                  {formatCurrency(item.total, item.currency)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={[s.fab, { backgroundColor: colors.primary }]} onPress={openNewInvoice} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: colors.surface, maxHeight: '90%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editingInvoice ? t('invoices', 'editInvoice') : t('invoices', 'newInvoice')}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>{t('invoices', 'invoiceNumber')}</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editNumber}
                onChangeText={setEditNumber}
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={s.fieldLabel}>{t('invoices', 'clientName')} *</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editClient}
                onChangeText={setEditClient}
                placeholder={t('invoices', 'clientPlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={s.fieldLabel}>{t('invoices', 'email')}</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="email@ejemplo.com"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={s.row}>
                <View style={s.halfField}>
                  <Text style={s.fieldLabel}>{t('invoices', 'amount')} *</Text>
                  <TextInput
                    style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={s.halfField}>
                  <Text style={s.fieldLabel}>{t('invoices', 'currency')}</Text>
                  <TextInput
                    style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                    value={editCurrency}
                    onChangeText={setEditCurrency}
                    maxLength={3}
                    autoCapitalize="characters"
                    placeholder="MXN"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>

              <View style={s.row}>
                <View style={s.halfField}>
                  <Text style={s.fieldLabel}>{t('invoices', 'tax')} (%)</Text>
                  <TextInput
                    style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                    value={editTax}
                    onChangeText={setEditTax}
                    keyboardType="decimal-pad"
                    placeholder="16"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={s.halfField}>
                  <Text style={s.fieldLabel}>{t('invoices', 'discount')} (%)</Text>
                  <TextInput
                    style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                    value={editDiscount}
                    onChangeText={setEditDiscount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>

              <Text style={s.fieldLabel}>{t('invoices', 'status')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {INVOICE_STATUSES.map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[s.statusChip, editStatus === st && { backgroundColor: INVOICE_STATUS_COLORS[st] + '20', borderColor: INVOICE_STATUS_COLORS[st] }]}
                    onPress={() => setEditStatus(st)}
                  >
                    <Ionicons name={STATUS_ICONS[st] as any} size={16} color={editStatus === st ? INVOICE_STATUS_COLORS[st] : colors.textTertiary} />
                    <Text style={[s.statusChipText, { color: editStatus === st ? INVOICE_STATUS_COLORS[st] : colors.textSecondary }]}>
                      {t('invoices', `status${st.charAt(0).toUpperCase() + st.slice(1)}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.fieldLabel}>{t('invoices', 'dueDate')}</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editDueDate}
                onChangeText={setEditDueDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={s.fieldLabel}>{t('invoices', 'concept')}</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editConcept}
                onChangeText={setEditConcept}
                placeholder={t('invoices', 'conceptPlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={s.fieldLabel}>{t('invoices', 'notes')}</Text>
              <TextInput
                style={[s.textArea, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
                numberOfLines={3}
                placeholderTextColor={colors.textTertiary}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.saveBtnText}>{t('common', 'save')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  toggleBtn: { padding: 4 },
  statsScroll: { paddingLeft: 20, marginBottom: 12 },
  statCard: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, marginRight: 10, minWidth: 120 },
  statValue: { fontSize: 16, fontWeight: '700' },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 15, marginLeft: 8 },
  filterScroll: { paddingLeft: 20, marginBottom: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', marginRight: 8 },
  filterText: { fontSize: 13, fontWeight: '600' },
  filterCount: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 6 },
  filterCountText: { fontSize: 11, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  card: { borderRadius: 14, padding: 16, marginBottom: 10, backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardOverdue: { borderLeftWidth: 3, borderLeftColor: colors.error },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  invoiceNumber: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  clientName: { fontSize: 15, color: colors.textSecondary, marginBottom: 2 },
  email: { fontSize: 13, color: colors.textTertiary, marginBottom: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  amount: { fontSize: 18, fontWeight: '700' },
  dueDate: { fontSize: 12, color: colors.textTertiary },
  concept: { fontSize: 13, color: colors.textTertiary, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 100 },
  gridCard: { width: '46%', margin: '2%', borderRadius: 14, padding: 14, borderWidth: 1 },
  gridStatusDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 8 },
  gridInvoiceNumber: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  gridClient: { fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  gridAmount: { fontSize: 16, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: 12 },
  emptySub: { fontSize: 14, color: colors.textTertiary, marginTop: 4, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 15, borderWidth: 1 },
  textArea: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 80, borderWidth: 1 },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  statusChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  statusChipText: { fontSize: 13, fontWeight: '600', marginLeft: 6 },
  saveBtn: { borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 24, marginBottom: 40 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
