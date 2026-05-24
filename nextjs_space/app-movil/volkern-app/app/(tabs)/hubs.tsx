import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { hubsService } from '../../src/services/hubs';
import { getIonicon } from '../../src/utils/icons';
import { favoritesService } from '../../src/services/favorites';
import type { HubCategory, HubModule } from '../../src/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getCategoryIcon(catId: string): keyof typeof Ionicons.glyphMap {
  const iconMap: Record<string, string> = {
    agencia: 'business',
    ventas: 'trending-up',
    comunicaciones: 'chatbubbles',
    marketing: 'megaphone',
    academia: 'school',
    rrhh: 'people',
    equipo: 'person-circle',
    finanzas: 'calculator',
    calidad: 'shield-checkmark',
    produccion: 'settings',
    inventario: 'cube',
    proyectos: 'briefcase',
    taskforce: 'headset',
    strategy: 'trending-up',
    assets: 'cube',
    knowledge: 'book',
    perfil: 'person',
    configuracion: 'settings',
  };
  return (iconMap[catId] || 'grid') as keyof typeof Ionicons.glyphMap;
}

// ─── Category Section ─────────────────────────────────────────────────────────
function CategorySection({
  category,
  modules,
  onModulePress,
  onToggleFav,
  favoritedIds,
  colors,
  styles: sty,
  t,
}: {
  category: HubCategory;
  modules: HubModule[];
  onModulePress: (module: HubModule) => void;
  onToggleFav: (module: HubModule) => void;
  favoritedIds: Set<string>;
  colors: ReturnType<typeof useThemeColors>;
  styles: ReturnType<typeof makeStyles>;
  t: (domain: string, key: string, vars?: Record<string, string | number>) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayModules = expanded ? modules : modules.slice(0, 4);

  if (modules.length === 0) return null;

  return (
    <View style={sty.categorySection}>
      {/* Category Header */}
      <TouchableOpacity
        style={sty.categoryHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={[sty.categoryIcon, { backgroundColor: category.color + '15' }]}>
          <Ionicons name={getCategoryIcon(category.id)} size={20} color={category.color} />
        </View>
        <View style={sty.categoryInfo}>
          <Text style={sty.categoryName}>{category.name}</Text>
          <Text style={sty.categoryDescription} numberOfLines={1}>
            {category.description}
          </Text>
        </View>
        <View style={sty.categoryMeta}>
          <Text style={[sty.categoryCount, { color: category.color }]}>
            {modules.length}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textTertiary}
          />
        </View>
      </TouchableOpacity>

      {/* Module Grid */}
      <View style={sty.moduleGrid}>
        {displayModules.map((mod) => {
          const isFav = favoritedIds.has(mod.id);
          return (
            <TouchableOpacity
              key={mod.id}
              style={sty.moduleCard}
              onPress={() => onModulePress(mod)}
              onLongPress={() => onToggleFav(mod)}
              activeOpacity={0.7}
            >
              <View style={sty.moduleCardTop}>
                <TouchableOpacity
                  style={sty.favStarBtn}
                  onPress={(e) => { e.stopPropagation?.(); onToggleFav(mod); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={isFav ? 'star' : 'star-outline'}
                    size={14}
                    color={isFav ? colors.warning : colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
              <View style={[sty.moduleIconWrap, { backgroundColor: mod.color + '15' }]}>
                <Ionicons name={getIonicon(mod.icon)} size={22} color={mod.color} />
              </View>
              <Text style={sty.moduleName} numberOfLines={2}>
                {mod.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {modules.length > 4 && (
        <TouchableOpacity
          style={[sty.expandButton, { borderColor: category.color + '30' }]}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <Text style={[sty.expandText, { color: category.color }]}>
            {expanded ? t('hubs', 'showLess') : t('hubs', 'showMore', { n: modules.length - 4 })}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={category.color}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HubsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'categories' | 'grid'>('categories');
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    favoritesService.getFavoritedIds('module').then(setFavoritedIds);
  }, []);

  const categories = useMemo(() => hubsService.getCategories(), []);
  const allModules = useMemo(() => hubsService.getModules(), []);

  // Filter categories and modules
  const filteredData = useMemo(() => {
    if (!search.trim()) {
      return { categories, moduleMap: undefined };
    }

    const q = search.toLowerCase();
    const matched = allModules.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.categoryName.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q),
    );

    // Group matched by category
    const grouped: Record<string, HubModule[]> = {};
    for (const mod of matched) {
      if (!grouped[mod.categoryId]) grouped[mod.categoryId] = [];
      grouped[mod.categoryId].push(mod);
    }

    return { categories, moduleMap: grouped, searchActive: true, matched };
  }, [search, categories, allModules]);

  // Get modules for a category (filtered if searching)
  const getModulesForCategory = (catId: string): HubModule[] => {
    if (filteredData.searchActive && filteredData.moduleMap) {
      return filteredData.moduleMap[catId] || [];
    }
    return hubsService.getModulesByCategory(catId);
  };

  const handleModulePress = (mod: HubModule) => {
    router.push(`/hub/${mod.categoryId}`);
  };

  const handleToggleFav = async (mod: HubModule) => {
    const nowFav = await favoritesService.toggle({
      id: mod.id,
      type: 'module',
      name: mod.name,
      icon: mod.icon,
      color: mod.color,
    });
    setFavoritedIds(prev => {
      const next = new Set(prev);
      if (nowFav) next.add(mod.id);
      else next.delete(mod.id);
      return next;
    });
  };

  const totalModules = allModules.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('hubs', 'title')}</Text>
          <Text style={styles.headerSubtitle}>
            {t('hubs', 'subtitle', { total: totalModules, categories: categories.length })}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.viewToggle}
          onPress={() => setViewMode(viewMode === 'categories' ? 'grid' : 'categories')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={viewMode === 'categories' ? 'apps' : 'list'}
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('hubs', 'searchPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredData.searchActive && filteredData.matched ? (
          // Search results: compact flat list
          filteredData.matched.length > 0 ? (
            <>
              <Text style={styles.resultCount}>
                {filteredData.matched.length === 1 ? t('hubs', 'resultsCount', { n: filteredData.matched.length }) : t('hubs', 'resultsCountPlural', { n: filteredData.matched.length })}
              </Text>
              <View style={styles.searchResultsGrid}>
                {filteredData.matched.map((mod) => {
                  const isFav = favoritedIds.has(mod.id);
                  return (
                    <TouchableOpacity
                      key={mod.id}
                      style={styles.searchResultCard}
                      onPress={() => handleModulePress(mod)}
                      onLongPress={() => handleToggleFav(mod)}
                      activeOpacity={0.7}
                    >
                      <TouchableOpacity
                        style={{ padding: 4, marginRight: 4 }}
                        onPress={(e) => { e.stopPropagation?.(); handleToggleFav(mod); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={isFav ? 'star' : 'star-outline'}
                          size={18}
                          color={isFav ? colors.warning : colors.textTertiary}
                        />
                      </TouchableOpacity>
                      <View style={[styles.moduleIconWrap, { backgroundColor: mod.color + '15' }]}>
                        <Ionicons name={getIonicon(mod.icon)} size={22} color={mod.color} />
                      </View>
                      <View style={styles.searchResultInfo}>
                        <Text style={styles.moduleName} numberOfLines={1}>
                          {mod.name}
                        </Text>
                        <Text style={styles.moduleCategoryLabel} numberOfLines={1}>
                          {mod.categoryName}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={64} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>{t('hubs', 'noResults')}</Text>
              <Text style={styles.emptyText}>
                {t('hubs', 'noResultsText', { query: search, total: totalModules })}
              </Text>
            </View>
          )
        ) : viewMode === 'grid' ? (
          // Grid view: all modules in a flat grid
          <View style={styles.allModulesGrid}>
            {allModules.map((mod) => {
              const isFav = favoritedIds.has(mod.id);
              return (
                <TouchableOpacity
                  key={mod.id}
                  style={[styles.flatCard, { borderLeftColor: mod.color }]}
                  onPress={() => handleModulePress(mod)}
                  onLongPress={() => handleToggleFav(mod)}
                  activeOpacity={0.7}
                >
                  <TouchableOpacity
                    style={{ padding: 4, marginRight: 4 }}
                    onPress={(e) => { e.stopPropagation?.(); handleToggleFav(mod); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={isFav ? 'star' : 'star-outline'}
                      size={18}
                      color={isFav ? colors.warning : colors.textTertiary}
                    />
                  </TouchableOpacity>
                  <View style={[styles.moduleIconWrap, { backgroundColor: mod.color + '15' }]}>
                    <Ionicons name={getIonicon(mod.icon)} size={20} color={mod.color} />
                  </View>
                  <View style={styles.flatCardInfo}>
                    <Text style={styles.moduleName} numberOfLines={1}>
                      {mod.name}
                    </Text>
                    <Text style={styles.moduleCategoryLabel} numberOfLines={1}>
                      {mod.categoryName}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          // Categories view (default)
          categories.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              modules={getModulesForCategory(cat.id)}
              onModulePress={handleModulePress}
              onToggleFav={handleToggleFav}
              favoritedIds={favoritedIds}
              colors={colors}
              styles={styles}
              t={t}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      backgroundColor: colors.white,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      ...typography.h2,
      color: colors.textPrimary,
    },
    headerSubtitle: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },
    viewToggle: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.primary + '10',
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: layout.screenPadding,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: colors.white,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      ...typography.body,
      color: colors.textPrimary,
      paddingVertical: spacing.md,
    },
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.sm,
    },

    // ─── Category Section ──────────────────────────────────────────────────────
    categorySection: {
      marginBottom: spacing.md,
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      overflow: 'hidden',
      ...shadows.sm,
    },
    categoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      gap: spacing.md,
    },
    categoryIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    categoryInfo: {
      flex: 1,
    },
    categoryName: {
      ...typography.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    categoryDescription: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 1,
    },
    categoryMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    categoryCount: {
      ...typography.h3,
      fontWeight: '700',
    },
    moduleGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    moduleCard: {
      width: (SCREEN_WIDTH - layout.screenPadding * 2 - spacing.md * 2 - spacing.sm * 3) / 4,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      gap: spacing.xs,
    },
    moduleCardTop: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      width: '100%',
      height: 16,
    },
    favStarBtn: {
      width: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    moduleIconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    moduleName: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      fontSize: 11,
    },
    moduleCategoryLabel: {
      ...typography.caption,
      fontSize: 10,
      color: colors.textTertiary,
    },
    expandButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      borderStyle: 'dashed',
    },
    expandText: {
      ...typography.caption,
      fontWeight: '600',
    },

    // ─── Flat Grid View ────────────────────────────────────────────────────────
    allModulesGrid: {
      gap: spacing.sm,
    },
    flatCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
      borderLeftWidth: 3,
      ...shadows.sm,
    },
    flatCardInfo: {
      flex: 1,
    },

    // ─── Search Results ─────────────────────────────────────────────────────────
    resultCount: {
      ...typography.caption,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      fontWeight: '500',
    },
    searchResultsGrid: {
      gap: spacing.sm,
    },
    searchResultCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
      ...shadows.sm,
    },
    searchResultInfo: {
      flex: 1,
    },

    // ─── Empty State ────────────────────────────────────────────────────────────
    emptyState: {
      alignItems: 'center',
      paddingVertical: 60,
      gap: spacing.md,
    },
    emptyTitle: {
      ...typography.h3,
      color: colors.textPrimary,
    },
    emptyText: {
      ...typography.body,
      color: colors.textTertiary,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
}
