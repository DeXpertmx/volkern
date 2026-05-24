import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { dashboardService, DashboardStats, AnalyticsInsight, DashboardActivity } from '../../src/services/dashboard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const s = makeStyles(colors, insets);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [insights, setInsights] = useState<AnalyticsInsight[]>([]);
  const [activities, setActivities] = useState<DashboardActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await dashboardService.getStats('30');
      setStats(data);
      setInsights(dashboardService.buildAnalyticsInsights(data));
      setActivities(dashboardService.parseActivities(data));
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const revenueTrend = stats?.ingresosDiarios && stats.ingresosDiarios.length > 1
    ? ((stats.ingresosDiarios[stats.ingresosDiarios.length - 1]?.ingresos || 0) -
       (stats.ingresosDiarios[0]?.ingresos || 0))
    : 0;

  if (loading) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }, s.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>{t('dashboard', 'title')}</Text>
          <Text style={s.subtitle}>{t('dashboard', 'subtitle')}</Text>
        </View>

        {/* Stats Grid */}
        <View style={s.insightsGrid}>
          {insights.slice(0, 4).map((insight, idx) => (
            <View key={idx} style={[s.insightCard, { backgroundColor: colors.surface }]}>
              <View style={[s.insightIcon, { backgroundColor: insight.color + '15' }]}>
                <Ionicons name={insight.icon as any} size={20} color={insight.color} />
              </View>
              <Text style={[s.insightValue, { color: colors.textPrimary }]}>{insight.value}</Text>
              <Text style={[s.insightLabel, { color: colors.textSecondary }]}>{insight.label}</Text>
              {insight.change !== undefined && (
                <View style={s.trendRow}>
                  <Ionicons
                    name={insight.direction === 'up' ? 'trending-up' : insight.direction === 'down' ? 'trending-down' : 'remove'}
                    size={14}
                    color={insight.direction === 'up' ? '#10B981' : insight.direction === 'down' ? '#EF4444' : '#64748B'}
                  />
                  <Text style={[s.trendText, {
                    color: insight.direction === 'up' ? '#10B981' : insight.direction === 'down' ? '#EF4444' : '#64748B',
                  }]}>
                    {insight.change}%
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Revenue Trends */}
        {stats?.ingresosDiarios && stats.ingresosDiarios.length > 0 && (
          <View style={[s.sectionCard, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('dashboard', 'revenue')}</Text>
            <View style={s.chart}>
              {stats.ingresosDiarios.slice(0, 14).map((d, idx) => {
                const maxVal = Math.max(...stats.ingresosDiarios.map(x => x.ingresos), 1);
                const height = (d.ingresos / maxVal) * 100;
                return (
                  <View key={idx} style={s.barWrapper}>
                    <View style={[s.bar, { height: Math.max(height, 4), backgroundColor: colors.primary + '80' }]} />
                    <Text style={[s.barLabel, { color: colors.textTertiary }]}>
                      {new Date(d.fecha).getDate()}
                    </Text>
                  </View>
                );
              })}
            </View>
            {revenueTrend !== 0 && (
              <Text style={[s.trendSummary, { color: revenueTrend > 0 ? '#10B981' : '#EF4444' }]}>
                {revenueTrend > 0 ? '↑' : '↓'} {dashboardService.formatCurrency(Math.abs(revenueTrend))}
              </Text>
            )}
          </View>
        )}

        {/* Upcoming Appointments */}
        {stats?.proximasCitas && stats.proximasCitas.length > 0 && (
          <View style={[s.sectionCard, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('dashboard', 'upcomingAppointments')}</Text>
            {stats.proximasCitas.slice(0, 5).map((cita) => (
              <View key={cita.id} style={s.activityItem}>
                <View style={[s.activityDot, { backgroundColor: '#3B82F6' }]} />
                <View style={s.activityContent}>
                  <Text style={[s.activityText, { color: colors.textPrimary }]}>
                    {cita.lead?.name || t('common', 'userPlaceholder')}
                  </Text>
                  <Text style={[s.activityTime, { color: colors.textTertiary }]}>
                    {new Date(cita.fechaHora).toLocaleDateString(locale, {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recent Activity */}
        {activities.length > 0 && (
          <View style={[s.sectionCard, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('dashboard', 'recentActivity')}</Text>
            {activities.slice(0, 8).map((act) => (
              <View key={act.id} style={s.activityItem}>
                <View style={[s.activityDot, {
                  backgroundColor: act.type === 'cita' ? '#3B82F6' : act.type === 'lead' ? '#10B981' : act.type === 'message' ? '#F59E0B' : '#64748B',
                }]} />
                <View style={s.activityContent}>
                  <Text style={[s.activityText, { color: colors.textPrimary }]} numberOfLines={1}>{act.text}</Text>
                  <Text style={[s.activityTime, { color: colors.textTertiary }]}>{act.time}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Campaigns */}
        {stats && (
          <View style={[s.sectionCard, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('dashboard', 'campaigns')}</Text>
            <View style={s.campaignRow}>
              <View style={s.campaignStat}>
                <Text style={[s.campaignValue, { color: '#3B82F6' }]}>{stats.campanasActivas}</Text>
                <Text style={[s.campaignLabel, { color: colors.textSecondary }]}>{t('dashboard', 'active')}</Text>
              </View>
              <View style={s.campaignStat}>
                <Text style={[s.campaignValue, { color: '#10B981' }]}>{stats.campanasCompletadas}</Text>
                <Text style={[s.campaignLabel, { color: colors.textSecondary }]}>{t('dashboard', 'completed')}</Text>
              </View>
              <View style={s.campaignStat}>
                <Text style={[s.campaignValue, { color: '#F59E0B' }]}>{stats.totalCampanas}</Text>
                <Text style={[s.campaignLabel, { color: colors.textSecondary }]}>{t('common', 'total')}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  insightsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  insightCard: { width: (SCREEN_WIDTH - 42) / 2, borderRadius: 12, padding: 14 },
  insightIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  insightValue: { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  insightLabel: { fontSize: 12, marginBottom: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trendText: { fontSize: 11, fontWeight: '600' },
  sectionCard: { borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 14 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 100, marginBottom: 8 },
  barWrapper: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '80%', borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 9, marginTop: 4 },
  trendSummary: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
  activityItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  activityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  activityContent: { flex: 1 },
  activityText: { fontSize: 14, marginBottom: 2 },
  activityTime: { fontSize: 12 },
  campaignRow: { flexDirection: 'row', gap: 12 },
  campaignStat: { flex: 1, alignItems: 'center' },
  campaignValue: { fontSize: 24, fontWeight: '700' },
  campaignLabel: { fontSize: 12, marginTop: 2 },
});
