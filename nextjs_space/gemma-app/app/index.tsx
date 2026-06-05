import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { login, getApiUrl, setApiUrl } from '../src/services/api-client'

const COLORS = {
  primary: '#2563EB',
  border: '#E2E8F0',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
}

export default function LoginScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [configSaved, setConfigSaved] = useState(false)
  const [testingConn, setTestingConn] = useState(false)
  const [connResult, setConnResult] = useState<'idle' | 'ok' | 'fail'>('idle')

  useEffect(() => {
    getApiUrl().then(url => setServerUrl(url))
  }, [])

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Correo y contraseña requeridos')
      return
    }

    // Guardar URL
    const url = serverUrl.trim().replace(/\/$/, '')
    if (url) {
      await setApiUrl(url)
    }

    setLoading(true)
    setError(null)
    try {
      await login(email.trim(), password)
      router.replace('/chat')
    } catch (err: any) {
      const msg = err.friendlyMessage || err.message || 'Error al iniciar sesión'

      // Si es error de conexión, sugerir configurar servidor
      if (err.isNetworkError) {
        setError(msg + '\n\n💡 Toca "Configurar servidor" abajo y pon http://192.168.0.22:3002')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async () => {
    const url = serverUrl.trim().replace(/\/$/, '')
    if (!url) return

    setTestingConn(true)
    setConnResult('idle')

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${url}/api/auth/mobile-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'test' }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      // Si llega al servidor (aunque sea 401 por credenciales), la conexión funciona
      setConnResult('ok')
      await setApiUrl(url)
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2000)
    } catch {
      setConnResult('fail')
    } finally {
      setTestingConn(false)
    }
  }

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo / Header */}
          <View style={styles.header}>
            <View style={styles.logoWrap}>
              <Ionicons name="sparkles" size={36} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Gemma</Text>
            <Text style={styles.subtitle}>Asistente inteligente de Volkern</Text>
          </View>

          {/* URL actual */}
          <View style={styles.urlBar}>
            <Ionicons name="server-outline" size={14} color={COLORS.textTertiary} />
            <Text style={styles.urlText} numberOfLines={1}>
              {serverUrl || 'Conectando...'}
            </Text>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={testConnection}
              disabled={testingConn || !serverUrl}
            >
              {testingConn ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons
                  name={connResult === 'ok' ? 'checkmark-circle' : connResult === 'fail' ? 'close-circle' : 'refresh'}
                  size={16}
                  color={connResult === 'ok' ? COLORS.success : connResult === 'fail' ? COLORS.error : COLORS.primary}
                />
              )}
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput
                style={styles.input}
                nativeID="login-email"
                value={email}
                onChangeText={setEmail}
                placeholder="admin@volkern.com"
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, { paddingRight: 44 }]}
                  nativeID="login-password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textTertiary}
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={COLORS.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Iniciar sesión</Text>
              )}
            </TouchableOpacity>

            {/* Configuración de servidor — siempre visible */}
            <View style={styles.configPanel}>
              <Text style={styles.configLabel}>Servidor Volkern</Text>
              <TextInput
                style={styles.input}
                nativeID="server-url"
                value={serverUrl}
                onChangeText={text => { setServerUrl(text); setConnResult('idle'); setConfigSaved(false) }}
                placeholder="http://192.168.0.22:3002"
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                autoComplete="url"
              />
              <View style={styles.configActions}>
                <TouchableOpacity
                  style={[styles.configBtn, configSaved && styles.configBtnSaved]}
                  onPress={testConnection}
                  disabled={testingConn}
                >
                  <Ionicons
                    name={testingConn ? 'hourglass' : 'pulse-outline'}
                    size={16}
                    color="#fff"
                  />
                  <Text style={styles.configBtnText}>
                    {testingConn ? 'Probando...' : 'Probar conexión'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.configHint}>
                Tu servidor está en 192.168.0.22:3002. Pega esa URL arriba y toca "Probar conexión". Si ves el check verde, inicia sesión.
              </Text>
            </View>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Volkern · Datos protegidos
          </Text>
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
  content: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  urlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  urlText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textTertiary,
  },
  testBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    gap: 14,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.error + '10',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.error,
    flex: 1,
    lineHeight: 18,
  },
  inputGroup: {
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  passwordWrap: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    padding: 4,
  },
  loginBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  configPanel: {
    backgroundColor: COLORS.surface + '80',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    marginTop: 4,
  },
  configLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  configActions: {
    flexDirection: 'row',
    gap: 8,
  },
  configBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 10,
  },
  configBtnSaved: {
    backgroundColor: COLORS.success,
  },
  configBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  configHint: {
    fontSize: 11,
    color: COLORS.textTertiary,
    lineHeight: 15,
  },
  footer: {
    textAlign: 'center',
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 24,
  },
})
