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
  tagsService,
  TAG_GROUPS,
  TAG_COLORS,
  type Tag,
  type TagGroup,
} from '../../src/services/tags';

// ─── Tag Card ────────────────────────────────────────────────────────────────
function TagCard({
  tag,
  onPress,
  onToggleSmart,
  colors,
  s,
  t,
}: {
  tag: Tag;
  onPress: () => void;
  onToggleSmart: () => void;
  colors: ReturnType<typeof useThemeColors>;
  s: ReturnType<typeof makeStyles>;
  t: (domain: string, key: string, params?: any) => string;
}) {
  const group = TAG_GROUPS.find((g) => g.value === tag.group);

  return (
    <TouchableOpacity
      style={[s.tagCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.tagCardLeft}>
        <View style={[s.tagDot, { backgroundColor: tag.color }]} />
        <View style={s.tagCardText}>
          <View style={s.tagCardNameRow}>
            <Text style={[s.tagCardName, { color: colors.textPrimary }]}>{tag.name}</Text>
            {tag.isSmart && (
              <Ionicons name="flash" size={14} color={colors.warning} />
            )}
          </View>
          <Text style={[s.tagCardSub, { color: colors.textTertiary }]}>
            {t('tags', 'usedIn', { n: tag.usageCount })} · {group ? t('tags', `group${group.value.charAt(0).toUpperCase() + group.value.slice(1)}`) : ''}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[s.smartToggle, { backgroundColor: tag.isSmart ? colors.warningBg : colors.borderLight }]}
        onPress={onToggleSmart}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="flash" size={16} color={tag.isSmart ? colors.warning : colors.textTertiary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Color Picker ─────────────────────────────────────────────────────────────
function ColorPicker({
  selected,
  onSelect,
  colors,
}: {
  selected: string;
  onSelect: (c: string) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
      {TAG_COLORS.map((c) => (
        <TouchableOpacity
          key={c}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: c,
            borderWidth: selected === c ? 3 : 0,
            borderColor: colors.textPrimary,
          }}
          onPress={() => onSelect(c)}
        />
      ))}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function TagsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState<TagGroup | 'all'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ total: number; smartCount: number; mostUsed: Tag[] } | null>(null);

  // Form
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#3B82F6');
  const [editGroup, setEditGroup] = useState<TagGroup>('general');
  const [editIsSmart, setEditIsSmart] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [allTags, statsData] = await Promise.all([
        tagsService.getAll(),
        tagsService.getStats(),
      ]);
      setTags(allTags);
      setStats(statsData);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredTags = useMemo(() => {
    let result = [...tags];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (filterGroup !== 'all') result = result.filter((t) => t.group === filterGroup);
    result.sort((a, b) => b.usageCount - a.usageCount);
    return result;
  }, [tags, searchQuery, filterGroup]);

  const openNew = () => {
    setEditingTag(null);
    setEditName(''); setEditColor('#3B82F6'); setEditGroup('general'); setEditIsSmart(false);
    setModalVisible(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingTag(tag);
    setEditName(tag.name); setEditColor(tag.color); setEditGroup(tag.group); setEditIsSmart(tag.isSmart);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!editName.trim()) { Alert.alert(t('common', 'error'), t('common', 'required')); return; }
    setSaving(true);
    try {
      if (editingTag) {
        await tagsService.update(editingTag.id, {
          name: editName.trim(), color: editColor, group: editGroup, isSmart: editIsSmart,
        });
      } else {
        await tagsService.create({
          name: editName.trim(), color: editColor, group: editGroup, isSmart: editIsSmart,
        });
      }
      setModalVisible(false);
      loadData();
    } catch { Alert.alert(t('common', 'error'), t('tags', 'saveError')); }
    finally { setSaving(false); }
  };

  const handleDelete = (tag: Tag) => {
    Alert.alert(t('tags', 'deleteConfirm'), t('tags', 'deleteTagConfirm', { name: tag.name }), [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => { await tagsService.delete(tag.id); loadData(); } },
    ]);
  };

  const toggleSmart = async (tag: Tag) => {
    try {
      await tagsService.toggleSmart(tag.id);
      loadData();
    } catch {}
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.headerTitle}>
            <Text style={[s.headerTitleText, { color: colors.textPrimary }]}>{t('tags', 'title')}</Text>
            {stats && (
              <Text style={[s.headerSub, { color: colors.textTertiary }]}>
                {t('tags', 'totalTags', { n: stats.total })} · {stats.smartCount} {t('tags', 'smartTag')}
              </Text>
            )}
          </View>
        </View>
        {/* Search */}
        <View style={[s.searchBar, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput style={[s.searchInput, { color: colors.textPrimary }]}
            placeholder={t('tags', 'searchPlaceholder')} placeholderTextColor={colors.textTertiary}
            value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery ? <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={18} color={colors.textTertiary} /></TouchableOpacity> : null}
        </View>
        {/* Group tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsScroll}>
          <TouchableOpacity
            style={[s.tab, filterGroup === 'all' && { backgroundColor: colors.primaryBg, borderColor: colors.primary + '30' }]}
            onPress={() => setFilterGroup('all')}>
            <Text style={[s.tabText, { color: filterGroup === 'all' ? colors.primary : colors.textTertiary }]}>{t('tags', 'filterAll')}</Text>
          </TouchableOpacity>
          {TAG_GROUPS.map((g) => (
            <TouchableOpacity key={g.value}
              style={[s.tab, filterGroup === g.value && { backgroundColor: g.color + '15', borderColor: g.color + '30' }]}
              onPress={() => setFilterGroup(g.value)}>
              <View style={[s.tabDot, { backgroundColor: g.color }]} />
              <Text style={[s.tabText, { color: filterGroup === g.value ? g.color : colors.textTertiary }]}>{t('tags', `group${g.value.charAt(0).toUpperCase() + g.value.slice(1)}`)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : filteredTags.length === 0 ? (
        <View style={s.center}>
          <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
            <Ionicons name="pricetags-outline" size={48} color={colors.primary + '60'} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
            {searchQuery ? t('tags', 'noSearchResults') : t('tags', 'noTags')}
          </Text>
          <Text style={[s.emptySub, { color: colors.textTertiary }]}>{t('tags', 'noTagsSub')}</Text>
          <TouchableOpacity style={[s.emptyCta, { backgroundColor: colors.primary }]} onPress={openNew}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.emptyCtaText}>{t('tags', 'newTag')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}>
          {filteredTags.map((tag) => (
            <View key={tag.id}>
              <TagCard tag={tag} colors={colors} s={s} t={t}
                onPress={() => openEdit(tag)}
                onToggleSmart={() => toggleSmart(tag)} />
              <TouchableOpacity style={s.deleteTagBtn} onPress={() => handleDelete(tag)}>
                <Ionicons name="trash-outline" size={14} color={colors.error} />
                <Text style={[s.deleteTagText, { color: colors.error }]}>{t('common', 'delete')}</Text>
              </TouchableOpacity>
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
                {editingTag ? t('tags', 'editTag') : t('tags', 'newTag')}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[s.modalSaveBtn, { color: colors.primary }]}>{t('common', 'save')}</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
              <TextInput style={[s.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('tags', 'namePlaceholder')} placeholderTextColor={colors.textTertiary}
                value={editName} onChangeText={setEditName} />

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('tags', 'color')}</Text>
              <ColorPicker selected={editColor} onSelect={setEditColor} colors={colors} />

              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('tags', 'group')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
                {TAG_GROUPS.map((g) => (
                  <TouchableOpacity key={g.value}
                    style={[s.chip, editGroup === g.value && { backgroundColor: g.color + '15', borderColor: g.color }]}
                    onPress={() => setEditGroup(g.value)}>
                    <View style={[s.chipDot, { backgroundColor: g.color }]} />
                    <Text style={[s.chipText, { color: editGroup === g.value ? g.color : colors.textTertiary }]}>{t('tags', `group${g.value.charAt(0).toUpperCase() + g.value.slice(1)}`)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Smart toggle */}
              <View style={[s.smartRow, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
                <View style={s.smartRowLeft}>
                  <Ionicons name="flash" size={20} color={editIsSmart ? colors.warning : colors.textTertiary} />
                  <View>
                    <Text style={[s.smartLabel, { color: colors.textPrimary }]}>{t('tags', 'smartTag')}</Text>
                    <Text style={[s.smartDesc, { color: colors.textTertiary }]}>{t('tags', 'smartTagDesc')}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.smartToggleBtn, { backgroundColor: editIsSmart ? colors.warningBg : colors.borderLight }]}
                  onPress={() => setEditIsSmart(!editIsSmart)}>
                  <View style={[s.smartToggleDot, { transform: [{ translateX: editIsSmart ? 14 : 0 }], backgroundColor: editIsSmart ? colors.warning : colors.textTertiary }]} />
                </TouchableOpacity>
              </View>

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
  tabsScroll: { paddingHorizontal: layout.screenPadding, paddingVertical: spacing.md, gap: spacing.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: 'transparent' },
  tabText: { ...typography.caption, fontWeight: '500' },
  tabDot: { width: 8, height: 8, borderRadius: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: layout.screenPadding * 2 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyTitle: { ...typography.h3, textAlign: 'center', marginBottom: spacing.sm },
  emptySub: { ...typography.bodySmall, textAlign: 'center', lineHeight: 20 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full },
  emptyCtaText: { ...typography.bodySmall, fontWeight: '600', color: '#fff' },
  listContent: { padding: layout.screenPadding, paddingBottom: 120 },
  tagCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, ...shadows.sm },
  tagCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  tagDot: { width: 12, height: 12, borderRadius: 6 },
  tagCardText: { flex: 1 },
  tagCardNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tagCardName: { ...typography.bodySmall, fontWeight: '600' },
  tagCardSub: { ...typography.caption, fontSize: 10, marginTop: 1 },
  smartToggle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  deleteTagBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 48, marginBottom: spacing.sm },
  deleteTagText: { fontSize: 10, fontWeight: '500' },
  fab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 100 : 80, right: layout.screenPadding, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', ...shadows.lg },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: layout.screenPadding, paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalCancelBtn: { ...typography.body, fontWeight: '500' },
  modalSaveBtn: { ...typography.body, fontWeight: '700' },
  modalTitle: { ...typography.h3 },
  modalBody: { flex: 1 },
  fieldInput: { ...typography.bodySmall, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  fieldLabel: { ...typography.caption, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.sm },
  chipsRow: { gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: 'transparent' },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { ...typography.caption, fontWeight: '500' },
  smartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  smartRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  smartLabel: { ...typography.bodySmall, fontWeight: '500' },
  smartDesc: { ...typography.caption, fontSize: 10 },
  smartToggleBtn: { width: 36, height: 22, borderRadius: 11, justifyContent: 'center', paddingHorizontal: 3 },
  smartToggleDot: { width: 16, height: 16, borderRadius: 8 },
});
