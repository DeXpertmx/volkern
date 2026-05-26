import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import Svg, { Polyline } from 'react-native-svg';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useAuth } from '../../src/contexts/auth';
import { useI18n } from '../../src/contexts/i18n';
import { dashboardService, DashboardStats, AnalyticsInsight } from '../../src/services/dashboard';
import { favoritesService, type FavoriteItem } from '../../src/services/favorites';
import { goalsService } from '../../src/services/goals';
import { contactsService, type Contact } from '../../src/services/contacts';
import { hubsService } from '../../src/services/hubs';
import { getIonicon } from '../../src/utils/icons';

// ─── Trend Indicator ───────────────────────────────────────────────────────────
function generateSparklineData(baseValue: number, insight?: AnalyticsInsight): number[] {
  const points = 5;
  const data: number[] = [];
  for (let i = 0; i < points; i++) {
    // Create a trend from baseValue * (1 - change) to baseValue
    const progress = i / (points - 1);
    if (insight?.direction === 'up') {
      data.push(Math.round(baseValue * (0.7 + progress * 0.3)));
    } else if (insight?.direction === 'down') {
      data.push(Math.round(baseValue * (1.3 - progress * 0.3)));
    } else {
      data.push(Math.round(baseValue * (0.9 + Math.random() * 0.2)));
    }
  }
  return data;
}

function TrendIndicator({ change, direction, colors }: {
  change?: number;
  direction?: 'up' | 'down' | 'flat';
  colors: ReturnType<typeof useThemeColors>;
}) {
  if (!direction || !change) return null;
  const icon = direction === 'up' ? 'arrow-up' : direction === 'down' ? 'arrow-down' : 'remove';
  const color = direction === 'up' ? colors.success : direction === 'down' ? colors.error : colors.textTertiary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Ionicons name={icon} size={10} color={color} />
      <Text style={{ fontSize: 10, color, fontWeight: '600' }}>{change}%</Text>
    </View>
  );
}

// ─── Mini Sparkline ────────────────────────────────────────────────────────────
function MiniSparkline({ data, color, colors }: {
  data: number[];
  color: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  if (data.length < 2) return null;
  const chartWidth = 60;
  const chartHeight = 24;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * chartWidth},${chartHeight - ((v - min) / range) * chartHeight}`).join(' ');

  return (
    <View style={{ width: chartWidth, height: chartHeight, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Text style={{ fontSize: 8, color: colors.textTertiary }}>{max}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 8, color: colors.textTertiary }}>{min}</Text>
      </View>
      <Svg width={chartWidth} height={chartHeight}>
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────
function getQuickActions(c: ReturnType<typeof useThemeColors>) {
  return [
    { icon: 'person-add' as const, label: 'Nuevo Lead', color: c.primary, action: 'lead' },
    { icon: 'calendar' as const, label: 'Agendar', color: c.success, action: 'cita' },
    { icon: 'search' as const, label: 'Consultar', color: c.warning, action: 'consulta' },
    { icon: 'cash' as const, label: 'Cotizar', color: c.info, action: 'cotizacion' },
  ];
}

// ─── KPI definition ───────────────────────────────────────────────────────────
interface KpiItem {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  insight?: AnalyticsInsight;
}

function buildKpis(stats: DashboardStats, c: ReturnType<typeof useThemeColors>): KpiItem[] {
  const insights = dashboardService.buildAnalyticsInsights(stats);
  return [
    {
      label: 'Leads', value: String(stats.totalLeads), icon: 'trending-up', color: c.success,
      insight: insights[0],
    },
    {
      label: 'Citas Hoy', value: String(stats.citasHoy), icon: 'calendar', color: c.primary,
      insight: insights[1],
    },
    {
      label: 'Pendientes', value: String(stats.citasPendientes), icon: 'checkbox', color: c.warning,
      insight: undefined,
    },
    {
      label: 'Ingresos Mes', value: dashboardService.formatCurrency(stats.ingresosMes), icon: 'cash', color: c.success,
      insight: insights[2],
    },
  ];
}

// ─── Activity definition ──────────────────────────────────────────────────────
interface ActivityItem {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  time: string;
  color: string;
}

function buildActivities(stats: DashboardStats, c: ReturnType<typeof useThemeColors>): ActivityItem[] {
  const items: ActivityItem[] = [];

  // Próximas citas como actividades
  for (const cita of (stats.proximasCitas || []).slice(0, 4)) {
    const fecha = new Date(cita.fechaHora);
    const ahora = new Date();
    const diffMs = fecha.getTime() - ahora.getTime();
    const diffMin = Math.round(diffMs / 60000);

    let timeStr: string;
    if (diffMin < 0) timeStr = 'Ahora';
    else if (diffMin < 60) timeStr = `En ${diffMin} min`;
    else if (diffMin < 1440) timeStr = `En ${Math.round(diffMin / 60)}h`;
    else timeStr = `En ${Math.round(diffMin / 1440)}d`;

    const leadName = (cita.lead as any)?.nombre || (cita.lead as any)?.name || 'Sin cliente';
    const servicioName = (cita.servicio as any)?.nombre || 'Sin servicio';

    items.push({
      icon: 'calendar',
      text: `Cita: ${leadName} — ${servicioName}`,
      time: timeStr,
      color: c.primary,
    });
  }

  // Campañas activas
  if (stats.campanasActivas > 0) {
    items.push({
      icon: 'megaphone',
      text: `${stats.campanasActivas} campaña(s) activa(s)`,
      time: 'En curso',
      color: c.info,
    });
  }

  return items;
}

export default function DashboardScreen() {
  const colors = useThemeColors();
  const screenWidth = Dimensions.get('window').width;
  const styles = useMemo(() => makeStyles(colors, screenWidth), [colors, screenWidth]);
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [goalStats, setGoalStats] = useState({ active: 0, completed: 0, total: 0, overallProgress: 0 });
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);

  useEffect(() => {
    loadDashboard();
    loadFavorites();
    loadGoalStats();
    loadRecentContacts();
  }, []);

  async function loadRecentContacts() {
    try {
      const stats = await contactsService.getStats();
      setRecentContacts(stats.recentContacts);
    } catch {
      // ignore
    }
  }

  async function loadGoalStats() {
    try {
      const s = await goalsService.getStats();
      setGoalStats(s);
    } catch {
      // ignore
    }
  }

  async function loadFavorites() {
    try {
      const items = await favoritesService.getAll();
      setFavorites(items.slice(0, 6));
    } catch {
      // ignore
    }
  }

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);
      const data = await dashboardService.getStats('30');
      setStats(data);
    } catch (err: any) {
      setError(err?.message || t('dashboard', 'errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const QUICK_ACTIONS = getQuickActions(colors);

  // ── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.header, { justifyContent: 'center' }]}>
          <Text style={styles.greeting}>{t('dashboard', 'loading')}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.header, { justifyContent: 'center' }]}>
          <Text style={styles.greeting}>{t('common', 'error')}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Ionicons name="cloud-offline" size={48} color={colors.error} />
          <Text style={[styles.subtitle, { color: colors.error, textAlign: 'center', marginTop: spacing.md }]}>
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
            onPress={loadDashboard}
          >
            <Text style={{ color: colors.white, fontWeight: '600' }}>{t('common', 'retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Data ───────────────────────────────────────────────────────────
  const kpis = stats ? buildKpis(stats, colors) : [];
  const activities = stats ? buildActivities(stats, colors) : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {t('dashboard', 'greeting', { name: user?.name?.split(' ')[0] || t('common', 'userPlaceholder') })}
          </Text>
          <Text style={styles.subtitle}>{t('dashboard', 'subtitle')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TouchableOpacity
            onPress={() => router.push('/hub/search')}
            style={{ padding: 4 }}
          >
            <Ionicons name="search" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* KPIs Grid */}
        <View style={styles.kpiGrid}>
          {kpis.map((kpi, index) => (
            <View key={index} style={styles.kpiCard}>
              <View style={styles.kpiTopRow}>
                <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '15' }]}>
                  <Ionicons name={kpi.icon} size={18} color={kpi.color} />
                </View>
                {kpi.insight && (
                  <TrendIndicator change={kpi.insight.change} direction={kpi.insight.direction} colors={colors} />
                )}
              </View>
              <Text style={styles.kpiValue}>{kpi.value}</Text>
              {kpi.insight && kpi.insight.change && kpi.insight.direction !== 'flat' && (
                <MiniSparkline
                  data={generateSparklineData(Number(kpi.value.replace(/[^0-9]/g, '')) ?? 10, kpi.insight)}
                  color={kpi.color}
                  colors={colors}
                />
              )}
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        {/* Favorites Section */}
        {favorites.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={styles.sectionTitle}>{t('favorites', 'title')}</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
                <Text style={[styles.subtitle, { color: colors.primary, fontWeight: '600' }]}>{t('favorites', 'manageFavorites')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.favGrid}>
              {favorites.map((fav) => (
                <TouchableOpacity
                  key={`${fav.type}-${fav.id}`}
                  style={styles.favCard}
                  onPress={() => {
                    if (fav.type === 'module') {
                      const mod = hubsService.getModule(fav.id);
                      if (mod) router.push(`/hub/module-detail?moduleId=${mod.id}`);
                    } else {
                      router.push('/(tabs)/tasks');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.favIcon, { backgroundColor: fav.color + '15' }]}>
                    <Ionicons name={getIonicon(fav.icon) as any} size={18} color={fav.color} />
                  </View>
                  <Text style={styles.favName} numberOfLines={2}>{fav.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Recent Contacts Section */}
        {recentContacts.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={styles.sectionTitle}>{t('contacts', 'title')}</Text>
              <TouchableOpacity onPress={() => router.push('/hub/contacts')}>
                <Text style={[styles.subtitle, { color: colors.primary, fontWeight: '600' }]}>{t('contacts', 'manageContacts')}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.activityCard, { backgroundColor: colors.surface }]}>
              {recentContacts.slice(0, 4).map((contact, index, arr) => (
                <TouchableOpacity
                  key={contact.id}
                  style={[
                    { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
                    index < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
                  ]}
                  onPress={() => router.push('/hub/contacts')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.kpiIcon, { backgroundColor: colors.primaryBg, marginBottom: 0 }]}>
                    <Ionicons name="person" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.activityText, { color: colors.textPrimary }]}>{contact.name}</Text>
                    <Text style={[styles.activityTime, { color: colors.textTertiary }]}>
                      {contact.company || contact.email}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Goals Section */}
        {goalStats.total > 0 && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={styles.sectionTitle}>{t('goals', 'title')}</Text>
              <TouchableOpacity onPress={() => router.push('/hub/goals')}>
                <Text style={[styles.subtitle, { color: colors.primary, fontWeight: '600' }]}>{t('common', 'seeAll')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.goalsCard, { backgroundColor: colors.surface }]}
              onPress={() => router.push('/hub/goals')}
              activeOpacity={0.7}
            >
              <View style={styles.goalsCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[styles.goalsIcon, { backgroundColor: colors.primaryBg }]}>
                    <Ionicons name="stats-chart" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.goalsOverviewText, { color: colors.textPrimary }]}>{t('goals', 'overallProgress')}</Text>
                </View>
                <Text style={[styles.goalsPercent, { color: colors.primary }]}>{goalStats.overallProgress}%</Text>
              </View>
              {/* Progress bar */}
              <View style={[styles.goalsBarBg, { backgroundColor: colors.borderLight }]}>
                <View style={[styles.goalsBarFill, { width: `${goalStats.overallProgress}%`, backgroundColor: colors.primary }]} />
              </View>
              <View style={styles.goalsStatsRow}>
                <View style={styles.goalsStat}>
                  <Text style={[styles.goalsStatValue, { color: colors.textPrimary }]}>{goalStats.active}</Text>
                  <Text style={[styles.goalsStatLabel, { color: colors.textTertiary }]}>{t('goals', 'active')}</Text>
                </View>
                <View style={styles.goalsStat}>
                  <Text style={[styles.goalsStatValue, { color: colors.success }]}>{goalStats.completed}</Text>
                  <Text style={[styles.goalsStatLabel, { color: colors.textTertiary }]}>{t('goals', 'completed')}</Text>
                </View>
                <View style={styles.goalsStat}>
                  <Text style={[styles.goalsStatValue, { color: colors.textSecondary }]}>{goalStats.total}</Text>
                  <Text style={[styles.goalsStatLabel, { color: colors.textTertiary }]}>{t('goals', 'all')}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>{t('dashboard', 'quickActions')}</Text>
        <View style={styles.quickActions}>
          {QUICK_ACTIONS.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={styles.quickActionButton}
              onPress={() => router.push('/(tabs)/gemma')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: action.color + '15' }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Actividad Reciente */}
        <Text style={styles.sectionTitle}>{t('dashboard', 'recentActivity')}</Text>
        <View style={styles.activityCard}>
          {activities.length === 0 ? (
            <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={32} color={colors.textTertiary} />
              <Text style={[styles.subtitle, { color: colors.textTertiary, marginTop: spacing.sm }]}>
                {t('dashboard', 'noActivity')}
              </Text>
            </View>
          ) : (
            activities.map((activity, index) => (
              <View
                key={index}
                style={[
                  styles.activityItem,
                  index < activities.length - 1 && styles.activityBorder,
                ]}
              >
                <View style={[styles.activityDot, { backgroundColor: activity.color }]}>
                  <Ionicons name={activity.icon} size={12} color={colors.white} />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityText}>{activity.text}</Text>
                  <Text style={styles.activityTime}>{activity.time}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Revenue Trend Chart */}
        {stats?.ingresosDiarios && stats.ingresosDiarios.length > 1 && (
          <>
            <Text style={styles.sectionTitle}>{t('dashboard', 'revenueTrend')}</Text>
            <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartStat, { color: colors.textPrimary }]}>
                  {dashboardService.formatCurrency(
                    stats.ingresosDiarios.reduce((sum, d) => sum + d.ingresos, 0)
                  )}
                </Text>
                <Text style={[styles.chartStatLabel, { color: colors.textTertiary }]}>{t('dashboard', 'revenueTotal')}</Text>
              </View>
              <LineChart
                data={{
                  labels: stats.ingresosDiarios
                    .filter((_, i) => i % Math.max(1, Math.floor(stats.ingresosDiarios.length / 5)) === 0)
                    .map((d) => d.fecha.slice(5)),
                  datasets: [{ data: stats.ingresosDiarios.map((d) => d.ingresos) }],
                }}
                width={screenWidth - layout.screenPadding * 2 - spacing.lg * 2}
                height={140}
                yAxisLabel="$"
                yAxisSuffix=""
                chartConfig={{
                  backgroundColor: colors.white,
                  backgroundGradientFrom: colors.surface,
                  backgroundGradientTo: colors.surface,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
                  labelColor: () => colors.textTertiary,
                  propsForDots: { r: '3', strokeWidth: '1.5', stroke: colors.primary },
                  propsForBackgroundLines: { strokeDasharray: '2,2', stroke: colors.borderLight },
                  style: { borderRadius: radius.md },
                }}
                style={{ borderRadius: radius.md, marginTop: spacing.sm }}
                bezier
                fromZero
              />
              <View style={styles.chartFooter}>
                <Text style={[styles.chartFooterText, { color: colors.textTertiary }]}>
                  {t('dashboard', 'last7days')} · {t('dashboard', 'dailyAvg')}: {dashboardService.formatCurrency(
                    Math.round(stats.ingresosDiarios.reduce((sum, d) => sum + d.ingresos, 0) / stats.ingresosDiarios.length)
                  )}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Quick Stats */}
        {stats && (
          <>
            <Text style={styles.sectionTitle}>{t('dashboard', 'quickStats')}</Text>
            <View style={[styles.quickStatsGrid, { backgroundColor: colors.surface }]}>
              <View style={[styles.quickStatItem, { borderRightWidth: 1, borderRightColor: colors.borderLight, borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
                <View style={[styles.quickStatIcon, { backgroundColor: colors.primaryBg }]}>
                  <Ionicons name="people" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.quickStatValue, { color: colors.textPrimary }]}>{stats.totalLeads}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textTertiary }]}>{t('dashboard', 'totalLeads')}</Text>
              </View>
              <View style={[styles.quickStatItem, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
                <View style={[styles.quickStatIcon, { backgroundColor: colors.successBg }]}>
                  <Ionicons name="calendar" size={18} color={colors.success} />
                </View>
                <Text style={[styles.quickStatValue, { color: colors.textPrimary }]}>{stats.citasHoy}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textTertiary }]}>{t('dashboard', 'kpiCitasHoy')}</Text>
              </View>
              <View style={[styles.quickStatItem, { borderRightWidth: 1, borderRightColor: colors.borderLight }]}>
                <View style={[styles.quickStatIcon, { backgroundColor: colors.warningBg }]}>
                  <Ionicons name="checkbox" size={18} color={colors.warning} />
                </View>
                <Text style={[styles.quickStatValue, { color: colors.textPrimary }]}>{stats.citasPendientes}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textTertiary }]}>{t('dashboard', 'kpiPendientes')}</Text>
              </View>
              <View style={styles.quickStatItem}>
                <View style={[styles.quickStatIcon, { backgroundColor: colors.infoBg }]}>
                  <Ionicons name="megaphone" size={18} color={colors.info} />
                </View>
                <Text style={[styles.quickStatValue, { color: colors.textPrimary }]}>{stats.campanasActivas}/{stats.totalCampanas}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textTertiary }]}>{t('dashboard', 'activeCampaigns')}</Text>
              </View>
            </View>
          </>
        )}

        {/* Full Analytics Button */}
        {stats && (
          <TouchableOpacity
            style={[styles.analyticsBtn, { backgroundColor: colors.primary, ...shadows.md }]}
            onPress={() => router.push('/(tabs)/reports')}
          >
            <Ionicons name="stats-chart" size={20} color={colors.white} />
            <Text style={styles.analyticsBtnText}>{t('dashboard', 'fullAnalytics')}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        )}

        {/* Acceso Rápido a Gemma */}
        <TouchableOpacity
          style={styles.gemmaPrompt}
          onPress={() => router.push('/(tabs)/gemma')}
        >
          <View style={styles.gemmaPromptContent}>
            <Ionicons name="chatbubble-ellipses" size={24} color={colors.primary} />
            <View style={styles.gemmaPromptText}>
              <Text style={styles.gemmaPromptTitle}>{t('dashboard', 'askGemma')}</Text>
              <Text style={styles.gemmaPromptSub}>{t('dashboard', 'askGemmaSub')}</Text>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles Factory ──────────────────────────────────────────────────────────
const makeStyles = (colors: ReturnType<typeof useThemeColors>, screenWidth: number) => StyleSheet.create({
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
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  greeting: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.screenPadding,
    paddingBottom: 100,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  kpiCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
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
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  quickActionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
    marginBottom: spacing.xxl,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  activityBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  activityDot: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  activityTime: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 1,
  },
  gemmaPrompt: {
    backgroundColor: colors.primaryBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.primary + '20',
  },
  gemmaPromptContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  gemmaPromptText: {
    flex: 1,
  },
  gemmaPromptTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  gemmaPromptSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },

  // ─── Goals ────────────────────────────────────────────────────────────
  goalsCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
    marginBottom: spacing.xxl,
  },
  goalsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  goalsIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalsOverviewText: { ...typography.bodySmall, fontWeight: '500' },
  goalsPercent: { ...typography.h3, fontWeight: '700' },
  goalsBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  goalsBarFill: { height: '100%', borderRadius: 4 },
  goalsStatsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  goalsStat: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  goalsStatValue: { ...typography.bodySmall, fontWeight: '600' },
  goalsStatLabel: { ...typography.caption },

  // ─── Favorites ─────────────────────────────────────────────────────────
  favGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  favCard: {
    width: (screenWidth - layout.screenPadding * 2 - spacing.sm * 2) / 3,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.sm,
  },
  favIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ─── Chart ────────────────────────────────────────────────────────────
  chartCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.sm,
    marginBottom: spacing.xxl,
  },
  chartHeader: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  chartStat: {
    ...typography.number,
    fontWeight: '700',
  },
  chartStatLabel: {
    ...typography.caption,
    marginTop: 1,
  },
  chartFooter: {
    width: '100%',
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  chartFooterText: {
    ...typography.caption,
  },

  // ─── Quick Stats Grid ───────────────────────────────────────────────
  quickStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
    marginBottom: spacing.xxl,
  },
  quickStatItem: {
    width: '50%',
    padding: spacing.lg,
    alignItems: 'center',
  },
  quickStatIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  quickStatValue: {
    ...typography.h3,
    fontWeight: '700',
  },
  quickStatLabel: {
    ...typography.caption,
    marginTop: 2,
  },

  // ─── Analytics Button ───────────────────────────────────────────────
  analyticsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    marginBottom: spacing.xxl,
  },
  analyticsBtnText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 15,
  },

  favName: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
    fontSize: 10,
  },
});

