import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  RefreshControl,
  Share,
  Linking,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';
import { shareService, type DigitalCard, type ShareLink } from '../../src/services/share';

// ─── Card Preview ─────────────────────────────────────────────────────────────
function CardPreview({ card, colors, sty }: {
  card: DigitalCard;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const { t } = useI18n();
  const initials = card.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={[sty.cardPreview, { backgroundColor: colors.primary }]}>
      {/* Decorative circles */}
      <View style={[sty.decoCircle, { backgroundColor: colors.primaryLight + '30', top: -30, right: -20, width: 100, height: 100 }]} />
      <View style={[sty.decoCircle, { backgroundColor: colors.primaryLight + '20', bottom: -40, left: -30, width: 140, height: 140 }]} />

      {card.photo ? (
        <Image source={{ uri: card.photo }} style={sty.cardPhoto} />
      ) : (
        <View style={[sty.cardAvatar, { backgroundColor: colors.white + '30' }]}>
          <Text style={sty.cardInitials}>{initials}</Text>
        </View>
      )}
      <Text style={sty.cardName}>{card.name}</Text>
      <Text style={sty.cardSub}>{card.title} · {card.company}</Text>
      <View style={sty.cardContacts}>
        {card.email ? (
          <View style={sty.contactRow}>
            <Ionicons name="mail-outline" size={12} color={colors.white + 'CC'} />
            <Text style={sty.contactText}>{card.email}</Text>
          </View>
        ) : null}
        {card.phone ? (
          <View style={sty.contactRow}>
            <Ionicons name="call-outline" size={12} color={colors.white + 'CC'} />
            <Text style={sty.contactText}>{card.phone}</Text>
          </View>
        ) : null}
        {card.bookingUrl ? (
          <View style={sty.contactRow}>
            <Ionicons name="calendar-outline" size={12} color={colors.white + 'CC'} />
            <Text style={sty.contactText} numberOfLines={1}>{card.bookingUrl}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── QR Display ───────────────────────────────────────────────────────────────
function QRDisplay({ url, colors, sty }: {
  url: string;
  colors: ReturnType<typeof useThemeColors>;
  sty: ReturnType<typeof makeStyles>;
}) {
  const { t } = useI18n();
  const [qrBg, setQrBg] = useState('#FFFFFF');

  useEffect(() => {
    // QR code needs light background for scanability
    setQrBg(colors.background === '#0F172A' ? '#1E293B' : '#FFFFFF');
  }, [colors.background]);

  return (
    <View style={[sty.qrContainer, { backgroundColor: colors.surface }]}>
      <View style={[sty.qrBorder, { backgroundColor: qrBg }]}>
        <QRCode
          value={url}
          size={160}
          backgroundColor={qrBg}
          color={colors.primary}
        />
      </View>
      <Text style={[sty.qrSub, { color: colors.textTertiary }]}>{t('share', 'qrSub')}</Text>
    </View>
  );
}

// ─── Share Action Button ──────────────────────────────────────────────────────
function ShareAction({ icon, label, color, bg, onPress, s }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity
      style={[s.shareAction, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[s.shareActionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ShareScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();

  const [card, setCard] = useState<DigitalCard | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const s = useMemo(() => makeStyles(colors), [colors]);

  // ─── Load ───────────────────────────────────────────────────────────
  const loadCard = useCallback(async () => {
    try {
      const data = await shareService.getDigitalCard();
      setCard(data);
      setLinks(shareService.getShareLinks(data));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCard(); }, [loadCard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCard();
    setRefreshing(false);
  }, [loadCard]);

  // ─── Share via OS sheet ──────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!card) return;
    try {
      await Share.share({
        message: `${t('share', 'shareMessage')}\n\n${shareService.getProfileUrl(card)}`,
        title: t('share', 'myProfile'),
      });
    } catch { /* ignore */ }
  }, [card, t]);

  // ─── Copy link ───────────────────────────────────────────────────────
  const handleCopyLink = useCallback(async () => {
    if (!card) return;
    const url = shareService.getProfileUrl(card);
    await Clipboard.setStringAsync(url);
    Alert.alert(t('common', 'done'), t('share', 'linkCopied'));
  }, [card, t]);

  // ─── Open link ───────────────────────────────────────────────────────
  const handleOpenLink = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  // ─── Call / Email ────────────────────────────────────────────────────
  const handleOpenUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  // ─── Download vCard ──────────────────────────────────────────────────
  const handleSaveContact = useCallback(() => {
    if (!card?.vcard) return;
    Alert.alert(t('share', 'downloadVcard'), t('share', 'vcardSaved'));
  }, [card, t]);

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
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('share', 'title')}</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>{t('share', 'shareHint')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !card ? (
        <View style={s.emptyState}>
          <View style={[s.emptyIcon, { backgroundColor: colors.primaryBg }]}>
            <Ionicons name="card-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>{t('share', 'noData')}</Text>
          <TouchableOpacity style={[s.retryBtn, { backgroundColor: colors.primary }]} onPress={onRefresh}>
            <Text style={s.retryBtnText}>{t('common', 'retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* QR Code */}
          <QRDisplay url={shareService.getProfileUrl(card)} colors={colors} sty={s} />

          {/* Digital Card Preview */}
          <CardPreview card={card} colors={colors} sty={s} />

          {/* Quick Actions */}
          <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t('share', 'shareOptions')}</Text>
          <View style={s.actionsGrid}>
            <ShareAction
              icon="share-social"
              label={t('common', 'share')}
              color={colors.primary}
              bg={colors.primaryBg}
              onPress={handleShare}
              s={s}
            />
            <ShareAction
              icon="copy-outline"
              label={t('share', 'copyLink')}
              color={colors.info}
              bg={colors.infoBg}
              onPress={handleCopyLink}
              s={s}
            />
            <ShareAction
              icon="person-add-outline"
              label={t('share', 'saveContact')}
              color={colors.success}
              bg={colors.successBg}
              onPress={handleSaveContact}
              s={s}
            />
            <ShareAction
              icon="download-outline"
              label={t('share', 'qrDownload')}
              color={colors.warning}
              bg={colors.warningBg}
              onPress={handleShare}
              s={s}
            />
          </View>

          {/* Quick Links */}
          <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t('common', 'info')}</Text>
          {links.map((link, idx) => (
            <TouchableOpacity
              key={idx}
              style={[s.linkRow, { backgroundColor: colors.surface }]}
              onPress={() => handleOpenUrl(link.url)}
              activeOpacity={0.7}
            >
              <View style={[s.linkIcon, { backgroundColor: colors.primaryBg }]}>
                <Ionicons name={link.icon as any} size={18} color={colors.primary} />
              </View>
              <View style={s.linkInfo}>
                <Text style={[s.linkLabel, { color: colors.textPrimary }]}>{link.label}</Text>
                <Text style={[s.linkUrl, { color: colors.textTertiary }]} numberOfLines={1}>{link.url}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

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
      width: 40, height: 40, borderRadius: radius.md,
      justifyContent: 'center', alignItems: 'center',
    },
    headerTitle: { ...typography.h2 },
    headerSub: { ...typography.bodySmall, marginTop: 1 },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: 100,
    },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // ─── QR ────────────────────────────────────────────────────────────
    qrContainer: {
      alignItems: 'center',
      padding: spacing.xl,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
      ...shadows.sm,
    },
    qrBorder: {
      padding: spacing.md,
      borderRadius: radius.md,
    },
    qrSub: { ...typography.caption, marginTop: spacing.md },

    // ─── Card Preview ──────────────────────────────────────────────────
    cardPreview: {
      borderRadius: radius.xl,
      padding: spacing.xl,
      alignItems: 'center',
      marginBottom: spacing.md,
      overflow: 'hidden',
      ...shadows.md,
    },
    decoCircle: {
      position: 'absolute',
      borderRadius: 999,
    },
    cardPhoto: {
      width: 64, height: 64, borderRadius: 32,
      marginBottom: spacing.md,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.4)',
    },
    cardAvatar: {
      width: 64, height: 64, borderRadius: 32,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: spacing.md,
    },
    cardInitials: { color: '#fff', fontSize: 24, fontWeight: '700' },
    cardName: {
      color: '#fff',
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 2,
    },
    cardSub: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: '500',
      marginBottom: spacing.md,
    },
    cardContacts: { gap: spacing.xs, alignItems: 'center' },
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    contactText: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 12,
      fontWeight: '500',
    },

    // ─── Actions ────────────────────────────────────────────────────────
    shareAction: {
      width: '47%',
      alignItems: 'center',
      padding: spacing.lg,
      borderRadius: radius.lg,
      gap: spacing.sm,
    },
    shareActionLabel: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },

    // ─── Links ──────────────────────────────────────────────────────────
    sectionLabel: {
      ...typography.label,
      marginBottom: spacing.sm,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      marginBottom: spacing.sm,
      ...shadows.sm,
    },
    linkIcon: {
      width: 36, height: 36, borderRadius: radius.md,
      justifyContent: 'center', alignItems: 'center',
    },
    linkInfo: { flex: 1 },
    linkLabel: { ...typography.bodySmall, fontWeight: '600' },
    linkUrl: { ...typography.caption, marginTop: 1 },

    // ─── Empty ──────────────────────────────────────────────────────────
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    emptyIcon: {
      width: 80, height: 80, borderRadius: radius.full,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: { ...typography.h3, textAlign: 'center' },
    retryBtn: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.xl,
    },
    retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  });
