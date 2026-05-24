import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { favoritesService } from '../../src/services/favorites';
import {
  taskService,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type CreateTaskInput,
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_CATEGORIES,
  getStatusLabel,
  getPriorityColor,
  getStatusIcon,
} from '../../src/services/tasks';

type SortMode = 'date_desc' | 'date_asc' | 'priority';

// ─── Priority Badge ──────────────────────────────────────────────────────────
function PriorityBadge({ priority, colors }: { priority: TaskPriority; colors: ReturnType<typeof useThemeColors> }) {
  const config = TASK_PRIORITIES.find(p => p.value === priority);
  return (
    <View style={[sty.priorityBadge, { backgroundColor: config?.color + '15' }]}>
      <View style={[sty.priorityDot, { backgroundColor: config?.color || colors.textTertiary }]} />
      <Text style={[sty.priorityText, { color: config?.color || colors.textTertiary }]}>
        {config?.label || priority}
      </Text>
    </View>
  );
}

// ─── Status Icon ─────────────────────────────────────────────────────────────
function StatusIcon({ status, colors }: { status: TaskStatus; colors: ReturnType<typeof useThemeColors> }) {
  const label = getStatusLabel(status);
  const icon = getStatusIcon(status);
  const color = status === 'completed' ? colors.success :
    status === 'cancelled' ? colors.textTertiary :
    status === 'in_progress' ? colors.warning : colors.primary;
  return <Ionicons name={icon as any} size={18} color={color} />;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TasksScreen() {
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const dateLocale = locale === 'en-US' ? 'en-US' : 'es-MX';
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Status filters (use t() inside component) ──────────────────────
  const statusFilters = useMemo((): { value: TaskStatus | 'all'; label: string }[] => [
    { value: 'all', label: t('tasks', 'all') },
    { value: 'pending', label: t('tasks', 'todo') },
    { value: 'in_progress', label: t('tasks', 'inProgress') },
    { value: 'completed', label: t('tasks', 'done') },
  ], [t]);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('date_desc');
  const [showSortPicker, setShowSortPicker] = useState(false);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium');
  const [formCategory, setFormCategory] = useState<string>('Otro');
  const [formDueDate, setFormDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Stats
  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
  } | null>(null);
  const [favTaskIds, setFavTaskIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    favoritesService.getFavoritedIds('task').then(setFavTaskIds);
  }, []);

  // ── Load ───────────────────────────────────────────────────────────
  const loadTasks = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [tasksData, statsData] = await Promise.all([
        taskService.getAll(statusFilter !== 'all' ? { status: statusFilter } : undefined),
        taskService.getStats().catch(() => null),
      ]);
      setTasks(tasksData);
      if (statsData) setStats(statsData);
    } catch (err: any) {
      setError(err?.message || t('tasks', 'errorLoading'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // ── Sort ───────────────────────────────────────────────────────────
  const sortedTasks = useMemo(() => {
    const list = [...tasks];
    switch (sortMode) {
      case 'date_desc':
        return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'date_asc':
        return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case 'priority': {
        const order: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return list.sort((a, b) => order[a.priority] - order[b.priority]);
      }
      default:
        return list;
    }
  }, [tasks, sortMode]);

  // ── Create / Edit ──────────────────────────────────────────────────
  const openCreate = () => {
    setEditingTask(null);
    setFormTitle('');
    setFormDescription('');
    setFormPriority('medium');
    setFormCategory('Otro');
    setFormDueDate('');
    setShowModal(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description);
    setFormPriority(task.priority);
    setFormCategory(task.category || 'Otro');
    setFormDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) {
      Alert.alert(t('common', 'error'), t('tasks', 'titleRequired'));
      return;
    }

    setSaving(true);
    try {
      if (editingTask) {
        await taskService.update(editingTask.id, {
          title: formTitle.trim(),
          description: formDescription.trim(),
          priority: formPriority,
          category: formCategory,
          dueDate: formDueDate || null,
        });
      } else {
        const input: CreateTaskInput = {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          priority: formPriority,
          category: formCategory,
          dueDate: formDueDate || undefined,
        };
        await taskService.create(input);
      }
      setShowModal(false);
      loadTasks(true);
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message || t('tasks', 'saveError'));
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle Status ──────────────────────────────────────────────────
  const toggleFav = async (task: Task) => {
    const nowFav = await favoritesService.toggle({
      id: task.id,
      type: 'task',
      name: task.title,
      icon: 'checkbox',
      color: getPriorityColor(task.priority),
    });
    setFavTaskIds(prev => {
      const next = new Set(prev);
      if (nowFav) next.add(task.id);
      else next.delete(task.id);
      return next;
    });
  };

  const toggleComplete = async (task: Task) => {
    const next: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await taskService.updateStatus(task.id, next);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next, completedAt: next === 'completed' ? new Date().toISOString() : null } : t));
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message || t('tasks', 'updateError'));
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────
  const handleDelete = (task: Task) => {
    Alert.alert(
      t('tasks', 'deleteConfirm'),
      t('tasks', 'deleteTaskConfirm', { title: task.title }),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await taskService.delete(task.id);
              setTasks(prev => prev.filter(t => t.id !== task.id));
            } catch (e: any) {
              Alert.alert(t('common', 'error'), e.message || t('tasks', 'deleteError'));
            }
          },
        },
      ],
    );
  };

  // ── Loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('tasks', 'title')}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('tasks', 'title')}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Ionicons name="cloud-offline" size={48} color={colors.error} />
          <Text style={[s.subtitle, { color: colors.error, textAlign: 'center', marginTop: spacing.md }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[s.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => loadTasks()}
          >
            <Text style={[s.retryText, { color: colors.white }]}>{t('common', 'retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const pendingCount = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
  const overdueCount = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled' || !t.dueDate) return false;
    return new Date(t.dueDate) < new Date();
  }).length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('tasks', 'title')}</Text>
          <Text style={[s.headerSub, { color: colors.textTertiary }]}>
            {pendingCount > 0 ? t('tasks', 'pendingCount', { n: pendingCount }) : t('tasks', 'allGood')}
            {overdueCount > 0 && ` · ${t('tasks', 'overdueCount', { n: overdueCount })}`}
          </Text>
        </View>
        <TouchableOpacity style={[s.addButton, { backgroundColor: colors.primary }]} onPress={openCreate}>
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      {stats && (
        <View style={[s.statsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.pending + stats.inProgress}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('tasks', 'statsActive')}</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: colors.warning }]}>{stats.overdue}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('tasks', 'statsOverdue')}</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: colors.success }]}>{stats.completed}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('tasks', 'done')}</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.total}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>{t('tasks', 'total')}</Text>
          </View>
        </View>
      )}

      {/* Filters + Sort */}
      <View style={[s.filterBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterContent}>
          {statusFilters.map(filter => (
            <TouchableOpacity
              key={filter.value}
              style={[
                s.filterChip,
                { backgroundColor: colors.background },
                statusFilter === filter.value && { backgroundColor: colors.primary },
              ]}
              onPress={() => setStatusFilter(filter.value)}
            >
              <Text style={[
                s.filterText,
                { color: colors.textSecondary },
                statusFilter === filter.value && { color: colors.white, fontWeight: '600' },
              ]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={s.sortButton} onPress={() => setShowSortPicker(!showSortPicker)}>
          <Ionicons
            name={sortMode === 'date_desc' ? 'arrow-down' : sortMode === 'date_asc' ? 'arrow-up' : 'funnel'}
            size={16}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Sort picker */}
      {showSortPicker && (
        <View style={[s.sortPicker, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {[
            { value: 'date_desc' as SortMode, label: t('tasks', 'sortRecent'), icon: 'arrow-down' as const },
            { value: 'date_asc' as SortMode, label: t('tasks', 'sortOldest'), icon: 'arrow-up' as const },
            { value: 'priority' as SortMode, label: t('tasks', 'sortPriority'), icon: 'funnel' as const },
          ].map(option => (
            <TouchableOpacity
              key={option.value}
              style={[s.sortOption, sortMode === option.value && { backgroundColor: colors.primaryBg }]}
              onPress={() => { setSortMode(option.value); setShowSortPicker(false); }}
            >
              <Ionicons name={option.icon} size={16} color={sortMode === option.value ? colors.primary : colors.textSecondary} />
              <Text style={[s.sortOptionText, { color: sortMode === option.value ? colors.primary : colors.textPrimary }]}>
                {option.label}
              </Text>
              {sortMode === option.value && <Ionicons name="checkmark" size={16} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Task list */}
      <ScrollView
        style={s.list}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadTasks(true)} tintColor={colors.primary} />
        }
      >
        {sortedTasks.length === 0 ? (
          <View style={s.empty}>
            <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="checkmark-done" size={40} color={colors.primary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {statusFilter === 'all' ? t('tasks', 'noTasksAll') : t('tasks', 'noTasksFilter')}
            </Text>
            <Text style={[s.emptySub, { color: colors.textTertiary }]}>
              {statusFilter === 'all' ? t('tasks', 'createFirstTask') : t('tasks', 'changeFilter')}
            </Text>
            <TouchableOpacity style={[s.emptyButton, { backgroundColor: colors.primary }]} onPress={openCreate}>
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={[s.emptyButtonText, { color: colors.white }]}>{t('tasks', 'newTask')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sortedTasks.map((task, index) => {
            const isOverdue = task.dueDate && task.status !== 'completed' && task.status !== 'cancelled' && new Date(task.dueDate) < new Date();
            const dueDateStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }) : null;
            const isFav = favTaskIds.has(task.id);

            return (
              <TouchableOpacity
                key={task.id}
                style={[s.taskCard, { backgroundColor: colors.surface }]}
                onPress={() => openEdit(task)}
                onLongPress={() => handleDelete(task)}
                activeOpacity={0.7}
              >
                {/* Checkbox / Status */}
                <TouchableOpacity
                  style={[s.checkbox, task.status === 'completed' && { backgroundColor: colors.success, borderColor: colors.success }]}
                  onPress={() => toggleComplete(task)}
                >
                  {task.status === 'completed' ? (
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                  ) : task.status === 'in_progress' ? (
                    <View style={[s.inProgressDot, { backgroundColor: colors.warning }]} />
                  ) : null}
                </TouchableOpacity>

                {/* Content */}
                <View style={s.taskContent}>
                  <View style={s.taskHeader}>
                    <Text
                      style={[
                        s.taskTitle,
                        { color: colors.textPrimary },
                        task.status === 'completed' && { textDecorationLine: 'line-through', color: colors.textTertiary },
                      ]}
                      numberOfLines={1}
                    >
                      {task.title}
                    </Text>
                    {task.category && (
                      <View style={[s.categoryChip, { backgroundColor: colors.primaryBg }]}>
                        <Text style={[s.categoryText, { color: colors.primary }]}>{task.category}</Text>
                      </View>
                    )}
                  </View>

                  {task.description ? (
                    <Text style={[s.taskDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                      {task.description}
                    </Text>
                  ) : null}

                  <View style={s.taskFooter}>
                    <PriorityBadge priority={task.priority} colors={colors} />
                    {dueDateStr && (
                      <View style={[s.dueDateBadge, isOverdue && { backgroundColor: colors.errorBg }]}>
                        <Ionicons
                          name="calendar-outline"
                          size={12}
                          color={isOverdue ? colors.error : colors.textTertiary}
                        />
                        <Text style={[s.dueDateText, { color: isOverdue ? colors.error : colors.textTertiary }]}>
                          {dueDateStr}
                          {isOverdue && ` (${t('tasks', 'overdue').toLowerCase()})`}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      onPress={() => toggleFav(task)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={isFav ? 'star' : 'star-outline'}
                        size={16}
                        color={isFav ? colors.warning : colors.textTertiary}
                      />
                    </TouchableOpacity>
                    <StatusIcon status={task.status} colors={colors} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ─── Create/Edit Modal ──────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                {editingTask ? t('tasks', 'editTask') : t('tasks', 'newTask')}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalScroll} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('tasks', 'taskTitle')} *</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder={t('tasks', 'titlePlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              {/* Description */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('tasks', 'taskDescription')}</Text>
              <TextInput
                style={[s.fieldInput, s.fieldTextArea, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder={t('tasks', 'descPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Priority */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('tasks', 'priority')}</Text>
              <View style={s.priorityRow}>
                {TASK_PRIORITIES.map(p => (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      s.priorityOption,
                      { borderColor: colors.border },
                      formPriority === p.value && { borderColor: p.color, backgroundColor: p.color + '10' },
                    ]}
                    onPress={() => setFormPriority(p.value)}
                  >
                    <View style={[sty.priorityDot, { backgroundColor: p.color }]} />
                    <Text style={[s.priorityOptionText, { color: formPriority === p.value ? p.color : colors.textSecondary }]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Category */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('tasks', 'category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>
                {TASK_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      s.categoryOption,
                      { backgroundColor: colors.background, borderColor: colors.border },
                      formCategory === cat && { backgroundColor: colors.primaryBg, borderColor: colors.primary },
                    ]}
                    onPress={() => setFormCategory(cat)}
                  >
                    <Text style={[
                      s.categoryOptionText,
                      { color: colors.textSecondary },
                      formCategory === cat && { color: colors.primary, fontWeight: '600' },
                    ]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Due Date */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('tasks', 'dueDate')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formDueDate}
                onChangeText={setFormDueDate}
                placeholder={t('tasks', 'datePlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              {/* Actions */}
              <View style={s.modalActions}>
                <TouchableOpacity
                  style={[s.modalCancel, { borderColor: colors.border }]}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalSave, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={[s.modalSaveText, { color: colors.white }]}>
                      {editingTask ? t('common', 'save') : t('common', 'create')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles Factory (reusable within this module) ───────────────────────────
export const sty = {
  priorityBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
};

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.h2,
  },
  headerSub: {
    ...typography.caption,
    marginTop: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  retryButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  retryText: {
    ...typography.body,
    fontWeight: '600',
  },

  // ─── Stats ─────────────────────────────────────────────────────────────────
  statsBar: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...typography.number,
    fontSize: 18,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    alignSelf: 'center',
  },

  // ─── Filters ──────────────────────────────────────────────────────────────
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  filterContent: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    flex: 1,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  filterText: {
    ...typography.bodySmall,
  },
  sortButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },

  // ─── Sort Picker ──────────────────────────────────────────────────────────
  sortPicker: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  sortOptionText: {
    ...typography.bodySmall,
    flex: 1,
  },

  // ─── Task List ─────────────────────────────────────────────────────────────
  list: {
    flex: 1,
  },
  listContent: {
    padding: layout.screenPadding,
    gap: spacing.sm,
    paddingBottom: 100,
  },

  // ─── Task Card ─────────────────────────────────────────────────────────────
  taskCard: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  inProgressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taskContent: {
    flex: 1,
    gap: spacing.xs,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taskTitle: {
    ...typography.bodySmall,
    fontWeight: '500',
    flex: 1,
  },
  categoryChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
  },
  taskDesc: {
    ...typography.caption,
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dueDateText: {
    fontSize: 10,
    fontWeight: '500',
  },

  // ─── Empty ─────────────────────────────────────────────────────────────────
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  emptyButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },

  // ─── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: layout.screenPadding,
    paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    ...typography.h3,
  },
  modalScroll: {
    maxHeight: '90%',
  },
  fieldLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  fieldInput: {
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    borderWidth: 1,
  },
  fieldTextArea: {
    minHeight: 80,
    paddingTop: spacing.md,
  },

  // ─── Priority selector ────────────────────────────────────────────────────
  priorityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  priorityOptionText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // ─── Category selector ─────────────────────────────────────────────────────
  categoryRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  categoryOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  categoryOptionText: {
    ...typography.caption,
  },

  // ─── Modal actions ─────────────────────────────────────────────────────────
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modalCancelText: {
    ...typography.body,
    fontWeight: '600',
  },
  modalSave: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  modalSaveText: {
    ...typography.body,
    fontWeight: '600',
  },
});
