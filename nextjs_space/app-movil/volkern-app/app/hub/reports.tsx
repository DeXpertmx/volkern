import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { reportsService, LeadStatsResponse, DealMetricsResponse } from '../../src/services/reports';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ReportTab = 'leads' | 'deals' | 'overview';

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const s = makeStyles(colors, insets);

  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [leadStats, setLeadStats] = useState<LeadStatsResponse | null>(null);
  const [dealMetrics, setDealMetrics] = useState<DealMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [leads, deals] = await Promise.all([
        reportsService.getLeadStats('30'),
        reportsService.getDealMetrics('mes'),
      ]);
      setLeadStats(leads);
      setDealMetrics(deals);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const tabs: { key: ReportTab; label: string; icon: string }[] = [
    { key: 'overview', label: t('reports', 'overview'), icon: 'grid' },
    { key: 'leads', label: t('reports', 'leads'), icon: 'people' },
    { key: 'deals', label: t('reports', 'deals'), icon: 'cash' },
  ];

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
          <Text style={s.title}>{t('reports', 'title')}</Text>
          <Text style={s.subtitle}>{t('reports', 'subtitle')}</Text>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabRow}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[s.tab, activeTab === tab.key && s.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? '#fff' : colors.textSecondary} />
              <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Overview Tab */}
        {activeTab === 'overview' && leadStats && dealMetrics && (
          <>
            <View style={[s.card, { backgroundColor: colors.surface }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('reports', 'conversion')}</Text>
              <View style={s.conversionRow}>
                <View style={s.conversionStat}>
                  <Text style={[s.conversionValue, { color: '#3B82F6' }]}>
                    {reportsService.formatPercent(leadStats.overview.tasaConversion)}
                  </Text>
                  <Text style={[s.conversionLabel, { color: colors.textSecondary }]}>{t('reports', 'conversion')}</Text>
                </View>
                <View style={s.conversionStat}>
                  <Text style={[s.conversionValue, { color: '#10B981' }]}>
                    {reportsService.formatPercent(dealMetrics.resumen.tasaConversion)}
                  </Text>
                  <Text style={[s.conversionLabel, { color: colors.textSecondary }]}>{t('reports', 'dealRate')}</Text>
                </View>
              </View>
            </View>

            <View style={[s.card, { backgroundColor: colors.surface }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('reports', 'revenue')}</Text>
              <Text style={[s.bigNumber, { color: colors.textPrimary }]}>
                {reportsService.formatCurrency(dealMetrics.resumen.valorGanado)}
              </Text>
              <Text style={[s.cardSub, { color: colors.textSecondary }]}>
                {t('reports', 'weightedPipeline')}: {reportsService.formatCurrency(dealMetrics.resumen.valorPonderado)}
              </Text>
              <View style={s.revenueRow}>
                <View style={s.revenueItem}>
                  <Text style={[s.revenueValue, { color: '#10B981' }]}>${dealMetrics.resumen.dealsGanados}</Text>
                  <Text style={[s.revenueLabel, { color: colors.textSecondary }]}>{t('reports', 'won')}</Text>
                </View>
                <View style={s.revenueItem}>
                  <Text style={[s.revenueValue, { color: '#EF4444' }]}>${dealMetrics.resumen.dealsPerdidos}</Text>
                  <Text style={[s.revenueLabel, { color: colors.textSecondary }]}>{t('reports', 'lost')}</Text>
                </View>
                <View style={s.revenueItem}>
                  <Text style={[s.revenueValue, { color: '#F59E0B' }]}>${dealMetrics.resumen.valorPonderado.toLocaleString()}</Text>
                  <Text style={[s.revenueLabel, { color: colors.textSecondary }]}>{t('reports', 'pipeline')}</Text>
                </View>
              </View>
            </View>

            <View style={[s.card, { backgroundColor: colors.surface }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('reports', 'topSellers')}</Text>
              {dealMetrics.topVendedores.slice(0, 5).map((seller, idx) => (
                <View key={seller.id} style={s.sellerRow}>
                  <View style={[s.sellerRank, { backgroundColor: idx === 0 ? '#F59E0B20' : colors.borderLight }]}>
                    <Text style={[s.sellerRankText, { color: idx === 0 ? '#F59E0B' : colors.textSecondary }]}>{idx + 1}</Text>
                  </View>
                  <View style={s.sellerInfo}>
                    <Text style={[s.sellerName, { color: colors.textPrimary }]}>{seller.nombre}</Text>
                    <Text style={[s.sellerDetail, { color: colors.textSecondary }]}>
                      {seller.ganados}/{seller.deals} {t('reports', 'won')}
                    </Text>
                  </View>
                  <Text style={[s.sellerRevenue, { color: colors.textPrimary }]}>
                    {reportsService.formatCurrency(seller.valorGanado)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Leads Tab */}
        {activeTab === 'leads' && leadStats && (
          <>
            <View style={[s.card, { backgroundColor: colors.surface }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('reports', 'leadStats')}</Text>
              <View style={s.metricRow}>
                <View style={s.metricItem}>
                  <Text style={[s.metricValue, { color: colors.textPrimary }]}>{leadStats.overview.totalLeads}</Text>
                  <Text style={[s.metricLabel, { color: colors.textSecondary }]}>{t('reports', 'total')}</Text>
                </View>
                <View style={s.metricItem}>
                  <Text style={[s.metricValue, { color: '#10B981' }]}>{leadStats.overview.leadsNuevos}</Text>
                  <Text style={[s.metricLabel, { color: colors.textSecondary }]}>{t('reports', 'new')}</Text>
                </View>
                <View style={s.metricItem}>
                  <Text style={[s.metricValue, { color: '#3B82F6' }]}>{leadStats.overview.leadsConvertidos}</Text>
                  <Text style={[s.metricLabel, { color: colors.textSecondary }]}>{t('reports', 'converted')}</Text>
                </View>
              </View>
              <View style={s.divider} />
              <Text style={[s.metricSub, { color: colors.textSecondary }]}>
                {t('reports', 'scoreAvg')}: {leadStats.overview.scorePromedio} · {t('reports', 'unassigned')}: {leadStats.overview.leadsSinAsignar}
              </Text>
            </View>

            <View style={[s.card, { backgroundColor: colors.surface }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('reports', 'byStatus')}</Text>
              {leadStats.porEstado.map((g, idx) => (
                <View key={idx} style={s.groupRow}>
                  <Text style={[s.groupLabel, { color: colors.textPrimary }]}>{g.estado}</Text>
                  <View style={s.groupBar}>
                    <View style={[s.groupBarFill, {
                      width: `${(g.count / Math.max(...leadStats.porEstado.map(x => x.count), 1)) * 100}%`,
                      backgroundColor: colors.primary,
                    }]} />
                  </View>
                  <Text style={[s.groupCount, { color: colors.textSecondary }]}>{g.count}</Text>
                </View>
              ))}
            </View>

            <View style={[s.card, { backgroundColor: colors.surface }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('reports', 'bySource')}</Text>
              {leadStats.porFuente.map((g, idx) => (
                <View key={idx} style={s.groupRow}>
                  <Text style={[s.groupLabel, { color: colors.textPrimary }]}>{g.fuente}</Text>
                  <View style={s.groupBar}>
                    <View style={[s.groupBarFill, {
                      width: `${(g.count / Math.max(...leadStats.porFuente.map(x => x.count), 1)) * 100}%`,
                      backgroundColor: '#8B5CF6',
                    }]} />
                  </View>
                  <Text style={[s.groupCount, { color: colors.textSecondary }]}>{g.count}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Deals Tab */}
        {activeTab === 'deals' && dealMetrics && (
          <>
            <View style={[s.card, { backgroundColor: colors.surface }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('reports', 'dealSummary')}</Text>
              <View style={s.metricRow}>
                <View style={s.metricItem}>
                  <Text style={[s.metricValue, { color: colors.textPrimary }]}>{dealMetrics.resumen.totalDeals}</Text>
                  <Text style={[s.metricLabel, { color: colors.textSecondary }]}>{t('reports', 'total')}</Text>
                </View>
                <View style={s.metricItem}>
                  <Text style={[s.metricValue, { color: '#F59E0B' }]}>{dealMetrics.resumen.dealsActivos}</Text>
                  <Text style={[s.metricLabel, { color: colors.textSecondary }]}>{t('reports', 'active')}</Text>
                </View>
                <View style={s.metricItem}>
                  <Text style={[s.metricValue, { color: '#10B981' }]}>{dealMetrics.resumen.dealsGanados}</Text>
                  <Text style={[s.metricLabel, { color: colors.textSecondary }]}>{t('reports', 'won')}</Text>
                </View>
              </View>
              <View style={s.divider} />
              <Text style={[s.metricSub, { color: colors.textSecondary }]}>
                {t('reports', 'avgTicket')}: {reportsService.formatCurrency(dealMetrics.resumen.ticketPromedio)} · {t('reports', 'avgCycle')}: {dealMetrics.resumen.tiempoPromedioCiclo}d
              </Text>
            </View>

            {dealMetrics.distribucion.porEtapa && (
              <View style={[s.card, { backgroundColor: colors.surface }]}>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('reports', 'byStage')}</Text>
                {Object.entries(dealMetrics.distribucion.porEtapa).map(([stage, data], idx) => (
                  <View key={idx} style={s.stageRow}>
                    <View style={s.stageInfo}>
                      <Text style={[s.stageName, { color: colors.textPrimary }]}>{stage}</Text>
                      <Text style={[s.stageCount, { color: colors.textSecondary }]}>{data.cantidad} · {reportsService.formatCurrency(data.valor)}</Text>
                    </View>
                    <View style={s.stageBar}>
                      <View style={[s.stageBarFill, {
                        width: `${(data.valor / Math.max(...Object.values(dealMetrics.distribucion.porEtapa).map(x => x.valor), 1)) * 100}%`,
                        backgroundColor: '#3B82F6',
                      }]} />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {dealMetrics.pronostico.length > 0 && (
              <View style={[s.card, { backgroundColor: colors.surface }]}>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('reports', 'forecast')}</Text>
                {dealMetrics.pronostico.slice(0, 6).map((f, idx) => (
                  <View key={idx} style={s.forecastRow}>
                    <Text style={[s.forecastMonth, { color: colors.textPrimary }]}>{f.mes}</Text>
                    <Text style={[s.forecastValue, { color: colors.textPrimary }]}>
                      {reportsService.formatCurrency(f.valorPonderado)}
                    </Text>
                    <Text style={[s.forecastCount, { color: colors.textSecondary }]}>{f.cantidad}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  tabRow: { flexDirection: 'row', marginBottom: 16 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surface, marginRight: 8 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, color: colors.textSecondary },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  card: { borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 14 },
  cardSub: { fontSize: 13, marginTop: 4 },
  conversionRow: { flexDirection: 'row', gap: 12 },
  conversionStat: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: colors.background },
  conversionValue: { fontSize: 28, fontWeight: '700' },
  conversionLabel: { fontSize: 12, marginTop: 2 },
  bigNumber: { fontSize: 32, fontWeight: '700' },
  revenueRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  revenueItem: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: colors.background },
  revenueValue: { fontSize: 18, fontWeight: '700' },
  revenueLabel: { fontSize: 11, marginTop: 2 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sellerRank: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  sellerRankText: { fontSize: 13, fontWeight: '700' },
  sellerInfo: { flex: 1 },
  sellerName: { fontSize: 14, fontWeight: '500' },
  sellerDetail: { fontSize: 12 },
  sellerRevenue: { fontSize: 14, fontWeight: '600' },
  metricRow: { flexDirection: 'row', gap: 12 },
  metricItem: { flex: 1, alignItems: 'center' },
  metricValue: { fontSize: 22, fontWeight: '700' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  metricSub: { fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  groupLabel: { width: 80, fontSize: 13 },
  groupBar: { flex: 1, height: 8, backgroundColor: colors.borderLight, borderRadius: 4 },
  groupBarFill: { height: 8, borderRadius: 4 },
  groupCount: { width: 30, textAlign: 'right', fontSize: 13, fontWeight: '600' },
  stageRow: { marginBottom: 12 },
  stageInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  stageName: { fontSize: 14, fontWeight: '500' },
  stageCount: { fontSize: 13 },
  stageBar: { height: 8, backgroundColor: colors.borderLight, borderRadius: 4 },
  stageBarFill: { height: 8, borderRadius: 4 },
  forecastRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  forecastMonth: { fontSize: 14, fontWeight: '500', flex: 1 },
  forecastValue: { fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'center' },
  forecastCount: { fontSize: 13, width: 30, textAlign: 'right' },
});
