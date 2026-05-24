import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { contactsService, type Contact, type Interaction, type InteractionType } from '../../src/services/contacts';

// ─── Interaction type config ──────────────────────────────────────────────────

const INTERACTION_OPTIONS: { key: InteractionType; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'call', icon: 'call', color: '#10B981' },
  { key: 'email', icon: 'mail', color: '#3B82F6' },
  { key: 'meeting', icon: 'people', color: '#8B5CF6' },
  { key: 'note', icon: 'document-text', color: '#F59E0B' },
  { key: 'message', icon: 'chatbubble', color: '#EC4899' },
];

const SOURCE_OPTIONS: { key: Contact['source']; labelKey: string }[] = [
  { key: 'manual', labelKey: 'sourceManual' },
  { key: 'import', labelKey: 'sourceImport' },
  { key: 'lead', labelKey: 'sourceLead' },
];

function getInteractionConfig(type: InteractionType) {
  return INTERACTION_OPTIONS.find((o) => o.key === type) || INTERACTION_OPTIONS[3];
}

const INTERACTION_TYPE_KEYS: Record<InteractionType, string> = {
  call: 'typeCall',
  email: 'typeEmail',
  meeting: 'typeMeeting',
  note: 'typeNote',
  message: 'typeMessage',
};

const SOURCE_KEYS: Record<Contact['source'], string> = {
  manual: 'sourceManual',
  import: 'sourceImport',
  lead: 'sourceLead',
};

// ─── Interaction Item ─────────────────────────────────────────────────────────

function InteractionItem({ interaction, colors, sty, onDelete }: {
  interaction: Interaction;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const config = getInteractionConfig(interaction.type);
  const date = new Date(interaction.timestamp);
  const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[sty.interactionItem, { backgroundColor: colors.background }]}>
      <View style={[sty.interactionIcon, { backgroundColor: config.color + '15' }]}>
        <Ionicons name={config.icon} size={16} color={config.color} />
      </View>
      <View style={sty.interactionInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={[sty.interactionType, { color: config.color }]}>
            {t('contacts', INTERACTION_TYPE_KEYS[interaction.type])}
          </Text>
          <Text style={[sty.interactionDate, { color: colors.textTertiary }]}>{dateStr}</Text>
        </View>
        {interaction.notes ? (
          <Text style={[sty.interactionNotes, { color: colors.textSecondary }]}>{interaction.notes}</Text>
        ) : null}
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={18} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Contact Card ─────────────────────────────────────────────────────────────

function ContactCard({ contact, colors, sty, onPress }: {
  contact: Contact;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const initials = contact.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <TouchableOpacity
      style={[sty.contactCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[sty.contactAvatar, { backgroundColor: colors.primaryBg }]}>
        <Text style={[sty.contactInitials, { color: colors.primary }]}>{initials}</Text>
      </View>
      <View style={sty.contactInfo}>
        <Text style={[sty.contactName, { color: colors.textPrimary }]} numberOfLines={1}>{contact.name}</Text>
        {contact.company ? (
          <Text style={[sty.contactMeta, { color: colors.textTertiary }]} numberOfLines={1}>
            {contact.company}{contact.position ? ` — ${contact.position}` : ''}
          </Text>
        ) : contact.position ? (
          <Text style={[sty.contactMeta, { color: colors.textTertiary }]} numberOfLines={1}>{contact.position}</Text>
        ) : (
          <Text style={[sty.contactMeta, { color: colors.textTertiary }]} numberOfLines={1}>{contact.email || contact.phone}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ContactsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Record<string, Interaction[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formPosition, setFormPosition] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTagsText, setFormTagsText] = useState('');
  const [formSource, setFormSource] = useState<Contact['source']>('manual');

  // Interaction modal
  const [showIntModal, setShowIntModal] = useState(false);
  const [intContactId, setIntContactId] = useState<string | null>(null);
  const [intType, setIntType] = useState<InteractionType>('note');
  const [intNotes, setIntNotes] = useState('');

  const [saving, setSaving] = useState(false);

  // ─── Load data ───────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const allContacts = await contactsService.getAll();
      setContacts(allContacts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Load interactions for expanded contact ──────────────────────────
  const loadInteractions = useCallback(async (contactId: string) => {
    const ints = await contactsService.getInteractions(contactId);
    setInteractions((prev) => ({ ...prev, [contactId]: ints }));
  }, []);

  // ─── Pull to refresh ─────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // ─── Search / Filter ─────────────────────────────────────────────────
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const lower = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.phone.includes(searchQuery) ||
        c.email.toLowerCase().includes(lower) ||
        c.company.toLowerCase().includes(lower) ||
        c.tags.some((tag) => tag.toLowerCase().includes(lower)),
    );
  }, [contacts, searchQuery]);

  // ─── Open create modal ───────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditingContact(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormCompany('');
    setFormPosition('');
    setFormNotes('');
    setFormTagsText('');
    setFormSource('manual');
    setShowModal(true);
  }, []);

  // ─── Open edit modal ─────────────────────────────────────────────────
  const openEdit = useCallback((contact: Contact) => {
    setEditingContact(contact);
    setFormName(contact.name);
    setFormPhone(contact.phone);
    setFormEmail(contact.email);
    setFormCompany(contact.company);
    setFormPosition(contact.position);
    setFormNotes(contact.notes);
    setFormTagsText(contact.tags.join(', '));
    setFormSource(contact.source);
    setShowModal(true);
  }, []);

  // ─── Save contact ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!formName.trim()) {
      Alert.alert(t('common', 'error'), t('contacts', 'nameRequired'));
      return;
    }
    const tags = formTagsText.split(',').map((s) => s.trim()).filter(Boolean);

    setSaving(true);
    try {
      if (editingContact) {
        await contactsService.update(editingContact.id, {
          name: formName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          company: formCompany.trim(),
          position: formPosition.trim(),
          notes: formNotes.trim(),
          tags,
          source: formSource,
        });
      } else {
        await contactsService.create({
          name: formName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          company: formCompany.trim(),
          position: formPosition.trim(),
          notes: formNotes.trim(),
          tags,
          source: formSource,
        });
      }
      setShowModal(false);
      await loadData();
    } catch {
      Alert.alert(t('common', 'error'), t('contacts', 'saveError'));
    } finally {
      setSaving(false);
    }
  }, [formName, formPhone, formEmail, formCompany, formPosition, formNotes, formTagsText, formSource, editingContact, t, loadData]);

  // ─── Delete contact ──────────────────────────────────────────────────
  const handleDelete = useCallback((contact: Contact) => {
    Alert.alert(
      t('contacts', 'deleteConfirm'),
      t('contacts', 'deleteContactConfirm', { name: contact.name }),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            await contactsService.delete(contact.id);
            await loadData();
          },
        },
      ],
    );
  }, [t, loadData]);

  // ─── Expand contact ──────────────────────────────────────────────────
  const handleExpand = useCallback(async (contactId: string) => {
    if (expandedId === contactId) {
      setExpandedId(null);
    } else {
      setExpandedId(contactId);
      if (!interactions[contactId]) {
        await loadInteractions(contactId);
      }
    }
  }, [expandedId, interactions, loadInteractions]);

  // ─── Add interaction ─────────────────────────────────────────────────
  const handleAddInteraction = useCallback(async () => {
    if (!intContactId) return;
    await contactsService.addInteraction(intContactId, intType, intNotes.trim());
    setShowIntModal(false);
    setIntNotes('');
    setIntType('note');
    await loadInteractions(intContactId);
  }, [intContactId, intType, intNotes, loadInteractions]);

  // ─── Delete interaction ──────────────────────────────────────────────
  const handleDeleteInteraction = useCallback(async (interaction: Interaction) => {
    Alert.alert(
      t('contacts', 'deleteInteractionConfirm'),
      '',
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            await contactsService.deleteInteraction(interaction.id);
            if (interactions[interaction.contactId]) {
              const updated = await contactsService.getInteractions(interaction.contactId);
              setInteractions((prev) => ({ ...prev, [interaction.contactId]: updated }));
            }
          },
        },
      ],
    );
  }, [t, interactions]);

  // ─── Styles ──────────────────────────────────────────────────────────
  const s = useMemo(() => makeStyles(colors), [colors]);

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <RNStatusBar barStyle={colors.textPrimary === '#0F172A' ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[s.headerBack, { backgroundColor: colors.background }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('contacts', 'title')}</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>{t('contacts', 'subtitle')}</Text>
        </View>
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: colors.primary }]}
          onPress={openCreate}
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[s.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[s.searchInputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            style={[s.searchInput, { color: colors.textPrimary }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('contacts', 'search')}
            placeholderTextColor={colors.textTertiary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
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
        {loading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredContacts.length === 0 ? (
          <View style={s.emptyState}>
            <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
              <Ionicons
                name={searchQuery ? 'search-outline' : 'people-outline'}
                size={40}
                color={colors.primary}
              />
            </View>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {searchQuery ? t('contacts', 'noSearchResults') : t('contacts', 'noContacts')}
            </Text>
            <Text style={[s.emptySub, { color: colors.textTertiary }]}>
              {searchQuery ? '' : t('contacts', 'noContactsSub')}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={[s.createBtn, { backgroundColor: colors.primary }]}
                onPress={openCreate}
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={s.createBtnText}>{t('contacts', 'newContact')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <Text style={[s.countText, { color: colors.textTertiary }]}>
              {t('contacts', 'totalContacts', { n: filteredContacts.length })}
            </Text>

            {filteredContacts.map((contact) => (
              <View key={contact.id}>
                <ContactCard
                  contact={contact}
                  colors={colors}
                  sty={s}
                  onPress={() => handleExpand(contact.id)}
                />

                {/* Expanded detail */}
                {expandedId === contact.id && (
                  <View style={[s.expandedCard, { backgroundColor: colors.surface }]}>
                    {/* Contact details */}
                    <View style={s.detailRow}>
                      <Ionicons name="call" size={16} color={colors.textTertiary} />
                      <Text style={[s.detailText, { color: colors.textSecondary }]}>
                        {contact.phone || t('common', 'noData')}
                      </Text>
                    </View>
                    <View style={s.detailRow}>
                      <Ionicons name="mail" size={16} color={colors.textTertiary} />
                      <Text style={[s.detailText, { color: colors.textSecondary }]}>
                        {contact.email || t('common', 'noData')}
                      </Text>
                    </View>
                    <View style={s.detailRow}>
                      <Ionicons name="business" size={16} color={colors.textTertiary} />
                      <Text style={[s.detailText, { color: colors.textSecondary }]}>
                        {contact.company || t('common', 'noData')}
                        {contact.position ? ` — ${contact.position}` : ''}
                      </Text>
                    </View>

                    {/* Tags */}
                    {contact.tags.length > 0 && (
                      <View style={s.tagsRow}>
                        {contact.tags.map((tag, i) => (
                          <View key={i} style={[s.tagChip, { backgroundColor: colors.primaryBg }]}>
                            <Text style={[s.tagText, { color: colors.primary }]}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Notes */}
                    {contact.notes ? (
                      <Text style={[s.detailNotes, { color: colors.textSecondary }]}>{contact.notes}</Text>
                    ) : null}

                    {/* Source badge */}
                    <View style={s.sourceRow}>
                      <View style={[s.sourceBadge, { backgroundColor: colors.background }]}>
                        <Text style={[s.sourceText, { color: colors.textTertiary }]}>
                          {t('contacts', 'source')}: {t('contacts', SOURCE_KEYS[contact.source] || 'sourceManual')}
                        </Text>
                      </View>
                    </View>

                    {/* Interactions */}
                    <View style={s.interactionsSection}>
                      <View style={s.interactionsHeader}>
                        <Text style={[s.interactionsTitle, { color: colors.textPrimary }]}>
                          {t('contacts', 'interactions')}
                        </Text>
                        <TouchableOpacity
                          onPress={() => { setIntContactId(contact.id); setShowIntModal(true); }}
                        >
                          <Ionicons name="add-circle" size={22} color={colors.primary} />
                        </TouchableOpacity>
                      </View>

                      {(!interactions[contact.id] || interactions[contact.id].length === 0) ? (
                        <Text style={[s.noInteractionsText, { color: colors.textTertiary }]}>
                          {t('contacts', 'noInteractionsSub')}
                        </Text>
                      ) : (
                        interactions[contact.id].map((int) => (
                          <InteractionItem
                            key={int.id}
                            interaction={int}
                            colors={colors}
                            sty={s}
                            onDelete={() => handleDeleteInteraction(int)}
                          />
                        ))
                      )}
                    </View>

                    {/* Actions */}
                    <View style={s.expandedActions}>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: colors.primaryBg }]}
                        onPress={() => openEdit(contact)}
                      >
                        <Ionicons name="pencil" size={16} color={colors.primary} />
                        <Text style={[s.actionBtnText, { color: colors.primary }]}>{t('common', 'edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: colors.errorBg }]}
                        onPress={() => handleDelete(contact)}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                        <Text style={[s.actionBtnText, { color: colors.error }]}>{t('common', 'delete')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ─── Create / Edit Modal ─────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                {editingContact ? t('contacts', 'editContact') : t('contacts', 'newContact')}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '85%' }}>
              {/* Name */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'contactName')} *</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formName}
                onChangeText={setFormName}
                placeholder={t('contacts', 'contactName')}
                placeholderTextColor={colors.textTertiary}
              />

              {/* Phone */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'phone')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formPhone}
                onChangeText={setFormPhone}
                placeholder="+52 555 123 4567"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
              />

              {/* Email */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'email')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formEmail}
                onChangeText={setFormEmail}
                placeholder="user@example.com"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {/* Company */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'company')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formCompany}
                onChangeText={setFormCompany}
                placeholder={t('contacts', 'company')}
                placeholderTextColor={colors.textTertiary}
              />

              {/* Position */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'position')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formPosition}
                onChangeText={setFormPosition}
                placeholder={t('contacts', 'position')}
                placeholderTextColor={colors.textTertiary}
              />

              {/* Notes */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'notes')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border, minHeight: 60 }]}
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder={t('contacts', 'notes')}
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={2}
              />

              {/* Tags */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'tags')}</Text>
              <TextInput
                style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={formTagsText}
                onChangeText={setFormTagsText}
                placeholder={t('contacts', 'tagPlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              {/* Source selector */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'source')}</Text>
              <View style={s.sourceSelector}>
                {SOURCE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.sourceChip, { backgroundColor: formSource === opt.key ? colors.primaryBg : colors.background, borderColor: formSource === opt.key ? colors.primary : colors.border }]}
                    onPress={() => setFormSource(opt.key)}
                  >
                    <Text style={[s.sourceChipText, { color: formSource === opt.key ? colors.primary : colors.textSecondary }]}>
                      {t('contacts', opt.labelKey as any)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Actions */}
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalCancel, { borderColor: colors.border }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSave, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.modalSaveText}>{t('common', 'save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Interaction Modal ──────────────────────────────────────────────── */}
      <Modal visible={showIntModal} animationType="fade" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.intModalContent, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitle, { color: colors.textPrimary, marginBottom: spacing.lg }]}>
              {t('contacts', 'newInteraction')}
            </Text>

            {/* Type selector */}
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'interactionType')}</Text>
            <View style={s.intTypeRow}>
              {INTERACTION_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.intTypeBtn, {
                    backgroundColor: intType === opt.key ? opt.color + '20' : colors.background,
                    borderColor: intType === opt.key ? opt.color : colors.border,
                  }]}
                  onPress={() => setIntType(opt.key)}
                >
                  <Ionicons name={opt.icon} size={18} color={intType === opt.key ? opt.color : colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Notes */}
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('contacts', 'interactionNotes')}</Text>
            <TextInput
              style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border, minHeight: 80 }]}
              value={intNotes}
              onChangeText={setIntNotes}
              placeholder={t('contacts', 'interactionNotes')}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
            />

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <TouchableOpacity
                style={[s.modalCancel, { borderColor: colors.border, flex: 1 }]}
                onPress={() => { setShowIntModal(false); setIntNotes(''); setIntType('note'); }}
              >
                <Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSave, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleAddInteraction}
              >
                <Text style={s.modalSaveText}>{t('contacts', 'newInteraction')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchBar: {
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
    },
    searchInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 40,
      borderWidth: 1,
    },
    searchInput: {
      flex: 1,
      ...typography.bodySmall,
      height: 40,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      paddingBottom: 100,
    },
    loadingContainer: {
      paddingVertical: spacing.xxxl * 2,
      alignItems: 'center',
    },
    countText: { ...typography.caption, marginBottom: spacing.sm },

    // ─── Contact Card ──────────────────────────────────────────────────
    contactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderRadius: radius.lg,
      padding: spacing.md,
      ...shadows.sm,
      marginBottom: spacing.xs,
    },
    contactAvatar: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    contactInitials: { ...typography.body, fontWeight: '700' },
    contactInfo: { flex: 1 },
    contactName: { ...typography.bodySmall, fontWeight: '600' },
    contactMeta: { ...typography.caption, marginTop: 1 },

    // ─── Expanded Card ─────────────────────────────────────────────────
    expandedCard: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
      marginBottom: spacing.md,
      marginTop: -spacing.xs,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm + 2,
    },
    detailText: { ...typography.bodySmall, flex: 1 },
    detailNotes: { ...typography.bodySmall, lineHeight: 20, marginTop: spacing.sm, fontStyle: 'italic' },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    tagChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    tagText: { fontSize: 10, fontWeight: '600' },
    sourceRow: {
      flexDirection: 'row',
      marginTop: spacing.sm,
    },
    sourceBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    sourceText: { fontSize: 10, fontWeight: '500' },

    // ─── Interactions ──────────────────────────────────────────────────
    interactionsSection: {
      marginTop: spacing.md,
    },
    interactionsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    interactionsTitle: { ...typography.bodySmall, fontWeight: '600' },
    noInteractionsText: { ...typography.caption, fontStyle: 'italic' },
    interactionItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      marginBottom: spacing.xs,
    },
    interactionIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 2,
    },
    interactionInfo: { flex: 1 },
    interactionType: { fontSize: 11, fontWeight: '600' },
    interactionDate: { fontSize: 9 },
    interactionNotes: { ...typography.caption, marginTop: 2, lineHeight: 16 },

    // ─── Actions ───────────────────────────────────────────────────────
    expandedActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    actionBtnText: { fontSize: 11, fontWeight: '600' },

    // ─── Empty State ───────────────────────────────────────────────────
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.xxxl * 2,
      paddingHorizontal: spacing.xl,
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: { ...typography.h3, textAlign: 'center' },
    emptySub: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.sm },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.xl,
    },
    createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    // ─── Source selector ───────────────────────────────────────────────
    sourceSelector: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    sourceChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    sourceChipText: { ...typography.caption, fontWeight: '500' },

    // ─── Modal ─────────────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: layout.screenPadding,
      paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding,
      maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    modalTitle: { ...typography.h3 },
    fieldLabel: {
      ...typography.caption,
      fontWeight: '600',
      marginBottom: spacing.xs,
      marginTop: spacing.md,
    },
    fieldInput: {
      borderRadius: radius.md,
      padding: spacing.md,
      ...typography.body,
      borderWidth: 1,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xl,
    },
    modalCancel: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      marginTop: spacing.md,
    },
    modalCancelText: { ...typography.body, fontWeight: '600' },
    modalSave: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.md,
    },
    modalSaveText: { ...typography.body, color: '#fff', fontWeight: '600' },

    // ─── Interaction Modal ─────────────────────────────────────────────
    intModalContent: {
      borderRadius: radius.xl,
      padding: layout.screenPadding,
      marginHorizontal: layout.screenPadding,
      marginBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding,
    },
    intTypeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    intTypeBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
    },
  });
