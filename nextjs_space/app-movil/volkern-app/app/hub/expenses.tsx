import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, RefreshControl, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  expenseService, Expense, ExpenseType, ExpenseCategory, CreateExpenseInput,
  EXPENSE_CATEGORIES,
} from '../../src/services/expenses';

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filterType, setFilterType] = useState<'all' | ExpenseType>('all');
  const [stats, setStats] = useState<any>(null);

  // Form state
  const [formType, setFormType] = useState<ExpenseType>('expense');
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('other');
  const [formDate, setFormDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [data, s] = await Promise.all([
        expenseService.getAll(),
        expenseService.getStats(),
      ]);
      setExpenses(data);
      setStats(s);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const openNew = () => {
    setEditingExpense(null);
    setFormType('expense');
    setFormDesc('');
    setFormAmount('');
    setFormCategory('other');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setModalVisible(true);
  };

  const openEdit = (e: Expense) => {
    setEditingExpense(e);
    setFormType(e.type);
    setFormDesc(e.description);
    setFormAmount(String(e.amount));
    setFormCategory(e.category);
    setFormDate(e.date);
    setFormNotes(e.notes);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formDesc.trim() || !formAmount.trim()) {
      Alert.alert(t('common', 'error'), t('expenses', 'requiredFields'));
      return;
    }
    const amount = Number(formAmount.trim());
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('common', 'error'), t('expenses', 'invalidAmount'));
      return;
    }
    try {
      const data: CreateExpenseInput = {
        type: formType,
        description: formDesc.trim(),
        amount,
        category: formCategory,
        date: formDate.trim() || new Date().toISOString().split('T')[0],
        notes: formNotes.trim() || undefined,
      };
      if (editingExpense) {
        await expenseService.update(editingExpense.id, data);
      } else {
        await expenseService.create(data);
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('expenses', 'saveError'));
    }
  };

  const handleDelete = (e: Expense) => {
    Alert.alert(
      t('expenses', 'deleteConfirm'),
      t('expenses', 'deleteExpenseConfirm', { desc: e.description }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await expenseService.delete(e.id); loadData(); },
        },
      ]
    );
  };

  const filtered = filterType === 'all'
    ? expenses
    : expenses.filter(e => e.type === filterType);

  const renderItem = ({ item }: { item: Expense }) => {
    const catConfig = EXPENSE_CATEGORIES.find(c => c.value === item.category);
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: colors.surface }]} onPress={() => openEdit(item)}>
        <View style={s.cardRow}>
          <View style={[s.cardIcon, { backgroundColor: (catConfig?.color || '#64748B') + '15' }]}>
            <Ionicons name={(catConfig?.icon || 'ellipsis-horizontal') as any} size={20} color={catConfig?.color || '#64748B'} />
          </View>
          <View style={s.cardContent}>
            <Text style={[s.cardDesc, { color: colors.textPrimary }]} numberOfLines={1}>{item.description}</Text>
            <Text style={[s.cardCat, { color: colors.textSecondary }]}>
              {catConfig?.label || item.category} · {item.date}
            </Text>
          </View>
          <View style={s.cardRight}>
            <Text style={[s.cardAmount, { color: item.type === 'expense' ? '#EF4444' : '#10B981' }]}>
              {item.type === 'expense' ? '-' : '+'}${item.amount.toLocaleString()}
            </Text>
            {item.notes ? <Text style={[s.cardNotes, { color: colors.textTertiary }]} numberOfLines={1}>{item.notes}</Text> : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }, s.center]}>
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
              <Text style={s.title}>{t('expenses', 'title')}</Text>
              <TouchableOpacity style={s.addBtn} onPress={openNew}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {stats && (
              <View style={[s.summaryCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.balance, { color: stats.balance >= 0 ? '#10B981' : '#EF4444' }]}>
                  {stats.balance >= 0 ? '+' : ''}${stats.balance.toLocaleString()}
                </Text>
                <Text style={[s.balanceLabel, { color: colors.textSecondary }]}>{t('expenses', 'balance')}</Text>
                <View style={s.summaryRow}>
                  <View style={s.summaryItem}>
                    <Text style={[s.summaryValue, { color: '#10B981' }]}>+${stats.monthlyIncome.toLocaleString()}</Text>
                    <Text style={[s.summaryLabel, { color: colors.textSecondary }]}>{t('expenses', 'income')}</Text>
                  </View>
                  <View style={s.summaryItem}>
                    <Text style={[s.summaryValue, { color: '#EF4444' }]}>-${stats.monthlyExpenses.toLocaleString()}</Text>
                    <Text style={[s.summaryLabel, { color: colors.textSecondary }]}>{t('expenses', 'expenses')}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Filter Tabs */}
            <View style={s.filterRow}>
              <TouchableOpacity
                style={[s.filterChip, filterType === 'all' && { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}
                onPress={() => setFilterType('all')}
              >
                <Text style={[s.filterText, { color: filterType === 'all' ? colors.primary : colors.textSecondary }]}>
                  {t('common', 'all')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.filterChip, filterType === 'expense' && { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                onPress={() => setFilterType('expense')}
              >
                <Text style={[s.filterText, { color: filterType === 'expense' ? '#EF4444' : colors.textSecondary }]}>
                  {t('expenses', 'expenses')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.filterChip, filterType === 'income' && { backgroundColor: '#D1FAE5', borderColor: '#10B981' }]}
                onPress={() => setFilterType('income')}
              >
                <Text style={[s.filterText, { color: filterType === 'income' ? '#10B981' : colors.textSecondary }]}>
                  {t('expenses', 'income')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="wallet-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('expenses', 'noExpenses')}</Text>
            <TouchableOpacity style={s.emptyAction} onPress={openNew}>
              <Text style={s.emptyActionText}>{t('expenses', 'addExpense')}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={s.modalCancel}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>
                {editingExpense ? t('expenses', 'editExpense') : t('expenses', 'addExpense')}
              </Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={s.modalSave}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody}>
              {/* Type toggle */}
              <View style={s.typeRow}>
                <TouchableOpacity
                  style={[s.typeBtn, formType === 'expense' && { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                  onPress={() => setFormType('expense')}
                >
                  <Ionicons name="arrow-down" size={16} color={formType === 'expense' ? '#EF4444' : colors.textSecondary} />
                  <Text style={[s.typeBtnText, { color: formType === 'expense' ? '#EF4444' : colors.textSecondary }]}>
                    {t('expenses', 'expense')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.typeBtn, formType === 'income' && { backgroundColor: '#D1FAE5', borderColor: '#10B981' }]}
                  onPress={() => setFormType('income')}
                >
                  <Ionicons name="arrow-up" size={16} color={formType === 'income' ? '#10B981' : colors.textSecondary} />
                  <Text style={[s.typeBtnText, { color: formType === 'income' ? '#10B981' : colors.textSecondary }]}>
                    {t('expenses', 'income')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('expenses', 'descPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formDesc}
                onChangeText={setFormDesc}
              />
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('expenses', 'amountPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formAmount}
                onChangeText={setFormAmount}
                keyboardType="numeric"
              />
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('expenses', 'datePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formDate}
                onChangeText={setFormDate}
              />

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('expenses', 'category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catRow}>
                {EXPENSE_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[s.catChip, formCategory === cat.value && { backgroundColor: cat.color + '30', borderColor: cat.color }]}
                    onPress={() => setFormCategory(cat.value)}
                  >
                    <Ionicons name={cat.icon as any} size={14} color={formCategory === cat.value ? cat.color : colors.textSecondary} />
                    <Text style={[s.catText, { color: formCategory === cat.value ? cat.color : colors.textSecondary }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput
                style={[s.textArea, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('expenses', 'notesPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formNotes}
                onChangeText={setFormNotes}
                multiline
              />
            </ScrollView>
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
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  summaryCard: { borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  balance: { fontSize: 32, fontWeight: '700' },
  balanceLabel: { fontSize: 13, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', gap: 16, width: '100%' },
  summaryItem: { flex: 1, alignItems: 'center', padding: 8, borderRadius: 8, backgroundColor: colors.background },
  summaryValue: { fontSize: 16, fontWeight: '600' },
  summaryLabel: { fontSize: 11, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  filterText: { fontSize: 14, fontWeight: '500' },
  card: { borderRadius: 12, marginBottom: 8, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1 },
  cardDesc: { fontSize: 15, fontWeight: '500' },
  cardCat: { fontSize: 12, marginTop: 1 },
  cardRight: { alignItems: 'flex-end' },
  cardAmount: { fontSize: 15, fontWeight: '700' },
  cardNotes: { fontSize: 11, marginTop: 1, maxWidth: 100 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12, marginBottom: 16 },
  emptyAction: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.primary },
  emptyActionText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  modalCancel: { fontSize: 16, color: colors.textSecondary },
  modalSave: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  modalBody: { padding: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  textArea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, minHeight: 80, textAlignVertical: 'top' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border },
  typeBtnText: { fontSize: 15, fontWeight: '600' },
  catRow: { marginBottom: 12 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, marginRight: 8 },
  catText: { fontSize: 12, fontWeight: '500' },
});
