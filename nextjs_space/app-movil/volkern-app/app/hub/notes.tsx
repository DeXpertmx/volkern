import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Animated,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { notesService, NOTE_CATEGORIES, NOTE_COLORS, type Note, type NoteCategory, type NoteColor } from '../../src/services/notes';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - layout.screenPadding * 2 - spacing.sm) / 2;

// ─── Category Icon ───────────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<NoteCategory, keyof typeof Ionicons.glyphMap> = {
  general: 'document-text',
  idea: 'bulb',
  todo: 'checkbox',
  meeting: 'calendar',
  personal: 'person',
};

// ─── Note Card ───────────────────────────────────────────────────────────────
function NoteCard({
  note,
  onPress,
  onLongPress,
  colors,
  s,
  locale,
}: {
  note: Note;
  onPress: () => void;
  onLongPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
  s: ReturnType<typeof makeStyles>;
  locale: string;
}) {
  const contentPreview = note.content.replace(/\n/g, ' ').slice(0, 80);
  const dateStr = new Date(note.updatedAt).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <TouchableOpacity
      style={[s.noteCard, { backgroundColor: colors.surface, borderLeftColor: note.color, borderLeftWidth: 3 }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={s.noteCardHeader}>
        <View style={[s.categoryDot, { backgroundColor: note.color + '20' }]}>
          <Ionicons name={CATEGORY_ICONS[note.category]} size={14} color={note.color} />
        </View>
        {note.pinned && (
          <Ionicons name="pin" size={14} color={note.color} />
        )}
      </View>
      <Text style={[s.noteCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {note.title}
      </Text>
      {contentPreview ? (
        <Text style={[s.noteCardPreview, { color: colors.textTertiary }]} numberOfLines={2}>
          {contentPreview}
        </Text>
      ) : null}
      <Text style={[s.noteCardDate, { color: colors.textTertiary }]}>{dateStr}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function NotesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t, locale } = useI18n();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<NoteCategory | 'all'>('all');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [sortDesc, setSortDesc] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<NoteCategory>('general');
  const [editColor, setEditColor] = useState<NoteColor>('#6366F1');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ total: number; pinned: number; categories: Record<NoteCategory, number> } | null>(null);
  const [gridView, setGridView] = useState(true);

  const scrollY = useRef(new Animated.Value(0)).current;

  const loadNotes = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [allNotes, statsData] = await Promise.all([
        notesService.getAll(),
        notesService.getStats(),
      ]);
      setNotes(allNotes);
      setStats(statsData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Filtered notes
  const filteredNotes = useMemo(() => {
    let result = [...notes];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Category filter
    if (activeCategory !== 'all') {
      result = result.filter((n) => n.category === activeCategory);
    }

    // Pinned filter
    if (showPinnedOnly) {
      result = result.filter((n) => n.pinned);
    }

    // Sort
    result.sort((a, b) => {
      // Pinned always first
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return sortDesc ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt;
    });

    return result;
  }, [notes, searchQuery, activeCategory, showPinnedOnly, sortDesc]);

  const openNewNote = () => {
    setEditingNote(null);
    setEditTitle('');
    setEditContent('');
    setEditCategory('general');
    setEditColor('#6366F1');
    setEditTags('');
    setModalVisible(true);
  };

  const openEditNote = (note: Note) => {
    setEditingNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditCategory(note.category);
    setEditColor(note.color);
    setEditTags(note.tags.join(', '));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!editTitle.trim()) {
      Alert.alert(t('common', 'error'), t('notes', 'titleRequired'));
      return;
    }
    setSaving(true);
    try {
      const tags = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (editingNote) {
        await notesService.update(editingNote.id, {
          title: editTitle.trim(),
          content: editContent,
          category: editCategory,
          color: editColor,
          tags,
        });
      } else {
        await notesService.create({
          title: editTitle.trim(),
          content: editContent,
          category: editCategory,
          color: editColor,
          tags,
        });
      }
      setModalVisible(false);
      loadNotes();
    } catch {
      Alert.alert(t('common', 'error'), t('notes', 'saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (note: Note) => {
    Alert.alert(
      t('notes', 'deleteConfirm'),
      t('notes', 'deleteNoteConfirm', { title: note.title }),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await notesService.delete(note.id);
              loadNotes();
            } catch {
              Alert.alert(t('common', 'error'), t('notes', 'deleteError'));
            }
          },
        },
      ],
    );
  };

  const handleTogglePin = async (note: Note) => {
    try {
      await notesService.togglePin(note.id);
      loadNotes();
    } catch {
      // ignore
    }
  };

  const handleClearAll = () => {
    Alert.alert(t('notes', 'clearAll'), t('notes', 'clearAllConfirm'), [
      { text: t('common', 'cancel'), style: 'cancel' },
      {
        text: t('common', 'delete'),
        style: 'destructive',
        onPress: async () => {
          await notesService.clearAll();
          loadNotes();
        },
      },
    ]);
  };

  const wordCount = editContent.trim() ? editContent.trim().split(/\s+/).length : 0;
  const charCount = editContent.length;
  const dateLocale = locale === 'es-MX' ? 'es-MX' : 'en-US';

  // Category tabs
  const categories = useMemo(() => {
    const items: { value: NoteCategory | 'all'; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
      { value: 'all', label: t('notes', 'filterAll'), icon: 'grid', count: notes.length },
      ...NOTE_CATEGORIES.map((c) => ({
        value: c.value,
        label: t('notes', `category${c.value.charAt(0).toUpperCase() + c.value.slice(1)}` as any),
        icon: c.icon as keyof typeof Ionicons.glyphMap,
        count: stats?.categories[c.value] || 0,
      })),
    ];
    return items;
  }, [notes.length, stats, t]);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.headerTitle}>
            <Text style={[s.headerTitleText, { color: colors.textPrimary }]}>{t('notes', 'title')}</Text>
            {stats && (
              <Text style={[s.headerSub, { color: colors.textTertiary }]}>
                {t('notes', 'totalNotes', { n: stats.total })} · {t('notes', 'pinnedCount', { n: stats.pinned })}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setGridView(!gridView)} style={s.headerBtn}>
            <Ionicons name={gridView ? 'list' : 'grid'} size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[s.searchBar, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={[s.searchInput, { color: colors.textPrimary }]}
            placeholder={t('notes', 'searchPlaceholder')}
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

        {/* Category Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryScroll}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.value}
              style={[
                s.categoryTab,
                activeCategory === cat.value && { backgroundColor: colors.primaryBg, borderColor: colors.primary + '30' },
              ]}
              onPress={() => setActiveCategory(cat.value)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={cat.icon}
                size={16}
                color={activeCategory === cat.value ? colors.primary : colors.textTertiary}
              />
              <Text
                style={[
                  s.categoryTabText,
                  { color: activeCategory === cat.value ? colors.primary : colors.textTertiary },
                ]}
              >
                {cat.label}
              </Text>
              {cat.count > 0 && (
                <View style={[s.categoryCount, { backgroundColor: activeCategory === cat.value ? colors.primaryBg : colors.borderLight }]}>
                  <Text style={[s.categoryCountText, { color: activeCategory === cat.value ? colors.primary : colors.textTertiary }]}>
                    {cat.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filter row */}
        <View style={s.filterRow}>
          <TouchableOpacity
            style={[s.filterChip, showPinnedOnly && { backgroundColor: colors.warningBg, borderColor: colors.warning + '30' }]}
            onPress={() => setShowPinnedOnly(!showPinnedOnly)}
            activeOpacity={0.7}
          >
            <Ionicons name="pin" size={14} color={showPinnedOnly ? colors.warning : colors.textTertiary} />
            <Text style={[s.filterChipText, { color: showPinnedOnly ? colors.warning : colors.textTertiary }]}>
              {t('notes', 'filterPinned')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.filterChip}
            onPress={() => setSortDesc(!sortDesc)}
            activeOpacity={0.7}
          >
            <Ionicons name={sortDesc ? 'arrow-down' : 'arrow-up'} size={14} color={colors.textTertiary} />
            <Text style={[s.filterChipText, { color: colors.textTertiary }]}>
              {sortDesc ? t('notes', 'sortRecent') : t('notes', 'sortOldest')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Notes List ───────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredNotes.length === 0 ? (
        <View style={s.center}>
          <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
            <Ionicons name="document-text-outline" size={48} color={colors.primary + '60'} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
            {searchQuery ? t('notes', 'noSearchResults') : activeCategory !== 'all' ? t('notes', 'emptyCategory') : t('notes', 'noNotes')}
          </Text>
          <Text style={[s.emptySub, { color: colors.textTertiary }]}>
            {searchQuery ? '' : t('notes', 'noNotesSub')}
          </Text>
          {!searchQuery && (
            <TouchableOpacity style={[s.emptyCta, { backgroundColor: colors.primary }]} onPress={openNewNote} activeOpacity={0.7}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={s.emptyCtaText}>{t('notes', 'newNote')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <Animated.ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadNotes(true)} />}
        >
          {gridView ? (
            <View style={s.grid}>
              {filteredNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  colors={colors}
                  s={s}
                  locale={dateLocale}
                  onPress={() => openEditNote(note)}
                  onLongPress={() => {
                    Alert.alert(note.title, '', [
                      { text: t('notes', 'pinNote'), onPress: () => handleTogglePin(note) },
                      { text: t('common', 'edit'), onPress: () => openEditNote(note) },
                      { text: t('common', 'delete'), style: 'destructive', onPress: () => handleDelete(note) },
                      { text: t('common', 'cancel'), style: 'cancel' },
                    ]);
                  }}
                />
              ))}
            </View>
          ) : (
            <View>
              {filteredNotes.map((note) => (
                <TouchableOpacity
                  key={note.id}
                  style={[s.listCard, { backgroundColor: colors.surface, borderLeftColor: note.color, borderLeftWidth: 3 }]}
                  onPress={() => openEditNote(note)}
                  onLongPress={() => handleTogglePin(note)}
                  activeOpacity={0.7}
                >
                  <View style={s.listCardTop}>
                    <View style={[s.categoryDot, { backgroundColor: note.color + '20' }]}>
                      <Ionicons name={CATEGORY_ICONS[note.category]} size={14} color={note.color} />
                    </View>
                    <View style={s.listCardText}>
                      <Text style={[s.listCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {note.title}
                      </Text>
                      <Text style={[s.listCardPreview, { color: colors.textTertiary }]} numberOfLines={1}>
                        {note.content.replace(/\n/g, ' ').slice(0, 100) || t('notes', 'noteContent')}
                      </Text>
                    </View>
                    {note.pinned && <Ionicons name="pin" size={16} color={note.color} />}
                    <TouchableOpacity onPress={() => handleDelete(note)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.listCardDate, { color: colors.textTertiary }]}>
                    {new Date(note.updatedAt).toLocaleDateString(locale === 'es-MX' ? 'es-MX' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={{ height: 100 }} />
        </Animated.ScrollView>
      )}

      {/* ─── FAB ──────────────────────────────────────────────────────── */}
      {!loading && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: colors.primary }]}
          onPress={openNewNote}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ─── Note Editor Modal ─────────────────────────────────────────── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={[s.modalCancelBtn, { color: colors.textTertiary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                {editingNote ? t('notes', 'editNote') : t('notes', 'newNote')}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[s.modalSaveBtn, { color: colors.primary }]}>{t('common', 'save')}</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
              {/* Title */}
              <TextInput
                style={[s.titleInput, { color: colors.textPrimary, borderBottomColor: colors.borderLight }]}
                placeholder={t('notes', 'titlePlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={editTitle}
                onChangeText={setEditTitle}
                autoFocus={!editingNote}
              />

              {/* Content */}
              <TextInput
                style={[s.contentInput, { color: colors.textPrimary, backgroundColor: colors.background }]}
                placeholder={t('notes', 'contentPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={editContent}
                onChangeText={setEditContent}
                multiline
                textAlignVertical="top"
              />

              {/* Word/Char count */}
              <Text style={[s.charCount, { color: colors.textTertiary }]}>
                {t('notes', 'wordCount', { n: wordCount })} · {t('notes', 'charsCount', { n: charCount })}
              </Text>

              {/* Category */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('notes', 'category')}</Text>
              <View style={s.categoryRow}>
                {NOTE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      s.categoryOption,
                      editCategory === cat.value && { backgroundColor: colors.primaryBg, borderColor: colors.primary },
                    ]}
                    onPress={() => setEditCategory(cat.value)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={16}
                      color={editCategory === cat.value ? colors.primary : colors.textTertiary}
                    />
                    <Text
                      style={[
                        s.categoryOptionText,
                        { color: editCategory === cat.value ? colors.primary : colors.textTertiary },
                      ]}
                    >
                      {t('notes', `category${cat.value.charAt(0).toUpperCase() + cat.value.slice(1)}` as any)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Colors */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('notes', 'color')}</Text>
              <View style={s.colorRow}>
                {NOTE_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      s.colorOption,
                      { backgroundColor: color },
                      editColor === color && s.colorOptionSelected,
                    ]}
                    onPress={() => setEditColor(color)}
                    activeOpacity={0.7}
                  >
                    {editColor === color && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tags */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('notes', 'tags')}</Text>
              <TextInput
                style={[s.tagInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.borderLight }]}
                placeholder={t('notes', 'tagPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={editTags}
                onChangeText={setEditTags}
              />
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
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { flex: 1 },
  headerTitleText: { ...typography.h3 },
  headerSub: { ...typography.caption, marginTop: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: spacing.xs,
  },
  searchInput: { flex: 1, ...typography.bodySmall, paddingVertical: 0 },
  categoryScroll: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryTabText: { ...typography.caption, fontWeight: '500' },
  categoryCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  categoryCountText: { fontSize: 11, fontWeight: '600' },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterChipText: { ...typography.caption, fontWeight: '500' },
  scrollView: { flex: 1 },
  scrollContent: { padding: layout.screenPadding, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: layout.screenPadding * 2 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyTitle: { ...typography.h3, textAlign: 'center', marginBottom: spacing.sm },
  emptySub: { ...typography.bodySmall, textAlign: 'center', lineHeight: 20 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  emptyCtaText: { ...typography.bodySmall, fontWeight: '600', color: '#fff' },

  // Grid view
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  noteCard: {
    width: CARD_WIDTH,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  noteCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  categoryDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteCardTitle: { ...typography.bodySmall, fontWeight: '700', marginBottom: 2 },
  noteCardPreview: { ...typography.caption, lineHeight: 16 },
  noteCardDate: { ...typography.caption, fontSize: 10, marginTop: spacing.xs },

  // List view
  listCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  listCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listCardText: { flex: 1 },
  listCardTitle: { ...typography.bodySmall, fontWeight: '600' },
  listCardPreview: { ...typography.caption, marginTop: 1 },
  listCardDate: { ...typography.caption, fontSize: 10, marginTop: spacing.xs, marginLeft: 36 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    right: layout.screenPadding,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: layout.screenPadding,
    paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalCancelBtn: { ...typography.body, fontWeight: '500' },
  modalSaveBtn: { ...typography.body, fontWeight: '700' },
  modalTitle: { ...typography.h3 },
  modalBody: { flex: 1 },
  titleInput: {
    ...typography.h3,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    marginBottom: spacing.md,
  },
  contentInput: {
    ...typography.body,
    minHeight: 160,
    borderRadius: radius.md,
    padding: spacing.md,
    lineHeight: 22,
  },
  charCount: { ...typography.caption, fontSize: 11, textAlign: 'right', marginTop: spacing.xs, marginBottom: spacing.lg },
  fieldLabel: { ...typography.caption, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.md },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  categoryOptionText: { ...typography.caption, fontWeight: '500' },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: colors.textPrimary,
  },
  tagInput: {
    ...typography.bodySmall,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
});
