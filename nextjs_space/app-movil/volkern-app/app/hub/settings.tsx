import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  StatusBar as RNStatusBar,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, useTheme, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import {
  settingsService,
  type AppSettings,
  type ThemeMode,
  type Locale,
  TIMEZONES,
  LOCALES,
} from '../../src/services/settings';

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, icon, color, sty }: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  sty: ReturnType<typeof makeStyles>;
}) {
  const colors = useThemeColors();
  return (
    <View style={sty.sectionHeader}>
      <View style={[sty.sectionIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[sty.sectionTitle, { color: colors.textTertiary }]}>{title}</Text>
    </View>
  );
}

// ─── Toggle Row ──────────────────────────────────────────────────────────────
function ToggleRow({
  icon,
  iconBg,
  iconColor,
  label,
  description,
  value,
  onValueChange,
  last,
  sty,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  last?: boolean;
  sty: ReturnType<typeof makeStyles>;
}) {
  const colors = useThemeColors();
  return (
    <>
      <View style={sty.row}>
        <View style={sty.rowLeft}>
          <View style={[sty.rowIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={icon} size={18} color={iconColor} />
          </View>
          <View style={sty.rowText}>
            <Text style={[sty.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
            {description && <Text style={[sty.rowDescription, { color: colors.textTertiary }]}>{description}</Text>}
          </View>
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.border, true: iconColor + '60' }}
          thumbColor={value ? iconColor : colors.textTertiary}
        />
      </View>
      {!last && <View style={[sty.divider, { backgroundColor: colors.borderLight }]} />}
    </>
  );
}

// ─── Select Row ──────────────────────────────────────────────────────────────
function SelectRow({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  onPress,
  last,
  sty,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
  sty: ReturnType<typeof makeStyles>;
}) {
  const colors = useThemeColors();
  return (
    <>
      <TouchableOpacity style={sty.row} onPress={onPress} activeOpacity={0.7}>
        <View style={sty.rowLeft}>
          <View style={[sty.rowIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={icon} size={18} color={iconColor} />
          </View>
          <View style={sty.rowText}>
            <Text style={[sty.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
            <Text style={[sty.rowValue, { color: colors.textTertiary }]}>{value}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </TouchableOpacity>
      {!last && <View style={[sty.divider, { backgroundColor: colors.borderLight }]} />}
    </>
  );
}

// ─── Option Sheet ────────────────────────────────────────────────────────────
function OptionSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  sty,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: string }[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  sty: ReturnType<typeof makeStyles>;
}) {
  const colors = useThemeColors();
  if (!visible) return null;
  return (
    <TouchableOpacity style={[sty.overlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={onClose}>
      <View style={[sty.sheet, { backgroundColor: colors.surface }]}>
        <View style={[sty.sheetHandle, { backgroundColor: colors.border }]} />
        <Text style={[sty.sheetTitle, { color: colors.textPrimary }]}>{title}</Text>
        <ScrollView style={sty.sheetScroll} showsVerticalScrollIndicator={false}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[sty.sheetOption, selected === option.value && { backgroundColor: colors.primaryBg }]}
              onPress={() => onSelect(option.value)}
            >
              <Text
                style={[
                  sty.sheetOptionText,
                  { color: selected === option.value ? colors.primary : colors.textPrimary },
                  selected === option.value && sty.sheetOptionTextSelected,
                ]}
              >
                {option.label}
              </Text>
              {selected === option.value && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Option sheets
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showTimezonePicker, setShowTimezonePicker] = useState(false);
  const [showLocalePicker, setShowLocalePicker] = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    settingsService.load().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  // ─── Update handler ───────────────────────────────────────────────────
  const updateSetting = useCallback(async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    const updated = await settingsService.update(key, value);
    setSettings(updated);
  }, []);

  // ─── Theme label ──────────────────────────────────────────────────────
  const themeLabel: Record<ThemeMode, string> = {
    light: 'Claro',
    dark: 'Oscuro',
    system: 'Sistema',
  };
  const themeIcon: Record<ThemeMode, keyof typeof Ionicons.glyphMap> = {
    light: 'sunny',
    dark: 'moon',
    system: 'phone-portrait',
  };

  // ─── Profile visibility label ─────────────────────────────────────────
  const visibilityLabel: Record<string, string> = {
    public: 'Público',
    team: 'Solo equipo',
    private: 'Privado',
  };
  const visibilityIcon: Record<string, keyof typeof Ionicons.glyphMap> = {
    public: 'globe',
    team: 'people',
    private: 'lock-closed',
  };

  // ─── Computed styles ──────────────────────────────────────────────────
  const s = useMemo(() => makeStyles(colors), [colors]);

  if (loading || !settings) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <RNStatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={[s.headerBack, { backgroundColor: colors.background }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('settings', 'title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.loadingContainer}>
          <Text style={[s.loadingText, { color: colors.textTertiary }]}>{t('settings', 'loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <RNStatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[s.headerBack, { backgroundColor: colors.background }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('settings', 'title')}</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>{t('settings', 'subtitle')}</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Notificaciones ──────────────────────────────────────────── */}
        <SectionHeader title={t('settings', 'notifications')} icon="notifications" color={colors.warning} sty={s} />
        <View style={[s.card, { backgroundColor: colors.surface }]}>
          <ToggleRow
            icon="notifications"
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('settings', 'pushNotifications')}
            description={t('settings', 'pushDesc')}
            value={settings.pushNotifications}
            onValueChange={(v) => updateSetting('pushNotifications', v)}
            sty={s}
          />
          <ToggleRow
            icon="mail"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('settings', 'emailNotifications')}
            description={t('settings', 'emailDesc')}
            value={settings.emailNotifications}
            onValueChange={(v) => updateSetting('emailNotifications', v)}
            sty={s}
          />
          <ToggleRow
            icon="volume-high"
            iconBg={colors.infoBg}
            iconColor={colors.info}
            label={t('settings', 'sounds')}
            description={t('settings', 'soundsDesc')}
            value={settings.soundEnabled}
            onValueChange={(v) => updateSetting('soundEnabled', v)}
            sty={s}
          />
          <ToggleRow
            icon="newspaper"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('settings', 'dailyDigest')}
            description={t('settings', 'dailyDigestDesc')}
            value={settings.dailyDigest}
            onValueChange={(v) => updateSetting('dailyDigest', v)}
            sty={s}
          />
          <ToggleRow
            icon="megaphone"
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('settings', 'marketing')}
            description={t('settings', 'marketingDesc')}
            value={settings.marketingEmails}
            onValueChange={(v) => updateSetting('marketingEmails', v)}
            last
            sty={s}
          />
        </View>

        {/* ─── Apariencia ──────────────────────────────────────────────── */}
        <SectionHeader title={t('settings', 'appearance')} icon="color-palette" color={colors.primary} sty={s} />
        <View style={[s.card, { backgroundColor: colors.surface }]}>
          <SelectRow
            icon={themeIcon[settings.theme]}
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('settings', 'theme')}
            value={themeLabel[settings.theme]}
            onPress={() => setShowThemePicker(true)}
            sty={s}
          />
          <ToggleRow
            icon="phone-portrait"
            iconBg={colors.primaryBg}
            iconColor={colors.primary}
            label={t('settings', 'useDeviceTheme')}
            description={t('settings', 'useDeviceThemeDesc')}
            value={settings.useDeviceTheme}
            onValueChange={(v) => updateSetting('useDeviceTheme', v)}
            last
            sty={s}
          />
        </View>

        {/* ─── Región ──────────────────────────────────────────────────── */}
        <SectionHeader title={t('settings', 'region')} icon="globe" color={colors.info} sty={s} />
        <View style={[s.card, { backgroundColor: colors.surface }]}>
          <SelectRow
            icon="globe"
            iconBg={colors.infoBg}
            iconColor={colors.info}
            label={t('settings', 'timezone')}
            value={settingsService.getTimezoneLabel(settings.timezone)}
            onPress={() => setShowTimezonePicker(true)}
            sty={s}
          />
          <SelectRow
            icon="language"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('settings', 'language')}
            value={LOCALES.find(l => l.value === settings.locale)?.label || settings.locale}
            onPress={() => setShowLocalePicker(true)}
            last
            sty={s}
          />
        </View>

        {/* ─── Privacidad ──────────────────────────────────────────────── */}
        <SectionHeader title={t('settings', 'privacy')} icon="shield-checkmark" color={colors.success} sty={s} />
        <View style={[s.card, { backgroundColor: colors.surface }]}>
          <ToggleRow
            icon="radio-button-on"
            iconBg={colors.successBg}
            iconColor={colors.success}
            label={t('settings', 'showOnlineStatus')}
            description={t('settings', 'showOnlineDesc')}
            value={settings.showOnlineStatus}
            onValueChange={(v) => updateSetting('showOnlineStatus', v)}
            sty={s}
          />
          <SelectRow
            icon={visibilityIcon[settings.profileVisibility]}
            iconBg={colors.warningBg}
            iconColor={colors.warning}
            label={t('settings', 'profileVisibility')}
            value={visibilityLabel[settings.profileVisibility]}
            onPress={() => {
              Alert.alert(
                'Visibilidad del perfil',
                '¿Quién puede ver tu perfil?',
                [
                  { text: 'Público', onPress: () => updateSetting('profileVisibility', 'public') },
                  { text: 'Solo equipo', onPress: () => updateSetting('profileVisibility', 'team') },
                  { text: 'Privado', onPress: () => updateSetting('profileVisibility', 'private') },
                  { text: 'Cancelar', style: 'cancel' },
                ],
              );
            }}
            last
            sty={s}
          />
        </View>

        {/* ─── Datos y Almacenamiento ──────────────────────────────────── */}
        <SectionHeader title={t('settings', 'data')} icon="server" color={colors.textSecondary} sty={s} />
        <View style={[s.card, { backgroundColor: colors.surface }]}>
          {/* Sync / Offline Queue */}
          <TouchableOpacity
            style={s.row}
            onPress={() => router.push('/hub/offline-sync')}
          >
            <View style={s.rowLeft}>
              <View style={[s.rowIcon, { backgroundColor: colors.infoBg }]}>
                <Ionicons name="sync" size={18} color={colors.info} />
              </View>
              <View style={s.rowText}>
                <Text style={[s.rowLabel, { color: colors.textPrimary }]}>{t('offline', 'title')}</Text>
                <Text style={[s.rowDescription, { color: colors.textTertiary }]}>{t('offline', 'subtitle')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={[s.divider, { backgroundColor: colors.borderLight }]} />

          <TouchableOpacity
            style={s.row}
            onPress={() => {
              Alert.alert(
                t('settings', 'clearCache'),
                t('settings', 'clearCacheConfirm'),
                [
                  { text: t('common', 'cancel'), style: 'cancel' },
                  {
                    text: t('settings', 'clearCache'),
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert(t('common', 'done'), t('settings', 'cacheCleared'));
                    },
                  },
                ],
              );
            }}
          >
            <View style={s.rowLeft}>
              <View style={[s.rowIcon, { backgroundColor: colors.warningBg }]}>
                <Ionicons name="trash" size={18} color={colors.warning} />
              </View>
              <View style={s.rowText}>
                <Text style={[s.rowLabel, { color: colors.textPrimary }]}>{t('settings', 'clearCache')}</Text>
                <Text style={[s.rowDescription, { color: colors.textTertiary }]}>{t('settings', 'clearCacheDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={[s.divider, { backgroundColor: colors.borderLight }]} />
          <TouchableOpacity
            style={s.row}
            onPress={() => {
              Alert.alert(
                t('settings', 'resetSettings'),
                t('settings', 'resetConfirm'),
                [
                  { text: t('common', 'cancel'), style: 'cancel' },
                  {
                    text: t('settings', 'resetSettings'),
                    style: 'destructive',
                    onPress: async () => {
                      const defaults = await settingsService.reset();
                      setSettings(defaults);
                      Alert.alert(t('common', 'done'), t('settings', 'resetDone'));
                    },
                  },
                ],
              );
            }}
          >
            <View style={s.rowLeft}>
              <View style={[s.rowIcon, { backgroundColor: colors.errorBg }]}>
                <Ionicons name="refresh" size={18} color={colors.error} />
              </View>
              <View style={s.rowText}>
                <Text style={[s.rowLabel, { color: colors.textPrimary }]}>{t('settings', 'resetSettings')}</Text>
                <Text style={[s.rowDescription, { color: colors.textTertiary }]}>{t('settings', 'resetSettingsDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={[s.divider, { backgroundColor: colors.borderLight }]} />
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={[s.rowIcon, { backgroundColor: colors.background }]}>
                <Ionicons name="information-circle" size={18} color={colors.textTertiary} />
              </View>
              <View style={s.rowText}>
                <Text style={[s.rowLabel, { color: colors.textPrimary }]}>{t('settings', 'appVersion')}</Text>
                <Text style={[s.rowValue, { color: colors.textTertiary }]}>v1.0.0</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ─── Theme Picker Sheet ──────────────────────────────────────── */}
      <OptionSheet
        visible={showThemePicker}
        title="Tema de la app"
        options={[
          { label: '☀️ Claro', value: 'light' },
          { label: '🌙 Oscuro', value: 'dark' },
          { label: '📱 Sistema', value: 'system' },
        ]}
        selected={settings.theme}
        onSelect={(value) => {
          updateSetting('theme', value as ThemeMode);
          setShowThemePicker(false);
        }}
        onClose={() => setShowThemePicker(false)}
        sty={s}
      />

      {/* ─── Timezone Picker Sheet ───────────────────────────────────── */}
      <OptionSheet
        visible={showTimezonePicker}
        title="Zona horaria"
        options={TIMEZONES}
        selected={settings.timezone}
        onSelect={(value) => {
          updateSetting('timezone', value);
          setShowTimezonePicker(false);
        }}
        onClose={() => setShowTimezonePicker(false)}
        sty={s}
      />

      {/* ─── Locale Picker Sheet ─────────────────────────────────────── */}
      <OptionSheet
        visible={showLocalePicker}
        title="Idioma"
        options={LOCALES}
        selected={settings.locale}
        onSelect={(value) => {
          updateSetting('locale', value as Locale);
          setShowLocalePicker(false);
        }}
        onClose={() => setShowLocalePicker(false)}
        sty={s}
      />
    </View>
  );
}

// ─── Styles factory ──────────────────────────────────────────────────────────
const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
  },
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
  headerTitle: {
    ...typography.h2,
  },
  headerSub: {
    ...typography.bodySmall,
    marginTop: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
  },

  // ─── Section ───────────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    ...typography.label,
  },

  // ─── Card ──────────────────────────────────────────────────────────────────
  card: {
    borderRadius: radius.lg,
    ...shadows.sm,
  },

  // ─── Row ────────────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  rowDescription: {
    ...typography.caption,
    marginTop: 1,
  },
  rowValue: {
    ...typography.caption,
    marginTop: 1,
  },
  divider: {
    height: 1,
    marginLeft: 68,
  },

  // ─── Sheet ─────────────────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: layout.screenPadding,
    paddingBottom: Platform.OS === 'ios' ? 40 : layout.screenPadding,
    maxHeight: '60%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    ...typography.h3,
    marginBottom: spacing.lg,
  },
  sheetScroll: {
    maxHeight: 300,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  sheetOptionText: {
    ...typography.body,
  },
  sheetOptionTextSelected: {
    fontWeight: '600',
  },
});
