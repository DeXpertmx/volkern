import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/contexts/auth';
import { profileService, type FeatureUsage } from '../../src/services/profile';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { favoritesService, type FavoriteItem } from '../../src/services/favorites';
import { hubsService } from '../../src/services/hubs';
import { getIonicon } from '../../src/utils/icons';

// ─── Types ────────────────────────────────────────────────────────────────────
type ModalType = 'edit-profile' | 'change-password' | 'skill-key' | null;

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, sty }: { title: string; sty: ReturnType<typeof mStyles> }) {
  const colors = useThemeColors();
  return <Text style={[sty.sectionTitle, { color: colors.textTertiary }]}>{title}</Text>;
}

// ─── Setting Row ──────────────────────────────────────────────────────────────
function SettingRow({ icon, iconBg, iconColor, label, subtitle, right, onPress, last, sty }: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  sty: ReturnType<typeof mStyles>;
}) {
  const colors = useThemeColors();
  const Container = onPress ? TouchableOpacity : View;
  return (
    <>
      <Container style={sty.settingItem} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
        <View style={sty.settingLeft}>
          <View style={[sty.settingIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={icon} size={20} color={iconColor} />
          </View>
          <View style={sty.settingText}>
            <Text style={[sty.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
            {subtitle && <Text style={[sty.settingSub, { color: colors.textTertiary }]}>{subtitle}</Text>}
          </View>
        </View>
        {right || (onPress && <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />)}
      </Container>
      {!last && <View style={[sty.divider, { backgroundColor: colors.borderLight }]} />}
    </>
  );
}

// ─── Usage Bar ────────────────────────────────────────────────────────────────
function UsageBar({ usage, sty }: { usage: FeatureUsage; sty: ReturnType<typeof mStyles> }) {
  const colors = useThemeColors();
  const barColor = usage.status === 'exceeded' ? colors.error :
    usage.status === 'warning' ? colors.warning : colors.success;

  return (
    <View style={sty.usageItem}>
      <View style={sty.usageHeader}>
        <Text style={[sty.usageLabel, { color: colors.textSecondary }]}>{usage.label}</Text>
        <Text style={[sty.usageValue, { color: colors.textTertiary }]}>
          {usage.unlimited ? 'Ilimitado' : `${usage.current} / ${usage.limit}`}
        </Text>
      </View>
      {!usage.unlimited && (
        <View style={[sty.usageBarBg, { backgroundColor: colors.borderLight }]}>
          <View style={[sty.usageBarFill, { width: `${Math.min(usage.percentage, 100)}%`, backgroundColor: barColor }]} />
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();
  const { user, signOut, biometricAvailable, biometricEnabled, setBiometric } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const [profile, setProfile] = useState<Awaited<ReturnType<typeof profileService.getProfile>> | null>(null);
  const [subscription, setSubscription] = useState<Awaited<ReturnType<typeof profileService.getSubscriptionStatus>> | null>(null);
  const [usage, setUsage] = useState<FeatureUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [skillKey, setSkillKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [favLoading, setFavLoading] = useState(true);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [prof, sub, usageData] = await Promise.all([
        profileService.getProfile().catch(() => null),
        profileService.getSubscriptionStatus().catch(() => null),
        profileService.getUsage().catch(() => null),
      ]);
      if (prof) setProfile(prof);
      if (sub) setSubscription(sub);
      if (usageData) setUsage(usageData.usage);
    } catch { } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); loadFavorites(); }, [loadData]);

  const loadFavorites = async () => {
    try {
      setFavLoading(true);
      const items = await favoritesService.getAll();
      setFavorites(items);
    } catch { } finally {
      setFavLoading(false);
    }
  };

  const removeFav = async (item: FavoriteItem) => {
    await favoritesService.remove(item.id, item.type);
    loadFavorites();
  };

  const clearAllFavs = () => {
    Alert.alert(t('favorites', 'clearAll'), t('favorites', 'clearAllConfirm'), [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => { await favoritesService.clearAll(); loadFavorites(); } },
    ]);
  };

  const handleLogout = () => {
    Alert.alert(t('profile', 'logout'), t('profile', 'logoutConfirm'), [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('profile', 'logout'), style: 'destructive', onPress: async () => { setIsLoggingOut(true); await signOut(); } },
    ]);
  };

  const handleBiometricToggle = async (value: boolean) => {
    if (value && !biometricEnabled) await setBiometric(true);
    else await setBiometric(false);
  };

  const openEditProfile = () => {
    setEditName(profile?.name || user?.name || '');
    setEditPhone(profile?.telefono || user?.phone || '');
    setActiveModal('edit-profile');
  };

  const saveProfile = async () => {
    try {
      await profileService.updateProfile({ name: editName, telefono: editPhone });
      setActiveModal(null);
      loadData(true);
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message || t('common', 'errorOccurred'));
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) { Alert.alert(t('common', 'error'), t('common', 'required')); return; }
    if (newPassword !== confirmPassword) { Alert.alert(t('common', 'error'), t('profile', 'passwordsNoMatch')); return; }
    if (newPassword.length < 8) { Alert.alert(t('common', 'error'), t('profile', 'passwordMinLength')); return; }
    setChangingPassword(true);
    try {
      const result = await profileService.changePassword(currentPassword, newPassword);
      Alert.alert(t('common', 'done'), result.message);
      setActiveModal(null);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message || t('common', 'errorOccurred'));
    } finally { setChangingPassword(false); }
  };

  const handlePickAvatar = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert(t('common', 'error'), t('common', 'errorOccurred')); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      setUploadingAvatar(true);
      const { url } = await profileService.uploadAvatar(result.assets[0].uri);
      setProfile(prev => prev ? { ...prev, image: url } : prev);
      Alert.alert(t('profile', 'photoUpdated'), t('profile', 'photoUpdatedSub'));
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message || t('common', 'errorOccurred'));
    } finally { setUploadingAvatar(false); }
  }, []);

  const handleGenerateSkillKey = async () => {
    setGeneratingKey(true);
    try {
      const result = await profileService.generateSkillKey();
      setSkillKey(result.key);
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message || t('common', 'errorOccurred'));
    } finally { setGeneratingKey(false); }
  };

  const initials = (profile?.name || user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const planColor = subscription?.plan === 'enterprise' || subscription?.isSuperAdmin ? colors.warning :
    subscription?.plan === 'business' ? colors.primary :
    subscription?.plan === 'starter' ? colors.success : colors.textSecondary;
  const planLabel = subscription?.isSuperAdmin ? t('profile', 'unlimited') :
    subscription?.plan === 'trial' ? t('profile', 'trial') :
    subscription?.plan ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1) : t('common', 'loading');

  // Computed styles
  const s = useMemo(() => mStyles(colors), [colors]);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={s.scrollView} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}>
        {loading && (
          <View style={[s.loadingBanner, { backgroundColor: colors.primaryBg }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[s.loadingText, { color: colors.primary }]}>{t('common', 'loadingData')}</Text>
          </View>
        )}
        <View style={[s.profileHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={s.avatarWrap} activeOpacity={0.8} onPress={handlePickAvatar}>
            {profile?.image ? (
              <Image source={{ uri: profile.image }} style={s.avatarImage} />
            ) : (
              <View style={[s.avatarLarge, { backgroundColor: colors.primary }]}>
                <Text style={s.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={[s.avatarBadge, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
              {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={12} color="#fff" />}
            </View>
          </TouchableOpacity>
          <Text style={[s.userName, { color: colors.textPrimary }]}>{profile?.name || user?.name || t('common', 'userPlaceholder')}</Text>
          <Text style={[s.userRole, { color: colors.textSecondary }]}>{profile?.role?.nombre || user?.role || t('common', 'userPlaceholder')}</Text>
          <Text style={[s.userEmail, { color: colors.textTertiary }]}>{profile?.email || user?.email || ''}</Text>
          {subscription && (
            <View style={[s.planBadge, { backgroundColor: planColor + '15' }]}>
              <Ionicons name={subscription.isSuperAdmin ? 'infinite' : 'diamond'} size={14} color={planColor} />
              <Text style={[s.planText, { color: planColor }]}>{planLabel}</Text>
              {subscription.trial && <Text style={[s.trialText, { color: colors.textTertiary }]}> · {t('profile', 'daysRemaining', { n: subscription.trial.daysRemaining })}</Text>}
            </View>
          )}
          <TouchableOpacity style={[s.editButton, { borderColor: colors.primary + '30' }]} onPress={openEditProfile} activeOpacity={0.7}>
            <Ionicons name="pencil" size={16} color={colors.primary} />
            <Text style={[s.editButtonText, { color: colors.primary }]}>{t('profile', 'editProfile')}</Text>
          </TouchableOpacity>
        </View>

        {usage.length > 0 && (
          <>
            <SectionHeader title={t('profile', 'usage')} sty={s} />
            <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
              {usage.map((u, i) => (<UsageBar key={u.feature} usage={u} sty={s} />))}
              {usage.some(u => u.status === 'exceeded' || u.status === 'warning') && (
                <TouchableOpacity style={[s.upgradeCta, { backgroundColor: colors.warningBg, borderColor: colors.warning + '20' }]} activeOpacity={0.7}>
              <Ionicons name="rocket" size={16} color={colors.warning} />
              <Text style={[s.upgradeCtaText, { color: colors.warning }]}>{t('profile', 'upgradePlan')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <SectionHeader title={t('profile', 'account')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow icon="person" iconBg={colors.primaryBg} iconColor={colors.primary} label={t('profile', 'editProfile')} subtitle={profile?.name || user?.name || t('common', 'userPlaceholder')} onPress={openEditProfile} sty={s} />
          <SettingRow icon="lock-closed" iconBg={colors.errorBg} iconColor={colors.error} label={t('profile', 'changePassword')} onPress={() => setActiveModal('change-password')} sty={s} />
          <SettingRow icon="phone-portrait" iconBg={colors.infoBg} iconColor={colors.info} label={t('profile', 'phone')} subtitle={profile?.telefono || user?.phone || t('profile', 'noPhone')} last sty={s} />
        </View>

        <SectionHeader title={t('profile', 'security')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow icon="finger-print" iconBg={colors.primaryBg} iconColor={colors.primary} label={t('profile', 'biometricAccess')} subtitle={biometricAvailable ? t('profile', 'biometricDesc') : t('profile', 'biometricNotAvailable')}
            right={biometricAvailable ? <Switch value={biometricEnabled} onValueChange={handleBiometricToggle} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={biometricEnabled ? colors.primary : colors.textTertiary} /> : undefined} sty={s} />
          <SettingRow icon="shield-checkmark" iconBg={colors.warningBg} iconColor={colors.warning} label={t('profile', 'twoFactor')} subtitle={profile?.isTwoFactorEnabled ? t('profile', 'twoFactorEnabled') : t('profile', 'twoFactorRecommended')}
            right={<Switch value={profile?.isTwoFactorEnabled || false} onValueChange={async (v) => { try { await profileService.toggle2FA(v); loadData(true); } catch { Alert.alert(t('common', 'error'), t('common', 'errorOccurred')); } }} trackColor={{ false: colors.border, true: colors.warning + '60' }} thumbColor={profile?.isTwoFactorEnabled ? colors.warning : colors.textTertiary} />} last sty={s} />
        </View>

        <SectionHeader title={t('profile', 'digitalCard')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow icon="card" iconBg={colors.successBg} iconColor={colors.success} label={t('profile', 'businessCard')} subtitle={profile?.bookingEnabled ? t('profile', 'twoFactorEnabled') : t('common', 'noData')} onPress={() => router.push('/hub/perfil')} sty={s} />
          <SettingRow icon="calendar" iconBg={colors.primaryBg} iconColor={colors.primary} label={t('profile', 'bookingLink')} subtitle={profile?.bookingSlug || t('profile', 'notConfigured')} last sty={s} />
        </View>

        <SectionHeader title={t('share', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="share-social"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('share', 'title')}
            subtitle={t('share', 'subtitle')}
            onPress={() => router.push('/hub/share')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('profile', 'aiConnection')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow icon="hardware-chip" iconBg={colors.warningBg} iconColor={colors.warning} label={t('profile', 'gemmaSkill')} subtitle={skillKey ? t('profile', 'keyGenerated') : t('profile', 'gemmaSkillSub')} onPress={() => setActiveModal('skill-key')} last sty={s} />
        </View>

        <SectionHeader title={t('profile', 'preferences')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow icon="notifications" iconBg={colors.warningBg} iconColor={colors.warning} label={t('profile', 'notifications')} subtitle={t('profile', 'notificationsSub')} onPress={() => router.push('/hub/settings')} sty={s} />
          <SettingRow icon="globe" iconBg={colors.infoBg} iconColor={colors.info} label={t('profile', 'timezone')} subtitle={profile?.timezone || 'America/Mexico_City'} sty={s} />
          <SettingRow icon="color-palette" iconBg={colors.primaryBg} iconColor={colors.primary} label={t('profile', 'theme')} subtitle={t('settings', 'light')} last sty={s} />
        </View>

        {/* ─── Favorites Section ─────────────────────────────────────── */}
        {!favLoading && favorites.length > 0 && (
          <>
            <SectionHeader title={t('favorites', 'title')} sty={s} />
            <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
              {favorites.slice(0, 8).map((fav, index, arr) => (
                <SettingRow
                  key={`${fav.type}-${fav.id}`}
                  icon={fav.type === 'module' ? getIonicon(fav.icon) as any : 'checkbox'}
                  iconBg={fav.color + '15'}
                  iconColor={fav.color}
                  label={fav.name}
                  subtitle={fav.type === 'module' ? t('favorites', 'typeModule') : t('favorites', 'typeTask')}
                  right={
                    <TouchableOpacity onPress={() => removeFav(fav)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={20} color={colors.error} />
                    </TouchableOpacity>
                  }
                  last={index === arr.length - 1}
                  sty={s}
                />
              ))}
              {favorites.length > 8 && (
                <TouchableOpacity style={{ padding: spacing.md, alignItems: 'center' }}>
                  <Text style={[s.settingSub, { color: colors.textTertiary }]}>+{favorites.length - 8} más</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.md }}
                onPress={clearAllFavs}
              >
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={[s.settingSub, { color: colors.error, fontWeight: '500' }]}>{t('favorites', 'clearAll')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <SectionHeader title={t('leads', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="people"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('leads', 'title')}
            subtitle={t('leads', 'subtitle')}
            onPress={() => router.push('/hub/leads')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('templates', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="document-text"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('templates', 'title')}
            subtitle={t('templates', 'subtitle')}
            onPress={() => router.push('/hub/templates')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('tags', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="pricetags"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('tags', 'title')}
            subtitle={t('tags', 'subtitle')}
            onPress={() => router.push('/hub/tags')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('crm', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="people"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('crm', 'title')}
            subtitle={t('crm', 'subtitle')}
            onPress={() => router.push('/hub/crm')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('analytics', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="stats-chart"
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('analytics', 'title')}
            subtitle={t('analytics', 'subtitle')}
            onPress={() => router.push('/hub/analytics')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('invoices', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="document-text"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('invoices', 'title')}
            subtitle={t('invoices', 'subtitle')}
            onPress={() => router.push('/hub/invoices')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('team', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="people"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('team', 'title')}
            subtitle={t('team', 'subtitle')}
            onPress={() => router.push('/hub/team')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('email', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="mail"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('email', 'title')}
            subtitle={t('email', 'subtitle')}
            onPress={() => router.push('/hub/email')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('calendar', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="calendar"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('calendar', 'title')}
            subtitle={t('calendar', 'subtitle')}
            onPress={() => router.push('/hub/calendar')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('tasks', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="checkbox"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('tasks', 'title')}
            subtitle={t('tasks', 'subtitle')}
            onPress={() => router.push('/hub/tasks')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('chat', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="chatbubbles"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('chat', 'title')}
            subtitle={t('chat', 'subtitle')}
            onPress={() => router.push('/hub/chat')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('documents', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="folder"
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('documents', 'title')}
            subtitle={t('documents', 'subtitle')}
            onPress={() => router.push('/hub/documents')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('projects', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="folder-open"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('projects', 'title')}
            subtitle={t('projects', 'subtitle')}
            onPress={() => router.push('/hub/projects')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('dashboard', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="grid"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('dashboard', 'title')}
            subtitle={t('dashboard', 'subtitle')}
            onPress={() => router.push('/hub/dashboard')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('reports', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="stats-chart"
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('reports', 'title')}
            subtitle={t('reports', 'subtitle')}
            onPress={() => router.push('/hub/reports')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('notifications', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="notifications"
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('notifications', 'title')}
            subtitle={t('notifications', 'subtitle')}
            onPress={() => router.push('/hub/notifications')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('automation', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="flash"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('automation', 'title')}
            subtitle={t('automation', 'subtitle')}
            onPress={() => router.push('/hub/automation')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('expenses', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="wallet"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('expenses', 'title')}
            subtitle={t('expenses', 'subtitle')}
            onPress={() => router.push('/hub/expenses')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('health', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="pulse"
            iconBg={colors.errorBg}
            iconColor={colors.error}
            label={t('health', 'title')}
            subtitle={t('health', 'subtitle')}
            onPress={() => router.push('/hub/health')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('integrations', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="git-network"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('integrations', 'title')}
            subtitle={t('integrations', 'subtitle')}
            onPress={() => router.push('/hub/integrations')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('billing', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="card"
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('billing', 'title')}
            subtitle={t('billing', 'subtitle')}
            onPress={() => router.push('/hub/billing')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('audit', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="search"
            iconBg={colors.infoBg}
            iconColor={colors.info}
            label={t('audit', 'title')}
            subtitle={t('audit', 'subtitle')}
            onPress={() => router.push('/hub/audit')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('feedback', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="chatbox-ellipses"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('feedback', 'title')}
            subtitle={t('feedback', 'subtitle')}
            onPress={() => router.push('/hub/feedback')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('orders', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="cube"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('orders', 'title')}
            subtitle={t('orders', 'subtitle')}
            onPress={() => router.push('/hub/orders')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('inventory', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="server"
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('inventory', 'title')}
            subtitle={t('inventory', 'subtitle')}
            onPress={() => router.push('/hub/inventory')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('vendors', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="business"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('vendors', 'title')}
            subtitle={t('vendors', 'subtitle')}
            onPress={() => router.push('/hub/vendors')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('support', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="headset"
            iconBg={colors.infoBg}
            iconColor={colors.info}
            label={t('support', 'title')}
            subtitle={t('support', 'subtitle')}
            onPress={() => router.push('/hub/support')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('knowledge', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="library"
            iconBg={colors.errorBg}
            iconColor={colors.error}
            label={t('knowledge', 'title')}
            subtitle={t('knowledge', 'subtitle')}
            onPress={() => router.push('/hub/knowledge')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('contacts', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="people"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('contacts', 'title')}
            subtitle={t('contacts', 'subtitle')}
            onPress={() => router.push('/hub/contacts')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('pipeline', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="funnel"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('pipeline', 'title')}
            subtitle={t('pipeline', 'subtitle')}
            onPress={() => router.push('/hub/pipeline')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('notes', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="document-text"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('notes', 'title')}
            subtitle={t('notes', 'subtitle')}
            onPress={() => router.push('/hub/notes')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('surveys', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="document-text"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('surveys', 'title')}
            subtitle={t('surveys', 'subtitle')}
            onPress={() => router.push('/hub/surveys')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('kanban', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="grid"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('kanban', 'title')}
            subtitle={t('kanban', 'subtitle')}
            onPress={() => router.push('/hub/kanban')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('achievements', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="trophy"
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('achievements', 'title')}
            subtitle={t('achievements', 'subtitle')}
            onPress={() => router.push('/hub/achievements')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('goals', 'title')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="stats-chart"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('goals', 'title')}
            subtitle={t('goals', 'subtitle')}
            onPress={() => router.push('/hub/goals')}
            last
            sty={s}
          />
        </View>

        <SectionHeader title={t('profile', 'information')} sty={s} />
        <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
          <SettingRow icon="information-circle" iconBg={colors.primaryBg} iconColor={colors.primary} label={t('profile', 'about')} subtitle="v1.0.0" sty={s} />
          <SettingRow icon="help-circle" iconBg={colors.background} iconColor={colors.textSecondary} label={t('profile', 'help')} onPress={() => router.push('/hub/help')} sty={s} />
          <SettingRow icon="document-text" iconBg={colors.background} iconColor={colors.textSecondary} label={t('profile', 'terms')} last sty={s} />
        </View>

        {profile?.tenant && (
          <>
            <SectionHeader title={t('profile', 'company')} sty={s} />
            <View style={[s.settingsCard, { backgroundColor: colors.surface }]}>
              <SettingRow icon="business" iconBg={colors.primaryBg} iconColor={colors.primary} label={profile.tenant.nombre} subtitle={profile.tenant.accountType === 'AGENCY' ? 'Agencia' : 'Empresa'} last sty={s} />
            </View>
          </>
        )}

        <TouchableOpacity style={[s.logoutButton, { backgroundColor: colors.surface, borderColor: colors.error + '30' }]} onPress={handleLogout} disabled={isLoggingOut}>
          <Ionicons name="log-out" size={20} color={colors.error} />
          <Text style={[s.logoutText, { color: colors.error }]}>{isLoggingOut ? t('auth', 'loggingOut') : t('profile', 'logout')}</Text>
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={activeModal === 'edit-profile'} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>{t('profile', 'editProfile')}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('auth', 'name')}</Text>
            <TextInput style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} value={editName} onChangeText={setEditName} placeholder={t('auth', 'name')} placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('profile', 'phone')}</Text>
            <TextInput style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} value={editPhone} onChangeText={setEditPhone} placeholder="+52 555 123 4567" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => setActiveModal(null)}><Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }]} onPress={saveProfile}><Text style={s.modalSaveText}>{t('common', 'save')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={activeModal === 'change-password'} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>{t('profile', 'changePassword')}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('profile', 'currentPassword')}</Text>
            <TextInput style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('profile', 'newPassword')}</Text>
            <TextInput style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder={t('profile', 'passwordMinLength')} placeholderTextColor={colors.textTertiary} />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('profile', 'confirmNewPassword')}</Text>
            <TextInput style={[s.fieldInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder={t('profile', 'confirmNewPassword')} placeholderTextColor={colors.textTertiary} />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => setActiveModal(null)}><Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modalSave, { backgroundColor: colors.primary }, changingPassword && { opacity: 0.6 }]} onPress={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalSaveText}>{t('profile', 'changePassword')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Skill Key Modal */}
      <Modal visible={activeModal === 'skill-key'} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>{t('profile', 'gemmaSkill')}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={[s.fieldHelp, { color: colors.textSecondary }]}>{t('profile', 'generateKeyDesc')}</Text>
            {skillKey ? (
              <View style={s.keyDisplay}>
                <Text style={[s.keyLabel, { color: colors.warning }]}>{t('profile', 'yourKey')}</Text>
                <View style={[s.keyBox, { backgroundColor: colors.warningBg, borderColor: colors.warning + '20' }]}><Text style={[s.keyText, { color: colors.textPrimary }]} selectable>{skillKey}</Text></View>
                <Text style={[s.keyWarning, { color: colors.warning }]}>⚠️ {t('profile', 'keyWarning')}</Text>
              </View>
            ) : (
              <TouchableOpacity style={[s.generateKeyBtn, { backgroundColor: colors.primary }, generatingKey && { opacity: 0.6 }]} onPress={handleGenerateSkillKey} disabled={generatingKey}>
                {generatingKey ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="key" size={20} color="#fff" /><Text style={s.generateKeyText}>{t('profile', 'generateKey')}</Text></>}
              </TouchableOpacity>
            )}
              <TouchableOpacity style={[s.modalCancel, { borderColor: colors.border }]} onPress={() => { setActiveModal(null); setSkillKey(null); }}><Text style={[s.modalCancelText, { color: colors.textSecondary }]}>{t('common', 'close')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles Factory ──────────────────────────────────────────────────────────
const mStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  loadingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  loadingText: { ...typography.caption, fontWeight: '500' },
  profileHeader: { alignItems: 'center', paddingVertical: spacing.xxl, borderBottomWidth: 1 },
  avatarWrap: { position: 'relative', marginBottom: spacing.md },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '700' },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  userName: { ...typography.h2 },
  userRole: { ...typography.bodySmall, marginTop: 2 },
  userEmail: { ...typography.caption, marginTop: 2 },
  planBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full, marginTop: spacing.md },
  planText: { ...typography.caption, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  trialText: { ...typography.caption },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1 },
  editButtonText: { ...typography.caption, fontWeight: '600' },
  sectionTitle: { ...typography.label, paddingHorizontal: layout.screenPadding, paddingTop: spacing.xxl, paddingBottom: spacing.sm },
  settingsCard: { marginHorizontal: layout.screenPadding, borderRadius: radius.lg, ...shadows.sm },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  settingIcon: { width: 36, height: 36, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  settingText: { flex: 1 },
  settingLabel: { ...typography.bodySmall, fontWeight: '500' },
  settingSub: { ...typography.caption, marginTop: 1 },
  divider: { height: 1, marginLeft: 68 },
  usageItem: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  usageLabel: { ...typography.caption, fontWeight: '500' },
  usageValue: { ...typography.caption },
  usageBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  usageBarFill: { height: '100%', borderRadius: 3 },
  upgradeCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  upgradeCtaText: { ...typography.caption, fontWeight: '600' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginHorizontal: layout.screenPadding, marginTop: spacing.xxl, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  logoutText: { ...typography.body, fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: layout.screenPadding, paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  modalTitle: { ...typography.h3 },
  fieldLabel: { ...typography.caption, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  fieldInput: { borderRadius: radius.md, padding: spacing.md, ...typography.body, borderWidth: 1 },
  fieldHelp: { ...typography.bodySmall, lineHeight: 20, marginBottom: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  modalCancel: { flex: 1, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.md },
  modalCancelText: { ...typography.body, fontWeight: '600' },
  modalSave: { flex: 1, alignItems: 'center', padding: spacing.md, borderRadius: radius.md },
  modalSaveText: { ...typography.body, color: '#fff', fontWeight: '600' },
  keyDisplay: { gap: spacing.sm },
  keyLabel: { ...typography.caption, fontWeight: '600' },
  keyBox: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1 },
  keyText: { ...typography.body, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 },
  keyWarning: { ...typography.caption, lineHeight: 18 },
  generateKeyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  generateKeyText: { ...typography.body, color: '#fff', fontWeight: '600' },
});
