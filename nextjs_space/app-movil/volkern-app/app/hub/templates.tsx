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
  templatesService,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CHANNELS,
  type Template,
  type TemplateCategory,
  type TemplateChannel,
  type TemplateStatus,
  type TemplateVariable,
} from '../../src/services/templates';

// ─── Category Icon ────────────────────────────────────────────────────────────
function getCatInfo(cat: TemplateCategory) {
  return TEMPLATE_CATEGORIES.find((c) => c.value === cat)!;
}

function getChannelInfo(ch: TemplateChannel) {
  return TEMPLATE_CHANNELS.find((c) => c.value === ch)!;
}

// ─── Template Card ────────────────────────────────────────────────────────────
function TemplateCard({
  tmpl,
  onPress,
  colors,
  s,
  t,
}: {
  tmpl: Template;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
  s: ReturnType<typeof makeStyles>;
  t: (domain: string, key: string, params?: any) => string;
}) {
  const cat = getCatInfo(tmpl.category);
  const ch = getChannelInfo(tmpl.channel);

  return (
    <TouchableOpacity
      style={[s.templateCard, { backgroundColor: colors.surface, borderLeftColor: cat.color, borderLeftWidth: 3 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.tmplTop}>
        <View style={[s.tmplIcon, { backgroundColor: cat.color + '15' }]}>
          <Ionicons name={cat.icon as any} size={18} color={cat.color} />
        </View>
        <View style={s.tmplText}>
          <View style={s.tmplTitleRow}>
            <Text style={[s.tmplTitle, { color: colors.textPrimary }]} numberOfLines={1}>{tmpl.title}</Text>
            {tmpl.isBuiltIn && (
              <View style={[s.badgeBuiltIn, { backgroundColor: colors.primaryBg }]}>
                <Text style={[s.badgeBuiltInText, { color: colors.primary }]}>{t('templates', 'builtIn')}</Text>
              </View>
            )}
          </View>
          <Text style={[s.tmplDesc, { color: colors.textSecondary }]} numberOfLines={1}>{tmpl.description}</Text>
        </View>
        <View style={[s.tmplStatus, { backgroundColor: tmpl.status === 'active' ? colors.successBg : colors.borderLight }]}>
          <Text style={[s.tmplStatusText, { color: tmpl.status === 'active' ? colors.success : colors.textTertiary }]}>
            {t('templates', tmpl.status)}
          </Text>
        </View>
      </View>
      <View style={s.tmplMeta}>
        <View style={s.tmplMetaLeft}>
          <Ionicons name={ch.icon as any} size={12} color={colors.textTertiary} />
          <Text style={[s.tmplMetaText, { color: colors.textTertiary }]}>{t('templates', `channel${ch.value.charAt(0).toUpperCase() + ch.value.slice(1)}`)}</Text>
          <Text style={[s.tmplMetaText, { color: colors.textTertiary }]}>·</Text>
          <Ionicons name="code-slash" size={10} color={colors.textTertiary} />
          <Text style={[s.tmplMetaText, { color: colors.textTertiary }]}>{tmpl.variables.length}</Text>
        </View>
        <Text style={[s.tmplMetaText, { color: colors.textTertiary }]}>
          {t('templates', 'used', { n: tmpl.usageCount })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function TemplatesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<TemplateCategory | 'all'>('all');
  const [filterChannel, setFilterChannel] = useState<TemplateChannel | 'all'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'asc' | 'desc'>('recent');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  // Form state
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<TemplateCategory>('custom');
  const [editChannel, setEditChannel] = useState<TemplateChannel>('email');
  const [editStatus, setEditStatus] = useState<TemplateStatus>('active');
  const [editVariables, setEditVariables] = useState<TemplateVariable[]>([]);
  const [editTags, setEditTags] = useState('');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const all = await templatesService.getAll();
      setTemplates(all);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredTemplates = useMemo(() => {
    let result = [...templates];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) ||
        t.content.toLowerCase().includes(q) || t.tags.some((tg) => tg.toLowerCase().includes(q)),
      );
    }
    if (filterCategory !== 'all') result = result.filter((t) => t.category === filterCategory);
    if (filterChannel !== 'all') result = result.filter((t) => t.channel === filterChannel);
    result.sort((a, b) => {
      if (sortBy === 'asc') return a.title.localeCompare(b.title);
      if (sortBy === 'desc') return b.title.localeCompare(a.title);
      if (sortBy === 'popular') return b.usageCount - a.usageCount;
      return b.updatedAt - a.updatedAt;
    });
    return result;
  }, [templates, searchQuery, filterCategory, filterChannel, sortBy]);

  const openNew = () => {
    setEditingTemplate(null);
    setEditTitle(''); setEditDesc(''); setEditContent('');
    setEditCategory('custom'); setEditChannel('email'); setEditStatus('active');
    setEditVariables([]); setEditTags('');
    setModalVisible(true);
  };

  const openEdit = (tmpl: Template) => {
    setEditingTemplate(tmpl);
    setEditTitle(tmpl.title); setEditDesc(tmpl.description); setEditContent(tmpl.content);
    setEditCategory(tmpl.category); setEditChannel(tmpl.channel); setEditStatus(tmpl.status);
    setEditVariables([...tmpl.variables]); setEditTags(tmpl.tags.join(', '));
    setModalVisible(true);
  };

  const openPreview = (tmpl: Template) => {
    const vals: Record<string, string> = {};
    tmpl.variables.forEach((v) => { vals[v.key] = v.defaultValue || ''; });
    setPreviewValues(vals);
    setEditingTemplate(tmpl);
    setPreviewVisible(true);
  };

  const renderPreview = (content: string, values: Record<string, string>) => {
    let result = content;
    Object.entries(values).forEach(([key, val]) => {
      result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), val || `{{${key}}}`);
    });
    return result;
  };

  const handleSave = async () => {
    if (!editTitle.trim()) { Alert.alert(t('common', 'error'), t('templates', 'titleRequired')); return; }
    setSaving(true);
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      if (editingTemplate && !editingTemplate.isBuiltIn) {
        await templatesService.update(editingTemplate.id, {
          title: editTitle.trim(), description: editDesc.trim(), content: editContent,
          category: editCategory, channel: editChannel, status: editStatus,
          variables: editVariables, tags,
        });
      } else {
        await templatesService.create({
          title: editTitle.trim(), description: editDesc.trim(), content: editContent,
          category: editCategory, channel: editChannel, status: editStatus,
          variables: editVariables, tags,
        });
      }
      setModalVisible(false);
      loadData();
    } catch { Alert.alert(t('common', 'error'), t('templates', 'saveError')); }
    finally { setSaving(false); }
  };

  const handleDelete = (tmpl: Template) => {
    if (tmpl.isBuiltIn) { Alert.alert(t('common', 'info'), t('templates', 'builtIn')); return; }
    Alert.alert(t('templates', 'deleteConfirm'), t('templates', 'deleteTemplateConfirm', { title: tmpl.title }), [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => { await templatesService.delete(tmpl.id); loadData(); } },
    ]);
  };

  const handleUse = async (tmpl: Template) => {
    await templatesService.incrementUsage(tmpl.id);
    Alert.alert(t('common', 'done'), t('templates', 'used', { n: tmpl.usageCount + 1 }));
    loadData();
  };

  const addVariable = () => {
    setEditVariables([...editVariables, { key: '', label: '', defaultValue: '' }]);
  };

  const updateVariable = (idx: number, data: Partial<TemplateVariable>) => {
    const updated = [...editVariables];
    updated[idx] = { ...updated[idx], ...data };
    setEditVariables(updated);
  };

  const removeVariable = (idx: number) => {
    setEditVariables(editVariables.filter((_, i) => i !== idx));
  };

  const dateLocale = locale === 'es-MX' ? 'es-MX' : 'en-US';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.headerTitle}>
            <Text style={[s.headerTitleText, { color: colors.textPrimary }]}>{t('templates', 'title')}</Text>
            <Text style={[s.headerSub, { color: colors.textTertiary }]}>{t('templates', 'subtitle')}</Text>
          </View>
        </View>
        {/* Search */}
        <View style={[s.searchBar, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput style={[s.searchInput, { color: colors.textPrimary }]}
            placeholder={t('templates', 'searchPlaceholder')} placeholderTextColor={colors.textTertiary}
            value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery ? <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={18} color={colors.textTertiary} /></TouchableOpacity> : null}
        </View>
        {/* Category tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsScroll}>
          <TouchableOpacity
            style={[s.tab, filterCategory === 'all' && { backgroundColor: colors.primaryBg, borderColor: colors.primary + '30' }]}
            onPress={() => setFilterCategory('all')}>
            <Text style={[s.tabText, { color: filterCategory === 'all' ? colors.primary : colors.textTertiary }]}>{t('templates', 'filterAll')}</Text>
          </TouchableOpacity>
          {TEMPLATE_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.value}
              style={[s.tab, filterCategory === cat.value && { backgroundColor: cat.color + '15', borderColor: cat.color + '30' }]}
              onPress={() => setFilterCategory(cat.value)}>
              <Ionicons name={cat.icon as any} size={14} color={filterCategory === cat.value ? cat.color : colors.textTertiary} />
              <Text style={[s.tabText, { color: filterCategory === cat.value ? cat.color : colors.textTertiary }]}>{t('templates', cat.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : filteredTemplates.length === 0 ? (
        <View style={s.center}>
          <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
            <Ionicons name="document-text-outline" size={48} color={colors.primary + '60'} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
            {searchQuery ? t('templates', 'noSearchResults') : t('templates', 'noTemplates')}
          </Text>
          <Text style={[s.emptySub, { color: colors.textTertiary }]}>{t('templates', 'noTemplatesSub')}</Text>
          <TouchableOpacity style={[s.emptyCta, { backgroundColor: colors.primary }]} onPress={openNew}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.emptyCtaText}>{t('templates', 'newTemplate')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}>
          {filteredTemplates.map((tmpl) => (
            <View key={tmpl.id}>
              <TemplateCard tmpl={tmpl} colors={colors} s={s} t={t} onPress={() => openEdit(tmpl)} />
              <View style={s.tmplActions}>
                <TouchableOpacity style={[s.tmplActionBtn, { backgroundColor: colors.primaryBg }]} onPress={() => openPreview(tmpl)}>
                  <Ionicons name="eye" size={14} color={colors.primary} />
                  <Text style={[s.tmplActionText, { color: colors.primary }]}>{t('templates', 'preview')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.tmplActionBtn, { backgroundColor: colors.successBg }]} onPress={() => handleUse(tmpl)}>
                  <Ionicons name="send" size={14} color={colors.success} />
                  <Text style={[s.tmplActionText, { color: colors.success }]}>{t('templates', 'use')}</Text>
                </TouchableOpacity>
                {!tmpl.isBuiltIn && (
                  <TouchableOpacity style={[s.tmplActionBtn, { backgroundColor: colors.errorBg }]} onPress={() => handleDelete(tmpl)}>
                    <Ionicons name="trash" size={14} color={colors.error} />
                    <Text style={[s.tmplActionText, { color: colors.error }]}>{t('common', 'delete')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* FAB */}
      {!loading && (
        <TouchableOpacity style={[s.fab, { backgroundColor: colors.primary }]} onPress={openNew} activeOpacity={0.8}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Editor Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={[s.modalCancelBtn, { color: colors.textTertiary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                {editingTemplate && !editingTemplate.isBuiltIn ? t('templates', 'editTemplate') : t('templates', 'newTemplate')}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[s.modalSaveBtn, { color: colors.primary }]}>{t('common', 'save')}</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
              <TextInput style={[s.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('templates', 'titlePlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editTitle} onChangeText={setEditTitle} />
              <TextInput style={[s.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('templates', 'descPlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editDesc} onChangeText={setEditDesc} />
              <TextInput style={[s.contentInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('templates', 'contentPlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editContent} onChangeText={setEditContent} multiline textAlignVertical="top" />

              {/* Category */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('templates', 'category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <TouchableOpacity key={cat.value}
                    style={[s.chip, editCategory === cat.value && { backgroundColor: cat.color + '15', borderColor: cat.color }]}
                    onPress={() => setEditCategory(cat.value)}>
                    <Ionicons name={cat.icon as any} size={14} color={editCategory === cat.value ? cat.color : colors.textTertiary} />
                    <Text style={[s.chipText, { color: editCategory === cat.value ? cat.color : colors.textTertiary }]}>{t('templates', cat.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Channel */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('templates', 'channel')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
                {TEMPLATE_CHANNELS.map((ch) => (
                  <TouchableOpacity key={ch.value}
                    style={[s.chip, editChannel === ch.value && { backgroundColor: ch.color + '15', borderColor: ch.color }]}
                    onPress={() => setEditChannel(ch.value)}>
                    <Ionicons name={ch.icon as any} size={14} color={editChannel === ch.value ? ch.color : colors.textTertiary} />
                    <Text style={[s.chipText, { color: editChannel === ch.value ? ch.color : colors.textTertiary }]}>{t('templates', `channel${ch.value.charAt(0).toUpperCase() + ch.value.slice(1)}`)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Status */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('templates', 'status')}</Text>
              <View style={s.statusRow}>
                {(['active', 'inactive', 'draft'] as TemplateStatus[]).map((st) => (
                  <TouchableOpacity key={st}
                    style={[s.statusChip, editStatus === st && { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}
                    onPress={() => setEditStatus(st)}>
                    <Text style={[s.statusChipText, { color: editStatus === st ? colors.primary : colors.textTertiary }]}>{t('templates', st)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Variables */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('templates', 'variables')}</Text>
              {editVariables.length === 0 && (
                <Text style={[s.emptyVarText, { color: colors.textTertiary }]}>{t('templates', 'addVariable')}</Text>
              )}
              {editVariables.map((v, i) => (
                <View key={i} style={[s.varRow, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
                  <TextInput style={[s.varInput, { color: colors.textPrimary, borderColor: colors.borderLight }]}
                    placeholder={t('templates', 'variableKey')} placeholderTextColor={colors.textTertiary}
                    value={v.key} onChangeText={(val) => updateVariable(i, { key: val })} />
                  <TextInput style={[s.varInput, { flex: 1, color: colors.textPrimary, borderColor: colors.borderLight }]}
                    placeholder={t('templates', 'variableLabel')} placeholderTextColor={colors.textTertiary}
                    value={v.label} onChangeText={(val) => updateVariable(i, { label: val })} />
                  <TouchableOpacity onPress={() => removeVariable(i)}>
                    <Ionicons name="close-circle" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={[s.addVarBtn, { borderColor: colors.primary + '30' }]} onPress={addVariable}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={[s.addVarText, { color: colors.primary }]}>{t('templates', 'addVariable')}</Text>
              </TouchableOpacity>

              {/* Tags */}
              <TextInput style={[s.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight, marginTop: spacing.md }]}
                placeholder={t('templates', 'tagPlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editTags} onChangeText={setEditTags} />
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Preview Modal */}
      <Modal visible={previewVisible} animationType="fade" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.previewCard, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>{t('templates', 'preview')}</Text>
              <TouchableOpacity onPress={() => setPreviewVisible(false)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={[s.previewDesc, { color: colors.textTertiary }]}>{t('templates', 'previewDesc')}</Text>
            {editingTemplate && editingTemplate.variables.map((v) => (
              <View key={v.key} style={s.previewVarRow}>
                <Text style={[s.previewVarLabel, { color: colors.textSecondary }]}>{v.label || v.key}</Text>
                <TextInput style={[s.previewVarInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                  placeholder={`{{${v.key}}}`} placeholderTextColor={colors.textTertiary}
                  value={previewValues[v.key] || ''} onChangeText={(val) => setPreviewValues({ ...previewValues, [v.key]: val })} />
              </View>
            ))}
            <View style={[s.previewContent, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
              <Text style={[s.previewContentText, { color: colors.textPrimary }]}>
                {editingTemplate ? renderPreview(editingTemplate.content, previewValues) : ''}
              </Text>
            </View>
            {editingTemplate && !editingTemplate.isBuiltIn && (
              <TouchableOpacity style={[s.previewUseBtn, { backgroundColor: colors.primary }]} onPress={() => { handleUse(editingTemplate); setPreviewVisible(false); }}>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={s.previewUseText}>{t('templates', 'use')}</Text>
              </TouchableOpacity>
            )}
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
  tabsScroll: { paddingHorizontal: layout.screenPadding, paddingVertical: spacing.md, gap: spacing.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: 'transparent' },
  tabText: { ...typography.caption, fontWeight: '500' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: layout.screenPadding * 2 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyTitle: { ...typography.h3, textAlign: 'center', marginBottom: spacing.sm },
  emptySub: { ...typography.bodySmall, textAlign: 'center', lineHeight: 20 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full },
  emptyCtaText: { ...typography.bodySmall, fontWeight: '600', color: '#fff' },
  listContent: { padding: layout.screenPadding, paddingBottom: 120 },
  templateCard: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, ...shadows.sm },
  tmplTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tmplIcon: { width: 36, height: 36, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  tmplText: { flex: 1 },
  tmplTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tmplTitle: { ...typography.bodySmall, fontWeight: '600' },
  badgeBuiltIn: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm },
  badgeBuiltInText: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  tmplDesc: { ...typography.caption, marginTop: 1 },
  tmplStatus: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  tmplStatusText: { fontSize: 10, fontWeight: '600' },
  tmplMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginLeft: 44 },
  tmplMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tmplMetaText: { ...typography.caption, fontSize: 10 },
  tmplActions: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, marginLeft: 44 },
  tmplActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm },
  tmplActionText: { fontSize: 10, fontWeight: '500' },
  fab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 100 : 80, right: layout.screenPadding, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', ...shadows.lg },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: layout.screenPadding, paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalCancelBtn: { ...typography.body, fontWeight: '500' },
  modalSaveBtn: { ...typography.body, fontWeight: '700' },
  modalTitle: { ...typography.h3 },
  modalBody: { flex: 1 },
  fieldInput: { ...typography.bodySmall, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  contentInput: { ...typography.bodySmall, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, minHeight: 120, marginBottom: spacing.md, textAlignVertical: 'top' },
  fieldLabel: { ...typography.caption, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.sm },
  chipsRow: { gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: 'transparent' },
  chipText: { ...typography.caption, fontWeight: '500' },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statusChip: { flex: 1, alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight },
  statusChipText: { ...typography.caption, fontWeight: '500' },
  emptyVarText: { ...typography.caption, fontStyle: 'italic', marginBottom: spacing.sm },
  varRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  varInput: { ...typography.caption, borderRadius: radius.sm, padding: spacing.xs, borderWidth: 1, width: 100 },
  addVarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed' },
  addVarText: { ...typography.caption, fontWeight: '500' },
  previewCard: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: layout.screenPadding, paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding, maxHeight: '80%' },
  previewDesc: { ...typography.caption, marginBottom: spacing.md },
  previewVarRow: { marginBottom: spacing.sm },
  previewVarLabel: { ...typography.caption, fontWeight: '500', marginBottom: spacing.xs },
  previewVarInput: { ...typography.bodySmall, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1 },
  previewContent: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.md, minHeight: 80 },
  previewContentText: { ...typography.bodySmall, lineHeight: 20 },
  previewUseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
  previewUseText: { ...typography.body, color: '#fff', fontWeight: '600' },
});
