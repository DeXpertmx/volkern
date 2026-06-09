import { useRef, useEffect } from 'react'
import { Platform } from 'react-native'

// IDs de categorías para agrupar notificaciones de voz
const NOTIF_CHANNEL_ID = 'voice-detection'
const NOTIF_CHANNEL_NAME = 'Detección de Voz'

// Módulo cargado dinámicamente solo en native.
// En web, expo-notifications no existe como módulo nativo y falla
// incluso con try/catch porque Metro lo resuelve en el bundle.
let NotificationsModule: any | null = null

async function getNotifications() {
  if (!NotificationsModule) {
    // Always fallback to unavailable to prevent Expo Go crashes
    // until we do a custom development build
    NotificationsModule = { __unavailable: true }
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

      // Normalizar: expo-notifications puede exportar en .default o directo
      const N = Notifs.default || Notifs
      if (!N.setNotificationHandler) return

      // Handler para mostrar banner en foreground
      N.setNotificationHandler({
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
        N.setNotificationChannelAsync(NOTIF_CHANNEL_ID, {
          name: NOTIF_CHANNEL_NAME,
          importance: N.AndroidImportance?.DEFAULT ?? 3,
          vibrationPattern: [0, 100, 50, 100],
          lightColor: '#8B5CF6',
        }).catch(() => {})
      }

      // Solicitar permisos
      if (Platform.OS !== 'web') {
        N.requestPermissionsAsync({
          ios: { allowAlert: true, allowSound: true, allowBadge: false },
        }).catch(() => {})
      }
    })
  }, [])

  // Mostrar notificación cuando se detecta voz con contenido
  useEffect(() => {
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

        const N = Notifs.default || Notifs
        if (!N.scheduleNotificationAsync) return

        N.scheduleNotificationAsync({
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
      if (Notifs.__unavailable) return
      const N = Notifs.default || Notifs
      N.cancelAllScheduledNotificationsAsync?.().catch(() => {})
    })
  }

  return { cancelVoiceNotifications }
}
