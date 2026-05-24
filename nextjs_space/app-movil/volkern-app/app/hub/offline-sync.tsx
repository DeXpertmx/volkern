import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Platform,
  StatusBar as RNStatusBar,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { useNetwork } from '../../src/contexts/network';
import { offlineQueue, type QueuedOperation, type SyncEntry } from '../../src/services/offline-queue';

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status, colors, sty }: {
  status: QueuedOperation['status'] | SyncEntry['status'];
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const { t } = useI18n();
  const labels: Record<string, string> = {
    pending: t('offline', 'statusPending'),
    syncing: t('offline', 'statusSyncing'),
    failed: t('offline', 'statusFailed'),
    completed: t('offline', 'statusCompleted'),
    partial: t('offline', 'partial'),
  };
  const config: Record<string, { icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }> = {
    pending: { icon: 'time', bg: colors.warningBg, fg: colors.warning },
    syncing: { icon: 'sync', bg: colors.primaryBg, fg: colors.primary },
    failed: { icon: 'close-circle', bg: colors.errorBg, fg: colors.error },
    completed: { icon: 'checkmark-circle', bg: colors.successBg, fg: colors.success },
    partial: { icon: 'alert-circle', bg: colors.warningBg, fg: colors.warning },
  };
  const c = config[status] || config.pending;
  const label = labels[status] || labels.pending;
  return (
    <View style={[sty.badge, { backgroundColor: c.bg }]}>
      <Ionicons name={c.icon} size={12} color={c.fg} />
      <Text style={[sty.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────
function SectionHeader({ title, icon, color, count, sty }: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  count?: number;
  sty: ReturnType<typeof makeStyles>;
}) {
  const colors = useThemeColors();
  return (
    <View style={sty.sectionHeader}>
      <View style={[sty.sectionIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[sty.sectionTitle, { color: colors.textTertiary }]}>{title}</Text>
      {count !== undefined && (
        <View style={[sty.countChip, { backgroundColor: color + '15' }]}>
          <Text style={[sty.countText, { color }]}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ icon, title, subtitle, colors, sty }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={sty.emptyState}>
      <View style={[sty.emptyIcon, { backgroundColor: colors.successBg }]}>
        <Ionicons name={icon} size={32} color={colors.success} />
      </View>
      <Text style={[sty.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[sty.emptySub, { color: colors.textTertiary }]}>{subtitle}</Text>
    </View>
  );
}

// ─── Last Sync Row ───────────────────────────────────────────────────────────
function LastSyncRow({ timestamp, colors, sty }: {
  timestamp: number | null;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const { t } = useI18n();
  const text = useMemo(() => {
    if (!timestamp) return t('offline', 'never');
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return t('offline', 'justNow');
    if (diff < 3_600_000) return t('offline', 'minutesAgo', { n: Math.round(diff / 60_000) });
    if (diff < 86_400_000) return t('offline', 'hoursAgo', { n: Math.round(diff / 3_600_000) });
    return t('offline', 'daysAgo', { n: Math.round(diff / 86_400_000) });
  }, [timestamp, t]);

  return (
    <View style={[sty.lastSyncRow, { backgroundColor: colors.surface }]}>
      <Ionicons name="time" size={16} color={colors.textTertiary} />
      <Text style={[sty.lastSyncText, { color: colors.textSecondary }]}>
        {t('offline', 'lastSync')}: {text}
      </Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function OfflineSyncScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();
  const { isOnline, networkState } = useNetwork();

  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const [history, setHistory] = useState<SyncEntry[]>([]);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const spinAnim = useRef(new Animated.Value(0)).current;

  // ─── Load data ───────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [ops, hist, last] = await Promise.all([
      offlineQueue.getAllOperations(),
      offlineQueue.getHistory(),
      offlineQueue.getLastSyncTimestamp(),
    ]);
    setOperations(ops);
    setHistory(hist);
    setLastSync(last);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Spin animation for syncing ──────────────────────────────────────
  useEffect(() => {
    if (syncing) {
      const animation = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      );
      animation.start();
      return () => animation.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [syncing, spinAnim]);

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ─── Sync all ────────────────────────────────────────────────────────
  const handleSyncAll = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncProgress(0);
    try {
      await offlineQueue.replayQueue((progress) => {
        setSyncProgress(progress);
      });
      await loadData();
    } catch {
      // error handled by queue
    } finally {
      setSyncing(false);
      setSyncProgress(0);
    }
  }, [syncing, loadData]);

  // ─── Delete operation ────────────────────────────────────────────────
  const handleDeleteOp = useCallback((op: QueuedOperation) => {
    Alert.alert(
      t('offline', 'deleteOperation'),
      t('offline', 'deleteOpConfirm'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            await offlineQueue.deleteOperation(op.id);
            await loadData();
          },
        },
      ],
    );
  }, [t, loadData]);

  // ─── Clear queue ─────────────────────────────────────────────────────
  const handleClearQueue = useCallback(() => {
    Alert.alert(
      t('offline', 'clearQueue'),
      t('offline', 'clearQueueConfirm'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            await offlineQueue.clearByStatus('pending');
            await loadData();
          },
        },
      ],
    );
  }, [t, loadData]);

  // ─── Clear history ───────────────────────────────────────────────────
  const handleClearHistory = useCallback(() => {
    Alert.alert(
      t('offline', 'clearHistory'),
      t('offline', 'clearHistoryConfirm'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            await offlineQueue.clearHistory();
            setHistory([]);
          },
        },
      ],
    );
  }, [t]);

  // ─── Pull to refresh ─────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // ─── Styles ──────────────────────────────────────────────────────────
  const s = useMemo(() => makeStyles(colors), [colors]);
  const pendingOps = operations.filter((op) => op.status === 'pending');
  const connectionIcon = isOnline
    ? networkState.status === 'wifi' ? 'wifi' : 'cellular'
    : 'cloud-offline';
  const connectionColor = isOnline ? colors.success : colors.error;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <RNStatusBar barStyle={colors.textPrimary === '#0F172A' ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[s.headerBack, { backgroundColor: colors.background }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('offline', 'title')}</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>{t('offline', 'subtitle')}</Text>
        </View>
        {/* Connection status mini-indicator */}
        <View style={[s.connBadge, { backgroundColor: connectionColor + '15' }]}>
          <Ionicons name={connectionIcon} size={14} color={connectionColor} />
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* ─── Connection Status ────────────────────────────────────── */}
        <View style={[s.connCard, { backgroundColor: colors.surface, borderLeftColor: connectionColor }]}>
          <View style={s.connLeft}>
            <Ionicons name={connectionIcon} size={22} color={connectionColor} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={[s.connLabel, { color: colors.textPrimary }]}>
                {isOnline ? t('offline', 'connected') : t('offline', 'disconnected')}
              </Text>
              <Text style={[s.connDetail, { color: colors.textTertiary }]}>
                {networkState.details || (isOnline ? t('offline', 'wifi') : '—')}
              </Text>
            </View>
          </View>
          {isOnline && pendingOps.length > 0 && (
            <TouchableOpacity
              style={[s.syncBtn, { backgroundColor: colors.primary }]}
              onPress={handleSyncAll}
              disabled={syncing}
            >
              {syncing ? (
                <Animated.View style={{ transform: [{ rotate: spinInterpolation }] }}>
                  <Ionicons name="sync" size={18} color={colors.white} />
                </Animated.View>
              ) : (
                <Ionicons name="cloud-upload" size={18} color={colors.white} />
              )}
              <Text style={s.syncBtnText}>
                {syncing ? t('offline', 'retrying') : t('offline', 'syncNow')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Progress bar when syncing */}
        {syncing && (
          <View style={[s.progressBar, { backgroundColor: colors.border }]}>
            <View style={[s.progressFill, { width: `${syncProgress}%`, backgroundColor: colors.primary }]} />
          </View>
        )}

        {/* Last sync */}
        <LastSyncRow timestamp={lastSync} colors={colors} sty={s} />

        {/* ─── Pending Operations ───────────────────────────────────── */}
        <View style={s.actionsRow}>
          <SectionHeader
            title={t('offline', 'pending')}
            icon="hourglass"
            color={colors.warning}
            count={pendingOps.length}
            sty={s}
          />
          {pendingOps.length > 0 && (
            <TouchableOpacity onPress={handleClearQueue} style={s.clearBtn}>
              <Ionicons name="trash-outline" size={14} color={colors.error} />
              <Text style={[s.clearBtnText, { color: colors.error }]}>{t('offline', 'clearQueue')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {pendingOps.length === 0 ? (
          <EmptyState
            icon="checkmark-circle"
            title={t('offline', 'emptyQueue')}
            subtitle={t('offline', 'emptyQueueSub')}
            colors={colors}
            sty={s}
          />
        ) : (
          <View style={[s.card, { backgroundColor: colors.surface }]}>
            {pendingOps.map((op, idx) => (
              <View key={op.id}>
                <View style={s.opRow}>
                  <View style={s.opLeft}>
                    <View style={[s.opIcon, { backgroundColor: colors.warningBg }]}>
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.warning} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.opLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                        {op.label}
                      </Text>
                      <Text style={[s.opMeta, { color: colors.textTertiary }]}>
                        {op.method} {op.endpoint.length > 30 ? op.endpoint.slice(0, 30) + '...' : op.endpoint}
                      </Text>
                      <Text style={[s.opMeta, { color: colors.textTertiary }]}>
                        {t('offline', 'retriesLeft', { n: `${op.retries}/${op.maxRetries}` })}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[s.opDeleteBtn, { backgroundColor: colors.errorBg }]}
                    onPress={() => handleDeleteOp(op)}
                  >
                    <Ionicons name="close" size={14} color={colors.error} />
                  </TouchableOpacity>
                </View>
                {idx < pendingOps.length - 1 && <View style={[s.divider, { backgroundColor: colors.borderLight }]} />}
              </View>
            ))}
          </View>
        )}

        {/* ─── Sync History ─────────────────────────────────────────── */}
        <View style={s.actionsRow}>
          <SectionHeader
            title={t('offline', 'history')}
            icon="timer"
            color={colors.info}
            count={history.length}
            sty={s}
          />
          {history.length > 0 && (
            <TouchableOpacity onPress={handleClearHistory} style={s.clearBtn}>
              <Ionicons name="trash-outline" size={14} color={colors.error} />
              <Text style={[s.clearBtnText, { color: colors.error }]}>{t('offline', 'clearHistory')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {history.length === 0 ? (
          <EmptyState
            icon="time"
            title={t('offline', 'noHistory')}
            subtitle=""
            colors={colors}
            sty={s}
          />
        ) : (
          <View style={[s.card, { backgroundColor: colors.surface }]}>
            {history.map((entry, idx) => (
              <View key={entry.id}>
                <View style={s.historyRow}>
                  <View style={s.historyLeft}>
                    <StatusBadge status={entry.status} colors={colors} sty={s} />
                    <View style={{ marginLeft: spacing.md, flex: 1 }}>
                      <Text style={[s.historyDate, { color: colors.textPrimary }]}>
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={[s.historyMeta, { color: colors.textTertiary }]}>
                        {t('offline', 'results', { succeeded: entry.succeeded, failed: entry.failed })}
                      </Text>
                    </View>
                  </View>
                  <Text style={[s.historyDuration, { color: colors.textTertiary }]}>
                    {entry.duration < 1000
                      ? `${entry.duration}${t('offline', 'ms')}`
                      : `${(entry.duration / 1000).toFixed(1)}s`}
                  </Text>
                </View>
                {idx < history.length - 1 && <View style={[s.divider, { backgroundColor: colors.borderLight }]} />}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
export type OfflineSyncStyles = ReturnType<typeof makeStyles>;

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
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: 100,
    },

    // ─── Connection Card ────────────────────────────────────────────────
    connCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderLeftWidth: 4,
      ...shadows.sm,
      marginBottom: spacing.md,
    },
    connLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    connLabel: { ...typography.bodySmall, fontWeight: '600' },
    connDetail: { ...typography.caption, marginTop: 1 },
    connBadge: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    syncBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    syncBtnText: { color: colors.white, fontSize: 12, fontWeight: '600' },

    // ─── Progress ───────────────────────────────────────────────────────
    progressBar: {
      height: 4,
      borderRadius: 2,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 2 },

    // ─── Last Sync ─────────────────────────────────────────────────────
    lastSyncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.lg,
    },
    lastSyncText: { ...typography.caption },

    // ─── Section ────────────────────────────────────────────────────────
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    sectionIcon: {
      width: 28,
      height: 28,
      borderRadius: radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionTitle: { ...typography.label },
    countChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    countText: { fontSize: 11, fontWeight: '700' },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: spacing.xs },
    clearBtnText: { fontSize: 11, fontWeight: '600' },

    // ─── Card ───────────────────────────────────────────────────────────
    card: { borderRadius: radius.lg, ...shadows.sm, marginBottom: spacing.md },

    // ─── Empty State ────────────────────────────────────────────────────
    emptyState: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: { ...typography.h3, textAlign: 'center' },
    emptySub: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.sm },

    // ─── Badge ──────────────────────────────────────────────────────────
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    badgeText: { fontSize: 10, fontWeight: '600' },

    // ─── Operation Row ──────────────────────────────────────────────────
    opRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.lg,
    },
    opLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
    opIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    opLabel: { ...typography.bodySmall, fontWeight: '500' },
    opMeta: { ...typography.caption, marginTop: 1 },
    opDeleteBtn: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: spacing.sm,
    },
    divider: { height: 1, marginLeft: 68 },

    // ─── History Row ────────────────────────────────────────────────────
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.lg,
    },
    historyLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    historyDate: { ...typography.bodySmall, fontWeight: '500' },
    historyMeta: { ...typography.caption, marginTop: 1 },
    historyDuration: { ...typography.caption },
  });
