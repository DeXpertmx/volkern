import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { notificationsService, toLocalNotification, LocalNotification, InAppNotification } from '../../src/services/notifications';
import { useNotificationsCount } from '../../src/contexts/notifications';
import { useI18n } from '../../src/contexts/i18n';

// ─── Filter types ────────────────────────────────────────────────────────────
const FILTER_TYPES = ['all', 'lead', 'appointment', 'message', 'alert'] as const;
type FilterType = typeof FILTER_TYPES[number];

const FILTER_TYPE_MAP: Record<FilterType, string | undefined> = {
  all: undefined,
  lead: 'lead',
  appointment: 'cita',
  message: 'message',
  alert: 'alert',
};

// ─── Get Type Config ─────────────────────────────────────────────────────────
function getTypeConfig(type: string, colors: ReturnType<typeof useThemeColors>) {
  switch (type) {
    case 'lead': return { icon: 'person-add' as const, color: colors.primary, bg: colors.primaryBg };
    case 'cita': return { icon: 'calendar' as const, color: colors.success, bg: colors.successBg };
    case 'message': return { icon: 'chatbubble' as const, color: colors.info, bg: colors.infoBg };
    case 'system': return { icon: 'sync' as const, color: colors.textSecondary, bg: colors.background };
    case 'alert': return { icon: 'alert-circle' as const, color: colors.warning, bg: colors.warningBg };
    default: return { icon: 'notifications' as const, color: colors.textTertiary, bg: colors.background };
  }
}

export default function NotificationsScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useI18n();
  const FILTERS: { type: FilterType; label: string }[] = useMemo(() => [
    { type: 'all', label: t('notifications', 'viewAll') },
    { type: 'lead', label: t('notifications', 'filterLead') },
    { type: 'appointment', label: t('notifications', 'filterAppointment') },
    { type: 'message', label: t('notifications', 'filterMessage') },
    { type: 'alert', label: t('notifications', 'filterReminder') },
  ], [t]);
  const [activeFilterType, setActiveFilterType] = useState<FilterType>('all');
  const [localNotifs, setLocalNotifs] = useState<LocalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { refreshUnreadCount, decrementUnread, resetUnread } = useNotificationsCount();

  // ── Load ───────────────────────────────────────────────────────────
  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const raw: InAppNotification[] = await notificationsService.getAll();
      const mapped = raw.map(toLocalNotification);
      setLocalNotifs(mapped);
    } catch (err: any) {
      setError(err?.message || t('common', 'errorOccurred'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // ── Mark as Read ───────────────────────────────────────────────────
  const markAsRead = useCallback(async (id: string) => {
    setLocalNotifs(prev => {
      const item = prev.find(n => n.id === id);
      if (item && !item.read) decrementUnread();
      return prev.map(n => n.id === id ? { ...n, read: true } : n);
    });
    try {
      await notificationsService.markAsRead(id);
    } catch {
      setLocalNotifs(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
      await refreshUnreadCount();
    }
  }, [decrementUnread, refreshUnreadCount]);

  // ── Mark All as Read ───────────────────────────────────────────────
  const markAllAsRead = useCallback(async () => {
    const unreadIds = localNotifs.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;

    Alert.alert(
      t('notifications', 'markAllRead'),
      undefined,
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('notifications', 'markAllRead'),
          onPress: () => {
            (async () => {
              setLocalNotifs(prev => prev.map(n => ({ ...n, read: true })));
              resetUnread();
              try {
                await notificationsService.markAllAsRead();
              } catch {
                loadNotifications();
              }
            })();
          },
        },
      ],
    );
  }, [localNotifs, loadNotifications]);

  // ── Filter ─────────────────────────────────────────────────────────
  const filtered = activeFilterType === 'all'
    ? localNotifs
    : localNotifs.filter(n => n.type === FILTER_TYPE_MAP[activeFilterType]);

  // ── Loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('notifications', 'title')}</Text>
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
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('notifications', 'title')}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Ionicons name="cloud-offline" size={48} color={colors.error} />
          <Text style={[s.subtitle, { color: colors.error, textAlign: 'center', marginTop: spacing.md }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={{
              marginTop: spacing.lg,
              backgroundColor: colors.primary,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
            }}
            onPress={loadNotifications}
          >
            <Text style={{ color: colors.white, fontWeight: '600' }}>{t('common', 'retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  const unreadCount = localNotifs.filter(n => !n.read).length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('notifications', 'title')}</Text>
          {unreadCount > 0 && (
            <Text style={[s.unreadCountText, { color: colors.textTertiary }]}>{unreadCount} {t('notifications', 'newNotification')}</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={[s.markAllText, { color: colors.primary }]}>{t('notifications', 'markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.filtersContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        contentContainerStyle={s.filtersContent}
      >
        {FILTERS.map(({ type, label }) => (
          <TouchableOpacity
            key={type}
            style={[s.filterChip, { backgroundColor: colors.background }, activeFilterType === type && { backgroundColor: colors.primary }]}
            onPress={() => setActiveFilterType(type)}
          >
            <Text style={[s.filterText, { color: colors.textSecondary }, activeFilterType === type && { color: colors.white, fontWeight: '600' as const }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <ScrollView style={s.list} contentContainerStyle={s.listContent}>
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="notifications-off" size={48} color={colors.textTertiary} />
            <Text style={[s.emptyText, { color: colors.textTertiary }]}>{t('notifications', 'empty')}</Text>
          </View>
        ) : (
          filtered.map(notification => {
            const config = getTypeConfig(notification.type, colors);
            return (
              <TouchableOpacity
                key={notification.id}
                style={[
                  s.notificationItem,
                  { backgroundColor: colors.surface },
                  !notification.read && { borderLeftWidth: 3, borderLeftColor: colors.primary },
                ]}
                onPress={() => markAsRead(notification.id)}
              >
                <View style={[s.notificationIcon, { backgroundColor: config.bg }]}>
                  <Ionicons name={config.icon} size={20} color={config.color} />
                </View>
                <View style={s.notificationContent}>
                  <View style={s.notificationHeader}>
                    <Text style={[s.notificationTitle, { color: colors.textPrimary }, !notification.read && { fontWeight: '700' }]}>
                      {notification.title}
                    </Text>
                    {!notification.read && <View style={[s.unreadDot, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Text style={[s.notificationBody, { color: colors.textSecondary }]}>{notification.body}</Text>
                  <Text style={[s.notificationTime, { color: colors.textTertiary }]}>{notification.time}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

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
  unreadCountText: {
    ...typography.caption,
    marginTop: 2,
  },
  markAllText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  subtitle: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  filtersContainer: {
    maxHeight: 44,
    borderBottomWidth: 1,
  },
  filtersContent: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
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
  list: {
    flex: 1,
  },
  listContent: {
    padding: layout.screenPadding,
    gap: spacing.sm,
  },
  notificationItem: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notificationTitle: {
    ...typography.bodySmall,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notificationBody: {
    ...typography.caption,
    marginTop: 2,
  },
  notificationTime: {
    ...typography.caption,
    marginTop: 4,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
  },
});
