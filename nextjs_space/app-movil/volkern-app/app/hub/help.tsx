import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { helpService, type FAQItem, type FAQCategory, type TutorialGuide } from '../../src/services/help';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  'getting-started': 'categoryGettingStarted',
  'account': 'categoryAccount',
  'modules': 'categoryModules',
  'tasks': 'categoryTasks',
  'calendar': 'categoryCalendar',
  'billing': 'categoryBilling',
  'support': 'categorySupport',
};

type ViewMode = 'main' | 'category' | 'faq-detail' | 'tutorial';

// ─── FAQ Accordion Item ───────────────────────────────────────────────────────
function FAQAccordionItem({ faq, colors, sty }: {
  faq: FAQItem;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <View style={[sty.faqItem, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        style={sty.faqHeader}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={sty.faqHeaderLeft}>
          <View style={[sty.faqCategoryDot, { backgroundColor: faq.category.color }]} />
          <Text style={[sty.faqQuestion, { color: colors.textPrimary }]} numberOfLines={expanded ? undefined : 2}>
            {faq.question}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textTertiary}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={sty.faqAnswerWrap}>
          <Text style={[sty.faqAnswer, { color: colors.textSecondary }]}>{faq.answer}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────
function CategoryCard({ category, color, label, onPress, sty }: {
  category: FAQCategory;
  color: string;
  label: string;
  onPress: () => void;
  sty: ReturnType<typeof makeStyles>;
}) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      style={[sty.categoryCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[sty.categoryIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={category.icon as any} size={22} color={color} />
      </View>
      <Text style={[sty.categoryLabel, { color: colors.textPrimary }]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Tutorial Card ────────────────────────────────────────────────────────────
function TutorialCard({ tutorial, colors, sty, onPress }: {
  tutorial: TutorialGuide;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const { t } = useI18n();
  return (
    <TouchableOpacity
      style={[sty.tutorialCard, { backgroundColor: colors.surface, borderLeftColor: tutorial.color }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={sty.tutorialHeader}>
        <View style={[sty.tutorialIcon, { backgroundColor: tutorial.color + '15' }]}>
          <Ionicons name={tutorial.icon as any} size={20} color={tutorial.color} />
        </View>
        <View style={sty.tutorialInfo}>
          <Text style={[sty.tutorialTitle, { color: colors.textPrimary }]}>{tutorial.title}</Text>
          <Text style={[sty.tutorialDesc, { color: colors.textTertiary }]}>{tutorial.description}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>
      <View style={sty.tutorialFooter}>
        <View style={[sty.tutorialStepsBadge, { backgroundColor: tutorial.color + '10' }]}>
          <Text style={[sty.tutorialStepsText, { color: tutorial.color }]}>
            {t('help', 'tutorialSteps', { n: tutorial.steps.length })}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Support Card ─────────────────────────────────────────────────────────────
function SupportCard({ colors, sty }: {
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const { t } = useI18n();
  const support = helpService.SUPPORT_CONTACT;

  const handleCopyEmail = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(support.email);
      Alert.alert(t('help', 'emailCopied'));
    } catch {
      // fallback
    }
  }, [t, support.email]);

  const handleSendEmail = useCallback(async () => {
    const url = `mailto:${support.email}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      handleCopyEmail();
    }
  }, [support.email, handleCopyEmail]);

  return (
    <View style={[sty.supportCard, { backgroundColor: colors.surface }]}>
      <View style={sty.supportHeader}>
        <View style={[sty.supportIcon, { backgroundColor: colors.primaryBg }]}>
          <Ionicons name="headset" size={24} color={colors.primary} />
        </View>
        <View style={sty.supportInfo}>
          <Text style={[sty.supportTitle, { color: colors.textPrimary }]}>{t('help', 'contact')}</Text>
          <Text style={[sty.supportSub, { color: colors.textTertiary }]}>{t('help', 'contactSub')}</Text>
        </View>
      </View>

      <View style={sty.supportDetails}>
        <View style={sty.supportRow}>
          <Ionicons name="mail-outline" size={16} color={colors.textTertiary} />
          <Text style={[sty.supportRowLabel, { color: colors.textSecondary }]}>{t('help', 'email')}</Text>
          <Text style={[sty.supportRowValue, { color: colors.textPrimary }]}>{support.email}</Text>
        </View>
        <View style={sty.supportRow}>
          <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
          <Text style={[sty.supportRowLabel, { color: colors.textSecondary }]}>{t('help', 'hours')}</Text>
          <Text style={[sty.supportRowValue, { color: colors.textPrimary }]}>{support.hours}</Text>
        </View>
        <View style={sty.supportRow}>
          <Ionicons name="flash-outline" size={16} color={colors.textTertiary} />
          <Text style={[sty.supportRowLabel, { color: colors.textSecondary }]}>{t('help', 'responseTime')}</Text>
          <Text style={[sty.supportRowValue, { color: colors.textPrimary }]}>{support.responseTime}</Text>
        </View>
      </View>

      <View style={sty.supportActions}>
        <TouchableOpacity
          style={[sty.supportBtn, { backgroundColor: colors.primary }]}
          onPress={handleSendEmail}
          activeOpacity={0.7}
        >
          <Ionicons name="mail" size={16} color="#fff" />
          <Text style={sty.supportBtnText}>{t('help', 'sendEmail')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sty.supportBtnSecondary, { borderColor: colors.border }]}
          onPress={handleCopyEmail}
          activeOpacity={0.7}
        >
          <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
          <Text style={[sty.supportBtnSecondaryText, { color: colors.textSecondary }]}>{t('help', 'copyEmail')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HelpScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();

  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [selectedCategory, setSelectedCategory] = useState<FAQCategory | null>(null);
  const [selectedFAQ, setSelectedFAQ] = useState<FAQItem | null>(null);
  const [selectedTutorial, setSelectedTutorial] = useState<TutorialGuide | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FAQItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ─── Search ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      setIsSearching(true);
      const timer = setTimeout(() => {
        setSearchResults(helpService.searchFAQs(searchQuery.trim()));
        setIsSearching(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchQuery]);

  // ─── Pull to refresh ─────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Data is static, just simulate refresh
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // ─── Navigate to category ────────────────────────────────────────────
  const openCategory = useCallback((category: FAQCategory) => {
    setSelectedCategory(category);
    setViewMode('category');
  }, []);

  // ─── Open FAQ detail ─────────────────────────────────────────────────
  const openFAQ = useCallback((faq: FAQItem) => {
    setSelectedFAQ(faq);
    setViewMode('faq-detail');
  }, []);

  // ─── Open tutorial ───────────────────────────────────────────────────
  const openTutorial = useCallback((tutorial: TutorialGuide) => {
    setSelectedTutorial(tutorial);
    setViewMode('tutorial');
  }, []);

  // ─── Back to main ────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    setViewMode('main');
    setSelectedCategory(null);
    setSelectedFAQ(null);
    setSelectedTutorial(null);
    setSearchQuery('');
  }, []);

  // ─── Styles ──────────────────────────────────────────────────────────
  const s = useMemo(() => makeStyles(colors), [colors]);

  // ─── Render content based on view mode ───────────────────────────────
  const renderContent = () => {
    switch (viewMode) {
      case 'main':
        return renderMain();
      case 'category':
        return renderCategoryFAQs();
      case 'faq-detail':
        return renderFAQDetail();
      case 'tutorial':
        return renderTutorialDetail();
      default:
        return renderMain();
    }
  };

  // ─── Main View ───────────────────────────────────────────────────────
  const renderMain = () => (
    <>
      {/* Search bar */}
      <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textTertiary} />
        <TextInput
          style={[s.searchInput, { color: colors.textPrimary }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('help', 'search')}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search results */}
      {searchQuery.trim().length >= 2 ? (
        <View style={s.searchResultsSection}>
          {isSearching ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: spacing.xxl }} />
          ) : searchResults.length > 0 ? (
            <>
              <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
                {t('help', 'faqs')} ({searchResults.length})
              </Text>
              {searchResults.map((faq) => (
                <FAQAccordionItem key={faq.id} faq={faq} colors={colors} sty={s} />
              ))}
            </>
          ) : (
            <View style={s.emptySearch}>
              <View style={[s.emptySearchIcon, { backgroundColor: colors.primaryBg }]}>
                <Ionicons name="search-outline" size={32} color={colors.primary} />
              </View>
              <Text style={[s.emptySearchTitle, { color: colors.textPrimary }]}>
                {t('help', 'noResults')}
              </Text>
              <Text style={[s.emptySearchSub, { color: colors.textTertiary }]}>
                {t('help', 'noResultsSub', { query: searchQuery })}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <>
          {/* Categories */}
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
            {t('help', 'categories')}
          </Text>
          <View style={s.categoriesGrid}>
            {helpService.FAQ_CATEGORIES.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                color={cat.color}
                label={t('help', CATEGORY_LABEL_KEYS[cat.id] || cat.id)}
                onPress={() => openCategory(cat)}
                sty={s}
              />
            ))}
          </View>

          {/* Tutorials */}
          <Text style={[s.sectionTitle, { color: colors.textSecondary, marginTop: spacing.lg }]}>
            {t('help', 'tutorials')}
          </Text>
          {helpService.TUTORIALS.map((tut) => (
            <TutorialCard key={tut.id} tutorial={tut} colors={colors} sty={s} onPress={() => openTutorial(tut)} />
          ))}

          {/* Support */}
          <Text style={[s.sectionTitle, { color: colors.textSecondary, marginTop: spacing.lg }]}>
            {t('help', 'contact')}
          </Text>
          <SupportCard colors={colors} sty={s} />
        </>
      )}
    </>
  );

  // ─── Category FAQs View ──────────────────────────────────────────────
  const renderCategoryFAQs = () => {
    if (!selectedCategory) return null;
    const faqs = helpService.getFAQsByCategory(selectedCategory.id);
    return (
      <>
        <TouchableOpacity style={s.backRow} onPress={goBack}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={[s.backText, { color: colors.primary }]}>{t('help', 'backToHelp')}</Text>
        </TouchableOpacity>

        <View style={s.categoryHeaderCard}>
          <View style={[s.categoryHeaderIcon, { backgroundColor: selectedCategory.color + '15' }]}>
            <Ionicons name={selectedCategory.icon as any} size={28} color={selectedCategory.color} />
          </View>
          <Text style={[s.categoryHeaderTitle, { color: colors.textPrimary }]}>
            {t('help', CATEGORY_LABEL_KEYS[selectedCategory.id] || selectedCategory.id)}
          </Text>
          <Text style={[s.categoryHeaderCount, { color: colors.textTertiary }]}>
            {faqs.length} {t('help', 'faqs').toLowerCase()}
          </Text>
        </View>

        {faqs.map((faq) => (
          <FAQAccordionItem key={faq.id} faq={faq} colors={colors} sty={s} />
        ))}
      </>
    );
  };

  // ─── FAQ Detail View ─────────────────────────────────────────────────
  const renderFAQDetail = () => {
    if (!selectedFAQ) return null;
    return (
      <>
        <TouchableOpacity style={s.backRow} onPress={() => setViewMode('category')}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={[s.backText, { color: colors.primary }]}>
            {t('help', CATEGORY_LABEL_KEYS[selectedFAQ.category.id] || selectedFAQ.category.id)}
          </Text>
        </TouchableOpacity>

        <View style={[s.faqDetailCard, { backgroundColor: colors.surface }]}>
          <View style={[s.faqDetailDot, { backgroundColor: selectedFAQ.category.color }]} />
          <Text style={[s.faqDetailQuestion, { color: colors.textPrimary }]}>{selectedFAQ.question}</Text>
          <Text style={[s.faqDetailAnswer, { color: colors.textSecondary }]}>{selectedFAQ.answer}</Text>
        </View>

        {/* Still need help */}
        <View style={[s.stillNeedHelpCard, { backgroundColor: colors.surface }]}>
          <View style={[s.stillNeedHelpIcon, { backgroundColor: colors.warningBg }]}>
            <Ionicons name="help-buoy" size={24} color={colors.warning} />
          </View>
          <Text style={[s.stillNeedHelpTitle, { color: colors.textPrimary }]}>
            {t('help', 'stillNeedHelp')}
          </Text>
          <Text style={[s.stillNeedHelpSub, { color: colors.textTertiary }]}>
            {t('help', 'stillNeedHelpSub')}
          </Text>
          <TouchableOpacity
            style={[s.stillNeedHelpBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              const url = `mailto:${helpService.SUPPORT_CONTACT.email}`;
              Linking.canOpenURL(url).then((ok) => ok && Linking.openURL(url));
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="mail" size={16} color="#fff" />
            <Text style={s.stillNeedHelpBtnText}>{t('help', 'sendEmail')}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  // ─── Tutorial Detail View ────────────────────────────────────────────
  const renderTutorialDetail = () => {
    if (!selectedTutorial) return null;
    return (
      <>
        <TouchableOpacity style={s.backRow} onPress={goBack}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={[s.backText, { color: colors.primary }]}>{t('help', 'backToHelp')}</Text>
        </TouchableOpacity>

        <View style={[s.tutorialDetailCard, { backgroundColor: colors.surface }]}>
          <View style={s.tutorialDetailHeader}>
            <View style={[s.tutorialDetailIcon, { backgroundColor: selectedTutorial.color + '15' }]}>
              <Ionicons name={selectedTutorial.icon as any} size={28} color={selectedTutorial.color} />
            </View>
            <View style={s.tutorialDetailInfo}>
              <Text style={[s.tutorialDetailTitle, { color: colors.textPrimary }]}>
                {selectedTutorial.title}
              </Text>
              <Text style={[s.tutorialDetailDesc, { color: colors.textTertiary }]}>
                {selectedTutorial.description}
              </Text>
            </View>
          </View>

          <View style={s.tutorialStepsList}>
            {selectedTutorial.steps.map((step, idx) => (
              <View key={idx} style={s.tutorialStepItem}>
                <View style={[s.tutorialStepNumber, { backgroundColor: selectedTutorial.color }]}>
                  <Text style={s.tutorialStepNumberText}>{idx + 1}</Text>
                </View>
                <Text style={[s.tutorialStepText, { color: colors.textSecondary }]}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
      </>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <RNStatusBar barStyle={colors.textPrimary === '#0F172A' ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[s.headerBack, { backgroundColor: colors.background }]}
          onPress={viewMode === 'main' ? () => router.back() : goBack}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
            {viewMode === 'tutorial' && selectedTutorial ? selectedTutorial.title :
             viewMode === 'faq-detail' ? t('help', 'faqs') :
             viewMode === 'category' && selectedCategory ? t('help', CATEGORY_LABEL_KEYS[selectedCategory.id] || selectedCategory.id) :
             t('help', 'title')}
          </Text>
          {viewMode === 'main' && (
            <Text style={[s.headerSub, { color: colors.textSecondary }]}>{t('help', 'subtitle')}</Text>
          )}
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {renderContent()}
        <View style={{ height: 60 }} />
      </ScrollView>
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
    headerBack: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: { ...typography.h2 },
    headerSub: { ...typography.bodySmall, marginTop: 1 },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: 100,
    },

    // ─── Search ────────────────────────────────────────────────────────
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: 1,
      marginBottom: spacing.lg,
    },
    searchInput: {
      flex: 1,
      ...typography.body,
    },
    searchResultsSection: {
      marginBottom: spacing.lg,
    },

    // ─── Empty Search ──────────────────────────────────────────────────
    emptySearch: {
      alignItems: 'center',
      paddingVertical: spacing.xxxl,
    },
    emptySearchIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    emptySearchTitle: { ...typography.h3, textAlign: 'center' },
    emptySearchSub: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.sm },

    // ─── Section Title ─────────────────────────────────────────────────
    sectionTitle: {
      ...typography.label,
      textTransform: 'uppercase',
      marginBottom: spacing.md,
    },

    // ─── Categories Grid ───────────────────────────────────────────────
    categoriesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },

    // ─── FAQ Item ──────────────────────────────────────────────────────
    faqItem: {
      borderRadius: radius.md,
      marginBottom: spacing.sm,
      overflow: 'hidden',
    },
    faqHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      gap: spacing.sm,
    },
    faqHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      flex: 1,
    },
    faqCategoryDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 6,
    },
    faqQuestion: { ...typography.bodySmall, fontWeight: '500', flex: 1 },
    faqAnswerWrap: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      paddingLeft: spacing.md + spacing.sm + 8,
    },
    faqAnswer: { ...typography.bodySmall, lineHeight: 20 },

    // ─── FAQ Detail ────────────────────────────────────────────────────
    faqDetailCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
      ...shadows.sm,
      marginBottom: spacing.lg,
    },
    faqDetailDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginBottom: spacing.sm,
    },
    faqDetailQuestion: { ...typography.h3, marginBottom: spacing.md },
    faqDetailAnswer: { ...typography.body, lineHeight: 22 },

    // ─── Still need help ───────────────────────────────────────────────
    stillNeedHelpCard: {
      borderRadius: radius.lg,
      padding: spacing.xl,
      alignItems: 'center',
      ...shadows.sm,
      marginBottom: spacing.lg,
    },
    stillNeedHelpIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    stillNeedHelpTitle: { ...typography.h3, textAlign: 'center' },
    stillNeedHelpSub: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg },
    stillNeedHelpBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    stillNeedHelpBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    // ─── Tutorial Card ─────────────────────────────────────────────────
    tutorialCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderLeftWidth: 4,
      ...shadows.sm,
      marginBottom: spacing.sm,
    },
    tutorialHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    tutorialIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tutorialInfo: { flex: 1 },
    tutorialTitle: { ...typography.bodySmall, fontWeight: '600' },
    tutorialDesc: { ...typography.caption, marginTop: 2 },
    tutorialFooter: {
      flexDirection: 'row',
      marginTop: spacing.sm,
    },
    tutorialStepsBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    tutorialStepsText: { fontSize: 10, fontWeight: '600' },

    // ─── Tutorial Detail ───────────────────────────────────────────────
    tutorialDetailCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
      marginBottom: spacing.lg,
    },
    tutorialDetailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    tutorialDetailIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tutorialDetailInfo: { flex: 1 },
    tutorialDetailTitle: { ...typography.h3 },
    tutorialDetailDesc: { ...typography.bodySmall, marginTop: 2 },
    tutorialStepsList: {
      gap: spacing.md,
    },
    tutorialStepItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    tutorialStepNumber: {
      width: 24,
      height: 24,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 1,
    },
    tutorialStepNumberText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    tutorialStepText: {
      ...typography.bodySmall,
      flex: 1,
      lineHeight: 20,
    },

    // ─── Category Card ─────────────────────────────────────────────────
    categoryCard: {
      width: '30.5%',
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
      gap: 8,
      ...shadows.sm,
    },
    categoryIcon: {
      width: 44,
      height: 44,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    categoryLabel: {
      fontSize: 11,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 15,
    },

    // ─── Back Row ──────────────────────────────────────────────────────
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    backText: { ...typography.bodySmall, fontWeight: '600' },

    // ─── Category Header ───────────────────────────────────────────────
    categoryHeaderCard: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    categoryHeaderIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    categoryHeaderTitle: { ...typography.h3 },
    categoryHeaderCount: { ...typography.caption, marginTop: spacing.xs },

    // ─── Support Card ──────────────────────────────────────────────────
    supportCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
      marginBottom: spacing.lg,
    },
    supportHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    supportIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    supportInfo: { flex: 1 },
    supportTitle: { ...typography.bodySmall, fontWeight: '600' },
    supportSub: { ...typography.caption, marginTop: 2 },
    supportDetails: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    supportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    supportRowLabel: { ...typography.caption, width: 80 },
    supportRowValue: { ...typography.bodySmall, fontWeight: '500', flex: 1 },
    supportActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    supportBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    supportBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    supportBtnSecondary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    supportBtnSecondaryText: { fontWeight: '600', fontSize: 13 },
  });


