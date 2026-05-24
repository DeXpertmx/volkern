import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { notificationsService, toLocalNotification, LocalNotification } from '../../src/services/notifications';

const TYPE_ICONS: Record<string, string> = {
  lead: 'person-add',
  cita: 'calendar',
  message: 'chatbubble',
  system: 'settings',
  alert: 'alert-circle',
};

const TYPE_COLORS: Record<string, string> = {
  lead: '#3B82F6',
  cita: '#10B981',
  message: '#8B5CF6',
  system: '#64748B',
  alert: '#EF4444',
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const raw = await notificationsService.getAll();
      setNotifications(raw.map(toLocalNotification));
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const stats = useMemo(() => ({
    total: notifications.length,
    unread: notifications.filter(n => !n.read).length,
    byType: {
      lead: notifications.filter(n => n.type === 'lead').length,
      cita: notifications.filter(n => n.type === 'cita').length,
      message: notifications.filter(n => n.type === 'message').length,
      alert: notifications.filter(n => n.type === 'alert').length,
    },
  }), [notifications]);

  const filtered = showUnreadOnly
    ? notifications.filter(n => !n.read)
    : notifications;

  const handleMarkAllRead = () => {
    Alert.alert(
      t('notifications', 'markAllRead'),
      t('notifications', 'markAllReadConfirm'),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'done'), onPress: async () => {
            await notificationsService.markAllAsRead();
            loadData();
          },
        },
      ]
    );
  };

  const handlePress = async (n: LocalNotification) => {
    if (!n.read) {
      // Find original and mark as read
      try {
        // The service marks by ID - we need the original ID
        // Since toLocalNotification passes id through, use it
        await notificationsService.markAsRead(n.id);
        loadData();
      } catch {
        // ignore
      }
    }
  };

  const renderItem = ({ item }: { item: LocalNotification }) => (
    <TouchableOpacity
      style={[s.notifCard, { backgroundColor: colors.surface }, !item.read && s.notifUnread]}
      onPress={() => handlePress(item)}
    >
      <View style={[s.notifIcon, { backgroundColor: (TYPE_COLORS[item.type] || '#64748B') + '15' }]}>
        <Ionicons name={TYPE_ICONS[item.type] as any} size={20} color={TYPE_COLORS[item.type] || '#64748B'} />
      </View>
      <View style={s.notifContent}>
        <Text style={[s.notifTitle, { color: colors.textPrimary }, !item.read && s.notifTitleUnread]}>
          {item.title}
        </Text>
        <Text style={[s.notifBody, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[s.notifTime, { color: colors.textTertiary }]}>{item.time}</Text>
      </View>
      {!item.read && <View style={[s.unreadDot, { backgroundColor: colors.primary }]} />}
    </TouchableOpacity>
  );

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
            {/* Header */}
            <View style={s.header}>
              <Text style={s.title}>{t('notifications', 'title')}</Text>
              <View style={s.headerActions}>
                <TouchableOpacity style={s.filterBtn} onPress={() => setShowUnreadOnly(!showUnreadOnly)}>
                  <Ionicons name="filter" size={18} color={showUnreadOnly ? colors.primary : colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.markAllBtn} onPress={handleMarkAllRead}>
                  <Ionicons name="checkmark-done" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats */}
            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#3B82F6' }]}>{stats.unread}</Text>
                <Text style={s.statLabel}>{t('notifications', 'unread')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#10B981' }]}>{stats.byType.lead}</Text>
                <Text style={s.statLabel}>{t('notifications', 'byTypeLeads')}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[s.statValue, { color: '#8B5CF6' }]}>{stats.byType.message}</Text>
                <Text style={s.statLabel}>{t('notifications', 'byTypeMessages')}</Text>
              </View>
            </View>

            {showUnreadOnly && (
              <Text style={[s.filterHint, { color: colors.primary }]}>
                {t('notifications', 'showingUnread')}
              </Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="notifications-off-outline" size={48} color={colors.primary + '60'} />
            </View>
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>
              {showUnreadOnly ? t('notifications', 'noUnread') : t('notifications', 'noNotifications')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  headerActions: { flexDirection: 'row', gap: 8 },
  filterBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  markAllBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  filterHint: { fontSize: 13, fontWeight: '500', marginBottom: 8 },
  notifCard: { flexDirection: 'row', borderRadius: 12, padding: 14, marginBottom: 8 },
  notifUnread: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  notifIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  notifTitleUnread: { fontWeight: '700' },
  notifBody: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  notifTime: { fontSize: 11 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
