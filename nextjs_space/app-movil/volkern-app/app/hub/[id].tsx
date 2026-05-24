import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';
import { hubsService } from '../../src/services/hubs';
import { getIonicon } from '../../src/utils/icons';

// ─── Module Card ──────────────────────────────────────────────────────────────
function ModuleCard({ module: mod, colors, styles: sty }: {
  module: ReturnType<typeof hubsService.getModules>[0];
  colors: ReturnType<typeof useThemeColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={sty.moduleCard}
      activeOpacity={0.7}
      onPress={() => router.push(`/hub/module-detail?moduleId=${mod.id}`)}
    >
      <View style={[sty.moduleIcon, { backgroundColor: mod.color + '15' }]}>
        <Ionicons name={getIonicon(mod.icon)} size={24} color={mod.color} />
      </View>
      <View style={sty.moduleInfo}>
        <Text style={sty.moduleName}>{mod.name}</Text>
        <Text style={sty.moduleDescription} numberOfLines={2}>
          {mod.description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

// ─── Hub Detail Screen ────────────────────────────────────────────────────────
export default function HubDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const category = useMemo(() => hubsService.getCategory(id), [id]);
  const modules = useMemo(() => hubsService.getModulesByCategory(id), [id]);

  if (!category) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        <Text style={styles.errorTitle}>Hub no encontrado</Text>
        <Text style={styles.errorText}>El módulo "{id}" no existe</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header Gradient (simulated with solid color + overlay) */}
      <View style={[styles.header, { backgroundColor: category.color }]}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.headerIconWrap}>
            <Ionicons
              name={getIonicon(category.icon)}
              size={32}
              color="#fff"
            />
          </View>
          <Text style={styles.headerTitle}>{category.name}</Text>
          <Text style={styles.headerDescription}>{category.description}</Text>
          <View style={styles.headerBadge}>
            <Ionicons name="grid" size={14} color="#fff" />
            <Text style={styles.headerBadgeText}>
              {modules.length} módulo{modules.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Decorative circles */}
        <View style={[styles.deco, styles.deco1]} />
        <View style={[styles.deco, styles.deco2]} />
      </View>

      {/* Modules List */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {modules.map((mod) => (
          <ModuleCard key={mod.id} module={mod} colors={colors} styles={styles} />
        ))}

        {/* Web CTA */}
        <View style={styles.webCta}>
          <Ionicons name="globe-outline" size={20} color={colors.textTertiary} />
          <Text style={styles.webCtaText}>
            Algunos módulos están disponibles solo en la versión web.{'\n'}
            Inicia sesión en volkern.com para acceder a todas las funciones.
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
    header: {
      paddingTop: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight! + 20,
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.xl,
      position: 'relative',
      overflow: 'hidden',
    },
    headerBack: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    headerContent: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    headerTitle: {
      ...typography.h1,
      color: '#fff',
      fontWeight: '700',
    },
    headerDescription: {
      ...typography.body,
      color: 'rgba(255,255,255,0.85)',
      textAlign: 'center',
      lineHeight: 22,
    },
    headerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: radius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginTop: spacing.xs,
    },
    headerBadgeText: {
      ...typography.caption,
      color: '#fff',
      fontWeight: '600',
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
      top: -60,
      right: -60,
    },
    deco2: {
      width: 120,
      height: 120,
      bottom: -40,
      left: -30,
    },
    body: {
      flex: 1,
    },
    bodyContent: {
      padding: layout.screenPadding,
      gap: spacing.sm,
    },
    moduleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.md,
      ...shadows.sm,
    },
    moduleIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    moduleIconImage: {
      width: 24,
      height: 24,
      tintColor: '#fff',
    },
    moduleInfo: {
      flex: 1,
      gap: 2,
    },
    moduleName: {
      ...typography.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    moduleDescription: {
      ...typography.caption,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    webCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.warning + '10',
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.warning + '20',
    },
    webCtaText: {
      flex: 1,
      ...typography.caption,
      color: colors.textSecondary,
      lineHeight: 18,
    },
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
    },
    backButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    backButtonText: {
      ...typography.body,
      color: colors.white,
      fontWeight: '600',
    },
  });
}
