import React from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  SafeAreaView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useVoiceLanguage, VOICE_LANGUAGES, getLanguageLabel } from '../../src/hooks/useVoiceLanguage'

const COLORS = {
  primary: '#2563EB',
  border: '#E2E8F0',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
}

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { language, setLanguage } = useVoiceLanguage()

  const handleSelect = (value: string) => {
    setLanguage(value)
    router.back()
  }

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ajustes</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Sección: Voz */}
        <Text style={styles.sectionTitle}>RECONOCIMIENTO DE VOZ</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="language-outline" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Idioma de voz</Text>
          </View>
          <Text style={styles.cardDesc}>
            Idioma que Gemma usará para entender tus comandos de voz.
            Selecciona el idioma que hablas al dictar mensajes.
          </Text>

          <View style={styles.languageList}>
            {VOICE_LANGUAGES.map((lang) => {
              const isSelected = language === lang.value
              return (
                <TouchableOpacity
                  key={lang.value}
                  style={[styles.langItem, isSelected && styles.langItemSelected]}
                  onPress={() => handleSelect(lang.value)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                    {lang.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
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
            Idioma actual: {getLanguageLabel(language)}
          </Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Gemma · Volkern</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  scroll: {
    padding: 16,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textTertiary,
    letterSpacing: 0.5,
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
    fontWeight: '600',
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
    backgroundColor: COLORS.primary + '08',
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
    fontWeight: '600',
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
