import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar,
  AppState,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useThemeColors, typography, spacing, radius, shadows, layout } from '../../src/theme'
import { gpsTrackerService, type GpsTrackerState, type GpsTrackerConfig } from '../../src/services/gps-tracker'

// ─── Interval options ────────────────────────────────────────────────────────
const INTERVAL_OPTIONS = [
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '15s', value: 15000 },
  { label: '30s', value: 30000 },
  { label: '60s', value: 60000 },
]

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GpsTrackerScreen() {
  const colors = useThemeColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const router = useRouter()

  // ── State ───────────────────────────────────────────────────────────
  const [deviceKey, setDeviceKey] = useState('')
  const [plate, setPlate] = useState('')
  const [apiUrl, setApiUrl] = useState('http://localhost:3000')
  const [isConfiguring, setIsConfiguring] = useState(true)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)

  const [trackerState, setTrackerState] = useState<GpsTrackerState>({
    isTracking: false,
    lastSent: null,
    consecutiveErrors: 0,
    lastError: null,
    totalSent: 0,
  })
  const [selectedInterval, setSelectedInterval] = useState(15000)
  const [sendingNow, setSendingNow] = useState(false)

  // ── Cargar config al montar ─────────────────────────────────────────
  useEffect(() => {
    loadConfig()
  }, [])

  // ── Suscribirse a cambios del tracker ───────────────────────────────
  useEffect(() => {
    const unsub = gpsTrackerService.subscribe((state) => {
      setTrackerState(state)
    })
    return unsub
  }, [])

  // ── Detener tracking al salir ───────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' && trackerState.isTracking) {
        // En una app real usaríamos expo-task-manager para background
        // Por ahora, seguimos trackeando en foreground
      }
    })
    return () => sub.remove()
  }, [trackerState.isTracking])

  async function loadConfig() {
    const config = await gpsTrackerService.loadConfig()
    if (config) {
      setDeviceKey(config.deviceKey)
      setPlate(config.plate || '')
      setApiUrl(config.apiUrl)
      setSelectedInterval(gpsTrackerService.getInterval())
      setIsConfiguring(false)
    }
  }

  // ── Guardar config ──────────────────────────────────────────────────
  async function handleSaveConfig() {
    if (!deviceKey.trim()) return
    setSaving(true)
    try {
      await gpsTrackerService.saveConfig({
        deviceKey: deviceKey.trim(),
        plate: plate.trim() || undefined,
        apiUrl: apiUrl.trim(),
      })
      gpsTrackerService.setInterval(selectedInterval)
      setIsConfiguring(false)
    } finally {
      setSaving(false)
    }
  }

  // ── Start / Stop ────────────────────────────────────────────────────
  async function handleStartTracking() {
    const hasPermission = await gpsTrackerService.requestPermission()
    if (!hasPermission) {
      setPermissionDenied(true)
      return
    }
    gpsTrackerService.setInterval(selectedInterval)
    const result = await gpsTrackerService.start()
    if (!result.success) {
      // mostrar error
    }
  }

  function handleStopTracking() {
    gpsTrackerService.stop()
  }

  async function handleSendNow() {
    setSendingNow(true)
    try {
      await gpsTrackerService.sendNow()
    } finally {
      setSendingNow(false)
    }
  }

  // ── Editar config después de guardada ───────────────────────────────
  function handleEditConfig() {
    if (trackerState.isTracking) {
      gpsTrackerService.stop()
    }
    setIsConfiguring(true)
  }

  // ── Formatear timestamp ─────────────────────────────────────────────
  function formatTime(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const apiBase = apiUrl.replace(/https?:\/\//, '').replace(/\/api.*/, '')

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>GPS Tracker</Text>
          <Text style={styles.headerSub}>Dispositivo IoT móvil</Text>
        </View>
        {!isConfiguring && (
          <TouchableOpacity style={styles.settingsBtn} onPress={handleEditConfig}>
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {isConfiguring ? (
          /* ════════════ CONFIGURACIÓN ════════════ */
          <View>
            {/* Hero */}
            <View style={styles.heroSection}>
              <View style={[styles.heroIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="locate" size={40} color={colors.primary} />
              </View>
              <Text style={styles.heroTitle}>Convierte tu teléfono en un GPS tracker</Text>
              <Text style={styles.heroDesc}>
                Introduce el deviceKey del vehículo que obtuviste desde el dashboard de Volkern para empezar a
                enviar la posición en tiempo real.
              </Text>
            </View>

            {/* DeviceKey Input */}
            <View style={styles.card}>
              <Text style={styles.inputLabel}>DeviceKey del vehículo</Text>
              <TextInput
                style={styles.input}
                placeholder="VK-GPS-XXXX-XXXX"
                placeholderTextColor={colors.textTertiary}
                value={deviceKey}
                onChangeText={setDeviceKey}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Text style={styles.inputHint}>
                Lo encuentras en el dashboard → Flota → Configuración GPS del vehículo
              </Text>
            </View>

            {/* Plate (optional) */}
            <View style={styles.card}>
              <Text style={styles.inputLabel}>Placa del vehículo (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 1234ABC"
                placeholderTextColor={colors.textTertiary}
                value={plate}
                onChangeText={setPlate}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            {/* API URL (avanzado) */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowUrlInput(!showUrlInput)}
            >
              <Ionicons
                name={showUrlInput ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={colors.textTertiary}
              />
              <Text style={styles.advancedToggleText}>
                {showUrlInput ? 'Ocultar' : 'Mostrar'} configuración avanzada
              </Text>
            </TouchableOpacity>

            {showUrlInput && (
              <View style={styles.card}>
                <Text style={styles.inputLabel}>URL del servidor</Text>
                <TextInput
                  style={styles.input}
                  placeholder="http://localhost:3000"
                  placeholderTextColor={colors.textTertiary}
                  value={apiUrl}
                  onChangeText={setApiUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={styles.inputHint}>
                  En producción: https://volkern.app
                </Text>
              </View>
            )}

            {/* Interval selector */}
            <View style={styles.card}>
              <Text style={styles.inputLabel}>Frecuencia de envío</Text>
              <View style={styles.intervalRow}>
                {INTERVAL_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.intervalChip,
                      selectedInterval === opt.value && styles.intervalChipActive,
                    ]}
                    onPress={() => setSelectedInterval(opt.value)}
                  >
                    <Text
                      style={[
                        styles.intervalChipText,
                        selectedInterval === opt.value && styles.intervalChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                !deviceKey.trim() && styles.primaryBtnDisabled,
              ]}
              onPress={handleSaveConfig}
              disabled={!deviceKey.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#fff" />
                  <Text style={styles.primaryBtnText}>Guardar e Iniciar Tracker</Text>
                </>
              )}
            </TouchableOpacity>

            {/* QR hint */}
            <View style={styles.qrHint}>
              <Ionicons name="qr-code-outline" size={18} color={colors.textTertiary} />
              <Text style={styles.qrHintText}>
                También puedes escanear el código QR desde el dashboard de flota para obtener el deviceKey
                automáticamente.
              </Text>
            </View>
          </View>
        ) : (
          /* ════════════ TRACKER ACTIVO ════════════ */
          <View>
            {/* Status hero */}
            <View
              style={[
                styles.statusHero,
                {
                  backgroundColor: trackerState.isTracking ? colors.success + '12' : colors.warning + '12',
                  borderColor: trackerState.isTracking ? colors.success + '30' : colors.warning + '30',
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: trackerState.isTracking ? colors.success : colors.warning,
                  },
                ]}
              />
              <View style={styles.statusTextWrap}>
                <Text style={styles.statusTitle}>
                  {trackerState.isTracking ? 'Enviando posición' : 'Tracker detenido'}
                </Text>
                <Text style={styles.statusSub}>
                  {trackerState.isTracking
                    ? 'Enviando datos GPS al servidor'
                    : 'Pulsa "Iniciar Tracker" para empezar'}
                </Text>
              </View>
            </View>

            {/* Vehicle info */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.cardLabel}>Dispositivo</Text>
                  <Text style={styles.cardValue}>{deviceKey}</Text>
                </View>
                {plate ? (
                  <View style={styles.plateBadge}>
                    <Text style={styles.plateText}>{plate}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.cardLabel}>Servidor</Text>
                <Text style={styles.cardValueSmall}>{apiBase}</Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.cardLabel}>Frecuencia</Text>
                <Text style={styles.cardValueSmall}>Cada {selectedInterval / 1000}s</Text>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="radio" size={20} color={colors.primary} />
                <Text style={styles.statValue}>{trackerState.totalSent}</Text>
                <Text style={styles.statLabel}>Enviadas</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons
                  name={trackerState.consecutiveErrors > 0 ? 'warning' : 'checkmark-circle'}
                  size={20}
                  color={trackerState.consecutiveErrors > 0 ? colors.warning : colors.success}
                />
                <Text style={styles.statValue}>
                  {trackerState.consecutiveErrors > 0 ? trackerState.consecutiveErrors : 0}
                </Text>
                <Text style={styles.statLabel}>Errores</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons
                  name="navigate"
                  size={20}
                  color={trackerState.lastSent ? colors.success : colors.textTertiary}
                />
                <Text style={styles.statValue} numberOfLines={1}>
                  {trackerState.lastSent
                    ? `${trackerState.lastSent.latitude.toFixed(4)}, ${trackerState.lastSent.longitude.toFixed(4)}`
                    : '---'}
                </Text>
                <Text style={styles.statLabel}>Última posición</Text>
              </View>
            </View>

            {/* Last sent */}
            {trackerState.lastSent && (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardLabel}>Último envío</Text>
                  <Text style={styles.cardValueSmall}>
                    {formatTime(trackerState.lastSent.timestamp)}
                  </Text>
                </View>
                <View style={styles.lastSentDetail}>
                  <Ionicons name="globe" size={14} color={colors.textTertiary} />
                  <Text style={styles.lastSentText}>
                    {trackerState.lastSent.latitude.toFixed(6)}, {trackerState.lastSent.longitude.toFixed(6)}
                  </Text>
                </View>
              </View>
            )}

            {/* Error */}
            {trackerState.lastError && (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>{trackerState.lastError}</Text>
              </View>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              {trackerState.isTracking ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.error }]}
                  onPress={handleStopTracking}
                >
                  <Ionicons name="stop-circle" size={22} color="#fff" />
                  <Text style={styles.primaryBtnText}>Detener Tracker</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleStartTracking}
                >
                  <Ionicons name="play-circle" size={22} color="#fff" />
                  <Text style={styles.primaryBtnText}>Iniciar Tracker</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.secondaryBtn, sendingNow && { opacity: 0.5 }]}
                onPress={handleSendNow}
                disabled={sendingNow}
              >
                {sendingNow ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color={colors.primary} />
                    <Text style={styles.secondaryBtnText}>Enviar ahora</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Interval quick change */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Frecuencia</Text>
              <View style={styles.intervalRow}>
                {INTERVAL_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.intervalChip,
                      selectedInterval === opt.value && styles.intervalChipActive,
                    ]}
                    onPress={() => {
                      setSelectedInterval(opt.value)
                      gpsTrackerService.setInterval(opt.value)
                    }}
                  >
                    <Text
                      style={[
                        styles.intervalChipText,
                        selectedInterval === opt.value && styles.intervalChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Permission denied */}
            {permissionDenied && (
              <View style={styles.warningCard}>
                <Ionicons name="location-off" size={20} color={colors.warning} />
                <Text style={styles.warningText}>
                  Permiso de ubicación denegado. Ve a Ajustes &gt; Volkern &gt; Localización y permite el acceso.
                </Text>
              </View>
            )}

            {/* Link to dashboard */}
            <TouchableOpacity
              style={styles.dashboardLink}
              onPress={() => {
                const url = `${apiUrl}/dashboard/logistica/flota`
                // Abrir en navegador
                if (Platform.OS === 'web') {
                  window.open(url, '_blank')
                } else {
                  // En app nativa, mostrar instrucción
                }
              }}
            >
              <Ionicons name="open-outline" size={16} color={colors.primary} />
              <Text style={styles.dashboardLinkText}>
                Ver vehículo en el dashboard web
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // ── Header ────────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.md,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      ...typography.h3,
      color: colors.textPrimary,
    },
    headerSub: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    settingsBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.borderLight,
    },
    // ── Body ──────────────────────────────────────────────────────────
    body: {
      flex: 1,
    },
    bodyContent: {
      padding: layout.screenPadding,
      paddingBottom: 60,
      gap: spacing.md,
    },
    // ── Config ─────────────────────────────────────────────────────────
    heroSection: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.md,
    },
    heroIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroTitle: {
      ...typography.h3,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    heroDesc: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    // ── Cards / Inputs ───────────────────────────────────────────────
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      ...shadows.sm,
    },
    inputLabel: {
      ...typography.label,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    inputHint: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: spacing.xs,
    },
    // ── Interval chips ────────────────────────────────────────────────
    intervalRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    intervalChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    intervalChipActive: {
      backgroundColor: colors.primary + '15',
      borderColor: colors.primary,
    },
    intervalChipText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    intervalChipTextActive: {
      color: colors.primary,
    },
    // ── Primary Button ────────────────────────────────────────────────
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      ...shadows.md,
    },
    primaryBtnDisabled: {
      opacity: 0.5,
    },
    primaryBtnText: {
      ...typography.body,
      color: '#fff',
      fontWeight: '700',
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    secondaryBtnText: {
      ...typography.bodySmall,
      color: colors.primary,
      fontWeight: '600',
    },
    // ── Advanced toggle ───────────────────────────────────────────────
    advancedToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    advancedToggleText: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    // ── QR hint ───────────────────────────────────────────────────────
    qrHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.infoBg,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.info + '20',
    },
    qrHintText: {
      flex: 1,
      ...typography.caption,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    // ── Status hero ───────────────────────────────────────────────────
    statusHero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
    },
    statusDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    statusTextWrap: {
      flex: 1,
    },
    statusTitle: {
      ...typography.body,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    statusSub: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    // ── Row ───────────────────────────────────────────────────────────
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardLabel: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    cardValue: {
      ...typography.bodySmall,
      color: colors.textPrimary,
      fontWeight: '600',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    cardValueSmall: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    plateBadge: {
      backgroundColor: colors.primaryBg,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      borderColor: colors.primary + '20',
    },
    plateText: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: '700',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    // ── Stats ─────────────────────────────────────────────────────────
    statsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
      ...shadows.sm,
    },
    statValue: {
      ...typography.bodySmall,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    statLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    // ── Last sent ─────────────────────────────────────────────────────
    lastSentDetail: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    lastSentText: {
      ...typography.caption,
      color: colors.textTertiary,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    // ── Error ─────────────────────────────────────────────────────────
    errorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.errorBg,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.error + '20',
    },
    errorText: {
      flex: 1,
      ...typography.caption,
      color: colors.error,
      fontWeight: '600',
    },
    // ── Warning ───────────────────────────────────────────────────────
    warningCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.warningBg,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.warning + '20',
    },
    warningText: {
      flex: 1,
      ...typography.caption,
      color: colors.warning,
      fontWeight: '600',
    },
    // ── Actions ───────────────────────────────────────────────────────
    actions: {
      gap: spacing.sm,
    },
    // ── Dashboard link ────────────────────────────────────────────────
    dashboardLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
    },
    dashboardLinkText: {
      ...typography.bodySmall,
      color: colors.primary,
      fontWeight: '600',
    },
  })
