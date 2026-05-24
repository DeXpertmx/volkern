import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, Alert, AlertButton, RefreshControl, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { teamService, TeamMember, TeamRole, TEAM_ROLES, TEAM_ROLE_COLORS } from '../../src/services/team';


const ROLE_ICONS: Record<TeamRole, string> = {
  owner: 'shield-checkmark-outline',
  admin: 'shield-checkmark-outline',
  manager: 'briefcase-outline',
  member: 'create-outline',
  viewer: 'eye-outline',
};

const AVATAR_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6'];

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function TeamScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<TeamRole | 'all'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Form
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<TeamRole>('viewer');
  const [editPhone, setEditPhone] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await teamService.getAll();
      setMembers(data);
    } catch (e) {
      console.error('Error loading team:', e);
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

  const filteredMembers = useMemo(() => {
    let result = members;
    if (roleFilter !== 'all') result = result.filter(m => m.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.department && m.department.toLowerCase().includes(q))
      );
    }
    return result;
  }, [members, roleFilter, search]);

  const stats = useMemo(() => {
    const total = members.length;
    const active = members.filter(m => m.status === 'active').length;
    const invited = members.filter(m => m.status === 'invited').length;
    const suspended = members.filter(m => m.status === 'suspended').length;
    return { total, active, invited, suspended };
  }, [members]);

  const openNewMember = () => {
    setEditingMember(null);
    setEditName('');
    setEditEmail('');
    setEditRole('viewer');
    setEditPhone('');
    setEditDepartment('');
    setModalVisible(true);
  };

  const openEditMember = (member: TeamMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditPhone(member.phone || '');
    setEditDepartment(member.department || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!editName.trim() || !editEmail.trim()) {
      Alert.alert(t('common', 'error'), t('team', 'requiredFields'));
      return;
    }
    setSaving(true);
    try {
      const memberData = {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        role: editRole,
        phone: editPhone.trim() || undefined,
        department: editDepartment.trim() || undefined,
      };
      if (editingMember) {
        await teamService.update(editingMember.id, memberData);
      } else {
        await teamService.create(memberData);
      }
      setModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert(t('common', 'error'), t('common', 'unexpectedError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (member: TeamMember) => {
    Alert.alert(
      t('team', 'deleteConfirm'),
      t('team', 'deleteMemberConfirm', { name: member.name }),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        { text: t('common', 'delete'), style: 'destructive', onPress: async () => {
          await teamService.delete(member.id);
          loadData();
        }},
      ]
    );
  };

  const handleResendInvite = async (member: TeamMember) => {
    await teamService.resendInvite(member.id);
    Alert.alert(t('common', 'success'), t('team', 'inviteResent'));
  };

  const handleToggleStatus = async (member: TeamMember) => {
    const newStatus = member.status === 'active' ? 'suspended' : 'active';
    await teamService.updateStatus(member.id, newStatus);
    loadData();
  };

  const renderMember = ({ item }: { item: TeamMember }) => {
    const avatarColor = getAvatarColor(item.id);
    const roleColor = TEAM_ROLE_COLORS[item.role];
    const isInvited = item.status === 'invited';
    return (
      <TouchableOpacity
        style={[s.card, isInvited && { opacity: 0.7 }]}
        onPress={() => openEditMember(item)}
        onLongPress={() => {
          Alert.alert(
            item.name,
            undefined,
            [
              { text: t('team', 'edit'), onPress: () => openEditMember(item) } as AlertButton,
              ...(item.role !== 'owner' ? [
                { text: item.status === 'active' ? t('team', 'suspend') : t('team', 'activate'),
                  onPress: () => handleToggleStatus(item) } as AlertButton,
                { text: t('common', 'delete'), style: 'destructive' as const, onPress: () => handleDelete(item) } as AlertButton,
              ] : []),
              { text: t('common', 'cancel'), style: 'cancel' as const },
            ]
          );
        }}
        activeOpacity={0.7}
      >
        <View style={s.cardRow}>
          <View style={[s.avatar, { backgroundColor: avatarColor }]}>
            <Text style={s.avatarText}>{getInitials(item.name)}</Text>
            {isInvited && <View style={s.inviteDot} />}
          </View>
          <View style={s.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.memberName}>{item.name}</Text>
              {item.role === 'owner' && <Ionicons name="shield-checkmark" size={14} color="#EAB308" />}
            </View>
            <Text style={s.memberEmail}>{item.email}</Text>
            {item.department && <Text style={s.memberDept}>{item.department}</Text>}
          </View>
          <View style={[s.roleBadge, { backgroundColor: roleColor + '20' }]}>
            <Ionicons name={ROLE_ICONS[item.role] as any} size={13} color={roleColor} />
            <Text style={[s.roleText, { color: roleColor }]}>
              {t('team', `role${item.role.charAt(0).toUpperCase() + item.role.slice(1)}`)}
            </Text>
          </View>
        </View>
        {isInvited && (
          <View style={s.inviteBanner}>
            <Ionicons name="mail-outline" size={14} color={colors.warning} />
            <Text style={[s.inviteText, { color: colors.warning }]}>{t('team', 'pendingInvite')}</Text>
            <TouchableOpacity onPress={() => handleResendInvite(item)}>
              <Text style={[s.resendLink, { color: colors.primary }]}>{t('team', 'resend')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {item.lastActive && (
          <Text style={s.lastActive}>
            {t('team', 'lastActive')}:            {new Date(item.lastActive).toLocaleDateString((locale as string).startsWith('es') ? 'es-MX' : 'en-US', {
              month: 'short', day: 'numeric',
            })}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>{t('team', 'title')}</Text>
      </View>

      {/* Stats */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statsScroll}>
        <View style={[s.statCard, { backgroundColor: colors.success + '15' }]}>
          <Text style={[s.statValue, { color: colors.success }]}>{stats.active}</Text>
          <Text style={s.statLabel}>{t('team', 'active')}</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: colors.warning + '15' }]}>
          <Text style={[s.statValue, { color: colors.warning }]}>{stats.invited}</Text>
          <Text style={s.statLabel}>{t('team', 'invited')}</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: colors.textTertiary + '20' }]}>
          <Text style={[s.statValue, { color: colors.textSecondary }]}>{stats.suspended}</Text>
          <Text style={s.statLabel}>{t('team', 'suspended')}</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats.total}</Text>
          <Text style={s.statLabel}>{t('team', 'total')}</Text>
        </View>
      </ScrollView>

      {/* Search */}          <View style={s.searchBar}>
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

      {/* Role Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
        {(['all', ...TEAM_ROLES] as const).map(r => (
          <TouchableOpacity
            key={r}
            style={[s.filterChip, roleFilter === r && { backgroundColor: (r === 'all' ? colors.primary : TEAM_ROLE_COLORS[r]) + '20', borderColor: r === 'all' ? colors.primary : TEAM_ROLE_COLORS[r] }]}
            onPress={() => setRoleFilter(r)}
          >
            {r !== 'all' && <Ionicons name={ROLE_ICONS[r] as any} size={14} color={roleFilter === r ? TEAM_ROLE_COLORS[r] : colors.textTertiary} style={{ marginRight: 4 }} />}
            <Text style={[s.filterText, { color: roleFilter === r ? (r === 'all' ? colors.primary : TEAM_ROLE_COLORS[r]) : colors.textSecondary }]}>
              {r === 'all' ? t('common', 'all') : t('team', `role${r.charAt(0).toUpperCase() + r.slice(1)}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filteredMembers}
        keyExtractor={item => item.id}
        renderItem={renderMember}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textTertiary} />
            <Text style={s.emptyTitle}>{t('team', 'noMembers')}</Text>
            <Text style={s.emptySub}>{search ? '' : t('team', 'noMembersSub')}</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={[s.fab, { backgroundColor: colors.primary }]} onPress={openNewMember} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editingMember ? t('team', 'editMember') : t('team', 'inviteMember')}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>{t('team', 'name')} *</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editName}
                onChangeText={setEditName}
                placeholder={t('team', 'namePlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={s.fieldLabel}>{t('team', 'email')} *</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="email@ejemplo.com"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={s.fieldLabel}>{t('team', 'phone')}</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="+52 55 1234 5678"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
              />

              <Text style={s.fieldLabel}>{t('team', 'department')}</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={editDepartment}
                onChangeText={setEditDepartment}
                placeholder={t('team', 'deptPlaceholder')}
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={s.fieldLabel}>{t('team', 'role')}</Text>
              {TEAM_ROLES.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[s.roleOption, editRole === r && { backgroundColor: TEAM_ROLE_COLORS[r] + '15', borderColor: TEAM_ROLE_COLORS[r] }]}
                  onPress={() => setEditRole(r)}
                  disabled={!!editingMember && r === 'owner' && editingMember.role !== 'owner'}
                >
                  <Ionicons name={ROLE_ICONS[r] as any} size={20} color={editRole === r ? TEAM_ROLE_COLORS[r] : colors.textTertiary} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[s.roleOptionTitle, { color: editRole === r ? TEAM_ROLE_COLORS[r] : colors.textPrimary }]}>
                      {t('team', `role${r.charAt(0).toUpperCase() + r.slice(1)}`)}
                    </Text>
                    <Text style={s.roleOptionDesc}>
                      {t('team', `role${r.charAt(0).toUpperCase() + r.slice(1)}Desc`)}
                    </Text>
                  </View>
                  {editRole === r && <Ionicons name="checkmark-circle" size={22} color={TEAM_ROLE_COLORS[r]} />}
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.saveBtnText}>{editingMember ? t('common', 'save') : t('team', 'sendInvite')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  statsScroll: { paddingLeft: 20, marginBottom: 12 },
  statCard: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, marginRight: 10, minWidth: 100, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, marginBottom: 8, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontSize: 15, marginLeft: 8 },
  filterScroll: { paddingLeft: 20, marginBottom: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', marginRight: 8 },
  filterText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  card: { borderRadius: 14, padding: 16, marginBottom: 10, backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  inviteDot: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.warning, borderWidth: 2, borderColor: colors.surface },
  cardInfo: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  memberEmail: { fontSize: 13, color: colors.textTertiary, marginTop: 1 },
  memberDept: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  roleText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  inviteBanner: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border + '40' },
  inviteText: { fontSize: 13, marginLeft: 6, flex: 1 },
  resendLink: { fontSize: 13, fontWeight: '600' },
  lastActive: { fontSize: 11, color: colors.textTertiary, marginTop: 6 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: 12 },
  emptySub: { fontSize: 14, color: colors.textTertiary, marginTop: 4, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 15, borderWidth: 1 },
  roleOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  roleOptionTitle: { fontSize: 15, fontWeight: '600' },
  roleOptionDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  saveBtn: { borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 24, marginBottom: 40 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
