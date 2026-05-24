import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { auditService, type AuditEvent, type AuditEventType } from '../../src/services/audit';

const EVENT_ICONS: Record<string, string> = {
  user_action: 'person',
  system_action: 'cog',
  security_event: 'shield',
};

const EVENT_COLORS: Record<string, string> = {
  user_action: '#3B82F6',
  system_action: '#10B981',
  security_event: '#EF4444',
};

export default function AuditScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<AuditEventType | 'all'>('all');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await auditService.getAll({ type: filterType, search: search || undefined });
      setEvents(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterType, search]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const renderEvent = ({ item }: { item: AuditEvent }) => (
    <View style={[s.eventCard, { backgroundColor: colors.surface, borderLeftColor: EVENT_COLORS[item.type], borderLeftWidth: 3 }]}>
      <View style={s.eventRow}>
        <View style={[s.eventIcon, { backgroundColor: EVENT_COLORS[item.type] + '15' }]}>
          <Ionicons name={EVENT_ICONS[item.type] as any} size={18} color={EVENT_COLORS[item.type]} />
        </View>
        <View style={s.eventContent}>
          <Text style={[s.eventAction, { color: colors.textPrimary }]}>{item.action}</Text>
          <Text style={[s.eventDetails, { color: colors.textSecondary }]} numberOfLines={2}>{item.details}</Text>
          <View style={s.eventMeta}>
            <Text style={[s.eventUser, { color: colors.textTertiary }]}>{item.userName}</Text>
            <Text style={[s.eventDot, { color: colors.textTertiary }]}>·</Text>
            <Text style={[s.eventTime, { color: colors.textTertiary }]}>
              {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
          {item.ipAddress ? (
            <Text style={[s.eventIp, { color: colors.textTertiary }]}>
              {t('audit', 'ipAddress')}: {item.ipAddress}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>{t('audit', 'title')}</Text>
      </View>

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={[s.searchInput, { color: colors.textPrimary }]}
          placeholder={t('audit', 'search')}
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter chips */}
      <View style={s.filterRow}>
        {(['all', 'user_action', 'system_action', 'security_event'] as const).map(type => (
          <TouchableOpacity
            key={type}
            style={[s.filterChip, filterType === type && {
              backgroundColor: type === 'all' ? colors.primary : EVENT_COLORS[type] + '20',
              borderColor: type === 'all' ? colors.primary : EVENT_COLORS[type],
            }]}
            onPress={() => setFilterType(type)}
          >
            {type !== 'all' && (
              <Ionicons name={EVENT_ICONS[type] as any} size={12} color={filterType === type ? EVENT_COLORS[type] : colors.textSecondary} />
            )}
            <Text style={[s.filterText, { color: filterType === type ? (type === 'all' ? '#fff' : EVENT_COLORS[type]) : colors.textSecondary }]}>
              {type === 'all' ? t('audit', 'allEvents') : t('audit', type === 'user_action' ? 'userAction' : type === 'system_action' ? 'systemAction' : 'securityEvent')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={events}
        keyExtractor={item => item.id}
        renderItem={renderEvent}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>
              {search || filterType !== 'all' ? t('audit', 'noResults') : t('audit', 'noEvents')}
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
  header: { padding: 16, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 12 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  filterText: { fontSize: 12, fontWeight: '500' },
  eventCard: { borderRadius: 12, marginBottom: 8, padding: 14 },
  eventRow: { flexDirection: 'row', gap: 10 },
  eventIcon: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  eventContent: { flex: 1 },
  eventAction: { fontSize: 14, fontWeight: '600' },
  eventDetails: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  eventUser: { fontSize: 11 },
  eventDot: { fontSize: 11 },
  eventTime: { fontSize: 11 },
  eventIp: { fontSize: 10, marginTop: 2 },
  emptyText: { fontSize: 15, marginTop: 12 },
});
