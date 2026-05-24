import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  RefreshControl,
  Dimensions,
  LayoutAnimation,
  UIManager,
  AlertButton,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { kanbanService, KANBAN_COLUMNS, STATUS_TRANSITIONS, type KanbanColumn } from '../../src/services/kanban';
import { type Task, type TaskStatus, getPriorityColor, getPriorityLabel } from '../../src/services/tasks';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLUMN_WIDTH = 280;
const screenWidth = Dimensions.get('window').width;

// ─── Priority Badge ───────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  const color = getPriorityColor(priority);
  const label = getPriorityLabel(priority);
  return (
    <View style={[styles.priorityBadge, { backgroundColor: color + '15' }]}>
      <View style={[styles.priorityDot, { backgroundColor: color }]} />
      <Text style={[styles.priorityText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, colors, onMove, onLongPress }: {
  task: Task;
  colors: ReturnType<typeof useThemeColors>;
  onMove: (status: TaskStatus) => void;
  onLongPress: () => void;
}) {
  const { t } = useI18n();
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';
  const isDueToday = task.dueDate && new Date(task.dueDate).toDateString() === new Date().toDateString();

  return (
    <TouchableOpacity
      style={[styles.taskCard, { backgroundColor: colors.surface }]}
      onPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Priority indicator line */}
      <View style={[styles.priorityLine, { backgroundColor: getPriorityColor(task.priority) }]} />

      <View style={styles.taskCardContent}>
        <Text style={[styles.taskTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {task.title}
        </Text>

        {task.description ? (
          <Text style={[styles.taskDesc, { color: colors.textTertiary }]} numberOfLines={2}>
            {task.description}
          </Text>
        ) : null}

        <View style={styles.taskCardFooter}>
          <PriorityBadge priority={task.priority} />

          {/* Due date */}
          {task.dueDate && (
            <View style={[styles.dateBadge, {
              backgroundColor: isOverdue ? colors.error + '15' : isDueToday ? colors.warning + '15' : colors.background,
            }]}>
              <Ionicons
                name={isOverdue ? 'alert-circle' : 'calendar-outline'}
                size={10}
                color={isOverdue ? colors.error : isDueToday ? colors.warning : colors.textTertiary}
              />
              <Text style={[styles.dateText, {
                color: isOverdue ? colors.error : isDueToday ? colors.warning : colors.textTertiary,
              }]}>
                {isOverdue ? t('kanban', 'overdue') :
                 isDueToday ? t('kanban', 'dueToday') :
                 new Date(task.dueDate).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>

        {/* Move actions */}
        <View style={styles.moveRow}>
          {STATUS_TRANSITIONS[task.status]?.map((nextStatus) => {
            const col = KANBAN_COLUMNS.find((c) => c.id === nextStatus);
            if (!col) return null;
            return (
              <TouchableOpacity
                key={nextStatus}
                style={[styles.moveBtn, { backgroundColor: col.color + '15' }]}
                onPress={() => onMove(nextStatus)}
              >
                <Ionicons name={col.icon as any} size={12} color={col.color} />
                <Text style={[styles.moveBtnText, { color: col.color }]}>
                  {t('kanban', `moveTo${nextStatus === 'in_progress' ? 'InProgress' : nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}` as any)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Column Component ─────────────────────────────────────────────────────────
function KanbanColumnView({ column, colors, sty, onMoveTask, onRefresh }: {
  column: KanbanColumn;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();

  const handleMove = useCallback((taskId: string, newStatus: TaskStatus) => {
    onMoveTask(taskId, newStatus);
  }, [onMoveTask]);

  const handleLongPress = useCallback((task: Task) => {
    const transitions = STATUS_TRANSITIONS[task.status];
    if (!transitions || transitions.length === 0) {
      Alert.alert(task.title, t('kanban', 'noTasks'));
      return;
    }

    const buttons: AlertButton[] = transitions.map((nextStatus) => {
      const col = KANBAN_COLUMNS.find((c) => c.id === nextStatus);
      const label = t('kanban', `moveTo${nextStatus === 'in_progress' ? 'InProgress' : nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}` as any);
      return {
        text: `${label}`,
        onPress: () => handleMove(task.id, nextStatus),
      };
    });

    buttons.push({ text: t('common', 'cancel'), style: 'cancel' });
    Alert.alert(task.title, t('kanban', 'moveTo'), buttons);
  }, [handleMove, t]);

  return (
    <View style={[styles.column, { backgroundColor: colors.background }]}>
      {/* Column Header */}
      <View style={[styles.columnHeader, { backgroundColor: colors.surface }]}>
        <View style={[styles.columnIcon, { backgroundColor: column.color + '15' }]}>
          <Ionicons name={column.icon as any} size={16} color={column.color} />
        </View>
        <Text style={[styles.columnTitle, { color: colors.textPrimary }]}>
          {t('kanban', column.titleKey as any)}
        </Text>
        <View style={[styles.columnCount, { backgroundColor: column.color + '15' }]}>
          <Text style={[styles.columnCountText, { color: column.color }]}>{column.tasks.length}</Text>
        </View>
      </View>

      {/* Column Tasks */}
      <ScrollView
        style={styles.columnScroll}
        contentContainerStyle={styles.columnScrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {column.tasks.length === 0 ? (
          <View style={styles.emptyColumn}>
            <Ionicons name="list-outline" size={28} color={colors.textTertiary + '50'} />
            <Text style={[styles.emptyColumnText, { color: colors.textTertiary }]}>
              {t('kanban', 'noTasks')}
            </Text>
          </View>
        ) : (
          column.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              colors={colors}
              onMove={(newStatus) => handleMove(task.id, newStatus)}
              onLongPress={() => handleLongPress(task)}
            />
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function KanbanScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();

  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const s = useMemo(() => makeStyles(colors), [colors]);

  // ─── Load board ──────────────────────────────────────────────────────
  const loadBoard = useCallback(async () => {
    try {
      const cols = await kanbanService.getBoard();
      setColumns(cols);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBoard();
    setRefreshing(false);
  }, [loadBoard]);

  // ─── Move task ────────────────────────────────────────────────────────
  const handleMoveTask = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMovingId(taskId);
    // Optimistic update
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        tasks: col.id === newStatus
          ? [...col.tasks]
          : col.tasks.filter((t) => t.id !== taskId),
      }))
    );
    try {
      await kanbanService.moveTask(taskId, newStatus);
      await loadBoard();
    } catch {
      await loadBoard();
    } finally {
      setMovingId(null);
    }
  }, [loadBoard]);

  // ─── Total count ─────────────────────────────────────────────────────
  const totalTasks = useMemo(
    () => columns.reduce((sum, col) => sum + col.tasks.length, 0),
    [columns]
  );

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
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('kanban', 'title')}</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>
            {t('kanban', 'totalTasks', { n: totalTasks })}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.refreshBtn, { backgroundColor: colors.background }]}
          onPress={onRefresh}
        >
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : totalTasks === 0 ? (
        <View style={s.emptyState}>
          <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
            <Ionicons name="grid-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>{t('kanban', 'emptyBoard')}</Text>
          <Text style={[s.emptySub, { color: colors.textTertiary }]}>{t('kanban', 'emptyBoardSub')}</Text>
          <TouchableOpacity
            style={[s.refreshAllBtn, { backgroundColor: colors.primary }]}
            onPress={onRefresh}
          >
            <Ionicons name="refresh" size={18} color={colors.white} />
            <Text style={s.refreshBtnText}>{t('common', 'retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          horizontal
          style={s.boardScroll}
          contentContainerStyle={s.boardContent}
          showsHorizontalScrollIndicator={false}
          snapToInterval={COLUMN_WIDTH + spacing.md}
          decelerationRate="fast"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              progressViewOffset={50}
            />
          }
        >
          {columns.map((column) => (
            <KanbanColumnView
              key={column.id}
              column={column}
              colors={colors}
              sty={s}
              onMoveTask={handleMoveTask}
              onRefresh={loadBoard}
            />
          ))}
        </ScrollView>
      )}

      {/* Drag hint */}
      {totalTasks > 0 && (
        <View style={[s.dragHint, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
          <Text style={[s.dragHintText, { color: colors.textTertiary }]}>{t('kanban', 'dragHint')}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: '600',
  },
  taskCard: {
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.sm,
  },
  priorityLine: {
    height: 3,
  },
  taskCardContent: {
    padding: spacing.md,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 4,
  },
  taskDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: spacing.sm,
  },
  taskCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  dateText: {
    fontSize: 9,
    fontWeight: '500',
  },
  moveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  moveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  moveBtnText: {
    fontSize: 10,
    fontWeight: '600',
  },
  column: {
    width: COLUMN_WIDTH,
    borderRadius: radius.lg,
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  columnIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  columnTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  columnCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  columnCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  columnScroll: {
    flex: 1,
  },
  columnScrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  emptyColumn: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyColumnText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
});

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
      width: 40, height: 40, borderRadius: radius.md,
      justifyContent: 'center', alignItems: 'center',
    },
    headerTitle: { ...typography.h2 },
    headerSub: { ...typography.bodySmall, marginTop: 1 },
    refreshBtn: {
      width: 40, height: 40, borderRadius: radius.md,
      justifyContent: 'center', alignItems: 'center',
    },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // ─── Board ──────────────────────────────────────────────────────────
    boardScroll: { flex: 1 },
    boardContent: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },

    // ─── Empty State ────────────────────────────────────────────────────
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    emptyIcon: {
      width: 80, height: 80, borderRadius: radius.full,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: { ...typography.h3, textAlign: 'center' },
    emptySub: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.sm },
    refreshAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.xl,
    },
    refreshBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    // ─── Drag Hint ──────────────────────────────────────────────────────
    dragHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
    },
    dragHintText: { fontSize: 11, fontWeight: '500' },
  });
