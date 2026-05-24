import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  RefreshControl,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { goalsService, type Goal, type GoalStatus, type GoalType, type Milestone } from '../../src/services/goals';

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON_OPTIONS: { key: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'trending-up', icon: 'trending-up' },
  { key: 'cash', icon: 'cash' },
  { key: 'people', icon: 'people' },
  { key: 'calendar', icon: 'calendar' },
  { key: 'checkbox', icon: 'checkbox' },
  { key: 'chatbubbles', icon: 'chatbubbles' },
  { key: 'megaphone', icon: 'megaphone' },
  { key: 'stats-chart', icon: 'stats-chart' },
  { key: 'heart', icon: 'heart' },
  { key: 'star', icon: 'star' },
  { key: 'fitness', icon: 'fitness' },
  { key: 'book', icon: 'book' },
  { key: 'flag', icon: 'flag' },
  { key: 'trophy', icon: 'trophy' },
  { key: 'bulb', icon: 'bulb' },
];

const COLOR_OPTIONS = [
  '#2563EB', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#06B6D4', '#F97316', '#EF4444', '#64748B',
  '#14B8A6', '#84CC16', '#A855F7', '#FB923C', '#22D3EE',
];

type FilterTab = 'active' | 'completed' | 'all';

// ─── Progress Ring ────────────────────────────────────────────────────────────
function ProgressRing({ progress, size, color, bgColor }: {
  progress: number;
  size: number;
  color: string;
  bgColor: string;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: size - 6, height: size - 6, borderRadius: (size - 6) / 2, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: size * 0.3, fontWeight: '700', color }}>{progress}%</Text>
      </View>
    </View>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────
function GoalCard({ goal, colors, sty, onPress, onToggle }: {
  goal: Goal;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
  onPress: () => void;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const progress = goal.type === 'boolean'
    ? (goal.currentValue >= 1 ? 100 : 0)
    : goal.currentValue >= goal.targetValue ? 100
    : Math.round((goal.currentValue / goal.targetValue) * 100);

  const isOverdue = goal.deadline && goal.deadline < Date.now() && goal.status === 'active';

  const color = goal.color || colors.primary;

  return (
    <TouchableOpacity
      style={[sty.goalCard, { backgroundColor: colors.surface, borderLeftColor: color }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={sty.goalHeader}>
        <View style={[sty.goalIcon, { backgroundColor: color + '15' }]}>
          <Ionicons name={goal.icon as any || 'flag'} size={20} color={color} />
        </View>
        <View style={sty.goalInfo}>
          <Text style={[sty.goalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {goal.title}
          </Text>
          <Text style={[sty.goalMeta, { color: colors.textTertiary }]} numberOfLines={1}>
            {goal.type === 'percentage' ? t('goals', 'typePercentage') :
             goal.type === 'boolean' ? t('goals', 'typeBoolean') :
             goal.unit ? `${goal.unit} · ${t('goals', 'typeNumeric')}` : t('goals', 'typeNumeric')}
            {goal.deadline ? ` · ${new Date(goal.deadline).toLocaleDateString()}` : ''}
            {isOverdue ? ` · ${t('goals', 'overdue')}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onToggle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons
            name={goal.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={goal.status === 'completed' ? colors.success : colors.textTertiary}
          />
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={sty.progressRow}>
        <View style={[sty.progressBarBg, { backgroundColor: colors.borderLight }]}>
          <View style={[sty.progressBarFill, { width: `${Math.min(progress, 100)}%`, backgroundColor: isOverdue ? colors.error : color }]} />
        </View>
        {goal.type !== 'boolean' && (
          <Text style={[sty.progressText, { color: colors.textTertiary }]}>
            {t('goals', 'progressValue', { current: goal.currentValue, target: goal.targetValue })}
          </Text>
        )}
        {goal.type === 'boolean' && (
          <Text style={[sty.progressText, { color: colors.textTertiary }]}>
            {goal.currentValue >= 1 ? t('goals', 'achieved') : t('goals', 'notAchieved')}
          </Text>
        )}
      </View>

      {/* Status badge */}
      <View style={sty.goalFooter}>
        <View style={[sty.statusBadge, {
          backgroundColor: goal.status === 'completed' ? colors.successBg :
                           goal.status === 'cancelled' ? colors.errorBg : colors.primaryBg,
        }]}>
          <Text style={[sty.statusText, {
            color: goal.status === 'completed' ? colors.success :
                   goal.status === 'cancelled' ? colors.error : color,
          }]}>
            {goal.status === 'completed' ? t('goals', 'completed') :
             goal.status === 'cancelled' ? t('goals', 'cancelled') : `${progress}%`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────────────────
function StatsCard({ stats, colors, sty }: {
  stats: { active: number; completed: number; total: number; overallProgress: number };
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const { t } = useI18n();
  return (
    <View style={[sty.statsCard, { backgroundColor: colors.surface }]}>
      <View style={sty.statsHeaderRow}>
        <View style={[sty.statsIcon, { backgroundColor: colors.primaryBg }]}>
          <Ionicons name="stats-chart" size={18} color={colors.primary} />
        </View>
        <Text style={[sty.statsTitle, { color: colors.textPrimary }]}>{t('goals', 'statsTitle')}</Text>
      </View>
      <View style={sty.statsBody}>
        <ProgressRing progress={stats.overallProgress} size={80} color={colors.primary} bgColor={colors.primaryBg} />
        <View style={sty.statsInfo}>
          <View style={sty.statRow}>
            <View style={[sty.statDot, { backgroundColor: colors.primary }]} />
            <Text style={[sty.statLabel, { color: colors.textSecondary }]}>{t('goals', 'active')}</Text>
            <Text style={[sty.statValue, { color: colors.textPrimary }]}>{stats.active}</Text>
          </View>
          <View style={sty.statRow}>
            <View style={[sty.statDot, { backgroundColor: colors.success }]} />
            <Text style={[sty.statLabel, { color: colors.textSecondary }]}>{t('goals', 'completed')}</Text>
            <Text style={[sty.statValue, { color: colors.textPrimary }]}>{stats.completed}</Text>
          </View>
          <View style={sty.statRow}>
            <View style={[sty.statDot, { backgroundColor: colors.textTertiary }]} />
            <Text style={[sty.statLabel, { color: colors.textSecondary }]}>{t('goals', 'all')}</Text>
            <Text style={[sty.statValue, { color: colors.textPrimary }]}>{stats.total}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Milestone Item ───────────────────────────────────────────────────────────
function MilestoneItem({ milestone, colors, sty, onToggle }: {
  milestone: Milestone;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
  onToggle: () => void;
}) {
  return (
    <View style={sty.milestoneRow}>
      <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons
          name={milestone.completed ? 'checkmark-circle' : 'radio-button-off'}
          size={20}
          color={milestone.completed ? colors.success : colors.textTertiary}
        />
      </TouchableOpacity>
      <Text style={[sty.milestoneText, { color: colors.textPrimary, textDecorationLine: milestone.completed ? 'line-through' : 'none', opacity: milestone.completed ? 0.6 : 1 }]}>
        {milestone.title}
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GoalsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({});
  const [stats, setStats] = useState({ active: 0, completed: 0, total: 0, overallProgress: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('active');
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<GoalType>('numeric');
  const [formTarget, setFormTarget] = useState('');
  const [formCurrent, setFormCurrent] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [formIcon, setFormIcon] = useState('flag');
  const [formColor, setFormColor] = useState(COLOR_OPTIONS[0]);
  const [formDeadline, setFormDeadline] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);

  // Milestone modal
  const [showMsModal, setShowMsModal] = useState(false);
  const [msGoalId, setMsGoalId] = useState<string | null>(null);
  const [msTitle, setMsTitle] = useState('');
  const [msTarget, setMsTarget] = useState('');

  const [inlineProgress, setInlineProgress] = useState('');
  const [saving, setSaving] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;

  // ─── Load data ───────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [allGoals, allStats] = await Promise.all([
        goalsService.getAll(),
        goalsService.getStats(),
      ]);
      setGoals(allGoals);
      setStats(allStats);

      // Load milestones for expanded goal
      const allMilestones: Record<string, Milestone[]> = {};
      for (const g of allGoals) {
        allMilestones[g.id] = await goalsService.getMilestones(g.id);
      }
      setMilestones(allMilestones);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Pull to refresh ─────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // ─── Filtered goals ──────────────────────────────────────────────────
  const filteredGoals = useMemo(() => {
    if (filterTab === 'all') return goals;
    return goals.filter((g) => g.status === filterTab);
  }, [goals, filterTab]);

  // ─── Toggle goal status ──────────────────────────────────────────────
  const handleToggle = useCallback(async (goal: Goal) => {
    if (goal.status === 'active') {
      // Complete it
      const updated = await goalsService.updateProgress(goal.id, goal.targetValue);
      if (updated) {
        setGoals((prev) => prev.map((g) => g.id === goal.id ? updated : g));
        const newStats = await goalsService.getStats();
        setStats(newStats);
      }
    } else {
      // Reactivate
      const updated = await goalsService.setStatus(goal.id, 'active');
      if (updated) {
        setGoals((prev) => prev.map((g) => g.id === goal.id ? updated : g));
        const newStats = await goalsService.getStats();
        setStats(newStats);
      }
    }
  }, []);

  // ─── Open create modal ───────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditingGoal(null);
    setFormTitle('');
    setFormDescription('');
    setFormType('numeric');
    setFormTarget('');
    setFormCurrent('0');
    setFormUnit('');
    setFormIcon('flag');
    setFormColor(COLOR_OPTIONS[0]);
    setFormDeadline('');
    setShowModal(true);
  }, []);

  // ─── Open edit modal ─────────────────────────────────────────────────
  const openEdit = useCallback((goal: Goal) => {
    setEditingGoal(goal);
    setFormTitle(goal.title);
    setFormDescription(goal.description);
    setFormType(goal.type);
    setFormTarget(String(goal.targetValue));
    setFormCurrent(String(goal.currentValue));
    setFormUnit(goal.unit);
    setFormIcon(goal.icon);
    setFormColor(goal.color);
    setFormDeadline(goal.deadline ? new Date(goal.deadline).toISOString().slice(0, 10) : '');
    setShowModal(true);
  }, []);

  // ─── Save goal ───────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!formTitle.trim()) {
      Alert.alert(t('common', 'error'), t('common', 'required'));
      return;
    }
    const targetVal = parseFloat(formTarget) || 0;
    const currentVal = parseFloat(formCurrent) || 0;

    setSaving(true);
    try {
      if (editingGoal) {
        await goalsService.update(editingGoal.id, {
          title: formTitle.trim(),
          description: formDescription.trim(),
          type: formType,
          targetValue: targetVal,
          currentValue: currentVal,
          unit: formUnit.trim(),
          icon: formIcon,
          color: formColor,
          deadline: formDeadline ? new Date(formDeadline).getTime() : undefined,
        });
      } else {
        await goalsService.create({
          title: formTitle.trim(),
          description: formDescription.trim(),
          type: formType,
          targetValue: targetVal,
          currentValue: currentVal,
          unit: formUnit.trim(),
          icon: formIcon,
          color: formColor,
          deadline: formDeadline ? new Date(formDeadline).getTime() : undefined,
          status: 'active',
        });
      }
      setShowModal(false);
      await loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('common', 'errorOccurred'));
    } finally {
      setSaving(false);
    }
  }, [formTitle, formDescription, formType, formTarget, formCurrent, formUnit, formIcon, formColor, formDeadline, editingGoal, t, loadData]);

  // ─── Delete goal ─────────────────────────────────────────────────────
  const handleDelete = useCallback((goal: Goal) => {
    Alert.alert(
      t('goals', 'deleteConfirm'),
      t('goals', 'deleteGoalConfirm', { title: goal.title }),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            await goalsService.delete(goal.id);
            await loadData();
          },
        },
      ],
    );
  }, [t, loadData]);

  // ─── Add milestone ───────────────────────────────────────────────────
  const handleAddMilestone = useCallback(async () => {
    if (!msTitle.trim() || !msGoalId) return;
    const targetVal = parseFloat(msTarget) || 0;
    await goalsService.addMilestone(msGoalId, msTitle.trim(), targetVal);
    setShowMsModal(false);
    setMsTitle('');
    setMsTarget('');
    // Reload milestones for the goal
    const updated = await goalsService.getMilestones(msGoalId);
    setMilestones((prev) => ({ ...prev, [msGoalId]: updated }));
  }, [msTitle, msTarget, msGoalId]);

  // ─── Toggle milestone ────────────────────────────────────────────────
  const handleToggleMilestone = useCallback(async (ms: Milestone) => {
    if (ms.completed) {
      await goalsService.uncompleteMilestone(ms.id);
    } else {
      await goalsService.completeMilestone(ms.id);
    }
    const updated = await goalsService.getMilestones(ms.goalId);
    setMilestones((prev) => ({ ...prev, [ms.goalId]: updated }));
  }, []);

  // ─── Clear all ───────────────────────────────────────────────────────
  const handleClearAll = useCallback(() => {
    Alert.alert(t('goals', 'clearAll'), t('goals', 'clearAllConfirm'), [
      { text: t('common', 'cancel'), style: 'cancel' },
      {
        text: t('common', 'delete'),
        style: 'destructive',
        onPress: async () => {
          await goalsService.clearAll();
          await loadData();
        },
      },
    ]);
  }, [t, loadData]);

  // ─── Styles ──────────────────────────────────────────────────────────
  const s = useMemo(() => makeStyles(colors), [colors]);

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <RNStatusBar barStyle={colors.textPrimary === '#0F172A' ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[s.headerBack, { backgroundColor: colors.background }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('goals', 'title')}</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>{t('goals', 'subtitle')}</Text>
        </View>
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: colors.primary }]}
          onPress={openCreate}
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Stats card */}
        <StatsCard stats={stats} colors={colors} sty={s} />

        {/* Filter tabs */}
        <View style={s.filterRow}>
          {(['active', 'completed', 'all'] as FilterTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                s.filterTab,
                filterTab === tab && { backgroundColor: colors.primary, ...shadows.sm },
              ]}
              onPress={() => setFilterTab(tab)}
            >
              <Text style={[
                s.filterText,
                { color: filterTab === tab ? colors.white : colors.textSecondary },
                filterTab === tab && { fontWeight: '600' },
              ]}>
                {tab === 'active' ? t('goals', 'active') :
                 tab === 'completed' ? t('goals', 'completed') : t('goals', 'all')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Goal list */}
        {loading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredGoals.length === 0 ? (
          <View style={s.emptyState}>
            <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="flag-outline" size={40} color={colors.primary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {filterTab === 'active' ? t('goals', 'emptyActive') :
               filterTab === 'completed' ? t('goals', 'emptyCompleted') : t('goals', 'noGoals')}
            </Text>
            <Text style={[s.emptySub, { color: colors.textTertiary }]}>
              {filterTab === 'active' ? t('goals', 'emptyActiveSub') :
               filterTab === 'completed' ? t('goals', 'emptyCompletedSub') : t('goals', 'noGoalsSub')}
            </Text>
            {filterTab !== 'completed' && (
              <TouchableOpacity
                style={[s.createBtn, { backgroundColor: colors.primary }]}
                onPress={openCreate}
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={s.createBtnText}>{t('goals', 'newGoal')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {filteredGoals.map((goal) => (
              <View key={goal.id}>
                <GoalCard
                  goal={goal}
                  colors={colors}
                  sty={s}
                  onPress={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)}
                  onToggle={() => handleToggle(goal)}
                />

                {/* Expanded detail */}
                {expandedGoalId === goal.id && (
                  <View style={[s.expandedCard, { backgroundColor: colors.surface }]}>
                    <Text style={[s.expandedDesc, { color: colors.textSecondary }]}>
                      {goal.description || t('common', 'noData')}
                    </Text>

                    {/* Update progress */}
                    <View style={s.expandedSection}>
                      <Text style={[s.expandedSectionTitle, { color: colors.textPrimary }]}>{t('goals', 'progress')}</Text>
                      <View style={s.updateProgressRow}>
                        <TextInput
                          style={[s.progressInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                          value={inlineProgress}
                          onChangeText={setInlineProgress}
                          keyboardType="numeric"
                          placeholder={String(goal.currentValue)}
                          placeholderTextColor={colors.textTertiary}
                        />
                        <Text style={[s.progressSeparator, { color: colors.textTertiary }]}>/</Text>
                        <Text style={[s.progressTarget, { color: colors.textPrimary }]}>{goal.targetValue} {goal.unit}</Text>
                        <TouchableOpacity
                          style={[s.updateBtn, { backgroundColor: colors.primary }]}
                          onPress={async () => {
                            const val = parseFloat(inlineProgress) || 0;
                            const updated = await goalsService.updateProgress(goal.id, val);
                            if (updated) {
                              setGoals((prev) => prev.map((g) => g.id === goal.id ? updated : g));
                              const newStats = await goalsService.getStats();
                              setStats(newStats);
                            }
                          }}
                        >
                          <Text style={s.updateBtnText}>{t('common', 'save')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Milestones */}
                    <View style={s.expandedSection}>
                      <View style={s.expandedSectionHeader}>
                        <Text style={[s.expandedSectionTitle, { color: colors.textPrimary }]}>{t('goals', 'milestones')}</Text>
                        <TouchableOpacity onPress={() => { setMsGoalId(goal.id); setShowMsModal(true); }}>
                          <Ionicons name="add-circle" size={22} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                      {(!milestones[goal.id] || milestones[goal.id].length === 0) ? (
                        <Text style={[s.milestoneEmpty, { color: colors.textTertiary }]}>{t('goals', 'newMilestone')}</Text>
                      ) : (
                        <>
                          {milestones[goal.id].map((ms) => (
                            <MilestoneItem
                              key={ms.id}
                              milestone={ms}
                              colors={colors}
                              sty={s}
                              onToggle={() => handleToggleMilestone(ms)}
                            />
                          ))}
                        </>
                      )}
                    </View>

                    {/* Actions */}
                    <View style={s.expandedActions}>
                      {goal.status === 'active' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: colors.successBg }]}
                          onPress={() => handleToggle(goal)}
                        >
                          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                          <Text style={[s.actionBtnText, { color: colors.success }]}>{t('goals', 'markComplete')}</Text>
                        </TouchableOpacity>
                      )}
                      {goal.status !== 'active' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: colors.primaryBg }]}
                          onPress={() => handleToggle(goal)}
                        >
                          <Ionicons name="refresh" size={16} color={colors.primary} />
                          <Text style={[s.actionBtnText, { color: colors.primary }]}>{t('goals', 'markActive')}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: colors.errorBg }]}
                        onPress={() => handleDelete(goal)}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                        <Text style={[s.actionBtnText, { color: colors.error }]}>{t('common', 'delete')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}

            {/* Clear all button */}
            {goals.length > 0 && (
              <TouchableOpacity
                style={[s.clearAllBtn, { backgroundColor: colors.surface, borderColor: colors.error + '30' }]}
                onPress={handleClearAll}
              >
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={[s.clearAllText, { color: colors.error }]}>{t('goals', 'clearAll')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ─── Create / Edit Modal ─────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                {editingGoal ? t('goals', 'editGoal') : t('goals', 'newGoal')}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '85%' }}>
              {/* Title */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'goalTitle')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder={t('goals', 'goalTitle')}
                placeholderTextColor={colors.textTertiary}
              />

              {/* Description */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'goalDescription')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border, minHeight: 60 }]}
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder={t('goals', 'goalDescription')}
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={2}
              />

              {/* Type selector */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'goalType')}</Text>
              <View style={s.typeRow}>
                {(['numeric', 'percentage', 'boolean'] as GoalType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[s.typeChip, { backgroundColor: formType === type ? colors.primaryBg : colors.background, borderColor: formType === type ? colors.primary : colors.border }]}
                    onPress={() => setFormType(type)}
                  >
                    <Text style={[s.typeChipText, { color: formType === type ? colors.primary : colors.textSecondary }]}>
                      {type === 'numeric' ? t('goals', 'typeNumeric') :
                       type === 'percentage' ? t('goals', 'typePercentage') : t('goals', 'typeBoolean')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Target value */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'targetValue')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formTarget}
                onChangeText={setFormTarget}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={colors.textTertiary}
              />

              {/* Current value */}
              {formType !== 'boolean' && (
                <>
                  <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'currentValue')}</Text>
                  <TextInput
                    style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                    value={formCurrent}
                    onChangeText={setFormCurrent}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                  />
                </>
              )}

              {/* Unit */}
              {formType === 'numeric' && (
                <>
                  <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'unit')}</Text>
                  <TextInput
                    style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                    value={formUnit}
                    onChangeText={setFormUnit}
                    placeholder={t('goals', 'unit')}
                    placeholderTextColor={colors.textTertiary}
                  />
                </>
              )}

              {/* Deadline */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'deadline')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formDeadline}
                onChangeText={setFormDeadline}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textTertiary}
              />

              {/* Icon picker */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'icon')}</Text>
              <View style={s.iconGrid}>
                {ICON_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.iconOption, {
                      backgroundColor: formIcon === opt.key ? formColor + '20' : colors.background,
                      borderColor: formIcon === opt.key ? formColor : colors.border,
                    }]}
                    onPress={() => setFormIcon(opt.key)}
                  >
                    <Ionicons name={opt.icon} size={18} color={formIcon === opt.key ? formColor : colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Color picker */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'color')}</Text>
              <View style={s.colorGrid}>
                {COLOR_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[s.colorOption, {
                      backgroundColor: c,
                      borderWidth: formColor === c ? 3 : 0,
                      borderColor: colors.surface,
                    }]}
                    onPress={() => setFormColor(c)}
                  >
                    {formColor === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

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
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.modalSaveText}>{t('common', 'save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Milestone Modal ──────────────────────────────────────────────── */}
      <Modal visible={showMsModal} animationType="fade" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.msModalContent, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitle, { color: colors.textPrimary, marginBottom: spacing.lg }]}>
              {t('goals', 'newMilestone')}
            </Text>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'milestoneTitle')}</Text>
            <TextInput
              style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              value={msTitle}
              onChangeText={setMsTitle}
              placeholder={t('goals', 'milestoneTitle')}
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('goals', 'milestoneTarget')}</Text>
            <TextInput
              style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              value={msTarget}
              onChangeText={setMsTarget}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <TouchableOpacity
                style={[s.modalCancel, { borderColor: colors.border, flex: 1 }]}
                onPress={() => { setShowMsModal(false); setMsTitle(''); setMsTarget(''); }}
              >
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSave, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleAddMilestone}
              >
                <Text style={s.modalSaveText}>{t('goals', 'addMilestone')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingTop: Platform.OS === 'ios' ? 60 : (RNStatusBar.currentHeight || 24) + 8,
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
    },
    headerBack: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: { ...typography.h2 },
    headerSub: { ...typography.bodySmall, marginTop: 1 },
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: 100,
    },
    loadingContainer: {
      paddingVertical: spacing.xxxl * 2,
      alignItems: 'center',
    },

    // ─── Stats Card ────────────────────────────────────────────────────
    statsCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
      marginBottom: spacing.lg,
    },
    statsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    statsIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statsTitle: { ...typography.bodySmall, fontWeight: '600' },
    statsBody: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xl,
    },
    statsInfo: { flex: 1, gap: spacing.sm },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    statDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statLabel: { ...typography.bodySmall, flex: 1 },
    statValue: { ...typography.bodySmall, fontWeight: '600' },

    // ─── Filter Tabs ───────────────────────────────────────────────────
    filterRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    filterTab: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
    },
    filterText: { ...typography.caption },

    // ─── Goal Card ─────────────────────────────────────────────────────
    goalCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderLeftWidth: 4,
      ...shadows.sm,
      marginBottom: spacing.sm,
    },
    goalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    goalIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    goalInfo: { flex: 1 },
    goalTitle: { ...typography.bodySmall, fontWeight: '600' },
    goalMeta: { ...typography.caption, marginTop: 2 },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    progressBarBg: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressText: { ...typography.caption, minWidth: 60, textAlign: 'right' },
    goalFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: spacing.sm,
    },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    statusText: { fontSize: 10, fontWeight: '600' },

    // ─── Expanded Card ─────────────────────────────────────────────────
    expandedCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
      marginBottom: spacing.md,
      marginTop: -spacing.xs,
    },
    expandedDesc: { ...typography.bodySmall, lineHeight: 20, marginBottom: spacing.md },
    expandedSection: { marginBottom: spacing.md },
    expandedSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    expandedSectionTitle: { ...typography.bodySmall, fontWeight: '600' },
    updateProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    progressInput: {
      width: 60,
      borderRadius: radius.md,
      padding: spacing.sm,
      ...typography.body,
      fontWeight: '600',
      textAlign: 'center',
      borderWidth: 1,
    },
    progressSeparator: { ...typography.body, fontWeight: '600' },
    progressTarget: { ...typography.bodySmall, fontWeight: '500', flex: 1 },
    updateBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    updateBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    expandedActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    actionBtnText: { fontSize: 11, fontWeight: '600' },

    // ─── Milestones ────────────────────────────────────────────────────
    milestoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs + 2,
    },
    milestoneText: { ...typography.bodySmall, flex: 1 },
    milestoneEmpty: { ...typography.caption, fontStyle: 'italic' },

    // ─── Empty State ───────────────────────────────────────────────────
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.xxxl * 2,
      paddingHorizontal: spacing.xl,
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: { ...typography.h3, textAlign: 'center' },
    emptySub: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.sm },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.xl,
    },
    createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    // ─── Clear All ─────────────────────────────────────────────────────
    clearAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginTop: spacing.lg,
      borderWidth: 1,
    },
    clearAllText: { ...typography.caption, fontWeight: '500' },

    // ─── Modal ─────────────────────────────────────────────────────────
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
    modalTitle: { ...typography.h3 },
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
    typeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    typeChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    typeChipText: { ...typography.caption, fontWeight: '500' },
    iconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    iconOption: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
    },
    colorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    colorOption: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xl,
    },
    modalCancel: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      marginTop: spacing.md,
    },
    modalCancelText: { ...typography.body, fontWeight: '600' },
    modalSave: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.md,
    },
    modalSaveText: { ...typography.body, color: '#fff', fontWeight: '600' },

    // ─── Milestone Modal ───────────────────────────────────────────────
    msModalContent: {
      borderRadius: radius.xl,
      padding: layout.screenPadding,
      marginHorizontal: layout.screenPadding,
      marginBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding,
    },
  });
