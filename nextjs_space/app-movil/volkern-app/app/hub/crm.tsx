import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { crmService, type TimelineActivity, type CustomerInsight, type CRMSettings } from '../../src/services/crm';

type Tab = 'timeline' | 'insights' | 'settings';

const ACTIVITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  deal_created: 'git-merge', deal_moved: 'arrow-forward', deal_won: 'trophy',
  deal_lost: 'close-circle', note_added: 'document-text', interaction: 'chatbubbles',
  lead_created: 'person-add', lead_converted: 'swap-horizontal',
};

export default function CRMScreen() {
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [activities, setActivities] = useState<TimelineActivity[]>([]);
  const [insights, setInsights] = useState<CustomerInsight | null>(null);
  const [settings, setSettings] = useState<CRMSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const s = useMemo(() => mStyles(colors), [colors]);

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [acts, ins, sets] = await Promise.all([
        crmService.getTimeline(100),
        crmService.getInsights(),
        crmService.getSettings(),
      ]);
      setActivities(acts);
      setInsights(ins);
      setSettings(sets);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const groupByDate = (acts: TimelineActivity[]): { label: string; items: TimelineActivity[] }[] => {
    const now = Date.now();
    const today = now - now % 86400000;
    const yesterday = today - 86400000;
    const weekAgo = today - 7 * 86400000;

    const groups: { label: string; items: TimelineActivity[] }[] = [];
    const todayItems = acts.filter(a => a.timestamp >= today);
    const yesterdayItems = acts.filter(a => a.timestamp >= yesterday && a.timestamp < today);
    const weekItems = acts.filter(a => a.timestamp >= weekAgo && a.timestamp < yesterday);
    const olderItems = acts.filter(a => a.timestamp < weekAgo);

    if (todayItems.length) groups.push({ label: t('crm', 'today'), items: todayItems });
    if (yesterdayItems.length) groups.push({ label: t('crm', 'yesterday'), items: yesterdayItems });
    if (weekItems.length) groups.push({ label: t('crm', 'thisWeek'), items: weekItems });
    if (olderItems.length) groups.push({ label: t('crm', 'older'), items: olderItems });
    return groups;
  };

  const handleClearTimeline = () => {
    Alert.alert(t('crm', 'clearTimeline'), t('crm', 'clearTimelineConfirm'), [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => { await crmService.clearTimeline(); loadData(); } },
    ]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(locale === 'es-MX' ? 'es-MX' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const friendlyMetric = (val: number) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(1)}K` : String(val);

  // ─── Tabs ──────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'timeline', label: t('crm', 'timeline'), icon: 'time' },
    { key: 'insights', label: t('crm', 'insights'), icon: 'analytics' },
    { key: 'settings', label: t('crm', 'settings'), icon: 'settings' },
  ];

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('crm', 'title')}</Text>
        <Text style={[s.headerSub, { color: colors.textSecondary }]}>{t('crm', 'subtitle')}</Text>
      </View>

      <View style={[s.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={18} color={activeTab === tab.key ? colors.primary : colors.textTertiary} />
            <Text style={[s.tabLabel, { color: activeTab === tab.key ? colors.primary : colors.textTertiary }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
      >
        {loading && (
          <View style={{ padding: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {/* ─── Timeline Tab ─────────────────────────────────────── */}
        {activeTab === 'timeline' && !loading && (
          <>
            {activities.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="time-outline" size={48} color={colors.textTertiary} />
                <Text style={[s.emptyTitle, { color: colors.textSecondary }]}>{t('crm', 'noActivity')}</Text>
              </View>
            ) : (
              <>
                <View style={{ paddingHorizontal: layout.screenPadding, paddingVertical: spacing.sm }}>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }} onPress={handleClearTimeline}>
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                    <Text style={[typography.caption, { color: colors.error }]}>{t('common', 'clear')}</Text>
                  </TouchableOpacity>
                </View>
                {groupByDate(activities).map(group => (
                  <View key={group.label} style={{ marginBottom: spacing.lg }}>
                    <Text style={[s.dateHeader, { color: colors.textSecondary }]}>{group.label}</Text>
                    {group.items.map(act => (
                      <View key={act.id} style={[s.activityCard, { backgroundColor: colors.surface }]}>
                        <View style={[s.activityIcon, { backgroundColor: colors.primaryBg }]}>
                          <Ionicons name={ACTIVITY_ICONS[act.type] || 'ellipse'} size={18} color={colors.primary} />
                        </View>
                        <View style={s.activityContent}>
                          <Text style={[s.activityTitle, { color: colors.textPrimary }]}>{act.title}</Text>
                          {act.description ? <Text style={[s.activityDesc, { color: colors.textTertiary }]}>{act.description}</Text> : null}
                        </View>
                        <Text style={[s.activityTime, { color: colors.textTertiary }]}>{formatTime(act.timestamp)}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ─── Insights Tab ─────────────────────────────────────── */}
        {activeTab === 'insights' && !loading && insights && (
          <View style={{ padding: layout.screenPadding, gap: spacing.md }}>
            <View style={[s.insightCard, { backgroundColor: colors.surface }]}>
              <Text style={[s.insightTitle, { color: colors.textPrimary }]}>{t('crm', 'totalContacts')}</Text>
              <Text style={[s.insightValue, { color: colors.primary }]}>{insights.totalContacts}</Text>
            </View>
            <View style={[s.insightCard, { backgroundColor: colors.surface }]}>
              <Text style={[s.insightTitle, { color: colors.textPrimary }]}>{t('crm', 'totalDeals')}</Text>
              <Text style={[s.insightValue, { color: colors.success }]}>{insights.totalDeals}</Text>
            </View>
            <View style={[s.insightCard, { backgroundColor: colors.surface }]}>
              <Text style={[s.insightTitle, { color: colors.textPrimary }]}>{t('crm', 'totalInteractions')}</Text>
              <Text style={[s.insightValue, { color: colors.warning }]}>{insights.totalInteractions}</Text>
            </View>
            <View style={[s.insightCard, { backgroundColor: colors.surface }]}>
              <Text style={[s.insightTitle, { color: colors.textPrimary }]}>{t('crm', 'conversionRate')}</Text>
              <Text style={[s.insightValue, { color: colors.info }]}>{(insights.conversionRate * 100).toFixed(1)}%</Text>
            </View>
            <View style={[s.insightCard, { backgroundColor: colors.surface }]}>
              <Text style={[s.insightTitle, { color: colors.textPrimary }]}>{t('crm', 'avgDealValue')}</Text>
              <Text style={[s.insightValue, { color: colors.success }]}>${friendlyMetric(insights.avgDealValue)}</Text>
            </View>
            {insights.topSources.length > 0 && (
              <View style={[s.insightSection, { backgroundColor: colors.surface }]}>
                <Text style={[s.insightTitle, { color: colors.textPrimary }]}>{t('crm', 'topSources')}</Text>
                {insights.topSources.map((src, i) => (
                  <View key={src.source} style={s.sourceRow}>
                    <Text style={[s.sourceLabel, { color: colors.textSecondary }]}>{i + 1}. {src.source}</Text>
                    <Text style={[s.sourceCount, { color: colors.textPrimary }]}>{src.count}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ─── Settings Tab ─────────────────────────────────────── */}
        {activeTab === 'settings' && !loading && settings && (
          <View style={{ padding: layout.screenPadding, gap: spacing.md }}>
            <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
              <View style={s.settingRow}>
                <Text style={[s.settingLabel, { color: colors.textPrimary }]}>{t('crm', 'autoReminders')}</Text>
                <Switch
                  value={settings.autoReminders}
                  onValueChange={async v => { const upd = await crmService.updateSettings({ autoReminders: v }); setSettings(upd); }}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={settings.autoReminders ? colors.primary : colors.textTertiary}
                />
              </View>
              <View style={[s.divider, { backgroundColor: colors.borderLight }]} />
              <View style={s.settingRow}>
                <Text style={[s.settingLabel, { color: colors.textPrimary }]}>{t('crm', 'notificationsEnabled')}</Text>
                <Switch
                  value={settings.enableActivityNotifications}
                  onValueChange={async v => { const upd = await crmService.updateSettings({ enableActivityNotifications: v }); setSettings(upd); }}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={settings.enableActivityNotifications ? colors.primary : colors.textTertiary}
                />
              </View>
            </View>
          </View>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const mStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: layout.screenPadding, paddingVertical: spacing.lg, borderBottomWidth: 1 },
  headerTitle: { ...typography.h2 },
  headerSub: { ...typography.bodySmall, marginTop: 2 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  tabLabel: { ...typography.caption, fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl * 2 },
  emptyTitle: { ...typography.body, marginTop: spacing.md },
  dateHeader: { ...typography.label, paddingHorizontal: layout.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  activityCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: layout.screenPadding, paddingVertical: spacing.md },
  activityIcon: { width: 36, height: 36, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  activityContent: { flex: 1 },
  activityTitle: { ...typography.bodySmall, fontWeight: '500' },
  activityDesc: { ...typography.caption, marginTop: 2, lineHeight: 16 },
  activityTime: { ...typography.caption, fontSize: 11 },
  insightCard: { padding: spacing.lg, borderRadius: radius.lg, ...shadows.sm },
  insightTitle: { ...typography.caption, fontWeight: '500' },
  insightValue: { ...typography.h1, marginTop: spacing.xs },
  insightSection: { padding: spacing.lg, borderRadius: radius.lg, ...shadows.sm, gap: spacing.sm },
  sourceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourceLabel: { ...typography.bodySmall },
  sourceCount: { ...typography.bodySmall, fontWeight: '600' },
  settingsCard: { borderRadius: radius.lg, overflow: 'hidden', ...shadows.sm },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  settingLabel: { ...typography.bodySmall, flex: 1, marginRight: spacing.md },
  divider: { height: 1, marginLeft: spacing.lg },
});
