import React from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  SafeAreaView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useVoiceLanguage, VOICE_LANGUAGES, getLanguageLabel } from '../../src/hooks/useVoiceLanguage'
import SafeBlurView from '../../src/components/SafeBlurView'

const COLORS = {
  primary: '#c0c1ff',        // Indigo
  secondary: '#ddb7ff',      // Violet
  tertiary: '#3cddc7',       // Mint
  background: '#0b1326',     // Deep space base
  surface: '#131b2e',        // Dark Surface
  surfaceContainerLow: '#0e1524',
  textPrimary: '#dae2fd',
  textSecondary: '#c7c4d7',
  textTertiary: '#908fa0',
  border: 'rgba(255, 255, 255, 0.08)',
}

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { language, setLanguage } = useVoiceLanguage()

  const handleSelect = (value: string) => {
    setLanguage(value)
    router.back()
  }

  const blurIntensity = Platform.OS === 'ios' ? 15 : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Mesh */}
      <View style={styles.glowContainer} pointerEvents="none">
        <View style={styles.topGlow} />
        <View style={styles.bottomGlow} />
      </View>

      {/* Header */}
      <SafeBlurView intensity={blurIntensity} tint="dark" style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ajustes de Voz</Text>
        <View style={styles.backBtn} />
      </SafeBlurView>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Sección: Voz */}
        <Text style={styles.sectionTitle}>RECONOCIMIENTO DE VOZ</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="language" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Idioma de voz</Text>
          </View>
          <Text style={styles.cardDesc}>
            Idioma que Gemma usará para entender tus comandos de voz.
            Selecciona el idioma que hablas al dictar mensajes.
          </Text>

          <View style={styles.languageList}>
            {VOICE_LANGUAGES.map((lang, idx) => {
              const isSelected = language === lang.value
              return (
                <TouchableOpacity
                  key={lang.value}
                  style={[
                    styles.langItem,
                    isSelected && styles.langItemSelected,
                    idx === VOICE_LANGUAGES.length - 1 && { borderBottomWidth: 0 }
                  ]}
                  onPress={() => handleSelect(lang.value)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                    {lang.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.tertiary} />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Info actual */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.textTertiary} />
          <Text style={styles.infoText}>
            Idioma actual configurado: {getLanguageLabel(language)}
          </Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Gemma · Volkern OS</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  glowContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 0,
  },
  topGlow: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.primary,
    opacity: 0.06,
  },
  bottomGlow: {
    position: 'absolute',
    bottom: -100,
    left: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.secondary,
    opacity: 0.05,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: 'rgba(23, 31, 51, 0.8)',
    zIndex: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  scroll: {
    padding: 16,
    gap: 16,
    zIndex: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textTertiary,
    letterSpacing: 1,
    marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cardDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  languageList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  langItemSelected: {
    backgroundColor: 'rgba(192, 193, 255, 0.08)',
  },
  langFlag: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  langLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  langLabelSelected: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  footer: {
    textAlign: 'center',
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 8,
  },
})
