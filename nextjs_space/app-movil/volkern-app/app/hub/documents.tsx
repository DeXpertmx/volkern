import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, RefreshControl, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { documentService, Document, DocumentFolder, DocumentType, DOCUMENT_TYPES, formatSize } from '../../src/services/documents';

const VIEW_TABS = [
  { key: 'all', icon: 'folder-outline', labelKey: 'allFiles' },
  { key: 'recent', icon: 'time-outline', labelKey: 'recent' },
  { key: 'favorites', icon: 'star-outline', labelKey: 'favorites' },
];

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useI18n();
  const s = makeStyles(colors, insets);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewTab, setViewTab] = useState('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formFolderName, setFormFolderName] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [allDocs, allFolders] = await Promise.all([
        viewTab === 'all' ? documentService.getAllDocuments({ folderId: selectedFolder, search: search || undefined })
          : viewTab === 'recent' ? documentService.getRecent(20)
          : documentService.getFavorites(),
        documentService.getAllFolders(),
      ]);
      setDocuments(allDocs);
      setFolders(allFolders);
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  }, [viewTab, selectedFolder, search]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openNewDoc = () => {
    setEditingDoc(null);
    setFormName('');
    setModalVisible(true);
  };

  const openEditDoc = (doc: Document) => {
    setEditingDoc(doc);
    setFormName(doc.name);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      Alert.alert(t('documents', 'nameRequired'));
      return;
    }
    try {
      if (editingDoc) {
        await documentService.updateDocument(editingDoc.id, { name: formName.trim() });
      } else {
        const ext = formName.split('.').pop()?.toLowerCase() || '';
        let type: DocumentType = 'other';
        if (['pdf'].includes(ext)) type = 'pdf';
        else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) type = 'image';
        else if (['xls', 'xlsx', 'csv'].includes(ext)) type = 'spreadsheet';
        else if (['txt', 'md', 'rtf'].includes(ext)) type = 'text';
        else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) type = 'archive';
        await documentService.createDocument({
          name: formName.trim(),
          type,
          size: 0,
          uri: `/docs/${formName.trim()}`,
          folderId: selectedFolder,
        });
      }
      setModalVisible(false);
      loadData();
    } catch {
      Alert.alert(t('documents', 'saveError'));
    }
  };

  const handleDelete = (doc: Document) => {
    Alert.alert(
      t('documents', 'deleteConfirm'),
      t('documents', 'deleteDocumentConfirm', { name: doc.name }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => {
            try { await documentService.deleteDocument(doc.id); loadData(); }
            catch { Alert.alert(t('documents', 'deleteError')); }
          },
        },
      ]
    );
  };

  const handleToggleFavorite = async (doc: Document) => {
    try { await documentService.toggleFavorite(doc.id); loadData(); }
    catch { /* ignore */ }
  };

  const openFolderModal = (folder?: DocumentFolder) => {
    setEditingFolder(folder || null);
    setFormFolderName(folder?.name || '');
    setFolderModalVisible(true);
  };

  const handleSaveFolder = async () => {
    if (!formFolderName.trim()) return;
    try {
      if (editingFolder) {
        await documentService.updateFolder(editingFolder.id, { name: formFolderName.trim() });
      } else {
        await documentService.createFolder({ name: formFolderName.trim() });
      }
      setFolderModalVisible(false);
      loadData();
    } catch { /* ignore */ }
  };

  const handleDeleteFolder = (folder: DocumentFolder) => {
    Alert.alert(
      t('documents', 'deleteFolder'),
      t('documents', 'deleteFolderConfirm', { name: folder.name }),
      [
        { text: t('common', 'cancel'), style: 'cancel' as const },
        {
          text: t('common', 'delete'), style: 'destructive' as const,
          onPress: async () => { await documentService.deleteFolder(folder.id); loadData(); },
        },
      ]
    );
  };

  const getTypeConfig = (type: DocumentType) => DOCUMENT_TYPES.find(t => t.value === type) || DOCUMENT_TYPES[5];

  const renderDoc = ({ item }: { item: Document }) => {
    const config = getTypeConfig(item.type);
    return (
      <TouchableOpacity style={s.docCard} onPress={() => openEditDoc(item)}>
        <View style={[s.docIcon, { backgroundColor: config.color + '20' }]}>
          <Ionicons name={config.icon as any} size={22} color={config.color} />
        </View>
        <View style={s.docContent}>
          <Text style={s.docName} numberOfLines={1}>{item.name}</Text>
          <Text style={s.docMeta}>{formatSize(item.size)}</Text>
        </View>
        <TouchableOpacity onPress={() => handleToggleFavorite(item)} style={s.favBtn}>
          <Ionicons
            name={item.favorite ? 'star' : 'star-outline'}
            size={18}
            color={item.favorite ? '#F59E0B' : colors.textSecondary}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={documents}
        keyExtractor={item => item.id}
        renderItem={renderDoc}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={s.header}>
              <Text style={s.title}>{t('documents', 'title')}</Text>
              <View style={s.headerActions}>
                <TouchableOpacity style={s.iconBtn} onPress={() => openFolderModal()}>
                  <Ionicons name="folder-open-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.addButton} onPress={openNewDoc}>
                  <Ionicons name="add" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* View tabs */}
            <View style={s.viewTabs}>
              {VIEW_TABS.map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.viewTab, viewTab === tab.key && s.viewTabActive]}
                  onPress={() => setViewTab(tab.key)}
                >
                  <Ionicons
                    name={tab.icon as any}
                    size={16}
                    color={viewTab === tab.key ? '#fff' : colors.textSecondary}
                  />
                  <Text style={[s.viewTabText, viewTab === tab.key && s.viewTabTextActive]}>
                    {t('documents', tab.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search */}
            <TextInput
              style={[s.searchInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder={t('documents', 'search')}
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
            />

            {/* Folders horizontal */}
            {viewTab === 'all' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.folderRow}>
                {selectedFolder && (
                  <TouchableOpacity style={s.folderChip} onPress={() => setSelectedFolder(null)}>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                    <Text style={s.folderChipText}>{t('documents', 'allFiles')}</Text>
                  </TouchableOpacity>
                )}
                {folders.map(f => (
                  <TouchableOpacity
                    key={f.id}
                    style={[s.folderChip, selectedFolder === f.id && { backgroundColor: f.color + '30', borderColor: f.color }]}
                    onPress={() => setSelectedFolder(f.id === selectedFolder ? null : f.id)}
                    onLongPress={() => {
                      Alert.alert(f.name, '', [
                        { text: t('documents', 'editFolder'), onPress: () => openFolderModal(f) },
                        { text: t('documents', 'deleteFolder'), style: 'destructive' as const, onPress: () => handleDeleteFolder(f) },
                        { text: t('common', 'cancel'), style: 'cancel' as const },
                      ]);
                    }}
                  >
                    <Ionicons name={f.icon as any} size={16} color={selectedFolder === f.id ? f.color : colors.textSecondary} />
                    <Text style={[s.folderChipText, selectedFolder === f.id && { color: f.color }]}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="document-outline" size={48} color={colors.textSecondary} />
            <Text style={s.emptyText}>{t('documents', 'noDocuments')}</Text>
            <TouchableOpacity style={s.emptyAction} onPress={openNewDoc}>
              <Text style={s.emptyActionText}>{t('documents', 'newDocument')}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Document editor modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={s.modalCancel}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>
                {editingDoc ? t('documents', 'editFolder') : t('documents', 'newDocument')}
              </Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={s.modalSave}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('documents', 'namePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formName}
                onChangeText={setFormName}
              />
              {editingDoc && (
                <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(editingDoc)}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  <Text style={s.deleteBtnText}>{t('common', 'delete')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Folder modal */}
      <Modal visible={folderModalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setFolderModalVisible(false)}>
                <Text style={s.modalCancel}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>
                {editingFolder ? t('documents', 'editFolder') : t('documents', 'newFolder')}
              </Text>
              <TouchableOpacity onPress={handleSaveFolder}>
                <Text style={s.modalSave}>{t('common', 'save')}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder={t('documents', 'folderNamePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={formFolderName}
                onChangeText={setFormFolderName}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any, insets: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  viewTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  viewTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, gap: 4 },
  viewTabActive: { backgroundColor: colors.primary },
  viewTabText: { fontSize: 13, color: colors.textSecondary },
  viewTabTextActive: { color: '#fff', fontWeight: '600' },
  searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  folderRow: { flexDirection: 'row', marginBottom: 12 },
  folderChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginRight: 8, gap: 4 },
  folderChipText: { fontSize: 13, color: colors.textSecondary },
  docCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8 },
  docIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  docContent: { flex: 1 },
  docName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  docMeta: { fontSize: 12, color: colors.textSecondary },
  favBtn: { padding: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12, marginBottom: 16 },
  emptyAction: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.primary },
  emptyActionText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  modalCancel: { fontSize: 16, color: colors.textSecondary },
  modalSave: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  modalBody: { padding: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FEE2E2', marginTop: 8 },
  deleteBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
});
