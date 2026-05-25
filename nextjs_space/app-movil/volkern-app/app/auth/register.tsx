import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme';

const SIGNUP_URL = `${process.env.EXPO_PUBLIC_WEB_URL || 'https://volkern.app'}/signup`;

export default function RegisterScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const openWebSignup = () => {
    Linking.openURL(SIGNUP_URL);
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Back button */}
        <TouchableOpacity
          style={[s.backButton, { backgroundColor: colors.background }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* Logo / Branding */}
        <View style={s.heroSection}>
          <View style={[s.logoContainer, { backgroundColor: colors.primary }]}>
            <Ionicons name="sparkles" size={40} color={colors.white} />
          </View>
          <Text style={s.title}>Crear cuenta</Text>
          <Text style={s.subtitle}>
            El registro de nuevos espacios de trabajo se realiza desde la web para
            una experiencia más completa.
          </Text>
        </View>

        {/* Info cards */}
        <View style={s.cardsSection}>
          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.infoIcon, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="gift-outline" size={22} color={colors.primary} />
            </View>
            <View style={s.infoContent}>
              <Text style={[s.infoTitle, { color: colors.textPrimary }]}>Prueba gratuita</Text>
              <Text style={[s.infoText, { color: colors.textSecondary }]}>
                14 días con todas las funcionalidades. Sin tarjeta de crédito.
              </Text>
            </View>
          </View>

          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.infoIcon, { backgroundColor: colors.successBg }]}>
              <Ionicons name="rocket-outline" size={22} color={colors.success} />
            </View>
            <View style={s.infoContent}>
              <Text style={[s.infoTitle, { color: colors.textPrimary }]}>Configuración inicial</Text>
              <Text style={[s.infoText, { color: colors.textSecondary }]}>
                Personaliza tu espacio con tu logo, colores, módulos y equipo.
              </Text>
            </View>
          </View>

          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.infoIcon, { backgroundColor: colors.warningBg }]}>
              <Ionicons name="globe-outline" size={22} color={colors.warning} />
            </View>
            <View style={s.infoContent}>
              <Text style={[s.infoTitle, { color: colors.textPrimary }]}>Acceso completo</Text>
              <Text style={[s.infoText, { color: colors.textSecondary }]}>
                Una vez creada tu cuenta, inicia sesión en la app con tu email y contraseña.
              </Text>
            </View>
          </View>
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={[s.ctaButton, { backgroundColor: colors.primary }, shadows.md]}
          onPress={openWebSignup}
          activeOpacity={0.85}
        >
          <Ionicons name="open-outline" size={20} color={colors.white} />
          <Text style={s.ctaButtonText}>Crear cuenta en la web</Text>
        </TouchableOpacity>

        <Text style={[s.hint, { color: colors.textTertiary }]}>
          Se abrirá el navegador para completar tu registro
        </Text>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={[s.footerText, { color: colors.textSecondary }]}>¿Ya tienes cuenta? </Text>
          <TouchableOpacity onPress={() => router.replace('/auth/login')}>
            <Text style={[s.footerLink, { color: colors.primary }]}>Inicia sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.white },
    scrollContent: {
      flexGrow: 1,
      padding: layout.screenPadding,
      paddingTop: spacing.xxl,
      paddingBottom: spacing.xxxl,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    heroSection: {
      alignItems: 'center',
      marginBottom: spacing.xxl,
    },
    logoContainer: {
      width: 72,
      height: 72,
      borderRadius: radius.xl,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
      ...shadows.lg,
    },
    title: {
      ...typography.h2,
      color: c.textPrimary,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.body,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 320,
    },
    cardsSection: {
      gap: spacing.md,
      marginBottom: spacing.xxl,
    },
    infoCard: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      ...shadows.sm,
    },
    infoIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    infoContent: {
      flex: 1,
      justifyContent: 'center',
    },
    infoTitle: {
      ...typography.bodySmall,
      fontWeight: '600',
      marginBottom: 2,
    },
    infoText: {
      ...typography.caption,
      lineHeight: 16,
    },
    ctaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md + 4,
      borderRadius: radius.lg,
      marginBottom: spacing.sm,
    },
    ctaButtonText: {
      ...typography.body,
      color: c.white,
      fontWeight: '700',
    },
    hint: {
      ...typography.caption,
      textAlign: 'center',
      marginBottom: spacing.xxl,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    footerText: {
      ...typography.bodySmall,
    },
    footerLink: {
      ...typography.bodySmall,
      fontWeight: '600',
    },
  });
