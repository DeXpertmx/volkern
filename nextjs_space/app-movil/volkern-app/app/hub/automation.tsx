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
  automationService, Automation, AutomationTrigger, AutomationAction,
  TRIGGER_TYPES, ACTION_TYPES,
} from '../../src/services/automation';

export default function AutomationScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [stats, setStats] = useState<{ total: number; enabled: number; disabled: number; totalRuns: number } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formTrigger, setFormTrigger] = useState<AutomationTrigger>({ type: 'lead_created', config: {} });
  const [formActions, setFormActions] = useState<AutomationAction[]>([{ type: 'send_notification', config: {} }]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [data, s] = await Promise.all([
        automationService.getAll(),
        automationService.getStats(),
      ]);
      setAutomations(data);
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
    setEditingAutomation(null);
    setFormName('');
    setFormDesc('');
    setFormTrigger({ type: 'lead_created', config: {} });
    setFormActions([{ type: 'send_notification', config: {} }]);
    setModalVisible(true);
  };

  const openEdit = (a: Automation) => {
    setEditingAutomation(a);
    setFormName(a.name);
    setFormDesc(a.description);
    setFormTrigger(a.trigger);
    setFormActions(a.actions);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      Alert.alert(t('common', 'error'), t('automation', 'nameRequired'));
      return;
    }
    try {
      if (editingAutomation) {
        await automationService.update(editingAutomation.id, {
          name: formName.trim(),
          description: formDesc.trim(),
          trigger: formTrigger,
          actions: formActions,
        });
      } else {
        await automationService.create({
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          trigger: formTrigger,
          actions: formActions,
        });
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('automation', 'saveError'));
    }
  };

  const handleDelete = (a: Automation) => {
    Alert.alert(
      t('automation', 'deleteConfirm'),
      t('automation', 'deleteAutomationConfirm', { name: a.name }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await automationService.delete(a.id); loadData(); },
        },
      ]
    );
  };

  const handleToggle = async (a: Automation) => {
    await automationService.toggleEnabled(a.id);
    loadData();
  };

  const renderItem = ({ item }: { item: Automation }) => {
    const triggerDef = TRIGGER_TYPES.find(t => t.value === item.trigger.type);
    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderLeftColor: item.enabled ? '#10B981' : '#64748B', borderLeftWidth: 3 }]}>
        <TouchableOpacity style={s.cardHeader} onPress={() => openEdit(item)}>
          <View style={s.cardTitleRow}>
            <Text style={[s.cardName, { color: colors.textPrimary }]}>{item.name}</Text>
            <TouchableOpacity onPress={() => handleToggle(item)}>
              <Ionicons
                name={item.enabled ? 'toggle' : 'toggle-outline'}
                size={28}
                color={item.enabled ? '#10B981' : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          {item.description ? (
            <Text style={[s.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <View style={s.cardMeta}>
            {triggerDef && (
              <View style={[s.badge, { backgroundColor: triggerDef.color + '15' }]}>
                <Ionicons name={triggerDef.icon as any} size={12} color={triggerDef.color} />
                <Text style={[s.badgeText, { color: triggerDef.color }]}>{triggerDef.label}</Text>
              </View>
            )}
            {item.runCount > 0 && (
              <Text style={[s.runCount, { color: colors.textTertiary }]}>
                {t('automation', 'runs', { n: item.runCount })}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <View style={s.cardActions}>
          <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
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
        data={automations}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <Text style={s.title}>{t('automation', 'title')}</Text>
              <TouchableOpacity style={s.addBtn} onPress={openNew}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            {stats && (
              <View style={s.statsRow}>
                <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                  <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.total}</Text>
                  <Text style={s.statLabel}>{t('automation', 'total')}</Text>
                </View>
                <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                  <Text style={[s.statValue, { color: '#10B981' }]}>{stats.enabled}</Text>
                  <Text style={s.statLabel}>{t('automation', 'enabled')}</Text>
                </View>
                <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                  <Text style={[s.statValue, { color: '#3B82F6' }]}>{stats.totalRuns}</Text>
                  <Text style={s.statLabel}>{t('automation', 'runs_short')}</Text>
                </View>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="settings-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('automation', 'noAutomations')}</Text>
            <TouchableOpacity style={s.emptyAction} onPress={openNew}>
              <Text style={s.emptyActionText}>{t('automation', 'newAutomation')}</Text>
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
                {editingAutomation ? t('automation', 'editAutomation') : t('automation', 'newAutomation')}
              </Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={s.modalSave}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody}>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('automation', 'namePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formName}
                onChangeText={setFormName}
              />
              <TextInput
                style={[s.textArea, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('automation', 'descPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formDesc}
                onChangeText={setFormDesc}
                multiline
              />

              {/* Trigger Selector */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('automation', 'trigger')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                {TRIGGER_TYPES.map(tr => (
                  <TouchableOpacity
                    key={tr.value}
                    style={[s.chip, formTrigger.type === tr.value && { backgroundColor: tr.color + '30', borderColor: tr.color }]}
                    onPress={() => setFormTrigger({ ...formTrigger, type: tr.value })}
                  >
                    <Ionicons name={tr.icon as any} size={14} color={formTrigger.type === tr.value ? tr.color : colors.textSecondary} />
                    <Text style={[s.chipText, { color: formTrigger.type === tr.value ? tr.color : colors.textSecondary }]}>
                      {tr.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Actions */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('automation', 'actions')}</Text>
              {formActions.map((action, idx) => (
                <View key={idx} style={[s.actionRow, { backgroundColor: colors.background }]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {ACTION_TYPES.map(at => (
                      <TouchableOpacity
                        key={at.value}
                        style={[s.actionChip, action.type === at.value && { backgroundColor: at.color + '30', borderColor: at.color }]}
                        onPress={() => {
                          const newActions = [...formActions];
                          newActions[idx] = { ...newActions[idx], type: at.value };
                          setFormActions(newActions);
                        }}
                      >
                        <Ionicons name={at.icon as any} size={14} color={action.type === at.value ? at.color : colors.textSecondary} />
                        <Text style={[s.chipText, { color: action.type === at.value ? at.color : colors.textSecondary }]}>
                          {at.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity onPress={() => {
                    if (formActions.length > 1) {
                      setFormActions(formActions.filter((_, i) => i !== idx));
                    }
                  }}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={[s.addActionBtn, { borderColor: colors.border }]}
                onPress={() => setFormActions([...formActions, { type: 'send_notification', config: {} }])}
              >
                <Ionicons name="add" size={18} color={colors.primary} />
                <Text style={[s.addActionText, { color: colors.primary }]}>{t('automation', 'addAction')}</Text>
              </TouchableOpacity>
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
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  card: { borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  cardHeader: { padding: 14 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 16, fontWeight: '600', flex: 1 },
  cardDesc: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  runCount: { fontSize: 12 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 8 },
  deleteBtn: { padding: 8 },
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
  chipRow: { marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, marginRight: 8 },
  chipText: { fontSize: 12, fontWeight: '500' },
  actionRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 10, marginBottom: 8 },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, marginRight: 6 },
  addActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', marginBottom: 20 },
  addActionText: { fontSize: 14, fontWeight: '500' },
});
