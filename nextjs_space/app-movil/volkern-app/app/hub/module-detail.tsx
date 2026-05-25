import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { hubsService } from '../../src/services/hubs';
import { getIonicon } from '../../src/utils/icons';

// ─── Native Screen Mapping ────────────────────────────────────────────────────
const NATIVE_SCREEN_MAP: Record<string, string> = {
  'hub-perfil': '/(tabs)/profile',
  'hub-seguridad': '/(tabs)/profile',
  'hub-perfil-notif': '/(tabs)/notifications',
  'hub-perfil-telefonia': '/(tabs)/profile',
  'hub-agent-skills': '/(tabs)/profile',
  'hub-mi-tarjeta': '/(tabs)/profile',
  'hub-agendamiento': '/(tabs)/profile',
  'hub-notificaciones': '/(tabs)/notifications',
  'hub-config-notif': '/(tabs)/notifications',
  'hub-analytics': '/(tabs)/reports',
  'hub-reportes': '/(tabs)/reports',
  'hub-finanzas-global': '/(tabs)/reports',
  'hub-finanzas': '/(tabs)/reports',
  'hub-snapshot': '/(tabs)/reports',
  'hub-cashflow': '/(tabs)/reports',
  'hub-profitability': '/(tabs)/reports',
  'hub-chatbot': '/(tabs)/gemma',
  'hub-connect': '/(tabs)/gemma',
  'hub-mensajes': '/(tabs)/gemma',
  'hub-ia-recs': '/(tabs)/gemma',
  'hub-dashboard': '/(tabs)',
  'hub-agencia': '/(tabs)',
  'hub-rrhh': '/(tabs)',
  'hub-sla': '/(tabs)',
  'hub-catalogo': '/(tabs)/hubs',
  'hub-config-equipo': '/(tabs)/hubs',
  'hub-config-integraciones': '/(tabs)/hubs',
  'hub-config-empresa': '/(tabs)/profile',
  'hub-config-horarios': '/(tabs)/profile',
  'hub-config-billing': '/(tabs)/profile',
};

// ─── Web Base URL ─────────────────────────────────────────────────────────────
const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://volkern.app';

// ─── Action Button ────────────────────────────────────────────────────────────
function ActionButton({
  icon,
  label,
  description,
  color,
  onPress,
  primary,
  colors,
  styles: sty,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  color: string;
  onPress: () => void;
  primary?: boolean;
  colors: ReturnType<typeof useThemeColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity
      style={[sty.actionButton, primary && { backgroundColor: color }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon}
        size={22}
        color={primary ? '#fff' : color}
      />
      <View style={sty.actionTextWrap}>
        <Text style={[sty.actionLabel, primary && { color: '#fff' }]}>
          {label}
        </Text>
        {description && (
          <Text style={[sty.actionDesc, primary && { color: 'rgba(255,255,255,0.8)' }]}>
            {description}
          </Text>
        )}
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={primary ? 'rgba(255,255,255,0.5)' : colors.textTertiary}
      />
    </TouchableOpacity>
  );
}

// ─── Quick Stat ───────────────────────────────────────────────────────────────
function QuickStat({
  icon,
  value,
  label,
  color,
  styles: sty,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  color: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={sty.statCard}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[sty.statValue, { color }]}>{value}</Text>
      <Text style={sty.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ModuleDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>();
  const router = useRouter();

  const mod = useMemo(() => hubsService.getModule(moduleId), [moduleId]);
  const category = useMemo(
    () => (mod ? hubsService.getCategory(mod.categoryId) : undefined),
    [mod],
  );

  // Módulos relacionados (misma categoría, excluyendo el actual)
  const relatedModules = useMemo(() => {
    if (!mod) return [];
    return hubsService
      .getModulesByCategory(mod.categoryId)
      .filter((m) => m.id !== mod.id)
      .slice(0, 6);
  }, [mod]);

  // Determinar acción primaria
  const hasNativeScreen = mod ? NATIVE_SCREEN_MAP[mod.id] : undefined;
  const webUrl = mod ? `${WEB_BASE_URL}${mod.hubHref}` : undefined;

  // ── Error ────────────────────────────────────────────────────────
  if (!mod || !category) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        <Text style={styles.errorTitle}>Módulo no encontrado</Text>
        <Text style={styles.errorText}>
          El módulo "{moduleId}" no existe o ha sido eliminado
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Open in browser ──────────────────────────────────────────────
  const openInBrowser = async () => {
    if (!webUrl) return;
    try {
      const supported = await Linking.canOpenURL(webUrl);
      if (supported) {
        await Linking.openURL(webUrl);
      } else {
        Alert.alert('Error', `No se puede abrir: ${webUrl}`);
      }
    } catch {
      Alert.alert('Error', 'No se pudo abrir el enlace');
    }
  };

  // ── Open native screen ───────────────────────────────────────────
  const openNativeScreen = () => {
    if (!hasNativeScreen) return;

    if (hasNativeScreen.startsWith('/(tabs)')) {
      router.replace(hasNativeScreen as any);
    } else {
      router.push(hasNativeScreen as any);
    }
  };

  // ── Primary action ───────────────────────────────────────────────
  const handlePrimaryAction = () => {
    if (hasNativeScreen) {
      openNativeScreen();
    } else {
      Alert.alert(
        'Abrir en navegador',
        `Este módulo solo está disponible en la versión web. ¿Quieres abrirlo en tu navegador?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir navegador', onPress: openInBrowser },
        ],
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: mod.color }]}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerIconWrap}>
          <Ionicons name={getIonicon(mod.icon)} size={36} color="#fff" />
        </View>
        <Text style={styles.headerTitle}>{mod.name}</Text>
        <Text style={styles.headerCategory}>{category.name}</Text>

        {/* Decorative circles */}
        <View style={[styles.deco, styles.deco1]} />
        <View style={[styles.deco, styles.deco2]} />
      </View>

      {/* Body */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Description */}
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionTitle}>Descripción</Text>
          <Text style={styles.descriptionText}>{mod.description}</Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <QuickStat
            icon="grid"
            value={String(category.moduleCount)}
            label="Módulos en hub"
            color={mod.color}
            styles={styles}
          />
          <QuickStat
            icon="globe-outline"
            value="Web"
            label="Disponible en"
            color={colors.primary}
            styles={styles}
          />
          <QuickStat
            icon={hasNativeScreen ? 'phone-portrait' : 'laptop-outline'}
            value={hasNativeScreen ? 'App' : 'Web'}
            label="Plataforma"
            color={hasNativeScreen ? colors.success : colors.warning}
            styles={styles}
          />
        </View>

        {/* Primary Action */}
        <TouchableOpacity
          style={[styles.primaryCta, { backgroundColor: mod.color }]}
          onPress={handlePrimaryAction}
          activeOpacity={0.8}
        >
          <Ionicons
            name={hasNativeScreen ? 'phone-portrait' : 'globe-outline'}
            size={24}
            color="#fff"
          />
          <View style={styles.primaryCtaText}>
            <Text style={styles.primaryCtaLabel}>
              {hasNativeScreen ? 'Abrir en la app' : 'Abrir en navegador'}
            </Text>
            <Text style={styles.primaryCtaDesc}>
              {hasNativeScreen
                ? 'Navega directamente desde la aplicación'
                : `Se abrirá ${WEB_BASE_URL.replace('https://', '')} en tu navegador`}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Secondary Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Acciones</Text>

          {hasNativeScreen && (
            <ActionButton
              icon="globe-outline"
              label="Abrir versión web"
              description="Funcionalidades completas en el navegador"
              color={colors.textSecondary}
              onPress={openInBrowser}
              colors={colors}
              styles={styles}
            />
          )}

          <ActionButton
            icon="share-outline"
            label="Compartir módulo"
            description="Envía el enlace a tu equipo"
            color={colors.primary}
            onPress={() => {
              if (webUrl) {
                Linking.openURL(
                  `https://wa.me/?text=${encodeURIComponent(`Mira este módulo de Volkern: ${mod.name} — ${webUrl}`)}`,
                ).catch(() => {
                  Alert.alert('Compartir', `Comparte este enlace: ${webUrl}`);
                });
              }
            }}
            colors={colors}
            styles={styles}
          />
        </View>

        {/* Related Modules */}
        {relatedModules.length > 0 && (
          <View style={styles.relatedSection}>
            <Text style={styles.sectionTitle}>
              Más de {category.name}
            </Text>
            <View style={styles.relatedGrid}>
              {relatedModules.map((rel) => (
                <TouchableOpacity
                  key={rel.id}
                  style={[styles.relatedCard, { borderLeftColor: mod.color }]}
                  onPress={() => router.push(`/hub/module-detail?moduleId=${rel.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.relatedIcon, { backgroundColor: mod.color + '15' }]}>
                    <Ionicons name={getIonicon(rel.icon)} size={20} color={mod.color} />
                  </View>
                  <Text style={styles.relatedName} numberOfLines={2}>
                    {rel.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Web CTA */}
        <View style={styles.webCta}>
          <Ionicons name="laptop-outline" size={20} color={colors.textTertiary} />
          <Text style={styles.webCtaText}>
            Accede a todas las funciones desde la versión web.{'\n'}
            Inicia sesión en{' '}
            <Text style={styles.webCtaLink}>{WEB_BASE_URL.replace('https://', '')}</Text>
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // Header
    header: {
      paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 24) + 16,
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.xl,
      alignItems: 'center',
      position: 'relative',
      overflow: 'hidden',
    },
    headerBack: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 8,
      left: layout.screenPadding,
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
    },
    headerIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    headerTitle: {
      ...typography.h1,
      color: '#fff',
      textAlign: 'center',
      fontWeight: '700',
    },
    headerCategory: {
      ...typography.bodySmall,
      color: 'rgba(255,255,255,0.8)',
      marginTop: spacing.xs,
    },
    deco: {
      position: 'absolute',
      borderRadius: 100,
      opacity: 0.1,
      backgroundColor: '#fff',
    },
    deco1: {
      width: 200,
      height: 200,
      top: -80,
      right: -80,
    },
    deco2: {
      width: 140,
      height: 140,
      bottom: -50,
      left: -40,
    },
    // Body
    body: {
      flex: 1,
    },
    bodyContent: {
      padding: layout.screenPadding,
      gap: spacing.lg,
    },
    // Description
    descriptionCard: {
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: spacing.lg,
      ...shadows.sm,
    },
    descriptionTitle: {
      ...typography.label,
      color: colors.textTertiary,
      marginBottom: spacing.sm,
    },
    descriptionText: {
      ...typography.body,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    // Stats
    statsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
      ...shadows.sm,
    },
    statValue: {
      ...typography.h3,
      fontWeight: '700',
    },
    statLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    // Primary CTA
    primaryCta: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
      ...shadows.md,
    },
    primaryCtaText: {
      flex: 1,
    },
    primaryCtaLabel: {
      ...typography.body,
      color: '#fff',
      fontWeight: '700',
    },
    primaryCtaDesc: {
      ...typography.caption,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 1,
    },
    // Actions
    actionsSection: {
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.label,
      color: colors.textTertiary,
      marginBottom: spacing.xs,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.md,
      ...shadows.sm,
    },
    actionTextWrap: {
      flex: 1,
    },
    actionLabel: {
      ...typography.bodySmall,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    actionDesc: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: 1,
    },
    // Related
    relatedSection: {
      gap: spacing.md,
    },
    relatedGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    relatedCard: {
      width: '48%',
      backgroundColor: colors.white,
      borderRadius: radius.md,
      padding: spacing.md,
      borderLeftWidth: 3,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      ...shadows.sm,
    },
    relatedIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    relatedName: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    // Web CTA
    webCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.warning + '10',
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.warning + '20',
    },
    webCtaText: {
      flex: 1,
      ...typography.caption,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    webCtaLink: {
      fontWeight: '600',
      color: colors.primary,
    },
    // Error
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: layout.screenPadding,
      gap: spacing.md,
    },
    errorTitle: {
      ...typography.h2,
      color: colors.textPrimary,
    },
    errorText: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    backButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      marginTop: spacing.md,
    },
    backButtonText: {
      ...typography.body,
      color: colors.white,
      fontWeight: '600',
    },
  });
}
