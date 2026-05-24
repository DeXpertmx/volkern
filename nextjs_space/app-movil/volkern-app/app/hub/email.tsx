import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, Alert, RefreshControl, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { emailService, EmailMessage, EmailFolder, EmailAttachment } from '../../src/services/email';

const FOLDERS: { key: EmailFolder; icon: string; label: string }[] = [
  { key: 'inbox', icon: 'mail-outline', label: 'inbox' },
  { key: 'sent', icon: 'send-outline', label: 'sent' },
  { key: 'drafts', icon: 'document-text-outline', label: 'drafts' },
  { key: 'starred', icon: 'star-outline', label: 'starred' },
  { key: 'archived', icon: 'archive-outline', label: 'archived' },
  { key: 'trash', icon: 'trash-outline', label: 'trash' },
];

export default function EmailScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<EmailFolder>('inbox');
  const [composeVisible, setComposeVisible] = useState(false);
  const [viewingMessage, setViewingMessage] = useState<EmailMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<EmailMessage[]>([]);

  // Compose form
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    try {
      await emailService.seedIfEmpty();
      const data = await emailService.getAll();
      setMessages(data);
    } catch (e) {
      console.error('Error loading email:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const folderMessages = useMemo(() => {
    let filtered = messages;
    if (activeFolder === 'starred') {
      filtered = filtered.filter(m => m.isStarred);
    } else {
      filtered = filtered.filter(m => m.folder === activeFolder);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(m =>
        m.subject.toLowerCase().includes(q) ||
        m.from.name.toLowerCase().includes(q) ||
        m.from.email.toLowerCase().includes(q) ||
        m.bodyPreview.toLowerCase().includes(q)
      );
    }
    return filtered.sort((a, b) => b.receivedAt - a.receivedAt);
  }, [messages, activeFolder, search]);

  const stats = useMemo(() => {
    const unread = messages.filter(m => !m.isRead && m.folder === 'inbox').length;
    const total = messages.length;
    const drafts = messages.filter(m => m.folder === 'drafts').length;
    const starred = messages.filter(m => m.isStarred).length;
    return { unread, total, drafts, starred };
  }, [messages]);

  const openMessage = async (msg: EmailMessage) => {
    setViewingMessage(msg);
    const thread = await emailService.getThread(msg.threadId);
    setThreadMessages(thread);
    // Auto mark as read
    if (!msg.isRead) {
      await emailService.markRead(msg.id);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRead: true } : m));
    }
  };

  const handleToggleStar = async (msg: EmailMessage) => {
    const newStarred = await emailService.toggleStar(msg.id);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isStarred: newStarred } : m));
  };

  const handleDelete = (msg: EmailMessage) => {
    Alert.alert(
      t('email', 'deleteConfirm'),
      undefined,
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        { text: t('common', 'delete'), style: 'destructive', onPress: async () => {
          await emailService.delete(msg.id);
          if (viewingMessage?.id === msg.id) setViewingMessage(null);
          loadData();
        }},
      ]
    );
  };

  const handleMoveFolder = async (msg: EmailMessage, folder: EmailFolder) => {
    await emailService.moveToFolder(msg.id, folder);
    if (viewingMessage?.id === msg.id) setViewingMessage(null);
    loadData();
  };

  const handleSend = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      Alert.alert(t('common', 'error'), t('email', 'requiredFields'));
      return;
    }
    setSending(true);
    try {
      await emailService.send({
        from: { name: 'Yo', email: 'yo@volkern.com' },
        to: composeTo.split(',').map(e => ({ name: e.trim(), email: e.trim() })),
        cc: [],
        bcc: [],
        subject: composeSubject.trim(),
        body: composeBody,
        bodyPreview: composeBody.slice(0, 100),
        attachments: [],
        labels: [],
        sentAt: Date.now(),
      });
      setComposeVisible(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      Alert.alert(t('common', 'success'), t('email', 'sent'));
      loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('common', 'unexpectedError'));
    } finally {
      setSending(false);
    }
  };

  const formatDate = (ts: number) => {
    const now = Date.now();
    const diff = now - ts;
    if (diff < 86400000) return new Date(ts).toLocaleTimeString((locale as string).startsWith('es') ? 'es-MX' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return new Date(ts).toLocaleDateString((locale as string).startsWith('es') ? 'es-MX' : 'en-US', { weekday: 'short' });
    return new Date(ts).toLocaleDateString((locale as string).startsWith('es') ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric' });
  };

  const renderMessage = ({ item }: { item: EmailMessage }) => (
    <TouchableOpacity
      style={[s.messageCard, !item.isRead && s.unreadCard]}
      onPress={() => openMessage(item)}
      onLongPress={() => {
        Alert.alert(
          item.subject,
          undefined,
          [
            { text: item.isStarred ? t('email', 'unstar') : t('email', 'star'), onPress: () => handleToggleStar(item) },
            { text: t('email', item.isRead ? 'markUnread' : 'markRead'), onPress: async () => {
              if (item.isRead) { await emailService.markUnread(item.id); }
              else { await emailService.markRead(item.id); }
              loadData();
            }},
            ...FOLDERS.filter(f => f.key !== item.folder && f.key !== 'starred').map(f => ({
              text: t('email', `moveTo${f.key.charAt(0).toUpperCase() + f.key.slice(1)}` as any),
              onPress: () => handleMoveFolder(item, f.key),
            })),
            { text: t('common', 'delete'), style: 'destructive', onPress: () => handleDelete(item) },
            { text: t('common', 'cancel'), style: 'cancel' },
          ]
        );
      }}
      activeOpacity={0.7}
    >
      <View style={s.messageRow}>
        <View style={[s.avatarSmall, { backgroundColor: getAvatarColor(item.from.email) }]}>
          <Text style={s.avatarSmallText}>{item.from.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={s.messageContent}>
          <View style={s.messageHeader}>
            <Text style={[s.senderName, !item.isRead && { fontWeight: '700' }]} numberOfLines={1}>
              {item.from.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {item.isStarred && <Ionicons name="star" size={12} color="#EAB308" />}
              {item.attachments.length > 0 && <Ionicons name="attach" size={12} color={colors.textTertiary} />}
              <Text style={s.messageDate}>{formatDate(item.receivedAt)}</Text>
            </View>
          </View>
          <Text style={[s.subject, !item.isRead && { fontWeight: '600' }]} numberOfLines={1}>
            {item.subject}
          </Text>
          <Text style={s.preview} numberOfLines={2}>{item.bodyPreview}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (viewingMessage) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.detailHeader}>
          <TouchableOpacity onPress={() => setViewingMessage(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t('common', 'back')}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => handleToggleStar(viewingMessage)}>
              <Ionicons name={viewingMessage.isStarred ? 'star' : 'star-outline'} size={22} color={viewingMessage.isStarred ? '#EAB308' : colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(viewingMessage)}>
              <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView contentContainerStyle={s.detailContent}>
          <Text style={s.detailSubject}>{viewingMessage.subject}</Text>
          <View style={[s.detailFrom, { backgroundColor: getAvatarColor(viewingMessage.from.email) }]}>
            <Text style={s.detailAvatarText}>{viewingMessage.from.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={s.detailSenderName}>{viewingMessage.from.name}</Text>
          <Text style={s.detailSenderEmail}>{viewingMessage.from.email}</Text>
          <Text style={s.detailDate}>
            {new Date(viewingMessage.receivedAt).toLocaleDateString((locale as string).startsWith('es') ? 'es-MX' : 'en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </Text>
          {viewingMessage.attachments.length > 0 && (
            <View style={s.attachmentRow}>
              {viewingMessage.attachments.map((att, i) => (
                <View key={att.id} style={[s.attachmentBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="document-attach-outline" size={16} color={colors.textSecondary} />
                  <Text style={s.attachmentName} numberOfLines={1}>{att.name}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={s.divider} />
          <Text style={s.detailBody}>{viewingMessage.body}</Text>

          {/* Thread replies */}
          {threadMessages.length > 1 && (
            <>
              <View style={s.threadDivider}>
                <Text style={s.threadCount}>
                  {threadMessages.length} {t('email', 'messagesInThread')}
                </Text>
              </View>
              {threadMessages.filter(m => m.id !== viewingMessage.id).map(msg => (
                <TouchableOpacity key={msg.id} style={s.threadMsg} onPress={() => setViewingMessage(msg)}>
                  <Text style={s.threadSender}>{msg.from.name}</Text>
                  <Text style={s.threadBody} numberOfLines={3}>{msg.body}</Text>
                  <Text style={s.threadDate}>{formatDate(msg.receivedAt)}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>

        {/* Reply bar */}
        <View style={[s.replyBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity style={[s.replyBtn, { backgroundColor: colors.primary }]} onPress={() => {
            setComposeTo(viewingMessage.from.email);
            setComposeSubject(`Re: ${viewingMessage.subject}`);
            setComposeBody('');
            setViewingMessage(null);
            setComposeVisible(true);
          }}>
            <Ionicons name="arrow-undo" size={18} color="#fff" />
            <Text style={s.replyBtnText}>{t('email', 'reply')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>{t('email', 'title')}</Text>
          {stats.unread > 0 && (
            <Text style={s.unreadBadge}>{stats.unread} {t('email', 'unread')}</Text>
          )}
        </View>
      </View>

      {/* Stats bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statsScroll}>
        <View style={[s.statChip, { backgroundColor: colors.primary + '15' }]}>
          <Ionicons name="mail-unread-outline" size={16} color={colors.primary} />
          <Text style={[s.statChipText, { color: colors.primary }]}>{stats.unread} {t('email', 'unread').toLowerCase()}</Text>
        </View>              <View style={[s.statChip, { backgroundColor: colors.surface }]}>
          <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
          <Text style={[s.statChipText, { color: colors.textSecondary }]}>{stats.total} {t('common', 'total').toLowerCase()}</Text>
        </View>
        <View style={[s.statChip, { backgroundColor: colors.warning + '15' }]}>
          <Ionicons name="document-text-outline" size={16} color={colors.warning} />
          <Text style={[s.statChipText, { color: colors.warning }]}>{stats.drafts} {t('email', 'drafts').toLowerCase()}</Text>
        </View>
      </ScrollView>

      {/* Folder tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.folderScroll}>
        {FOLDERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.folderTab, activeFolder === f.key && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
            onPress={() => setActiveFolder(f.key)}
          >
            <Ionicons
              name={activeFolder === f.key ? (f.icon.replace('-outline', '') as any) : f.icon}
              size={18}
              color={activeFolder === f.key ? colors.primary : colors.textSecondary}
            />
            <Text style={[s.folderText, { color: activeFolder === f.key ? colors.primary : colors.textSecondary }]}>
              {t('email', f.label)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={[s.searchInput, { color: colors.textPrimary }]}
          placeholder={t('common', 'search')}
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Messages */}
      <FlatList
        data={folderMessages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="mail-open-outline" size={48} color={colors.textTertiary} />
            <Text style={s.emptyTitle}>{t('email', 'emptyFolder')}</Text>
            <Text style={s.emptySub}>{search ? '' : t('email', 'emptyFolderSub')}</Text>
          </View>
        }
      />

      {/* FAB - Compose */}
      <TouchableOpacity style={[s.fab, { backgroundColor: colors.primary }]} onPress={() => {
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
        setComposeVisible(true);
      }} activeOpacity={0.8}>
        <Ionicons name="pencil" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Compose Modal */}
      <Modal visible={composeVisible} animationType="slide" transparent onRequestClose={() => setComposeVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setComposeVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>{t('email', 'compose')}</Text>
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: colors.primary, opacity: sending ? 0.6 : 1 }]}
                onPress={handleSend}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.sendBtnText}>{t('email', 'send')}</Text>
                )}
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TextInput
                style={[s.composeInput, { color: colors.textPrimary, borderBottomColor: colors.border }]}
                value={composeTo}
                onChangeText={setComposeTo}
                placeholder={t('email', 'toPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={[s.composeInput, { color: colors.textPrimary, borderBottomColor: colors.border }]}
                value={composeSubject}
                onChangeText={setComposeSubject}
                placeholder={t('email', 'subjectPlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />
              <TextInput
                style={[s.composeBodyInput, { color: colors.textPrimary }]}
                value={composeBody}
                onChangeText={setComposeBody}
                placeholder={t('email', 'bodyPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getAvatarColor(email: string): string {
  const colorsArr = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colorsArr[Math.abs(hash) % colorsArr.length];
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  unreadBadge: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 2 },
  statsScroll: { paddingLeft: 20, marginBottom: 8 },
  statChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, gap: 6 },
  statChipText: { fontSize: 13, fontWeight: '600' },
  folderScroll: { paddingLeft: 20, marginBottom: 8 },
  folderTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', marginRight: 8, gap: 6 },
  folderText: { fontSize: 13, fontWeight: '600' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 15, marginLeft: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  messageCard: { borderRadius: 14, padding: 14, marginBottom: 8, backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  messageRow: { flexDirection: 'row', gap: 12 },
  avatarSmall: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  avatarSmallText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  messageContent: { flex: 1 },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  senderName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  messageDate: { fontSize: 11, color: colors.textTertiary },
  subject: { fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
  preview: { fontSize: 13, color: colors.textTertiary, lineHeight: 18 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: 12 },
  emptySub: { fontSize: 14, color: colors.textTertiary, marginTop: 4, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  composeInput: { paddingHorizontal: 20, paddingVertical: 14, fontSize: 15, borderBottomWidth: 1 },
  composeBodyInput: { paddingHorizontal: 20, paddingVertical: 14, fontSize: 15, minHeight: 200 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border + '40' },
  detailContent: { padding: 20, paddingBottom: 100 },
  detailSubject: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  detailFrom: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  detailAvatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  detailSenderName: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  detailSenderEmail: { fontSize: 14, color: colors.textTertiary, marginBottom: 4 },
  detailDate: { fontSize: 13, color: colors.textTertiary, marginBottom: 16 },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  attachmentBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, gap: 6 },
  attachmentName: { fontSize: 12, color: colors.textSecondary, maxWidth: 120 },
  divider: { height: 1, backgroundColor: colors.border + '40', marginVertical: 16 },
  detailBody: { fontSize: 15, color: colors.textPrimary, lineHeight: 24 },
  threadDivider: { marginTop: 24, marginBottom: 12, borderTopWidth: 1, borderTopColor: colors.border + '40', paddingTop: 12 },
  threadCount: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  threadMsg: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border + '20' },
  threadSender: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  threadBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  threadDate: { fontSize: 11, color: colors.textTertiary },
  replyBar: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, gap: 8 },
  replyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
