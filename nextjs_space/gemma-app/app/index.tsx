import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Image, Dimensions
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { loginWithApiKey, getApiUrl } from '../src/services/api-client'
import SafeBlurView from '../src/components/SafeBlurView'
import { LinearGradient } from 'expo-linear-gradient'

const { width } = Dimensions.get('window')

const COLORS = {
  primary: '#c0c1ff',        // Deep Space Indigo
  secondary: '#ddb7ff',      // Vibrant Violet
  tertiary: '#3cddc7',       // Soft Mint
  background: '#0b1326',     // Deep space base background
  surface: '#0b1326',
  surfaceContainerLow: '#131b2e',
  surfaceContainerHigh: '#222a3d',
  onSurface: '#dae2fd',
  onSurfaceVariant: '#c7c4d7',
  outline: '#908fa0',
  outlineVariant: '#464554',
  error: '#ffb4ab',
}

export default function LoginScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  
  const [serverUrl, setServerUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    getApiUrl().then(url => {
      if (url && url !== 'http://localhost:3002') {
        setServerUrl(url)
      }
    })
  }, [])

  const handleLogin = async () => {
    if (!serverUrl.trim() || !apiKey.trim()) {
      setError('URL del servidor y API Key requeridos')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const url = serverUrl.trim().replace(/\/$/, '')
      await loginWithApiKey(apiKey.trim(), url)
      router.replace('/chat')
    } catch (err: any) {
      const msg = err.friendlyMessage || err.message || 'Error al conectar con el servidor'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const containerBlurIntensity = Platform.OS === 'ios' ? 20 : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Mesh Gradients */}
      <View style={styles.glowContainer} pointerEvents="none">
        <View style={styles.topGlow} />
        <View style={styles.bottomGlow} />
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 24) }]} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.innerContent}>
            {/* Header / Logo */}
            <View style={styles.header}>
              <View style={styles.avatarContainer}>
                <View style={styles.avatarGlow} />
                <Image
                  style={styles.avatarImage}
                  source={{ uri: 'https://lh3.googleusercontent.com/aida/AP1WRLs4y7EvGZtud-Jp_pwtOJO8YSxJC17pNWmmJd_cAYs3MASBg1BUlihjZCGErkwpYM2d0f28tu4Et8K5AEmWimKlv15QIXzUvKii6OLnZLt8UaogOMxZJGIOSmzHdztwVXuEG-KY3ao3uvpPEsBgApDFG9pE1lX-J8jdPi3xZde-NiFXNyVwACkziSqOQ8LGUxBcRurLWljK_u8q-T1FjPD05M5LgaDxgh2geBu19bvp0JaQc9mBTrKipu5O' }}
                />
                <View style={styles.badgeContainer}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.tertiary} />
                </View>
              </View>

              <Image
                style={styles.volkernLogo}
                source={{ uri: 'https://lh3.googleusercontent.com/aida/AP1WRLumx3tHLmFbBm55yhC16H2MOhTAJx-3EtgeeV6OoBezJWkdXZVcVOkiN4JYx17gEwJA4XBdS-gjfmMSC3zVA00A7VqSEgk2ZfTiCMU-8v8kVCrbWXXHqRctwroAbtFKFpl7VzOH5rH-dS4jCzROMiKtf7lnME5aukqmZfAEI7kdiIjfyQxugiF8sw9yNMw6yCOfDXa-M208Tc40s2Rwa4H3XHayjOxxdyGJ-1ryytogndj-QHFrNKd96Oou' }}
                resizeMode="contain"
              />
              
              <Text style={styles.title}>Conectar a Volkern OS</Text>
              <Text style={styles.subtitle}>Accede a tu instancia privada de inteligencia artificial.</Text>
            </View>

            {/* Connection Card (Glassmorphic) */}
            <View style={styles.glassCardContainer}>
              <SafeBlurView intensity={containerBlurIntensity} tint="dark" style={styles.glassCard}>
                <View style={styles.form}>
                  {error && (
                    <View style={styles.errorBox}>
                      <Ionicons name="alert-circle" size={18} color={COLORS.error} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  {/* Server URL Input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>URL DEL SERVIDOR</Text>
                    <View style={styles.inputWrapper}>
                      <View style={styles.inputIcon}>
                        <Ionicons name="server-outline" size={20} color={COLORS.onSurfaceVariant} />
                      </View>
                      <TextInput
                        style={styles.input}
                        nativeID="server_url"
                        value={serverUrl}
                        onChangeText={setServerUrl}
                        placeholder="https://instancia.volkern.app"
                        placeholderTextColor="rgba(144, 143, 160, 0.4)"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                      />
                    </View>
                  </View>

                  {/* API Key Input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>API KEY</Text>
                    <View style={styles.inputWrapper}>
                      <View style={styles.inputIcon}>
                        <Ionicons name="key-outline" size={20} color={COLORS.onSurfaceVariant} />
                      </View>
                      <TextInput
                        style={[styles.input, { paddingRight: 48 }]}
                        nativeID="api_key"
                        value={apiKey}
                        onChangeText={setApiKey}
                        placeholder="••••••••••••••••"
                        placeholderTextColor="rgba(144, 143, 160, 0.4)"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        style={styles.eyeBtn}
                        onPress={() => setShowPassword(!showPassword)}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={COLORS.onSurfaceVariant}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Connect Button */}
                  <TouchableOpacity
                    style={styles.connectBtnWrapper}
                    onPress={handleLogin}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={[COLORS.primary, '#8083ff']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.connectBtn}
                    >
                      {loading ? (
                        <View style={styles.btnLoading}>
                          <ActivityIndicator size="small" color="#1000a9" />
                          <Text style={styles.connectBtnText}>Conectando...</Text>
                        </View>
                      ) : (
                        <View style={styles.btnContent}>
                          <Text style={styles.connectBtnText}>Conectar</Text>
                          <Ionicons name="arrow-forward" size={20} color="#1000a9" />
                        </View>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Support links */}
                  <View style={styles.linksContainer}>
                    <TouchableOpacity>
                      <Text style={styles.linkText}>¿Olvidaste tu clave?</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.supportLink}>
                      <Ionicons name="help-circle-outline" size={14} color={COLORS.tertiary} />
                      <Text style={[styles.linkText, { color: COLORS.tertiary }]}>Soporte</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </SafeBlurView>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <View style={styles.footerDividerContainer}>
                <View style={styles.divider} />
                <Ionicons name="shield-checkmark" size={16} color={COLORS.outline} style={{ marginHorizontal: 8 }} />
                <View style={styles.divider} />
              </View>
              <Text style={styles.footerHeading}>SOBERANÍA DE DATOS GARANTIZADA</Text>
              <Text style={styles.footerText}>
                Sus credenciales y datos permanecen encriptados en su infraestructura local. Volkern OS no almacena claves privadas.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    top: -150,
    left: -150,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: COLORS.primary,
    opacity: 0.1,
  },
  bottomGlow: {
    position: 'absolute',
    bottom: -150,
    right: -150,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: COLORS.secondary,
    opacity: 0.08,
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  innerContent: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    marginBottom: 24,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(192, 193, 255, 0.15)',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(192, 193, 255, 0.3)',
  },
  badgeContainer: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  volkernLogo: {
    height: 32,
    width: 160,
    marginBottom: 16,
    opacity: 0.9,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.onSurface,
    textAlign: 'center',
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  glassCardContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(23, 31, 51, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  glassCard: {
    padding: 24,
  },
  form: {
    gap: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    fontSize: 13,
    color: COLORS.error,
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.outline,
    letterSpacing: 1,
    marginLeft: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    position: 'relative',
  },
  inputIcon: {
    paddingLeft: 14,
    paddingRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 14,
    fontSize: 15,
    color: COLORS.onSurface,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  connectBtnWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  connectBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  connectBtnText: {
    color: '#1000a9',
    fontSize: 16,
    fontWeight: '700',
  },
  linksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  linkText: {
    fontSize: 12,
    color: COLORS.outline,
    fontWeight: '500',
  },
  supportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  footerDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  footerHeading: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.outline,
    letterSpacing: 2,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(144, 143, 160, 0.6)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
})
