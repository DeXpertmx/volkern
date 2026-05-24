import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { reportsService } from '../../src/services/reports';
import type {
  LeadStatsResponse,
  DealMetricsResponse,
  DashboardStats,
} from '../../src/services/reports';

// ─── Constants ────────────────────────────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get('window').width;
const PIE_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

type PeriodFilter = '7d' | '30d' | '90d';
type ReportTab = 'leads' | 'deals' | 'revenue';

function getChartConfig(colors: ReturnType<typeof useThemeColors>) {
  return {
    backgroundColor: colors.white,
    backgroundGradientFrom: colors.white,
    backgroundGradientTo: colors.white,
    decimalCount: 0,
    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
    labelColor: () => colors.textTertiary,
    style: { borderRadius: radius.lg },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: colors.primary,
    },
    propsForBackgroundLines: {
      strokeDasharray: '4,4',
      stroke: colors.borderLight,
    },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const colors = useThemeColors();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const CHART_CONFIG = useMemo(() => getChartConfig(colors), [colors]);
  const CHART_WIDTH = SCREEN_WIDTH - layout.screenPadding * 2;
  const CHART_HEIGHT = 200;

  const [activeTab, setActiveTab] = useState<ReportTab>('leads');
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leadStats, setLeadStats] = useState<LeadStatsResponse | null>(null);
  const [dealMetrics, setDealMetrics] = useState<DealMetricsResponse | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);

  // ─── Load Data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const periodMap: Record<PeriodFilter, string> = {
        '7d': '7',
        '30d': '30',
        '90d': '90',
      };

      const dealPeriodMap: Record<PeriodFilter, string> = {
        '7d': 'semana',
        '30d': 'mes',
        '90d': 'trimestre',
      };

      const [leads, deals, dash] = await Promise.all([
        reportsService.getLeadStats(periodMap[period]),
        reportsService.getDealMetrics(dealPeriodMap[period]),
        reportsService.getDashboardStats(periodMap[period]),
      ]);

      setLeadStats(leads);
      setDealMetrics(deals);
      setDashboardStats(dash);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar reportes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Period Picker ─────────────────────────────────────────────────────────
  const PeriodSelector = () => (
    <View style={styles.periodRow}>
      {(['7d', '30d', '90d'] as PeriodFilter[]).map((p) => (
        <TouchableOpacity
          key={p}
          style={[styles.periodChip, period === p && styles.periodChipActive]}
          onPress={() => setPeriod(p)}
        >
          <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
            {p === '7d' ? t('reports', 'weekly') : p === '30d' ? t('reports', 'monthly') : t('reports', 'quarterly')}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ─── Tab Bar ───────────────────────────────────────────────────────────────
  const TabBar = () => (
    <View style={styles.tabRow}>
      {([
        { key: 'leads', label: t('reports', 'leads'), icon: 'people' as const },
        { key: 'deals', label: t('reports', 'sales'), icon: 'trending-up' as const },
        { key: 'revenue', label: t('reports', 'revenue'), icon: 'cash' as const },
      ] as const).map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          onPress={() => setActiveTab(tab.key)}
        >
          <Ionicons
            name={tab.icon}
            size={18}
            color={activeTab === tab.key ? colors.primary : colors.textTertiary}
          />
          <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('reports', 'title')}</Text>
          <Text style={styles.headerSub}>{t('reports', 'analytics')}</Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('reports', 'title')}</Text>
          <Text style={styles.headerSub}>{t('reports', 'analytics')}</Text>
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="cloud-offline" size={48} color={colors.error} />            <Text style={[styles.errorText, { marginTop: spacing.md }]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadData()}>
            <Text style={styles.retryText}>{t('common', 'retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('reports', 'title')}</Text>
        <Text style={styles.headerSub}>{t('reports', 'analytics')}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />
        }
      >
        {/* Period Selector */}
        <PeriodSelector />

        {/* Tab Bar */}
        <TabBar />

        {/* ─── LEADS TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'leads' && leadStats && (
          <>
            {/* KPI Cards */}
            <View style={styles.kpiGrid}>
              <KpiCard
                label={t('reports', 'totalLeads')}
                value={String(leadStats.overview.totalLeads)}
                icon="people"
                color={colors.primary}
                styles={styles}
              />
              <KpiCard
                label={t('reports', 'newLeads')}
                value={String(leadStats.overview.leadsNuevos)}
                icon="person-add"
                color={colors.success}
                styles={styles}
              />
              <KpiCard
                label={t('reports', 'conversionRate')}
                value={reportsService.formatPercent(leadStats.overview.tasaConversion)}
                icon="trending-up"
                color={colors.info}
                styles={styles}
              />
              <KpiCard
                label={t('reports', 'avgScore')}
                value={String(leadStats.overview.scorePromedio)}
                icon="star"
                color={colors.warning}
                styles={styles}
              />
            </View>

            {/* Leads by Status */}
            {leadStats.porEstado.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('reports', 'leadsByStatus')}</Text>
                <BarChart
                  data={{
                    labels: leadStats.porEstado.map((e) =>
                      (e.estado || 'sin estado').slice(0, 6),
                    ),
                    datasets: [{ data: leadStats.porEstado.map((e) => e.count) }],
                  }}
                  width={CHART_WIDTH}
                  height={CHART_HEIGHT}
                  yAxisLabel=""
                  yAxisSuffix=""
                  chartConfig={CHART_CONFIG}
                  style={styles.chart}
                  fromZero
                  showValuesOnTopOfBars
                />
              </View>
            )}

            {/* Leads by Source */}
            {leadStats.porFuente.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('reports', 'leadsBySource')}</Text>
                <PieChart
                  data={leadStats.porFuente.slice(0, 6).map((item, i) => ({
                    name: item.fuente || 'sin fuente',
                    population: item.count,
                    color: PIE_COLORS[i % PIE_COLORS.length],
                    legendFontColor: colors.textSecondary,
                    legendFontSize: 12,
                  }))}
                  width={CHART_WIDTH}
                  height={CHART_HEIGHT}
                  chartConfig={CHART_CONFIG}
                  accessor="population"
                  backgroundColor="transparent"
                  paddingLeft="25"
                  absolute
                />
              </View>
            )}

            {/* Lead Evolution */}
            {leadStats.evolucion.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('reports', 'leadEvolution')}</Text>
                <LineChart
                  data={{
                    labels: leadStats.evolucion
                      .filter((_: unknown, i: number) => i % 2 === 0)
                      .map((e: { fecha: string; count: number }) => e.fecha.slice(5)),
                    datasets: [{ data: leadStats.evolucion.map((e: { fecha: string; count: number }) => e.count) }],
                  }}
                  width={CHART_WIDTH}
                  height={200}
                  yAxisLabel=""
                  yAxisSuffix=""
                  chartConfig={{
                    ...CHART_CONFIG,
                    color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                    propsForDots: {
                      r: '4',
                      strokeWidth: '2',
                      stroke: colors.success,
                    },
                  }}
                  style={styles.chart}
                  bezier
                  fromZero
                />
              </View>
            )}

            {/* Top Leads */}
            {leadStats.topLeads.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('reports', 'topLeadsByScore')}</Text>
                {leadStats.topLeads.slice(0, 5).map((lead, i) => (
                  <View key={lead.id} style={styles.topLeadRow}>
                    <View style={styles.topLeadRank}>
                      <Text style={styles.topLeadRankText}>{i + 1}</Text>
                    </View>
                    <View style={styles.topLeadInfo}>
                      <Text style={styles.topLeadName}>{lead.nombre}</Text>
                      <Text style={styles.topLeadEmail}>{lead.email}</Text>
                    </View>
                    <View style={styles.topLeadScore}>
                      <Text style={styles.topLeadScoreValue}>{lead.score}</Text>
                      <Text style={styles.topLeadScoreLabel}>pts</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ─── DEALS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'deals' && dealMetrics && (
          <>
            {/* KPI Cards */}
            <View style={styles.kpiGrid}>
              <KpiCard
                label={t('reports', 'activeDeals')}
                value={String(dealMetrics.resumen.dealsActivos)}
                icon="trending-up"
                color={colors.primary}
                styles={styles}
              />
              <KpiCard
                label={t('reports', 'wonDeals')}
                value={String(dealMetrics.resumen.dealsGanados)}
                icon="trophy"
                color={colors.success}
                styles={styles}
              />
              <KpiCard
                label={t('reports', 'convRate')}
                value={reportsService.formatPercent(dealMetrics.resumen.tasaConversion)}
                icon="analytics"
                color={colors.info}
                styles={styles}
              />
              <KpiCard
                label={t('reports', 'avgTicket')}
                value={reportsService.formatCurrency(dealMetrics.resumen.ticketPromedio)}
                icon="cash"
                color={colors.warning}
                styles={styles}
              />
            </View>

            {/* Funnel by Stage */}
            {Object.keys(dealMetrics.distribucion.porEtapa).length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('reports', 'pipelineByStage')}</Text>
                {Object.entries(dealMetrics.distribucion.porEtapa).map(
                  ([etapa, data]) => (
                    <View key={etapa} style={styles.funnelRow}>
                      <View style={styles.funnelLabel}>
                        <Text style={styles.funnelStage}>{etapa}</Text>
                        <Text style={styles.funnelCount}>{data.cantidad} deals</Text>
                      </View>
                      <View style={styles.funnelBarBg}>
                        <View
                          style={[
                            styles.funnelBarFill,
                            {
                              width: `${
                                (data.cantidad /
                                  Math.max(
                                    ...Object.values(
                                      dealMetrics.distribucion.porEtapa,
                                    ).map((d: any) => d.cantidad),
                                  )) *
                                100
                              }%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.funnelValue}>
                        {reportsService.formatCurrency(data.valor)}
                      </Text>
                    </View>
                  ),
                )}
              </View>
            )}

            {/* Top Sellers */}
            {dealMetrics.topVendedores.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('reports', 'topSellers')}</Text>
                {dealMetrics.topVendedores.slice(0, 5).map((seller, i) => (
                  <View key={seller.id} style={styles.topLeadRow}>
                    <View style={styles.topLeadRank}>
                      <Text style={styles.topLeadRankText}>{i + 1}</Text>
                    </View>
                    <View style={styles.topLeadInfo}>
                      <Text style={styles.topLeadName}>{seller.nombre}</Text>
                      <Text style={styles.topLeadEmail}>
                        {seller.ganados} ganados · {seller.deals} totales
                      </Text>
                    </View>
                    <Text style={styles.sellerValue}>
                      {reportsService.formatCurrency(seller.valorGanado)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Deal Evolution */}
            {dealMetrics.evolucion.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('reports', 'salesEvolution')}</Text>
                <LineChart
                  data={{
                    labels: dealMetrics.evolucion
                      .filter((_: unknown, i: number) => i % 2 === 0)
                      .map((e: { periodo: string; valorCreado: number; valorGanado: number }) => e.periodo.slice(5)),
                    datasets: [
                      {
                        data: dealMetrics.evolucion.map((e: { periodo: string; valorCreado: number; valorGanado: number }) => e.valorGanado),
                        color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                        strokeWidth: 2,
                      },
                      {
                        data: dealMetrics.evolucion.map((e: { periodo: string; valorCreado: number; valorGanado: number }) => e.valorCreado),
                        color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
                        strokeWidth: 2,
                      },
                    ],
                  }}
                  width={CHART_WIDTH}
                  height={200}
                  yAxisLabel="$"
                  yAxisSuffix=""
                  chartConfig={{
                    ...CHART_CONFIG,
                    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
                  }}
                  style={styles.chart}
                  bezier
                  fromZero
                />
              </View>
            )}

            {/* Forecast */}
            {dealMetrics.pronostico.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('reports', 'salesForecast')}</Text>
                <BarChart
                  data={{
                    labels: dealMetrics.pronostico.map((f) => f.mes.slice(5)),
                    datasets: [
                      {
                        data: dealMetrics.pronostico.map((f) => f.valorPonderado),
                      },
                    ],
                  }}
                  width={CHART_WIDTH}
                  height={CHART_HEIGHT}
                  yAxisLabel="$"
                  yAxisSuffix=""
                  chartConfig={{
                    ...CHART_CONFIG,
                    color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
                  }}
                  style={styles.chart}
                  fromZero
                  showValuesOnTopOfBars
                />
              </View>
            )}
          </>
        )}

        {/* ─── REVENUE TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'revenue' && dashboardStats && (
          <>
            {/* KPI Cards */}
            <View style={styles.kpiGrid}>
              <KpiCard
                label={t('reports', 'monthlyRevenue')}
                value={reportsService.formatCurrency(dashboardStats.ingresosMes)}
                icon="cash"
                color={colors.success}
                styles={styles}
              />
              <KpiCard
                label={t('reports', 'appointmentsToday')}
                value={String(dashboardStats.citasHoy)}
                icon="calendar"
                color={colors.primary}
                styles={styles}
              />
              <KpiCard
                label={t('reports', 'pendingAppointments')}
                value={String(dashboardStats.citasPendientes)}
                icon="checkbox"
                color={colors.warning}
                styles={styles}
              />
              <KpiCard
                label={t('reports', 'campaigns')}
                value={`${dashboardStats.campanasActivas}/${dashboardStats.totalCampanas}`}
                icon="megaphone"
                color={colors.info}
                styles={styles}
              />
            </View>

            {/* Revenue Trend */}
            {dashboardStats.ingresosDiarios.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('reports', 'dailyRevenue')}</Text>
                <BarChart
                  data={{
                    labels: dashboardStats.ingresosDiarios
                      .filter((_: unknown, i: number) => i % 5 === 0)
                      .map((d: { fecha: string; ingresos: number }) => d.fecha.slice(5)),
                    datasets: [
                      {
                        data: dashboardStats.ingresosDiarios.map((d: { fecha: string; ingresos: number }) => d.ingresos),
                      },
                    ],
                  }}
                  width={CHART_WIDTH}
                  height={CHART_HEIGHT}
                  yAxisLabel="$"
                  yAxisSuffix=""
                  chartConfig={{
                    ...CHART_CONFIG,
                    color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                  }}
                  style={styles.chart}
                  fromZero
                />
              </View>
            )}

            {/* Campaign Summary */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>{t('reports', 'campaignSummary')}</Text>
              <View style={styles.campaignGrid}>
                <View style={[styles.campaignItem, { borderLeftColor: colors.primary }]}>
                  <Text style={styles.campaignValue}>{dashboardStats.totalCampanas}</Text>
                  <Text style={styles.campaignLabel}>{t('reports', 'totals')}</Text>
                </View>
                <View style={[styles.campaignItem, { borderLeftColor: colors.success }]}>
                  <Text style={styles.campaignValue}>{dashboardStats.campanasActivas}</Text>
                  <Text style={styles.campaignLabel}>{t('reports', 'active')}</Text>
                </View>
                <View style={[styles.campaignItem, { borderLeftColor: colors.warning }]}>
                  <Text style={styles.campaignValue}>{dashboardStats.campanasCompletadas}</Text>
                  <Text style={styles.campaignLabel}>{t('reports', 'completed')}</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── KPI Card Subcomponent ────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  icon,
  color,
  styles: sty,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={sty.kpiCard}>
      <View style={[sty.kpiIconCircle, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={sty.kpiValue}>{value}</Text>
      <Text style={sty.kpiLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.lg,
      backgroundColor: colors.white,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      ...typography.h2,
      color: colors.textPrimary,
    },
    headerSub: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: layout.screenPadding,
      paddingBottom: 100,
    },
    centerContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    errorText: {
      ...typography.body,
      color: colors.error,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: spacing.lg,
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    retryText: {
      color: colors.white,
      fontWeight: '600',
    },
    // Period
    periodRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    periodChip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
    },
    periodChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    periodText: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    periodTextActive: {
      color: colors.white,
    },
    // Tab Bar
    tabRow: {
      flexDirection: 'row',
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: 4,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    tabActive: {
      backgroundColor: colors.primaryBg,
    },
    tabText: {
      ...typography.bodySmall,
      color: colors.textTertiary,
      fontWeight: '600',
    },
    tabTextActive: {
      color: colors.primary,
    },
    // KPI Grid
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    kpiCard: {
      width: '48%',
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: spacing.md,
      ...shadows.sm,
    },
    kpiIconCircle: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    kpiValue: {
      ...typography.number,
      color: colors.textPrimary,
    },
    kpiLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    // Charts
    chartCard: {
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
      marginBottom: spacing.lg,
    },
    chartTitle: {
      ...typography.h3,
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    chart: {
      borderRadius: radius.md,
    },
    // Top Leads / Sellers
    topLeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    topLeadRank: {
      width: 24,
      height: 24,
      borderRadius: radius.full,
      backgroundColor: colors.primaryBg,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.md,
    },
    topLeadRankText: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.primary,
    },
    topLeadInfo: {
      flex: 1,
    },
    topLeadName: {
      ...typography.bodySmall,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    topLeadEmail: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: 1,
    },
    topLeadScore: {
      alignItems: 'center',
    },
    topLeadScoreValue: {
      ...typography.bodySmall,
      fontWeight: '700',
      color: colors.warning,
    },
    topLeadScoreLabel: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    sellerValue: {
      ...typography.bodySmall,
      fontWeight: '700',
      color: colors.success,
    },
    // Funnel
    funnelRow: {
      marginBottom: spacing.md,
    },
    funnelLabel: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    funnelStage: {
      ...typography.bodySmall,
      fontWeight: '600',
      color: colors.textPrimary,
      textTransform: 'capitalize',
    },
    funnelCount: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    funnelBarBg: {
      height: 8,
      backgroundColor: colors.borderLight,
      borderRadius: 4,
      overflow: 'hidden',
    },
    funnelBarFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 4,
    },
    funnelValue: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    // Campaign
    campaignGrid: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    campaignItem: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: radius.md,
      padding: spacing.md,
      borderLeftWidth: 3,
    },
    campaignValue: {
      ...typography.h2,
      color: colors.textPrimary,
    },
    campaignLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });
}
