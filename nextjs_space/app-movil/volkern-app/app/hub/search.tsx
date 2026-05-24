import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  searchService,
  getRecentSearches,
  clearRecentSearches,
  type SearchResult,
  type SearchSection,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
} from '../../src/services/search';

const SEARCH_DEBOUNCE_MS = 300;

function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] || 'search';
}

// ─── Search Result Row ────────────────────────────────────────────────────────
function SearchResultRow({
  result,
  colors,
  onPress,
}: {
  result: SearchResult;
  colors: ReturnType<typeof useThemeColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[ss.resultRow, { borderBottomColor: colors.borderLight }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[ss.resultIcon, { backgroundColor: result.color + '15' }]}>
        <Ionicons name={result.icon as any} size={20} color={result.color} />
      </View>
      <View style={ss.resultContent}>
        <Text style={[ss.resultTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {result.title}
        </Text>
        <Text style={[ss.resultDesc, { color: colors.textSecondary }]} numberOfLines={1}>
          {result.description}
        </Text>
      </View>
      <View style={[ss.resultCategory, { backgroundColor: result.color + '10' }]}>
        <Ionicons
          name={getCategoryIcon(result.category) as any}
          size={10}
          color={result.color}
        />
        <Text style={[ss.resultCategoryText, { color: result.color }]}>
          {result.categoryLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Suggestion Chip ──────────────────────────────────────────────────────────
function SuggestionChip({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon: string;
  color: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      style={[sty.chip, { backgroundColor: colors.background, borderColor: colors.border }]}
      onPress={onPress}
    >
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[sty.chipText, { color: colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SearchScreen() {
  const colors = useThemeColors();
  const { t } = useI18n();

  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [query, setQuery] = useState('');
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Fade in animation ─────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ── Debounced search ───────────────────────────────────────────────
  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSections([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const results = await searchService.searchAll(q);
      setSections(results);
    } catch {
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChangeText = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(text), SEARCH_DEBOUNCE_MS);
  }, [performSearch]);

  // ── Navigation ─────────────────────────────────────────────────────
  const handleResultPress = useCallback((result: SearchResult) => {
    router.back();
    setTimeout(() => {
      if (result.category === 'tasks') {
        router.push('/(tabs)/tasks');
      } else if (result.category === 'events') {
        router.push('/(tabs)/calendar');
      } else if (result.route.startsWith('/')) {
        router.push(result.route as any);
      } else {
        router.push('/(tabs)/hubs');
      }
    }, 100);
  }, [router]);

  const handleSuggestion = useCallback((label: string) => {
    setQuery(label);
    performSearch(label);
  }, [performSearch]);

  // ── Clear ──────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    setQuery('');
    setSections([]);
    setHasSearched(false);
    inputRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // ── Suggestions ────────────────────────────────────────────────────
  const suggestions = [
    { label: t('settings', 'light'), icon: 'trending-up', color: colors.categoryVentas },
    { label: t('tasks', 'todo'), icon: 'checkbox', color: colors.warning },
    { label: t('calendar', 'today'), icon: 'calendar', color: colors.primary },
    { label: t('dashboard', 'kpiLeads'), icon: 'people', color: colors.success },
    { label: t('reports', 'title'), icon: 'bar-chart', color: colors.info },
  ];

  const recentSearches = getRecentSearches();
  const totalResults = sections.reduce((sum, sec) => sum + sec.results.length, 0);

  return (
    <Animated.View style={[ss.overlay, { opacity: fadeAnim }]}>
      <SafeAreaView style={ss.safeArea} edges={['top']}>
        <KeyboardAvoidingView
          style={ss.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* ─── Search Bar ──────────────────────────────────────────── */}
          <View style={[ss.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={[ss.searchInputContainer, { backgroundColor: colors.background }]}>
              <Ionicons name="search" size={20} color={colors.textTertiary} />
              <TextInput
                ref={inputRef}
                style={[ss.searchInput, { color: colors.textPrimary }]}
                value={query}
                onChangeText={handleChangeText}
                placeholder={t('search', 'placeholder')}
                placeholderTextColor={colors.textTertiary}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={handleClear} style={ss.clearButton}>
                  <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={handleClose} style={ss.cancelButton}>
              <Text style={[ss.cancelText, { color: colors.primary }]}>{t('search', 'cancel')}</Text>
            </TouchableOpacity>
          </View>

          {/* ─── Content ─────────────────────────────────────────────── */}
          <ScrollView
            style={ss.flex}
            contentContainerStyle={ss.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Loading */}
            {loading && (
              <View style={ss.centered}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            {/* No results */}
            {hasSearched && !loading && totalResults === 0 && (
              <View style={ss.centered}>
                <View style={[ss.emptyIcon, { backgroundColor: colors.primaryBg }]}>
                  <Ionicons name="search-outline" size={40} color={colors.primary} />
                </View>
                <Text style={[ss.emptyTitle, { color: colors.textPrimary }]}>
                  {t('search', 'noResults')}
                </Text>
                <Text style={[ss.emptySub, { color: colors.textTertiary }]}>
                  {t('search', 'noResultsFor', { query })}
                </Text>
              </View>
            )}

            {/* Results */}
            {!loading && sections.map((section) => (
              <View key={section.title} style={ss.section}>
                <View style={ss.sectionHeader}>
                  <Ionicons
                    name={getCategoryIcon(section.title.toLowerCase()) as any}
                    size={16}
                    color={colors.textSecondary}
                  />
                  <Text style={[ss.sectionTitle, { color: colors.textSecondary }]}>
                    {section.title}
                  </Text>
                  <Text style={[ss.sectionCount, { color: colors.textTertiary }]}>
                    {section.results.length}
                  </Text>
                </View>
                {section.results.map((result) => (
                  <SearchResultRow
                    key={`${result.category}-${result.id}`}
                    result={result}
                    colors={colors}
                    onPress={() => handleResultPress(result)}
                  />
                ))}
              </View>
            ))}

            {/* Recent searches */}
            {!hasSearched && recentSearches.length > 0 && (
              <View style={ss.section}>
                <View style={ss.sectionHeader}>
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  <Text style={[ss.sectionTitle, { color: colors.textSecondary }]}>
                    {t('search', 'recentSearches')}
                  </Text>
                  <TouchableOpacity onPress={clearRecentSearches}>
                    <Text style={[ss.clearText, { color: colors.textTertiary }]}>{t('search', 'clearRecent')}</Text>
                  </TouchableOpacity>
                </View>
                <View style={ss.recentRow}>
                  {recentSearches.slice(0, 6).map((search, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[sty.chip, { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={() => handleSuggestion(search)}
                    >
                      <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
                      <Text style={[sty.chipText, { color: colors.textSecondary }]}>{search}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Suggestions */}
            {!hasSearched && recentSearches.length === 0 && (
              <View style={ss.section}>
                <View style={ss.sectionHeader}>
                  <Ionicons name="sparkles-outline" size={16} color={colors.textSecondary} />
                  <Text style={[ss.sectionTitle, { color: colors.textSecondary }]}>
                    {t('search', 'suggestions')}
                  </Text>
                </View>
                <View style={ss.suggestionsRow}>
                  {suggestions.map((sug, i) => (
                    <SuggestionChip
                      key={i}
                      label={sug.label}
                      icon={sug.icon}
                      color={sug.color}
                      onPress={() => handleSuggestion(sug.label)}
                    />
                  ))}
                </View>

                <Text style={[ss.hintText, { color: colors.textTertiary }]}>
                  {t('common', 'searchDot')}
                </Text>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Animated.View>
  );
}

// ─── Static styles (reusable) ─────────────────────────────────────────────────
export const sty = {
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
};

const ss = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // ─── Search Bar ──────────────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    height: 40,
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
  cancelButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // ─── Sections ───────────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  clearText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // ─── Result Row ─────────────────────────────────────────────────────────────
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultContent: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  resultDesc: {
    fontSize: 12,
    fontWeight: '400',
  },
  resultCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  resultCategoryText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // ─── Centered ───────────────────────────────────────────────────────────────
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySub: {
    fontSize: 14,
    fontWeight: '400',
  },

  // ─── Recent + Suggestions ───────────────────────────────────────────────────
  recentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  hintText: {
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});


