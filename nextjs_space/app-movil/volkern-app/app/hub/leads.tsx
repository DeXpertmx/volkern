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
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  leadsService,
  LEAD_STATUSES,
  LEAD_SOURCES,
  getStatusColor,
  type Lead,
  type LeadStatus,
  type LeadSource,
} from '../../src/services/leads';

// ─── Score Display ───────────────────────────────────────────────────────────
function ScoreDots({ score, color }: { score: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i <= score ? color : '#E5E7EB',
          }}
        />
      ))}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LeadsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'score' | 'name'>('recent');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ total: number; new: number; won: number; conversionRate: number } | null>(null);

  // Form state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editSource, setEditSource] = useState<LeadSource>('other');
  const [editStatus, setEditStatus] = useState<LeadStatus>('new');
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editCurrency, setEditCurrency] = useState('MXN');
  const [editScore, setEditScore] = useState(5);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [allLeads, statsData] = await Promise.all([
        leadsService.getAll(),
        leadsService.getStats(),
      ]);
      setLeads(allLeads);
      setStats({ total: statsData.total, new: statsData.new, won: statsData.won, conversionRate: statsData.conversionRate });
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredLeads = useMemo(() => {
    let result = [...leads];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) || l.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (filterStatus !== 'all') result = result.filter((l) => l.status === filterStatus);
    result.sort((a, b) => {
      if (sortBy === 'score') return b.interestScore - a.interestScore;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.updatedAt - a.updatedAt;
    });
    return result;
  }, [leads, searchQuery, filterStatus, sortBy]);

  const openNewLead = () => {
    setEditingLead(null); setEditName(''); setEditEmail(''); setEditPhone('');
    setEditCompany(''); setEditSource('other'); setEditStatus('new');
    setEditNotes(''); setEditTags(''); setEditBudget(''); setEditCurrency('MXN');
    setEditScore(5); setModalVisible(true);
  };

  const openEditLead = (lead: Lead) => {
    setEditingLead(lead); setEditName(lead.name); setEditEmail(lead.email);
    setEditPhone(lead.phone); setEditCompany(lead.company); setEditSource(lead.source);
    setEditStatus(lead.status); setEditNotes(lead.notes); setEditTags(lead.tags.join(', '));
    setEditBudget(lead.budget > 0 ? lead.budget.toString() : '');
    setEditCurrency(lead.currency); setEditScore(lead.interestScore); setModalVisible(true);
  };

  const handleSave = async () => {
    if (!editName.trim()) { Alert.alert(t('common', 'error'), t('leads', 'nameRequired')); return; }
    setSaving(true);
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      const budget = parseFloat(editBudget) || 0;
      const leadData = {
        name: editName.trim(), email: editEmail.trim(), phone: editPhone.trim(),
        company: editCompany.trim(), source: editSource, notes: editNotes,
        tags, budget, currency: editCurrency, interestScore: editScore,
        status: editStatus,
      };
      if (editingLead) {
        await leadsService.update(editingLead.id, leadData);
      } else {
        await leadsService.create(leadData);
      }
      setModalVisible(false); loadData();
    } catch { Alert.alert(t('common', 'error'), t('leads', 'saveError')); }
    finally { setSaving(false); }
  };

  const handleDelete = (lead: Lead) => {
    Alert.alert(t('leads', 'deleteConfirm'), t('leads', 'deleteLeadConfirm', { name: lead.name }), [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => { await leadsService.delete(lead.id); loadData(); } },
    ]);
  };

  const handleStatusChange = async (lead: Lead, status: LeadStatus) => {
    try { await leadsService.updateStatus(lead.id, status); loadData(); }
    catch {}
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
            <Text style={[s.headerTitleText, { color: colors.textPrimary }]}>{t('leads', 'title')}</Text>
            {stats && (
              <Text style={[s.headerSub, { color: colors.textTertiary }]}>
                {t('leads', 'totalLeads', { n: stats.total })} · {t('leads', 'conversionRate')}: {stats.conversionRate}%
              </Text>
            )}
          </View>
        </View>

        {/* Search */}
        <View style={[s.searchBar, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput style={[s.searchInput, { color: colors.textPrimary }]}
            placeholder={t('leads', 'searchPlaceholder')} placeholderTextColor={colors.textTertiary}
            value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery ? <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={18} color={colors.textTertiary} /></TouchableOpacity> : null}
        </View>

        {/* Status tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statusScroll}>
          <TouchableOpacity
            style={[s.statusTab, filterStatus === 'all' && { backgroundColor: colors.primaryBg, borderColor: colors.primary + '30' }]}
            onPress={() => setFilterStatus('all')}>
            <Text style={[s.statusTabText, { color: filterStatus === 'all' ? colors.primary : colors.textTertiary }]}>{t('leads', 'filterAll')}</Text>
          </TouchableOpacity>
          {LEAD_STATUSES.map((st) => (
            <TouchableOpacity
              key={st.value}
              style={[s.statusTab, filterStatus === st.value && { backgroundColor: st.color + '15', borderColor: st.color + '30' }]}
              onPress={() => setFilterStatus(st.value as LeadStatus)}>
              <View style={[s.statusDot, { backgroundColor: st.color }]} />
              <Text style={[s.statusTabText, { color: filterStatus === st.value ? st.color : colors.textTertiary }]}>
                {t('leads', `status${st.value.charAt(0).toUpperCase() + st.value.slice(1)}` as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ─── Content ──────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : filteredLeads.length === 0 ? (
        <View style={s.center}>
          <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
            <Ionicons name="people-outline" size={48} color={colors.primary + '60'} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
            {searchQuery ? t('leads', 'noSearchResults') : t('leads', 'noLeads')}
          </Text>
          <Text style={[s.emptySub, { color: colors.textTertiary }]}>{t('leads', 'noLeadsSub')}</Text>
          <TouchableOpacity style={[s.emptyCta, { backgroundColor: colors.primary }]} onPress={openNewLead}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.emptyCtaText}>{t('leads', 'newLead')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}>
          {filteredLeads.map((lead) => {
            const statusColor = getStatusColor(lead.status);
            const sourceInfo = LEAD_SOURCES.find((s) => s.value === lead.source);
            return (
              <TouchableOpacity
                key={lead.id}
                style={[s.leadCard, { backgroundColor: colors.surface, borderLeftColor: statusColor, borderLeftWidth: 3 }]}
                onPress={() => openEditLead(lead)}
                onLongPress={() => handleDelete(lead)}
                activeOpacity={0.7}>
                <View style={s.leadCardTop}>
                  <View style={[s.avatarSmall, { backgroundColor: statusColor + '20' }]}>
                    <Text style={[s.avatarText, { color: statusColor }]}>
                      {lead.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                  <View style={s.leadCardText}>
                    <Text style={[s.leadCardName, { color: colors.textPrimary }]} numberOfLines={1}>{lead.name}</Text>
                    <Text style={[s.leadCardCompany, { color: colors.textSecondary }]} numberOfLines={1}>{lead.company || lead.email}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: statusColor + '15' }]}>
                    <Text style={[s.statusBadgeText, { color: statusColor }]}>
                      {t('leads', `status${lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}` as any)}
                    </Text>
                  </View>
                </View>
                <View style={s.leadCardMeta}>
                  <View style={s.leadCardMetaLeft}>
                    {sourceInfo && (
                      <Ionicons name={sourceInfo.icon as any} size={12} color={colors.textTertiary} />
                    )}
                    <Text style={[s.leadCardMetaText, { color: colors.textTertiary }]}>
                      {t('leads', `source${lead.source.charAt(0).toUpperCase() + lead.source.slice(1)}` as any)}
                    </Text>
                    {lead.lastContactedAt && (
                      <Text style={[s.leadCardMetaText, { color: colors.textTertiary }]}>
                        · {new Date(lead.lastContactedAt).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  <ScoreDots score={lead.interestScore} color={statusColor} />
                </View>
                {lead.tags.length > 0 && (
                  <View style={s.tagsRow}>
                    {lead.tags.slice(0, 3).map((tag, i) => (
                      <View key={i} style={[s.tagChip, { backgroundColor: colors.primaryBg }]}>
                        <Text style={[s.tagChipText, { color: colors.primary }]}>{tag}</Text>
                      </View>
                    ))}
                    {lead.tags.length > 3 && (
                      <Text style={[s.tagChipText, { color: colors.textTertiary }]}>+{lead.tags.length - 3}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ─── FAB ──────────────────────────────────────────────────────── */}
      {!loading && (
        <TouchableOpacity style={[s.fab, { backgroundColor: colors.primary }]} onPress={openNewLead} activeOpacity={0.8}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ─── Lead Editor Modal ─────────────────────────────────────────── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={[s.modalCancelBtn, { color: colors.textTertiary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                {editingLead ? t('leads', 'editLead') : t('leads', 'newLead')}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[s.modalSaveBtn, { color: colors.primary }]}>{t('common', 'save')}</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
              <TextInput style={[s.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('leads', 'namePlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editName} onChangeText={setEditName} />
              <View style={s.fieldRow}>
                <TextInput style={[s.fieldInput, { flex: 1, color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                  placeholder={t('leads', 'emailPlaceholder')} placeholderTextColor={colors.textTertiary}
                  value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" />
                <TextInput style={[s.fieldInput, { flex: 1, color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                  placeholder={t('leads', 'phonePlaceholder')} placeholderTextColor={colors.textTertiary}
                  value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
              </View>
              <TextInput style={[s.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('leads', 'companyPlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editCompany} onChangeText={setEditCompany} />

              {/* Source */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('leads', 'source')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
                {LEAD_SOURCES.map((src) => (
                  <TouchableOpacity key={src.value}
                    style={[s.chip, editSource === src.value && { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}
                    onPress={() => setEditSource(src.value as LeadSource)}>
                    <Ionicons name={src.icon as any} size={14} color={editSource === src.value ? colors.primary : colors.textTertiary} />
                    <Text style={[s.chipText, { color: editSource === src.value ? colors.primary : colors.textTertiary }]}>
                      {t('leads', `source${src.value.charAt(0).toUpperCase() + src.value.slice(1)}` as any)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Status */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('leads', 'status')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
                {LEAD_STATUSES.map((st) => (
                  <TouchableOpacity key={st.value}
                    style={[s.chip, editStatus === st.value && { backgroundColor: st.color + '15', borderColor: st.color }]}
                    onPress={() => setEditStatus(st.value as LeadStatus)}>
                    <View style={[s.chipDot, { backgroundColor: st.color }]} />
                    <Text style={[s.chipText, { color: editStatus === st.value ? st.color : colors.textTertiary }]}>
                      {t('leads', `status${st.value.charAt(0).toUpperCase() + st.value.slice(1)}` as any)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Interest Score */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('leads', 'interestScore')}: {editScore}/10</Text>
              <View style={s.scoreRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                  <TouchableOpacity key={i} onPress={() => setEditScore(i)}
                    style={[s.scoreDot, { backgroundColor: i <= editScore ? getStatusColor(editStatus) : colors.borderLight }]}>
                    {i <= editScore && <Ionicons name="star" size={12} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Budget */}
              <View style={s.fieldRow}>
                <TextInput style={[s.fieldInput, { flex: 1, color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                  placeholder={t('leads', 'budget')} placeholderTextColor={colors.textTertiary}
                  value={editBudget} onChangeText={setEditBudget} keyboardType="decimal-pad" />
                <TextInput style={[s.fieldInput, { width: 72, color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight, textAlign: 'center' }]}
                  value={editCurrency} onChangeText={setEditCurrency} maxLength={3} />
              </View>

              {/* Notes */}
              <TextInput style={[s.notesInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('leads', 'notesPlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editNotes} onChangeText={setEditNotes} multiline textAlignVertical="top" />

              {/* Tags */}
              <TextInput style={[s.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('leads', 'tagPlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editTags} onChangeText={setEditTags} />
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1 },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.screenPadding, gap: spacing.sm },
  headerBtn: { width: 40, height: 40, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1 },
  headerTitleText: { ...typography.h3 },
  headerSub: { ...typography.caption, marginTop: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.screenPadding, marginTop: spacing.md, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.full, borderWidth: 1, gap: spacing.xs },
  searchInput: { flex: 1, ...typography.bodySmall, paddingVertical: 0 },
  statusScroll: { paddingHorizontal: layout.screenPadding, paddingVertical: spacing.md, gap: spacing.sm },
  statusTab: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderLight },
  statusTabText: { ...typography.caption, fontWeight: '500' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: layout.screenPadding * 2 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyTitle: { ...typography.h3, textAlign: 'center', marginBottom: spacing.sm },
  emptySub: { ...typography.bodySmall, textAlign: 'center', lineHeight: 20 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full },
  emptyCtaText: { ...typography.bodySmall, fontWeight: '600', color: '#fff' },
  listContent: { padding: layout.screenPadding, paddingBottom: 120 },
  leadCard: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  leadCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarSmall: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700' },
  leadCardText: { flex: 1 },
  leadCardName: { ...typography.bodySmall, fontWeight: '600' },
  leadCardCompany: { ...typography.caption, marginTop: 1 },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  statusBadgeText: { fontSize: 10, fontWeight: '600' },
  leadCardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginLeft: 44 },
  leadCardMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leadCardMetaText: { ...typography.caption, fontSize: 10 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm, marginLeft: 44 },
  tagChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  tagChipText: { fontSize: 10, fontWeight: '500' },
  fab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 100 : 80, right: layout.screenPadding, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', ...shadows.lg },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: layout.screenPadding, paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalCancelBtn: { ...typography.body, fontWeight: '500' },
  modalSaveBtn: { ...typography.body, fontWeight: '700' },
  modalTitle: { ...typography.h3 },
  modalBody: { flex: 1 },
  fieldInput: { ...typography.bodySmall, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  fieldLabel: { ...typography.caption, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.sm },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  chipsRow: { gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderLight },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { ...typography.caption, fontWeight: '500' },
  scoreRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  scoreDot: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  notesInput: { ...typography.bodySmall, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, minHeight: 80, marginBottom: spacing.md },
});
