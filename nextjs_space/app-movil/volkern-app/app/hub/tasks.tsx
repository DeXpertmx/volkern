import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { taskService, Task, TaskStatus, TaskPriority, CreateTaskInput, UpdateTaskInput, TASK_PRIORITIES, getPriorityColor, getStatusIcon } from '../../src/services/tasks';

const STATUS_TABS: { key: TaskStatus | 'all'; labelKey: string }[] = [
  { key: 'all', labelKey: 'all' },
  { key: 'pending', labelKey: 'todo' },
  { key: 'in_progress', labelKey: 'inProgress' },
  { key: 'completed', labelKey: 'done' },
];

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium');
  const [formDueDate, setFormDueDate] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await taskService.getAll({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search || undefined,
      });
      setTasks(data);
    } catch (err) {
      console.error('Error loading tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openNewTask = () => {
    setEditingTask(null);
    setFormTitle('');
    setFormDesc('');
    setFormPriority('medium');
    setFormDueDate('');
    setModalVisible(true);
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDesc(task.description || '');
    setFormPriority(task.priority);
    setFormDueDate(task.dueDate || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) {
      Alert.alert(t('tasks', 'titleRequired'));
      return;
    }
    try {
      const data: CreateTaskInput = {
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
        priority: formPriority,
        dueDate: formDueDate.trim() || undefined,
      };
      if (editingTask) {
        await taskService.update(editingTask.id, data as UpdateTaskInput);
      } else {
        await taskService.create(data);
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('tasks', 'saveError'));
    }
  };

  const handleDelete = (task: Task) => {
    Alert.alert(
      t('tasks', 'deleteConfirm'),
      t('tasks', 'deleteTaskConfirm', { title: task.title }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => {
            try {
              await taskService.delete(task.id);
              loadData();
            } catch { Alert.alert(t('tasks', 'deleteError')); }
          },
        },
      ]
    );
  };

  const handleToggleStatus = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await taskService.updateStatus(task.id, newStatus);
      loadData();
    } catch {
      Alert.alert(t('tasks', 'updateError'));
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length,
    overdue: tasks.filter(t => t.status === 'pending' && t.dueDate && t.dueDate < new Date().toISOString().split('T')[0]).length,
    completedToday: tasks.filter(t => t.status === 'completed' && t.completedAt && t.completedAt.startsWith(new Date().toISOString().split('T')[0])).length,
  };

  const renderTask = ({ item }: { item: Task }) => (
    <TouchableOpacity style={s.taskCard} onPress={() => openEditTask(item)}>
      <TouchableOpacity style={s.checkArea} onPress={() => handleToggleStatus(item)}>
        <Ionicons
          name={item.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={item.status === 'completed' ? '#10B981' : colors.textSecondary}
        />
      </TouchableOpacity>
      <View style={s.taskContent}>
        <Text style={[s.taskTitle, item.status === 'completed' && s.taskDone]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.description ? (
          <Text style={s.taskDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <View style={s.taskMeta}>
          <View style={[s.priorityBadge, { backgroundColor: getPriorityColor(item.priority) + '20' }]}>
            <Text style={[s.priorityText, { color: getPriorityColor(item.priority) }]}>
              {t('tasks', item.priority)}
            </Text>
          </View>
          {item.dueDate && (
            <Text style={[s.dueDate, item.dueDate < new Date().toISOString().split('T')[0] && item.status !== 'completed' && { color: '#EF4444' }]}>
              {item.dueDate}
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity style={s.deleteIcon} onPress={() => handleDelete(item)}>
        <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={filteredTasks}
        keyExtractor={item => item.id}
        renderItem={renderTask}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={s.header}>
              <Text style={s.title}>{t('tasks', 'title')}</Text>
              <TouchableOpacity style={s.addButton} onPress={openNewTask}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Stats */}
            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={s.statValue}>{stats.pending}</Text>
                <Text style={s.statLabel}>{t('tasks', 'statsActive')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#EF4444' }]}>{stats.overdue}</Text>
                <Text style={s.statLabel}>{t('tasks', 'statsOverdue')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#10B981' }]}>{stats.completedToday}</Text>
                <Text style={s.statLabel}>{t('tasks', 'statsCompletedToday')}</Text>
              </View>
            </View>

            {/* Search */}
            <TextInput
              style={[s.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder={t('tasks', 'titlePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
            />

            {/* Status tabs */}
            <ScrollableTabs
              tabs={STATUS_TABS.map(st => ({ key: st.key, label: t('tasks', st.labelKey) }))}
              active={statusFilter}
              onSelect={(k: string) => setStatusFilter(k as TaskStatus | 'all')}
              colors={colors}
            />
          </>
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="checkbox-outline" size={48} color={colors.textSecondary} />
            <Text style={s.emptyText}>{t('tasks', 'noTasks')}</Text>
            <TouchableOpacity style={s.emptyAction} onPress={openNewTask}>
              <Text style={s.emptyActionText}>{t('tasks', 'newTask')}</Text>
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
                {editingTask ? t('tasks', 'editTask') : t('tasks', 'newTask')}
              </Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={s.modalSave}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>

            <View style={s.modalBody}>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('tasks', 'titlePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formTitle}
                onChangeText={setFormTitle}
              />
              <TextInput
                style={[s.textArea, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('tasks', 'descPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formDesc}
                onChangeText={setFormDesc}
                multiline
              />
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('tasks', 'priority')}</Text>
              <View style={s.priorityRow}>
                {TASK_PRIORITIES.map(p => (
                  <TouchableOpacity
                    key={p.value}
                    style={[s.priorityChip, formPriority === p.value && { backgroundColor: p.color + '30', borderColor: p.color }]}
                    onPress={() => setFormPriority(p.value)}
                  >
                    <Text style={[s.priorityChipText, { color: formPriority === p.value ? p.color : colors.textSecondary }]}>
                      {t('tasks', p.value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('tasks', 'datePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formDueDate}
                onChangeText={setFormDueDate}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ScrollableTabs({ tabs, active, onSelect, colors }: any) {
  return (
    <View style={tabStyles(colors).row}>
      {tabs.map((tab: any) => (
        <TouchableOpacity
          key={tab.key}
          style={[tabStyles(colors).chip, active === tab.key && tabStyles(colors).chipActive]}
          onPress={() => onSelect(tab.key)}
        >
          <Text style={[tabStyles(colors).text, active === tab.key && tabStyles(colors).textActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tabStyles = (colors: any) => StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary },
  text: { fontSize: 14, color: colors.textSecondary },
  textActive: { color: '#fff', fontWeight: '600' },
});

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  taskCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  checkArea: { marginRight: 12 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  taskDone: { textDecorationLine: 'line-through', color: colors.textSecondary, opacity: 0.6 },
  taskDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  priorityText: { fontSize: 11, fontWeight: '600' },
  dueDate: { fontSize: 12, color: colors.textSecondary },
  deleteIcon: { padding: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12, marginBottom: 16 },
  emptyAction: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.primary },
  emptyActionText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  modalCancel: { fontSize: 16, color: colors.textSecondary },
  modalSave: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  modalBody: { padding: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  textArea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, minHeight: 80, textAlignVertical: 'top' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  priorityChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border },
  priorityChipText: { fontSize: 13, fontWeight: '500' },
});
