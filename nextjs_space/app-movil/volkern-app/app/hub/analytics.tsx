import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { analyticsService, type AnalyticsPeriod, type MetricCard, type MetricType } from '../../src/services/analytics';

const PERIODS: { key: AnalyticsPeriod; labelKey: string }[] = [
  { key: '7d', labelKey: 'period7d' },
  { key: '30d', labelKey: 'period30d' },
  { key: '90d', labelKey: 'period90d' },
  { key: '1y', labelKey: 'period1y' },
];

const MOCK_METRICS: Record<MetricType, { current: number; previous: number }> = {
  revenue: { current: 45200, previous: 38100 },
  leads: { current: 89, previous: 72 },
  deals: { current: 24, previous: 18 },
  contacts: { current: 156, previous: 134 },
  tasks: { current: 67, previous: 55 },
  appointments: { current: 31, previous: 28 },
};

export default function AnalyticsScreen() {
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [reportName, setReportName] = useState('');

  const s = useMemo(() => mStyles(colors), [colors]);

  const loadMetrics = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const computed = await analyticsService.computeMetrics(MOCK_METRICS);
      setMetrics(computed);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const handleExport = async () => {
    try {
      const csv = await analyticsService.exportToCSV(metrics, []);
      Alert.alert(t('analytics', 'exportCSV'), csv.slice(0, 200) + '...');
    } catch { /* ignore */ }
  };

  const handleSaveReport = async () => {
    if (!reportName.trim()) { Alert.alert(t('common', 'error'), t('common', 'required')); return; }
    try {
      await analyticsService.saveReport({
        name: reportName.trim(),
        period,
        metrics,
        charts: [],
        summary: `Reporte generado el ${new Date().toLocaleDateString()}`,
      });
      setSaveModal(false);
      setReportName('');
      Alert.alert(t('common', 'done'), t('analytics', 'generating'));
    } catch { /* ignore */ }
  };

  const trendIcon = (trend: 'up' | 'down' | 'flat') => {
    if (trend === 'up') return <Ionicons name="trending-up" size={20} color={colors.success} />;
    if (trend === 'down') return <Ionicons name="trending-down" size={20} color={colors.error} />;
    return <Ionicons name="remove" size={20} color={colors.textTertiary} />;
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('analytics', 'title')}</Text>
        <Text style={[s.headerSub, { color: colors.textSecondary }]}>{t('analytics', 'subtitle')}</Text>
      </View>

      {/* Period Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.periodBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: layout.screenPadding, gap: spacing.sm }}
      >
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[s.periodChip, { backgroundColor: period === p.key ? colors.primaryBg : colors.background, borderColor: period === p.key ? colors.primary : colors.border }]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[s.periodLabel, { color: period === p.key ? colors.primary : colors.textSecondary }]}>
              {t('analytics', p.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.periodChip, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={handleExport}>
          <Ionicons name="download-outline" size={16} color={colors.textSecondary} />
          <Text style={[s.periodLabel, { color: colors.textSecondary }]}>{t('analytics', 'exportCSV')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.periodChip, { backgroundColor: colors.primaryBg, borderColor: colors.primary }]} onPress={() => setSaveModal(true)}>
          <Ionicons name="save-outline" size={16} color={colors.primary} />
          <Text style={[s.periodLabel, { color: colors.primary }]}>{t('analytics', 'saveReport')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadMetrics(true)} />}
      >
        {loading ? (
          <View style={{ padding: spacing.xxl * 2, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={{ padding: layout.screenPadding, gap: spacing.md }}>
            {/* Metric Cards */}
            <View style={s.metricsGrid}>
              {metrics.map(m => (
                <View key={m.id} style={[s.metricCard, { backgroundColor: colors.surface, borderLeftColor: m.color, borderLeftWidth: 3 }]}>
                  <View style={s.metricTop}>
                    <Text style={[s.metricLabel, { color: colors.textSecondary }]}>{m.label}</Text>
                    {trendIcon(m.trend)}
                  </View>
                  <Text style={[s.metricValue, { color: colors.textPrimary }]}>
                    {m.prefix || ''}{m.value.toLocaleString()}{m.suffix || ''}
                  </Text>
                  <Text style={[s.metricChange, { color: m.trend === 'up' ? colors.success : m.trend === 'down' ? colors.error : colors.textTertiary }]}>
                    {m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→'} {Math.abs(m.changePercent)}%
                  </Text>
                </View>
              ))}
            </View>

            {/* Comparison placeholder */}
            <View style={[s.comparisonCard, { backgroundColor: colors.surface }]}>
              <Text style={[s.comparisonTitle, { color: colors.textPrimary }]}>{t('analytics', 'comparison')}</Text>
              <Text style={[s.comparisonSub, { color: colors.textTertiary }]}>{t('analytics', 'vsPreviousPeriod')}</Text>
              {metrics.map(m => (
                <View key={m.id} style={s.compareRow}>
                  <View style={[s.compareDot, { backgroundColor: m.color }]} />
                  <Text style={[s.compareLabel, { color: colors.textSecondary }]}>{m.label}</Text>
                  <Text style={[s.compareValue, { color: colors.textPrimary }]}>
                    {m.prefix || ''}{m.value.toLocaleString()}{m.suffix || ''}
                  </Text>
                  <Text style={[s.compareChange, { color: m.trend === 'up' ? colors.success : colors.error }]}>
                    {m.change > 0 ? '+' : ''}{m.changePercent}%
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Save Report Modal */}
      <Modal visible={saveModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>{t('analytics', 'saveReport')}</Text>
              <TouchableOpacity onPress={() => { setSaveModal(false); setReportName(''); }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('analytics', 'reportName')}</Text>
            <TextInput
              style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              value={reportName}
              onChangeText={setReportName}
              placeholder={t('analytics', 'reportNamePlaceholder')}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => { setSaveModal(false); setReportName(''); }}>
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }]} onPress={handleSaveReport}>
                <Ionicons name="save" size={18} color="#fff" />
                <Text style={s.modalSaveText}>{t('analytics', 'generateReport')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const mStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: layout.screenPadding, paddingVertical: spacing.lg, borderBottomWidth: 1 },
  headerTitle: { ...typography.h2 },
  headerSub: { ...typography.bodySmall, marginTop: 2 },
  periodBar: { paddingVertical: spacing.md, borderBottomWidth: 1 },
  periodChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1 },
  periodLabel: { ...typography.caption, fontWeight: '500' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricCard: { width: '47%', padding: spacing.md, borderRadius: radius.lg, ...shadows.sm },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricLabel: { ...typography.caption },
  metricValue: { ...typography.h3, marginTop: spacing.xs },
  metricChange: { ...typography.caption, marginTop: 2 },
  comparisonCard: { padding: spacing.lg, borderRadius: radius.lg, ...shadows.sm, gap: spacing.md },
  comparisonTitle: { ...typography.h3 },
  comparisonSub: { ...typography.caption, marginTop: -spacing.sm },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compareDot: { width: 8, height: 8, borderRadius: 4 },
  compareLabel: { flex: 1, ...typography.bodySmall },
  compareValue: { ...typography.bodySmall, fontWeight: '600' },
  compareChange: { ...typography.caption, fontWeight: '600', minWidth: 50, textAlign: 'right' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: layout.screenPadding, paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { ...typography.h3 },
  fieldLabel: { ...typography.caption, fontWeight: '600', marginBottom: spacing.xs },
  fieldInput: { borderRadius: radius.md, padding: spacing.md, ...typography.body, borderWidth: 1 },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  modalCancel: { flex: 1, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  modalCancelText: { ...typography.body, fontWeight: '600' },
  modalSave: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  modalSaveText: { ...typography.body, color: '#fff', fontWeight: '600' },
});
