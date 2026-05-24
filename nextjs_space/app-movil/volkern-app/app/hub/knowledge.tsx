import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  knowledgeService, type KnowledgeArticle, type KnowledgeCategory,
  DEFAULT_CATEGORIES,
} from '../../src/services/knowledge';

export default function KnowledgeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [viewingArticle, setViewingArticle] = useState<KnowledgeArticle | null>(null);

  const [formData, setFormData] = useState({ title: '', content: '', summary: '', categoryId: '', tags: '', author: '', published: true });

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [arts, cats] = await Promise.all([
        knowledgeService.getArticles(),
        knowledgeService.getCategories(),
      ]);
      setArticles(arts);
      setCategories(cats);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const filtered = useMemo(() => {
    let items = articles;
    if (selectedCat) items = items.filter(a => a.categoryId === selectedCat);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return items;
  }, [articles, selectedCat, search]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ title: '', content: '', summary: '', categoryId: categories[0]?.id || '', tags: '', author: '', published: true });
    setModalVisible(true);
  };

  const openEdit = (item: KnowledgeArticle) => {
    setEditing(item);
    setFormData({
      title: item.title, content: item.content, summary: item.summary,
      categoryId: item.categoryId, tags: item.tags.join(', '), author: item.author,
      published: item.published,
    });
    setModalVisible(true);
  };

  const handleViewArticle = async (article: KnowledgeArticle) => {
    await knowledgeService.incrementViews(article.id);
    setViewingArticle(article);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      Alert.alert(t('common', 'error'), t('knowledge', 'requiredFields'));
      return;
    }
    const tags = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
    try {
      if (editing) {
        await knowledgeService.update(editing.id, { ...formData, tags });
      } else {
        await knowledgeService.create({ ...formData, tags });
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('knowledge', 'saveError'));
    }
  };

  const handleDelete = (item: KnowledgeArticle) => {
    Alert.alert(
      t('knowledge', 'deleteArticle'),
      t('knowledge', 'deleteConfirm', { title: item.title }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await knowledgeService.delete(item.id); loadData(); },
        },
      ]
    );
  };

  const handleHelpful = async (helpful: boolean) => {
    if (!viewingArticle) return;
    await knowledgeService.markHelpful(viewingArticle.id, helpful);
    const updated = await knowledgeService.getById(viewingArticle.id);
    if (updated) setViewingArticle(updated);
  };

  const getCatDef = (catId: string) =>
    categories.find(c => c.id === catId) || DEFAULT_CATEGORIES.find(c => c.id === catId) || { id: '', name: '', icon: 'document-text', color: '#64748B' };

  const renderItem = ({ item }: { item: KnowledgeArticle }) => {
    const cat = getCatDef(item.categoryId);
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: colors.surface }]} onPress={() => handleViewArticle(item)} activeOpacity={0.7}>
        <View style={s.cardRow}>
          <View style={[s.catIcon, { backgroundColor: cat.color + '15' }]}>
            <Ionicons name={cat.icon as any} size={20} color={cat.color} />
          </View>
          <View style={s.cardInfo}>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{item.title}</Text>
            <Text style={[s.cardSummary, { color: colors.textSecondary }]} numberOfLines={2}>{item.summary}</Text>
            <View style={s.cardMeta}>
              <Text style={[s.cardViews, { color: colors.textTertiary }]}>{item.views} {t('knowledge', 'views')}</Text>
              <Text style={[s.cardHelpful, { color: colors.textTertiary }]}>
                {item.views > 0 ? t('knowledge', 'helpfulness', { n: Math.round((item.helpful / (item.helpful + item.notHelpful || 1)) * 100) }) : ''}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <Text style={s.title}>{t('knowledge', 'title')}</Text>
              <TouchableOpacity style={s.addBtn} onPress={openCreate}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={[s.searchInput, { color: colors.textPrimary }]}
                value={search}
                onChangeText={setSearch}
                placeholder={t('knowledge', 'searchArticles')}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <FlatList
              horizontal
              data={[{ id: null, name: 'allArticles', icon: 'grid', color: colors.primary }, ...categories]}
              keyExtractor={item => item.id || 'all'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.catChip, selectedCat === item.id && { backgroundColor: colors.primary }]}
                  onPress={() => setSelectedCat(item.id)}
                >
                  <Ionicons name={item.icon as any} size={16} color={selectedCat === item.id ? '#fff' : colors.textSecondary} />
                  <Text style={[s.catText, { color: selectedCat === item.id ? '#fff' : colors.textSecondary }]}>
                    {item.id ? item.name : t('knowledge', 'allArticles')}
                  </Text>
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
              style={s.catRow}
            />
          </>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyText, { color: colors.textPrimary }]}>{t('knowledge', 'noArticles')}</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>{t('knowledge', 'noArticlesSub')}</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? t('knowledge', 'editArticle') : t('knowledge', 'newArticle')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('knowledge', 'articleTitle')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.title} onChangeText={v => setFormData(p => ({ ...p, title: v }))} placeholder={t('knowledge', 'articleTitle')} placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('knowledge', 'summary')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.summary} onChangeText={v => setFormData(p => ({ ...p, summary: v }))} placeholder={t('knowledge', 'summary')} placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('knowledge', 'content')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, height: 120 }]} value={formData.content} onChangeText={v => setFormData(p => ({ ...p, content: v }))} placeholder={t('knowledge', 'content')} placeholderTextColor={colors.textTertiary} multiline />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('knowledge', 'tags')}</Text>
            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]} value={formData.tags} onChangeText={v => setFormData(p => ({ ...p, tags: v }))} placeholder="tag1, tag2, tag3" placeholderTextColor={colors.textTertiary} />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => setModalVisible(false)}>
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }]} onPress={handleSave}>
                <Text style={s.modalSaveText}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>
            {editing && (
              <TouchableOpacity style={s.deleteBtn} onPress={() => { setModalVisible(false); handleDelete(editing); }}>
                <Text style={s.deleteText}>{t('knowledge', 'deleteArticle')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewingArticle} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxHeight: '85%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { flex: 1 }]}>{viewingArticle?.title}</Text>
              <TouchableOpacity onPress={() => setViewingArticle(null)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {viewingArticle && (
              <>
                <View style={s.articleMeta}>
                  <View style={[s.articleCat, { backgroundColor: getCatDef(viewingArticle.categoryId).color + '15' }]}>
                    <Ionicons name={getCatDef(viewingArticle.categoryId).icon as any} size={14} color={getCatDef(viewingArticle.categoryId).color} />
                    <Text style={[s.articleCatText, { color: getCatDef(viewingArticle.categoryId).color }]}>{getCatDef(viewingArticle.categoryId).name}</Text>
                  </View>
                </View>
                <Text style={[s.articleSummary, { color: colors.textSecondary }]}>{viewingArticle.summary}</Text>
                <View style={[s.articleDivider, { backgroundColor: colors.borderLight }]} />
                <Text style={[s.articleContent, { color: colors.textPrimary }]}>{viewingArticle.content}</Text>
                {viewingArticle.tags.length > 0 && (
                  <View style={s.tagsRow}>
                    {viewingArticle.tags.map(tag => (
                      <View key={tag} style={[s.tag, { backgroundColor: colors.primaryBg }]}>
                        <Text style={[s.tagText, { color: colors.primary }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={[s.helpfulRow, { borderTopColor: colors.borderLight }]}>
                  <Text style={[s.helpfulLabel, { color: colors.textSecondary }]}>{t('knowledge', 'helpful')}?</Text>
                  <TouchableOpacity style={[s.helpfulBtn, { backgroundColor: colors.successBg }]} onPress={() => handleHelpful(true)}>
                    <Ionicons name="thumbs-up" size={18} color="#10B981" />
                    <Text style={[s.helpfulCount, { color: '#10B981' }]}>{viewingArticle.helpful}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.helpfulBtn, { backgroundColor: colors.errorBg }]} onPress={() => handleHelpful(false)}>
                    <Ionicons name="thumbs-down" size={18} color="#EF4444" />
                    <Text style={[s.helpfulCount, { color: '#EF4444' }]}>{viewingArticle.notHelpful}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  catRow: { marginBottom: 16 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginRight: 8, backgroundColor: colors.surface },
  catText: { fontSize: 13, fontWeight: '500' },
  card: { borderRadius: 12, marginBottom: 8, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardSummary: { fontSize: 13, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cardViews: { fontSize: 11 },
  cardHelpful: { fontSize: 11 },
  emptyText: { fontSize: 15, marginTop: 12, marginBottom: 4 },
  emptySub: { fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  modalCancelText: { fontSize: 16, fontWeight: '600' },
  modalSave: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12 },
  modalSaveText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  deleteBtn: { alignItems: 'center', padding: 14, marginTop: 12 },
  deleteText: { fontSize: 15, color: '#EF4444', fontWeight: '600' },
  articleMeta: { flexDirection: 'row', marginBottom: 12 },
  articleCat: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  articleCatText: { fontSize: 12, fontWeight: '600' },
  articleSummary: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  articleDivider: { height: 1, marginBottom: 12 },
  articleContent: { fontSize: 14, lineHeight: 22, marginBottom: 16 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 12, fontWeight: '500' },
  helpfulRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 16, borderTopWidth: 1 },
  helpfulLabel: { fontSize: 14, fontWeight: '500' },
  helpfulBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  helpfulCount: { fontSize: 14, fontWeight: '600' },
});
