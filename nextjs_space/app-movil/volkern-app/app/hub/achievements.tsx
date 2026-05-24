import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { achievementsService, ACHIEVEMENT_TIER_CONFIG, type Achievement, type GamificationProfile } from '../../src/services/achievements';

// ─── XP Progress Bar ──────────────────────────────────────────────────────────
function XPBar({ profile, colors, sty }: { profile: GamificationProfile; colors: ReturnType<typeof useThemeColors>; sty: ReturnType<typeof makeStyles> }) {
  const { t } = useI18n();
  const progress = profile.xpToNextLevel > 0 ? (profile.xp % profile.xpToNextLevel) / profile.xpToNextLevel : 1;
  const isMaxLevel = profile.level >= 50;

  return (
    <View style={[sty.xpContainer, { backgroundColor: colors.surface }]}>
      <View style={[sty.xpGlow, { backgroundColor: colors.primary + '10' }]} />
      <View style={sty.xpHeader}>
        <View style={[sty.levelBadge, { backgroundColor: colors.primary }]}>
          <Text style={sty.levelNumber}>{profile.level}</Text>
        </View>
        <View style={sty.xpInfo}>
          <Text style={[sty.levelLabel, { color: colors.textPrimary }]}>
            {isMaxLevel ? t('achievements', 'maxLevel') : t('achievements', 'level', { n: profile.level })}
          </Text>
          <Text style={[sty.xpText, { color: colors.textSecondary }]}>
            {isMaxLevel ? '🏆' : t('achievements', 'xpToNextLevel', { n: profile.xpToNextLevel - (profile.xp % profile.xpToNextLevel) })}
          </Text>
        </View>
        <View style={sty.xpValue}>
          <Text style={[sty.xpAmount, { color: colors.primary }]}>{profile.xp}</Text>
          <Text style={[sty.xpLabel, { color: colors.textTertiary }]}>XP</Text>
        </View>
      </View>
      {!isMaxLevel && (
        <View style={[sty.xpBarBg, { backgroundColor: colors.borderLight }]}>
          <View style={[sty.xpBarFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
        </View>
      )}
    </View>
  );
}

// ─── Streak Card ──────────────────────────────────────────────────────────────
function StreakCard({ profile, colors, sty }: { profile: GamificationProfile; colors: ReturnType<typeof useThemeColors>; sty: ReturnType<typeof makeStyles> }) {
  const { t } = useI18n();
  const hasStreak = profile.streaks.currentStreak > 0;

  return (
    <View style={[sty.streakCard, { backgroundColor: colors.surface }]}>
      <View style={sty.streakHeader}>
        <View style={[sty.streakIconWrap, { backgroundColor: colors.warningBg }]}>
          <Ionicons
            name={hasStreak ? 'flame' : 'flame-outline'}
            size={24}
            color={hasStreak ? colors.warning : colors.textTertiary}
          />
        </View>
        <Text style={[sty.streakLabel, { color: colors.textPrimary }]}>{t('achievements', 'streak')}</Text>
      </View>
      <View style={sty.streakStats}>
        <View style={sty.streakStat}>
          <Text style={[sty.streakNumber, { color: colors.warning }]}>{profile.streaks.currentStreak}</Text>
          <Text style={[sty.streakStatLabel, { color: colors.textTertiary }]}>{t('achievements', 'currentStreak')}</Text>
        </View>
        <View style={[sty.streakDivider, { backgroundColor: colors.borderLight }]} />
        <View style={sty.streakStat}>
          <Text style={[sty.streakNumber, { color: colors.textPrimary }]}>{profile.streaks.longestStreak}</Text>
          <Text style={[sty.streakStatLabel, { color: colors.textTertiary }]}>{t('achievements', 'longestStreak')}</Text>
        </View>
        <View style={[sty.streakDivider, { backgroundColor: colors.borderLight }]} />
        <View style={sty.streakStat}>
          <Ionicons
            name={profile.streaks.todayActive ? 'checkmark-circle' : 'ellipse-outline'}
            size={20}
            color={profile.streaks.todayActive ? colors.success : colors.textTertiary}
          />
          <Text style={[sty.streakStatLabel, { color: colors.textTertiary }]}>
            {profile.streaks.todayActive ? t('achievements', 'todayActive') : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Achievement Card ─────────────────────────────────────────────────────────
function AchievementCard({ achievement, colors, sty }: {
  achievement: Achievement & { progress: number; completed: boolean; unlockedAt: string | null };
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const { t } = useI18n();
  const tierColor = ACHIEVEMENT_TIER_CONFIG[achievement.tier].color;
  const tierIcon = ACHIEVEMENT_TIER_CONFIG[achievement.tier].icon;

  return (
    <View style={[
      sty.achievementCard,
      { backgroundColor: colors.surface, borderColor: achievement.completed ? tierColor + '30' : colors.borderLight },
      achievement.completed && { borderWidth: 1.5 },
    ]}>
      <View style={[sty.achievementIcon, { backgroundColor: achievement.completed ? tierColor + '15' : colors.borderLight }]}>
        <Ionicons name={achievement.completed ? (tierIcon as any) : (achievement.icon as any)} size={22} color={achievement.completed ? tierColor : colors.textTertiary} />
      </View>
      <View style={sty.achievementInfo}>
        <Text style={[sty.achievementLabel, { color: achievement.completed ? colors.textPrimary : colors.textSecondary }]}>
          {achievement.label}
        </Text>
        <Text style={[sty.achievementDesc, { color: colors.textTertiary }]} numberOfLines={1}>
          {achievement.description}
        </Text>
      </View>
      <View style={sty.achievementRight}>
        {achievement.completed ? (
          <Ionicons name="checkmark-circle" size={20} color={tierColor} />
        ) : (
          <View style={sty.achievementProgress}>
            <Text style={[sty.achievementPct, { color: colors.textTertiary }]}>
              {Math.min(Math.round(achievement.progress), 100)}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Badge Display ────────────────────────────────────────────────────────────
function BadgeDisplay({ profile, colors, sty }: { profile: GamificationProfile; colors: ReturnType<typeof useThemeColors>; sty: ReturnType<typeof makeStyles> }) {
  const { t } = useI18n();

  if (profile.badges.length === 0) return null;

  return (
    <View style={[sty.badgeSection, { backgroundColor: colors.surface }]}>
      <Text style={[sty.sectionTitle, { color: colors.textPrimary }]}>
        {t('achievements', 'badgesCount', { n: profile.badges.length })}
      </Text>
      <View style={sty.badgeGrid}>
        {profile.badges.slice(0, 12).map((badge) => (
          <View key={badge.id} style={sty.badgeItem}>
            <View style={[sty.badgeIcon, { backgroundColor: badge.color + '15' }]}>
              <Ionicons name={badge.icon as any} size={18} color={badge.color} />
            </View>
            <Text style={[sty.badgeLabel, { color: colors.textTertiary }]} numberOfLines={1}>{badge.label}</Text>
          </View>
        ))}
        {profile.badges.length > 12 && (
          <View style={sty.badgeItem}>
            <Text style={[sty.badgeMore, { color: colors.textSecondary }]}>+{profile.badges.length - 12}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Category Filter ──────────────────────────────────────────────────────────
const CATEGORIES = ['all', 'tasks', 'goals', 'contacts', 'surveys', 'login', 'social', 'onboarding'] as const;

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AchievementsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();

  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [achievements, setAchievements] = useState<(Achievement & { progress: number; completed: boolean; unlockedAt: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const s = useMemo(() => makeStyles(colors), [colors]);

  const loadData = useCallback(async () => {
    try {
      const [prof, achs] = await Promise.all([
        achievementsService.getProfile(),
        achievementsService.getAll(),
      ]);
      setProfile(prof);
      setAchievements(achs);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filtered = filter === 'all'
    ? achievements
    : achievements.filter((a) => a.category === filter);

  const completedCount = achievements.filter((a) => a.completed).length;

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <RNStatusBar barStyle={colors.textPrimary === '#0F172A' ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[s.headerBack, { backgroundColor: colors.background }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('achievements', 'title')}</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>{t('achievements', 'subtitle')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !profile ? (
        <View style={s.emptyState}>
          <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
            <Ionicons name="trophy-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>{t('achievements', 'noAchievements')}</Text>
          <TouchableOpacity style={[s.retryBtn, { backgroundColor: colors.primary }]} onPress={onRefresh}>
            <Text style={s.retryBtnText}>{t('common', 'retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* XP Level Bar */}
          <XPBar profile={profile} colors={colors} sty={s} />

          {/* Streaks */}
          <StreakCard profile={profile} colors={colors} sty={s} />

          {/* Badges */}
          <BadgeDisplay profile={profile} colors={colors} sty={s} />

          {/* Progress Summary */}
          <View style={[s.summaryRow, { backgroundColor: colors.surface }]}>
            <View style={s.summaryItem}>
              <Text style={[s.summaryNumber, { color: colors.primary }]}>{completedCount}</Text>
              <Text style={[s.summaryLabel, { color: colors.textTertiary }]}>{t('achievements', 'completed')}</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: colors.borderLight }]} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNumber, { color: colors.textPrimary }]}>{achievements.length - completedCount}</Text>
              <Text style={[s.summaryLabel, { color: colors.textTertiary }]}>{t('achievements', 'locked')}</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: colors.borderLight }]} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNumber, { color: colors.warning }]}>{profile.streaks.currentStreak}</Text>
              <Text style={[s.summaryLabel, { color: colors.textTertiary }]}>{t('common', 'today')}</Text>
            </View>
          </View>

          {/* Filter Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContent}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  s.filterTab,
                  { backgroundColor: filter === cat ? colors.primary : colors.surface, borderColor: colors.borderLight },
                ]}
                onPress={() => setFilter(cat)}
                activeOpacity={0.7}
              >
                <Text style={[
                  s.filterText,
                  { color: filter === cat ? '#fff' : colors.textSecondary },
                ]}>
                  {cat === 'all' ? t('common', 'all') : t('achievements', `category${cat.charAt(0).toUpperCase() + cat.slice(1)}` as any)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Achievement List */}
          {filtered.length === 0 ? (
            <View style={s.emptySection}>
              <Ionicons name="trophy-outline" size={32} color={colors.textTertiary} />
              <Text style={[s.emptySectionText, { color: colors.textTertiary }]}>{t('achievements', 'noAchievements')}</Text>
            </View>
          ) : (
            <View style={s.listSection}>
              {filtered.map((ach) => (
                <AchievementCard key={ach.id} achievement={ach} colors={colors} sty={s} />
              ))}
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingTop: Platform.OS === 'ios' ? 60 : (RNStatusBar.currentHeight || 24) + 8,
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
    },
    headerBack: { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { ...typography.h2 },
    headerSub: { ...typography.bodySmall, marginTop: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.lg, paddingBottom: 100, gap: spacing.md },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // ─── XP Bar ────────────────────────────────────────────────────────
    xpContainer: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      overflow: 'hidden',
      ...shadows.sm,
    },
    xpGlow: { position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: 60 },
    xpHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    levelBadge: {
      width: 44, height: 44, borderRadius: radius.lg,
      justifyContent: 'center', alignItems: 'center',
    },
    levelNumber: { color: '#fff', fontSize: 18, fontWeight: '800' },
    xpInfo: { flex: 1 },
    levelLabel: { ...typography.bodySmall, fontWeight: '700' },
    xpText: { ...typography.caption, marginTop: 1 },
    xpValue: { alignItems: 'center' },
    xpAmount: { ...typography.h3, fontWeight: '800' },
    xpLabel: { ...typography.caption, fontSize: 10 },
    xpBarBg: { height: 6, borderRadius: 3, marginTop: spacing.md, overflow: 'hidden' },
    xpBarFill: { height: '100%', borderRadius: 3 },

    // ─── Streak ─────────────────────────────────────────────────────────
    streakCard: { borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm },
    streakHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
    streakIconWrap: { width: 36, height: 36, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
    streakLabel: { ...typography.bodySmall, fontWeight: '600' },
    streakStats: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    streakStat: { alignItems: 'center', flex: 1, gap: spacing.xs },
    streakNumber: { fontSize: 24, fontWeight: '800' },
    streakStatLabel: { ...typography.caption, textAlign: 'center' },
    streakDivider: { width: 1, height: 32 },

    // ─── Badges ─────────────────────────────────────────────────────────
    badgeSection: { borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm },
    sectionTitle: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.md },
    badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    badgeItem: { alignItems: 'center', width: '18%', gap: spacing.xs, maxWidth: 72 },
    badgeIcon: { width: 36, height: 36, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
    badgeLabel: { ...typography.caption, fontSize: 9, textAlign: 'center' },
    badgeMore: { ...typography.body, fontWeight: '600' },

    // ─── Summary ────────────────────────────────────────────────────────
    summaryRow: { flexDirection: 'row', borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm },
    summaryItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
    summaryNumber: { fontSize: 24, fontWeight: '800' },
    summaryLabel: { ...typography.caption },
    summaryDivider: { width: 1, height: 32, marginHorizontal: spacing.sm },

    // ─── Filter ─────────────────────────────────────────────────────────
    filterScroll: { marginTop: spacing.xs },
    filterContent: { gap: spacing.sm, paddingVertical: spacing.sm },
    filterTab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1 },
    filterText: { ...typography.caption, fontWeight: '600' },

    // ─── Achievements List ──────────────────────────────────────────────
    listSection: { gap: spacing.sm },
    achievementCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      ...shadows.sm,
    },
    achievementIcon: { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
    achievementInfo: { flex: 1 },
    achievementLabel: { ...typography.bodySmall, fontWeight: '600' },
    achievementDesc: { ...typography.caption, marginTop: 1 },
    achievementRight: { alignItems: 'center', justifyContent: 'center', minWidth: 32 },
    achievementProgress: { alignItems: 'center' },
    achievementPct: { ...typography.caption, fontWeight: '600' },

    // ─── Empty ──────────────────────────────────────────────────────────
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    emptyIcon: { width: 80, height: 80, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
    emptyTitle: { ...typography.h3, textAlign: 'center' },
    retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.xl },
    retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    emptySection: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
    emptySectionText: { ...typography.bodySmall, textAlign: 'center' },
  });
