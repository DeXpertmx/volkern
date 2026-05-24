import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, RefreshControl, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { projectService, Project, ProjectStatus, CreateProjectInput, PROJECT_STATUSES, PROJECT_PRIORITIES } from '../../src/services/projects';

const STATUS_TABS: { key: ProjectStatus | 'all'; labelKey: string }[] = [
  { key: 'all', labelKey: 'all' },
  { key: 'active', labelKey: 'active' },
  { key: 'paused', labelKey: 'paused' },
  { key: 'completed', labelKey: 'completed' },
];

export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formBudget, setFormBudget] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectService.getAll({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search || undefined,
      });
      setProjects(data);
    } catch (err) {
      console.error('Error loading projects:', err);
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

  const openNewProject = () => {
    setEditingProject(null);
    setFormName('');
    setFormDesc('');
    setFormPriority('medium');
    setFormStartDate('');
    setFormEndDate('');
    setFormBudget('');
    setModalVisible(true);
  };

  const openEditProject = (p: Project) => {
    setEditingProject(p);
    setFormName(p.name);
    setFormDesc(p.description);
    setFormPriority(p.priority);
    setFormStartDate(p.startDate);
    setFormEndDate(p.endDate || '');
    setFormBudget(String(p.budget));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      Alert.alert(t('projects', 'nameRequired'));
      return;
    }
    try {
      const data: CreateProjectInput = {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        priority: formPriority,
        startDate: formStartDate.trim() || undefined,
        endDate: formEndDate.trim() || null,
        budget: formBudget.trim() ? Number(formBudget.trim()) : undefined,
      };
      if (editingProject) {
        await projectService.update(editingProject.id, data as any);
      } else {
        await projectService.create(data);
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('projects', 'saveError'));
    }
  };

  const handleDelete = (p: Project) => {
    Alert.alert(
      t('projects', 'deleteConfirm'),
      t('projects', 'deleteProjectConfirm', { name: p.name }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => {
            try { await projectService.delete(p.id); loadData(); }
            catch { Alert.alert(t('projects', 'deleteError')); }
          },
        },
      ]
    );
  };

  const getPriorityColor = (p: string) => {
    const found = PROJECT_PRIORITIES.find(pp => pp.value === p);
    return found ? found.color : '#94A3B8';
  };

  const getStatusColor = (s: string) => {
    const found = PROJECT_STATUSES.find(ps => ps.value === s);
    return found ? found.color : '#64748B';
  };

  const getStatusIcon = (s: string) => {
    const found = PROJECT_STATUSES.find(ps => ps.value === s);
    return found ? found.icon : 'ellipse';
  };

  const filteredProjects = projects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    completed: projects.filter(p => p.status === 'completed').length,
    avgProgress: projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0,
  };

  const renderProject = ({ item }: { item: Project }) => {
    const expanded = expandedId === item.id;
    const doneTasks = item.tasks.filter(t => t.status === 'done').length;
    return (
      <View style={[s.projectCard, { borderLeftColor: getStatusColor(item.status), borderLeftWidth: 4 }]}>
        <TouchableOpacity style={s.projectHeader} onPress={() => openEditProject(item)} onLongPress={() => setExpandedId(expanded ? null : item.id)}>
          <View style={s.projectInfo}>
            <View style={[s.projectIcon, { backgroundColor: item.color + '20' }]}>
              <Ionicons name={(item.icon || 'rocket') as any} size={22} color={item.color} />
            </View>
            <View style={s.projectContent}>
              <Text style={s.projectName} numberOfLines={1}>{item.name}</Text>
              <View style={s.projectMeta}>
                <View style={[s.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                  <Text style={[s.statusText, { color: getStatusColor(item.status) }]}>
                    {t('projects', 'status' + item.status.charAt(0).toUpperCase() + item.status.slice(1))}
                  </Text>
                </View>
                <Text style={s.projectMetaText}>{item.members.length} members</Text>
              </View>
            </View>
          </View>
          <View style={s.projectRight}>
            <View style={[s.priorityDot, { backgroundColor: getPriorityColor(item.priority) }]} />
            <Text style={s.budgetText}>${item.budget.toLocaleString()}</Text>
          </View>
        </TouchableOpacity>

        {/* Progress bar */}
        <View style={s.progressSection}>
          <View style={s.progressBarBg}>
            <View style={[s.progressBarFill, { width: `${item.progress}%`, backgroundColor: item.progress === 100 ? '#10B981' : item.color }]} />
          </View>
          <Text style={s.progressText}>{item.progress}%</Text>
        </View>

        {/* Expanded details */}
        {expanded && (
          <View style={s.expandedSection}>
            {item.description ? (
              <Text style={s.expandedDesc} numberOfLines={3}>{item.description}</Text>
            ) : null}
            {item.tasks.length > 0 && (
              <View style={s.tasksSection}>
                <Text style={s.tasksTitle}>{t('projects', 'tasks')} ({doneTasks}/{item.tasks.length})</Text>
                {item.tasks.slice(0, 5).map(task => (
                  <View key={task.id} style={s.taskRow}>
                    <Ionicons
                      name={task.status === 'done' ? 'checkmark-circle' : task.status === 'in_progress' ? 'time-outline' : 'ellipse-outline'}
                      size={16}
                      color={task.status === 'done' ? '#10B981' : colors.textSecondary}
                    />
                    <Text style={[s.taskRowText, task.status === 'done' && { textDecorationLine: 'line-through', color: colors.textSecondary }]}>
                      {task.title}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={s.projectActions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={filteredProjects}
        keyExtractor={item => item.id}
        renderItem={renderProject}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={s.header}>
              <Text style={s.title}>{t('projects', 'title')}</Text>
              <TouchableOpacity style={s.addButton} onPress={openNewProject}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Stats */}
            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#3B82F6' }]}>{stats.active}</Text>
                <Text style={s.statLabel}>{t('projects', 'active')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#10B981' }]}>{stats.completed}</Text>
                <Text style={s.statLabel}>{t('projects', 'completed')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#F59E0B' }]}>{stats.avgProgress}%</Text>
                <Text style={s.statLabel}>{t('projects', 'progress')}</Text>
              </View>
            </View>

            {/* Search */}
            <TextInput
              style={[s.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder={t('projects', 'searchPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
            />

            {/* Status tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
              {STATUS_TABS.map(st => (
                <TouchableOpacity
                  key={st.key}
                  style={[s.filterChip, statusFilter === st.key && s.filterChipActive]}
                  onPress={() => setStatusFilter(st.key)}
                >
                  <Text style={[s.filterChipText, statusFilter === st.key && s.filterChipTextActive]}>
                    {t('projects', st.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={colors.textSecondary} />
            <Text style={s.emptyText}>{t('projects', 'noProjects')}</Text>
            <TouchableOpacity style={s.emptyAction} onPress={openNewProject}>
              <Text style={s.emptyActionText}>{t('projects', 'newProject')}</Text>
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
                {editingProject ? t('projects', 'editProject') : t('projects', 'newProject')}
              </Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={s.modalSave}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalBody}>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('projects', 'namePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formName}
                onChangeText={setFormName}
              />
              <TextInput
                style={[s.textArea, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('projects', 'descPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formDesc}
                onChangeText={setFormDesc}
                multiline
              />

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('projects', 'priority')}</Text>
              <View style={s.priorityRow}>
                {PROJECT_PRIORITIES.map(p => (
                  <TouchableOpacity
                    key={p.value}
                    style={[s.priorityChip, formPriority === p.value && { backgroundColor: p.color + '30', borderColor: p.color }]}
                    onPress={() => setFormPriority(p.value)}
                  >
                    <Text style={[s.priorityChipText, { color: formPriority === p.value ? p.color : colors.textSecondary }]}>
                      {t('projects', 'priority' + p.value.charAt(0).toUpperCase() + p.value.slice(1))}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.dateRow}>
                <TextInput
                  style={[s.dateInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder={t('projects', 'startDate')}
                  placeholderTextColor={colors.textSecondary}
                  value={formStartDate}
                  onChangeText={setFormStartDate}
                />
                <TextInput
                  style={[s.dateInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder={t('projects', 'endDate')}
                  placeholderTextColor={colors.textSecondary}
                  value={formEndDate}
                  onChangeText={setFormEndDate}
                />
              </View>

              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('projects', 'budget')}
                placeholderTextColor={colors.textSecondary}
                value={formBudget}
                onChangeText={setFormBudget}
                keyboardType="numeric"
              />

              {editingProject && (
                <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(editingProject)}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  <Text style={s.deleteBtnText}>{t('common', 'delete')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  filterRow: { flexDirection: 'row', marginBottom: 16 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, marginRight: 8 },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 14, color: colors.textSecondary },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  projectCard: { backgroundColor: colors.surface, borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  projectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  projectInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  projectIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  projectContent: { flex: 1 },
  projectName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  projectMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  projectMetaText: { fontSize: 12, color: colors.textSecondary },
  projectRight: { alignItems: 'flex-end', gap: 4 },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  budgetText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  progressSection: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  progressBarBg: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3 },
  progressBarFill: { height: 6, borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, width: 40, textAlign: 'right' },
  expandedSection: { paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  expandedDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  tasksSection: {},
  tasksTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  taskRowText: { fontSize: 13, color: colors.textPrimary, flex: 1 },
  projectActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  actionBtn: { padding: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
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
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  priorityChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border },
  priorityChipText: { fontSize: 13, fontWeight: '500' },
  dateRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dateInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FEE2E2', marginTop: 8 },
  deleteBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
});
