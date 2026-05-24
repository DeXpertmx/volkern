import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { healthService, type HealthService, type HealthIssue } from '../../src/services/health';

export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [services, setServices] = useState<HealthService[]>([]);
  const [allHealthy, setAllHealthy] = useState(true);
  const [issues, setIssues] = useState<HealthIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [status, iss] = await Promise.all([
        healthService.getStatus(),
        healthService.getIssues(),
      ]);
      setServices(status.services);
      setAllHealthy(status.allHealthy);
      setIssues(iss);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const result = await healthService.checkNow();
      setServices(result.services);
      setAllHealthy(result.allHealthy);
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return 'checkmark-circle';
      case 'degraded': return 'alert-circle';
      case 'down': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#10B981';
      case 'degraded': return '#F59E0B';
      case 'down': return '#EF4444';
      default: return '#64748B';
    }
  };

  const renderService = ({ item }: { item: HealthService }) => (
    <View style={[s.serviceCard, { backgroundColor: colors.surface }]}>
      <View style={s.serviceRow}>
        <Ionicons name={getStatusIcon(item.status) as any} size={22} color={getStatusColor(item.status)} />
        <View style={s.serviceInfo}>
          <Text style={[s.serviceName, { color: colors.textPrimary }]}>{item.name}</Text>
          <Text style={[s.serviceMeta, { color: colors.textSecondary }]}>
            {t('health', 'responseTime')}: {item.responseTime}ms · {t('health', 'uptime')}: {item.uptime}
          </Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
          <Text style={[s.statusText, { color: getStatusColor(item.status) }]}>
            {item.status === 'healthy' ? t('health', 'online') :
             item.status === 'degraded' ? t('health', 'status') : t('health', 'offline')}
          </Text>
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
      <FlatList
        data={services}
        keyExtractor={item => item.id}
        renderItem={renderService}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <Text style={s.title}>{t('health', 'title')}</Text>
              <TouchableOpacity style={[s.refreshBtn, checking && { opacity: 0.6 }]} onPress={handleCheckNow} disabled={checking}>
                {checking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="refresh" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            <View style={[s.banner, { backgroundColor: allHealthy ? '#D1FAE5' : '#FEF3C7' }]}>
              <Ionicons
                name={allHealthy ? 'checkmark-circle' : 'alert-circle'}
                size={24}
                color={allHealthy ? '#10B981' : '#F59E0B'}
              />
              <Text style={[s.bannerText, { color: allHealthy ? '#065F46' : '#92400E' }]}>
                {allHealthy ? t('health', 'allHealthy') : t('health', 'issues')}
              </Text>
            </View>
          </>
        }
        ListFooterComponent={
          issues.filter(i => i.status === 'open').length > 0 ? (
            <>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('health', 'issues')}</Text>
              {issues.filter(i => i.status === 'open').map(issue => (
                <View key={issue.id} style={[s.issueCard, { backgroundColor: colors.surface, borderLeftColor: issue.severity === 'critical' ? '#EF4444' : '#F59E0B', borderLeftWidth: 3 }]}>
                  <Text style={[s.issueTitle, { color: colors.textPrimary }]}>{issue.title}</Text>
                  <Text style={[s.issueDesc, { color: colors.textSecondary }]}>{issue.description}</Text>
                  <Text style={[s.issueDate, { color: colors.textTertiary }]}>{new Date(issue.createdAt).toLocaleDateString()}</Text>
                </View>
              ))}
            </>
          ) : null
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
  refreshBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, marginBottom: 16 },
  bannerText: { fontSize: 15, fontWeight: '600', flex: 1 },
  serviceCard: { borderRadius: 12, marginBottom: 8, padding: 14 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 15, fontWeight: '600' },
  serviceMeta: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 12 },
  issueCard: { borderRadius: 12, padding: 14, marginBottom: 8 },
  issueTitle: { fontSize: 15, fontWeight: '600' },
  issueDesc: { fontSize: 13, marginTop: 4 },
  issueDate: { fontSize: 11, marginTop: 4 },
});
