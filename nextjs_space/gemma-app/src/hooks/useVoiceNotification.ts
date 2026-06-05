import { useRef, useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

// Configurar cómo se muestran las notificaciones cuando la app está en foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// IDs de categorías para agrupar notificaciones de voz
const NOTIF_CHANNEL_ID = 'voice-detection'
const NOTIF_CHANNEL_NAME = 'Detección de Voz'

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

  // Crear el canal de notificación en Android
  useEffect(() => {
    if (Platform.OS === 'android' && !channelCreatedRef.current) {
      channelCreatedRef.current = true
      Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_ID, {
        name: NOTIF_CHANNEL_NAME,
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 100, 50, 100],
        lightColor: '#8B5CF6',
      }).catch(() => {})
    }
  }, [])

  // Solicitar permisos al montar
  useEffect(() => {
    if (Platform.OS === 'web') return
    Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    }).catch(() => {})
  }, [])

  // Mostrar notificación cuando se detecta voz con contenido
  useEffect(() => {
    if (Platform.OS === 'web') return
    if (!isListening) {
      lastNotifiedRef.current = ''
      return
    }

    const trimmed = interimText.trim()
    // Solo notificar si hay suficiente contenido y no es el mismo texto que ya notificamos
    if (trimmed.length >= minLength && trimmed !== lastNotifiedRef.current) {
      lastNotifiedRef.current = trimmed

      const timer = setTimeout(() => {
        Notifications.scheduleNotificationAsync({
          content: {
            title: '🎤 Escuchando...',
            body: trimmed,
            data: { type: 'voice_detected', text: trimmed },
            sound: true,
            ...(Platform.OS === 'android' ? { channelId: NOTIF_CHANNEL_ID } : {}),
          },
          trigger: null, // Inmediata
        }).catch(() => {})
      }, 300) // Pequeño delay para evitar notificaciones en cada frame

      return () => clearTimeout(timer)
    }
  }, [interimText, isListening, minLength])

  /**
   * Función para cancelar todas las notificaciones de voz pendientes
   */
  const cancelVoiceNotifications = () => {
    lastNotifiedRef.current = ''
    Notifications.cancelAllScheduledNotificationsAsync().catch(() => {})
  }

  return { cancelVoiceNotifications }
}
