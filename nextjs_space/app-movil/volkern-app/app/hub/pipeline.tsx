import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  pipelineService,
  DEAL_STAGES,
  DEAL_PRIORITIES,
  STAGE_TRANSITIONS,
  getStageColor,
  type Deal,
  type DealStage,
  type DealPriority,
} from '../../src/services/pipeline';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STAGE_CARD_WIDTH = SCREEN_WIDTH * 0.72;

// ─── Format Currency ──────────────────────────────────────────────────────────
function formatCurrency(amount: number, currency: string, locale: string = 'es-MX'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString()}`;
  }
}

// ─── Deal Card ────────────────────────────────────────────────────────────────
function DealCard({
  deal,
  onPress,
  colors,
  s,
}: {
  deal: Deal;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
  s: ReturnType<typeof makeStyles>;
}) {
  const stageColor = getStageColor(deal.stage);
  const priorityColor = DEAL_PRIORITIES.find((p) => p.value === deal.priority)?.color || '#94A3B8';

  return (
    <TouchableOpacity
      style={[s.dealCard, { backgroundColor: colors.surface, borderLeftColor: stageColor, borderLeftWidth: 3 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.dealCardTop}>
        <View style={[s.priorityDot, { backgroundColor: priorityColor }]} />
        <Text style={[s.dealCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {deal.title}
        </Text>
      </View>
      <Text style={[s.dealCardCompany, { color: colors.textSecondary }]} numberOfLines={1}>
        {deal.company}
      </Text>
      <View style={s.dealCardBottom}>
        <Text style={[s.dealCardAmount, { color: colors.textPrimary, fontWeight: '700' }]}>
          {formatCurrency(deal.amount, deal.currency)}
        </Text>
        <View style={[s.probabilityBadge, { backgroundColor: getStageColor(deal.stage) + '15' }]}>
          <Text style={[s.probabilityText, { color: getStageColor(deal.stage) }]}>{deal.probability}%</Text>
        </View>
      </View>
      {deal.contactName ? (
        <Text style={[s.dealCardContact, { color: colors.textTertiary }]} numberOfLines={1}>
          <Ionicons name="person-outline" size={10} color={colors.textTertiary} /> {deal.contactName}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function PipelineScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [filterStage, setFilterStage] = useState<DealStage | 'all'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'amount' | 'probability'>('recent');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [editTitle, setEditTitle] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editContactName, setEditContactName] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('MXN');
  const [editStage, setEditStage] = useState<DealStage>('lead');
  const [editPriority, setEditPriority] = useState<DealPriority>('medium');
  const [editExpectedClose, setEditExpectedClose] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState('');

  const [stats, setStats] = useState<{
    total: number;
    totalAmount: number;
    wonAmount: number;
    weightedAmount: number;
  } | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [allDeals, statsData] = await Promise.all([
        pipelineService.getAll(),
        pipelineService.getStats(),
      ]);
      setDeals(allDeals);
      setStats({
        total: statsData.total,
        totalAmount: statsData.totalAmount,
        wonAmount: statsData.wonAmount,
        weightedAmount: statsData.weightedAmount,
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtered deals
  const filteredDeals = useMemo(() => {
    let result = [...deals];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.company.toLowerCase().includes(q) ||
          d.contactName.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (filterStage !== 'all') {
      result = result.filter((d) => d.stage === filterStage);
    }

    result.sort((a, b) => {
      if (sortBy === 'amount') return b.amount - a.amount;
      if (sortBy === 'probability') return b.probability - a.probability;
      return b.updatedAt - a.updatedAt;
    });

    return result;
  }, [deals, searchQuery, filterStage, sortBy]);

  // Deals grouped by stage for Kanban view
  const stageDeals = useMemo(() => {
    const grouped: Record<DealStage, Deal[]> = {} as any;
    for (const stage of DEAL_STAGES.map((s) => s.value)) {
      grouped[stage] = filteredDeals.filter((d) => d.stage === stage);
    }
    return grouped;
  }, [filteredDeals]);

  const openNewDeal = () => {
    setEditingDeal(null);
    setEditTitle('');
    setEditCompany('');
    setEditContactName('');
    setEditContactEmail('');
    setEditContactPhone('');
    setEditAmount('');
    setEditCurrency('MXN');
    setEditStage('lead');
    setEditPriority('medium');
    setEditExpectedClose('');
    setEditNotes('');
    setEditTags('');
    setModalVisible(true);
  };

  const openEditDeal = (deal: Deal) => {
    setEditingDeal(deal);
    setEditTitle(deal.title);
    setEditCompany(deal.company);
    setEditContactName(deal.contactName);
    setEditContactEmail(deal.contactEmail);
    setEditContactPhone(deal.contactPhone);
    setEditAmount(deal.amount > 0 ? deal.amount.toString() : '');
    setEditCurrency(deal.currency);
    setEditStage(deal.stage);
    setEditPriority(deal.priority);
    setEditExpectedClose(deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toISOString().split('T')[0] : '');
    setEditNotes(deal.notes);
    setEditTags(deal.tags.join(', '));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!editTitle.trim()) { Alert.alert(t('common', 'error'), t('pipeline', 'titleRequired')); return; }
    if (!editCompany.trim()) { Alert.alert(t('common', 'error'), t('pipeline', 'companyRequired')); return; }
    setSaving(true);
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      const amount = parseFloat(editAmount) || 0;
      const expectedClose = editExpectedClose ? new Date(editExpectedClose).getTime() : null;

      if (editingDeal) {
        await pipelineService.update(editingDeal.id, {
          title: editTitle.trim(),
          company: editCompany.trim(),
          contactName: editContactName.trim(),
          contactEmail: editContactEmail.trim(),
          contactPhone: editContactPhone.trim(),
          amount,
          currency: editCurrency,
          stage: editStage,
          priority: editPriority,
          expectedCloseDate: expectedClose,
          notes: editNotes,
          tags,
        });
      } else {
        await pipelineService.create({
          title: editTitle.trim(),
          company: editCompany.trim(),
          contactName: editContactName.trim(),
          contactEmail: editContactEmail.trim(),
          contactPhone: editContactPhone.trim(),
          amount,
          currency: editCurrency,
          stage: editStage,
          priority: editPriority,
          expectedCloseDate: expectedClose,
          notes: editNotes,
          tags,
        });
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('pipeline', 'saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (deal: Deal) => {
    Alert.alert(t('pipeline', 'deleteConfirm'), t('pipeline', 'deleteDealConfirm', { title: deal.title }), [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => { await pipelineService.delete(deal.id); loadData(); } },
    ]);
  };

  const handleMoveStage = async (deal: Deal, stage: DealStage) => {
    try {
      await pipelineService.updateStage(deal.id, stage);
      loadData();
    } catch {
      // ignore
    }
  };

  const dateLocale = locale === 'es-MX' ? 'es-MX' : 'en-US';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.headerTitle}>
            <Text style={[s.headerTitleText, { color: colors.textPrimary }]}>{t('pipeline', 'title')}</Text>
            {stats && (
              <Text style={[s.headerSub, { color: colors.textTertiary }]}>
                {t('pipeline', 'totalPipeline', { n: stats.total, amount: formatCurrency(stats.totalAmount, 'MXN') })}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')} style={s.headerBtn}>
            <Ionicons name={viewMode === 'kanban' ? 'list' : 'grid'} size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[s.searchBar, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={[s.searchInput, { color: colors.textPrimary }]}
            placeholder={t('pipeline', 'searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Stats bar */}
        {stats && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statsScroll}>
            <View style={[s.statCard, { backgroundColor: colors.primaryBg }]}>
              <Text style={[s.statValue, { color: colors.primary }]}>{formatCurrency(stats.totalAmount, 'MXN')}</Text>
              <Text style={[s.statLabel, { color: colors.primary }]}>{t('pipeline', 'totalDeals', { n: stats.total })}</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: colors.successBg }]}>
              <Text style={[s.statValue, { color: colors.success }]}>{formatCurrency(stats.wonAmount, 'MXN')}</Text>
              <Text style={[s.statLabel, { color: colors.success }]}>{t('pipeline', 'wonValue', { amount: '' }).replace(': ', '').trim()}</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: colors.warningBg }]}>
              <Text style={[s.statValue, { color: colors.warning }]}>{formatCurrency(stats.weightedAmount, 'MXN')}</Text>
              <Text style={[s.statLabel, { color: colors.warning }]}>{t('pipeline', 'expectedValue', { amount: '' }).replace(': ', '').trim()}</Text>
            </View>
          </ScrollView>
        )}

        {/* Stage tabs (list view) or header */}
        {viewMode === 'list' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stageScroll}>
            <TouchableOpacity
              style={[s.stageTab, filterStage === 'all' && { backgroundColor: colors.primaryBg, borderColor: colors.primary + '30' }]}
              onPress={() => setFilterStage('all')}
            >
              <Text style={[s.stageTabText, { color: filterStage === 'all' ? colors.primary : colors.textTertiary }]}>
                {t('pipeline', 'filterAll')}
              </Text>
            </TouchableOpacity>
            {DEAL_STAGES.map((stage) => (
              <TouchableOpacity
                key={stage.value}
                style={[s.stageTab, filterStage === stage.value && { backgroundColor: stage.color + '15', borderColor: stage.color + '30' }]}
                onPress={() => setFilterStage(stage.value)}
              >
                <View style={[s.stageDot, { backgroundColor: stage.color }]} />
                <Text style={[s.stageTabText, { color: filterStage === stage.value ? stage.color : colors.textTertiary }]}>
                  {t('pipeline', `stage${stage.value === 'closed_won' ? 'Won' : stage.value === 'closed_lost' ? 'Lost' : stage.value.charAt(0).toUpperCase() + stage.value.slice(1)}` as any)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ─── Content ──────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredDeals.length === 0 ? (
        <View style={s.center}>
          <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
            <Ionicons name="funnel-outline" size={48} color={colors.primary + '60'} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
            {searchQuery ? t('pipeline', 'noSearchResults') : t('pipeline', 'noDeals')}
          </Text>
          <Text style={[s.emptySub, { color: colors.textTertiary }]}>{t('pipeline', 'noDealsSub')}</Text>
          <TouchableOpacity style={[s.emptyCta, { backgroundColor: colors.primary }]} onPress={openNewDeal}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.emptyCtaText}>{t('pipeline', 'newDeal')}</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'kanban' ? (
        <ScrollView
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.kanbanScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        >
          {DEAL_STAGES.map((stage) => {
            const stageDealsList = stageDeals[stage.value] || [];
            const totalAmount = stageDealsList.reduce((sum, d) => sum + d.amount, 0);
            return (
              <View key={stage.value} style={[s.stageColumn, { backgroundColor: colors.background }]}>
                <View style={[s.stageColumnHeader, { borderBottomColor: stage.color + '30' }]}>
                  <View style={s.stageColTitle}>
                    <View style={[s.stageDot, { backgroundColor: stage.color }]} />
                    <Text style={[s.stageColText, { color: colors.textPrimary }]}>
                      {t('pipeline', `stage${stage.value === 'closed_won' ? 'Won' : stage.value === 'closed_lost' ? 'Lost' : stage.value.charAt(0).toUpperCase() + stage.value.slice(1)}` as any)}
                    </Text>
                    <View style={[s.stageCount, { backgroundColor: stage.color + '15' }]}>
                      <Text style={[s.stageCountText, { color: stage.color }]}>{stageDealsList.length}</Text>
                    </View>
                  </View>
                  {totalAmount > 0 && (
                    <Text style={[s.stageColAmount, { color: colors.textTertiary }]}>{formatCurrency(totalAmount, 'MXN')}</Text>
                  )}
                </View>
                <ScrollView
                  style={s.stageDealsList}
                  contentContainerStyle={s.stageDealsContent}
                  showsVerticalScrollIndicator={false}
                >
                  {stageDealsList.length === 0 ? (
                    <View style={s.stageEmpty}>
                      <Text style={[s.stageEmptyText, { color: colors.textTertiary }]}>{t('pipeline', 'noStageDeals')}</Text>
                    </View>
                  ) : (
                    stageDealsList.map((deal) => (
                      <View key={deal.id}>
                        <DealCard deal={deal} colors={colors} s={s} onPress={() => openEditDeal(deal)} />
                        {/* Quick stage move buttons */}
                        {STAGE_TRANSITIONS[deal.stage]?.length > 0 && (
                          <View style={s.stageMoves}>
                            {STAGE_TRANSITIONS[deal.stage].map((nextStage) => {
                              const ns = DEAL_STAGES.find((s) => s.value === nextStage)!;
                              return (
                                <TouchableOpacity
                                  key={nextStage}
                                  style={[s.stageMoveBtn, { backgroundColor: ns.color + '10', borderColor: ns.color + '20' }]}
                                  onPress={() => handleMoveStage(deal, nextStage)}
                                >
                                  <Ionicons name={ns.icon as any} size={10} color={ns.color} />
                                  <Text style={[s.stageMoveText, { color: ns.color }]}>
                                    {t('pipeline', 'moveTo')} {t('pipeline', `stage${nextStage === 'closed_won' ? 'Won' : nextStage === 'closed_lost' ? 'Lost' : nextStage.charAt(0).toUpperCase() + nextStage.slice(1)}` as any)}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        // List view
        <ScrollView
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        >
          {filteredDeals.map((deal) => {
            const stageColor = getStageColor(deal.stage);
            const priorityColor = DEAL_PRIORITIES.find((p) => p.value === deal.priority)?.color || '#94A3B8';
            return (
              <TouchableOpacity
                key={deal.id}
                style={[s.listDealCard, { backgroundColor: colors.surface, borderLeftColor: stageColor, borderLeftWidth: 3 }]}
                onPress={() => openEditDeal(deal)}
                onLongPress={() => handleDelete(deal)}
                activeOpacity={0.7}
              >
                <View style={s.listDealTop}>
                  <View style={[s.priorityDot, { backgroundColor: priorityColor }]} />
                  <View style={s.listDealText}>
                    <Text style={[s.listDealTitle, { color: colors.textPrimary }]} numberOfLines={1}>{deal.title}</Text>
                    <Text style={[s.listDealCompany, { color: colors.textSecondary }]} numberOfLines={1}>{deal.company}</Text>
                  </View>
                  <View style={[s.stageBadge, { backgroundColor: stageColor + '15' }]}>
                    <Text style={[s.stageBadgeText, { color: stageColor }]}>
                      {t('pipeline', `stage${deal.stage === 'closed_won' ? 'Won' : deal.stage === 'closed_lost' ? 'Lost' : deal.stage.charAt(0).toUpperCase() + deal.stage.slice(1)}` as any)}
                    </Text>
                  </View>
                </View>
                <View style={s.listDealBottom}>
                  <Text style={[s.listDealAmount, { color: colors.textPrimary }]}>{formatCurrency(deal.amount, deal.currency)}</Text>
                  <Text style={[s.listDealProb, { color: getStageColor(deal.stage) }]}>{deal.probability}%</Text>
                  {deal.expectedCloseDate && (
                    <Text style={[s.listDealDate, { color: colors.textTertiary }]}>
                      {new Date(deal.expectedCloseDate).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ─── FAB ──────────────────────────────────────────────────────── */}
      {!loading && (
        <TouchableOpacity style={[s.fab, { backgroundColor: colors.primary }]} onPress={openNewDeal} activeOpacity={0.8}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ─── Deal Editor Modal ─────────────────────────────────────────── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={[s.modalCancelBtn, { color: colors.textTertiary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                {editingDeal ? t('pipeline', 'editDeal') : t('pipeline', 'newDeal')}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[s.modalSaveBtn, { color: colors.primary }]}>{t('common', 'save')}</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
              <TextInput style={[s.modalInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('pipeline', 'titlePlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editTitle} onChangeText={setEditTitle} />
              <TextInput style={[s.modalInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('pipeline', 'companyPlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editCompany} onChangeText={setEditCompany} />

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('pipeline', 'stage')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fieldChips}>
                {DEAL_STAGES.map((stage) => (
                  <TouchableOpacity
                    key={stage.value}
                    style={[s.fieldChip, editStage === stage.value && { backgroundColor: stage.color + '15', borderColor: stage.color }]}
                    onPress={() => setEditStage(stage.value)}
                  >
                    <View style={[s.chipDot, { backgroundColor: stage.color }]} />
                    <Text style={[s.fieldChipText, { color: editStage === stage.value ? stage.color : colors.textTertiary }]}>
                      {t('pipeline', `stage${stage.value === 'closed_won' ? 'Won' : stage.value === 'closed_lost' ? 'Lost' : stage.value.charAt(0).toUpperCase() + stage.value.slice(1)}` as any)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('pipeline', 'priority')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fieldChips}>
                {DEAL_PRIORITIES.map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[s.fieldChip, editPriority === p.value && { backgroundColor: p.color + '15', borderColor: p.color }]}
                    onPress={() => setEditPriority(p.value)}
                  >
                    <View style={[s.chipDot, { backgroundColor: p.color }]} />
                    <Text style={[s.fieldChipText, { color: editPriority === p.value ? p.color : colors.textTertiary }]}>
                      {t('pipeline', `priority${p.value.charAt(0).toUpperCase() + p.value.slice(1)}` as any)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('pipeline', 'amount')}</Text>
              <View style={s.amountRow}>
                <TextInput style={[s.amountInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                  placeholder={t('pipeline', 'amountPlaceholder')} placeholderTextColor={colors.textTertiary}
                  value={editAmount} onChangeText={setEditAmount} keyboardType="decimal-pad" />
                <TextInput style={[s.currencyInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                  value={editCurrency} onChangeText={setEditCurrency} maxLength={3} />
              </View>

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('pipeline', 'contactName')}</Text>
              <TextInput style={[s.modalInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('pipeline', 'contactName')} placeholderTextColor={colors.textTertiary}
                value={editContactName} onChangeText={setEditContactName} />

              <View style={s.contactRow}>
                <View style={{ flex: 1 }}>
                  <TextInput style={[s.modalInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                    placeholder={t('pipeline', 'contactEmail')} placeholderTextColor={colors.textTertiary}
                    value={editContactEmail} onChangeText={setEditContactEmail} keyboardType="email-address" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput style={[s.modalInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                    placeholder={t('pipeline', 'contactPhone')} placeholderTextColor={colors.textTertiary}
                    value={editContactPhone} onChangeText={setEditContactPhone} keyboardType="phone-pad" />
                </View>
              </View>

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('pipeline', 'expectedClose')}</Text>
              <TextInput style={[s.modalInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary}
                value={editExpectedClose} onChangeText={setEditExpectedClose} />

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('pipeline', 'notes')}</Text>
              <TextInput style={[s.notesInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('pipeline', 'notesPlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editNotes} onChangeText={setEditNotes} multiline textAlignVertical="top" />

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('pipeline', 'tags')}</Text>
              <TextInput style={[s.modalInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('pipeline', 'tagPlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editTags} onChangeText={setEditTags} />

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles Factory ──────────────────────────────────────────────────────────
const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
  },
  headerBtn: { width: 40, height: 40, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1 },
  headerTitleText: { ...typography.h3 },
  headerSub: { ...typography.caption, marginTop: 1 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.screenPadding,
    marginTop: spacing.md, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.full, borderWidth: 1, gap: spacing.xs,
  },
  searchInput: { flex: 1, ...typography.bodySmall, paddingVertical: 0 },
  statsScroll: { paddingHorizontal: layout.screenPadding, paddingVertical: spacing.md, gap: spacing.sm },
  statCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: radius.md, minWidth: 120 },
  statValue: { ...typography.bodySmall, fontWeight: '700' },
  statLabel: { ...typography.caption, fontSize: 10, marginTop: 1 },
  stageScroll: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.sm, gap: spacing.sm },
  stageTab: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderLight,
  },
  stageTabText: { ...typography.caption, fontWeight: '500' },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: layout.screenPadding * 2 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyTitle: { ...typography.h3, textAlign: 'center', marginBottom: spacing.sm },
  emptySub: { ...typography.bodySmall, textAlign: 'center', lineHeight: 20 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full },
  emptyCtaText: { ...typography.bodySmall, fontWeight: '600', color: '#fff' },

  // Kanban view
  kanbanScroll: { padding: layout.screenPadding, gap: spacing.md },
  stageColumn: {
    width: STAGE_CARD_WIDTH,
    borderRadius: radius.lg,
    marginRight: spacing.md,
  },
  stageColumnHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: spacing.md, marginBottom: spacing.sm, borderBottomWidth: 2,
  },
  stageColTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stageColText: { ...typography.bodySmall, fontWeight: '700' },
  stageCount: { minWidth: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  stageCountText: { fontSize: 11, fontWeight: '700' },
  stageColAmount: { ...typography.caption, fontWeight: '600' },
  stageDealsList: { flex: 1 },
  stageDealsContent: { paddingBottom: 20 },
  stageEmpty: { padding: spacing.xl, alignItems: 'center' },
  stageEmptyText: { ...typography.caption, textAlign: 'center' },
  stageMoves: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  stageMoveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1,
  },
  stageMoveText: { fontSize: 10, fontWeight: '500' },

  // Deal card
  dealCard: {
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.xs, ...shadows.sm,
  },
  dealCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  dealCardTitle: { ...typography.bodySmall, fontWeight: '600', flex: 1 },
  dealCardCompany: { ...typography.caption, marginLeft: 20 },
  dealCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 20 },
  dealCardAmount: { ...typography.bodySmall },
  probabilityBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  probabilityText: { fontSize: 11, fontWeight: '700' },
  dealCardContact: { ...typography.caption, fontSize: 10, marginLeft: 20 },

  // List view
  listContent: { padding: layout.screenPadding, paddingBottom: 120 },
  listDealCard: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  listDealTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listDealText: { flex: 1 },
  listDealTitle: { ...typography.bodySmall, fontWeight: '600' },
  listDealCompany: { ...typography.caption, marginTop: 1 },
  stageBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  stageBadgeText: { fontSize: 10, fontWeight: '600' },
  listDealBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs, marginLeft: 20 },
  listDealAmount: { ...typography.bodySmall, fontWeight: '700' },
  listDealProb: { ...typography.caption, fontWeight: '600' },
  listDealDate: { ...typography.caption, fontSize: 11 },

  // FAB
  fab: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 100 : 80, right: layout.screenPadding,
    width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', ...shadows.lg,
  },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: layout.screenPadding, paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalCancelBtn: { ...typography.body, fontWeight: '500' },
  modalSaveBtn: { ...typography.body, fontWeight: '700' },
  modalTitle: { ...typography.h3 },
  modalBody: { flex: 1 },
  modalInput: { ...typography.bodySmall, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  fieldLabel: { ...typography.caption, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.sm },
  fieldChips: { gap: spacing.sm, paddingBottom: spacing.sm },
  fieldChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderLight,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  fieldChipText: { ...typography.caption, fontWeight: '500' },
  amountRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  amountInput: { flex: 1, ...typography.bodySmall, borderRadius: radius.md, padding: spacing.md, borderWidth: 1 },
  currencyInput: { width: 72, ...typography.bodySmall, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, textAlign: 'center' },
  contactRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  notesInput: { ...typography.bodySmall, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, minHeight: 80, marginBottom: spacing.md },
});
