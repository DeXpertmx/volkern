import { useRef, useEffect } from 'react'
import { Platform } from 'react-native'

// IDs de categorías para agrupar notificaciones de voz
const NOTIF_CHANNEL_ID = 'voice-detection'
const NOTIF_CHANNEL_NAME = 'Detección de Voz'

// Módulo cargado dinámicamente para evitar error "Cannot find native module 'ExpoPushTokenManager'" en web
let NotificationsModule: any = null

async function getNotifications() {
  if (!NotificationsModule) {
    try {
      NotificationsModule = await import('expo-notifications')
    } catch {
      // En web, expo-notifications no está disponible
      NotificationsModule = { __unavailable: true }
    }
  }
  return NotificationsModule
}

/**
 * Hook que muestra una notificación local cuando se detecta voz con contenido significativo.
 * @param interimText - Texto parcial del reconocimiento de voz
 * @param isListening - Si el reconocimiento está activo
 * @param minLength - Longitud mínima del texto para mostrar notificación (default: 3)
 */
export function useVoiceNotification(
  interimText: string,
  isListening: boolean,
  minLength: number = 3,
) {
  const lastNotifiedRef = useRef<string>('')
  const channelCreatedRef = useRef(false)

  // Configurar handler + crear canal en Android al montar
  useEffect(() => {
    getNotifications().then((Notifs) => {
      if (Notifs.__unavailable) return

      // Handler para mostrar banner en foreground
      Notifs.default.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      })

      // Canal Android
      if (Platform.OS === 'android' && !channelCreatedRef.current) {
        channelCreatedRef.current = true
        Notifs.default.setNotificationChannelAsync(NOTIF_CHANNEL_ID, {
          name: NOTIF_CHANNEL_NAME,
          importance: Notifs.default.AndroidImportance?.DEFAULT ?? 3,
          vibrationPattern: [0, 100, 50, 100],
          lightColor: '#8B5CF6',
        }).catch(() => {})
      }

      // Solicitar permisos
      if (Platform.OS !== 'web') {
        Notifs.default.requestPermissionsAsync({
          ios: { allowAlert: true, allowSound: true, allowBadge: false },
        }).catch(() => {})
      }
    })
  }, [])

  // Mostrar notificación cuando se detecta voz con contenido
  useEffect(() => {
    if (Platform.OS === 'web') return
    if (!isListening) {
      lastNotifiedRef.current = ''
      return
    }

    const trimmed = interimText.trim()
    if (trimmed.length >= minLength && trimmed !== lastNotifiedRef.current) {
      lastNotifiedRef.current = trimmed

      const timer = setTimeout(async () => {
        const Notifs = await getNotifications()
        if (Notifs.__unavailable) return

        Notifs.default.scheduleNotificationAsync({
          content: {
            title: '🎤 Escuchando...',
            body: trimmed,
            data: { type: 'voice_detected', text: trimmed },
            sound: true,
            ...(Platform.OS === 'android' ? { channelId: NOTIF_CHANNEL_ID } : {}),
          },
          trigger: null, // Inmediata
        }).catch(() => {})
      }, 300)

      return () => clearTimeout(timer)
    }
  }, [interimText, isListening, minLength])

  /**
   * Función para cancelar todas las notificaciones de voz pendientes
   */
  const cancelVoiceNotifications = () => {
    lastNotifiedRef.current = ''
    getNotifications().then((Notifs) => {
      if (!Notifs.__unavailable) {
        Notifs.default.cancelAllScheduledNotificationsAsync().catch(() => {})
      }
    })
  }

  return { cancelVoiceNotifications }
}
