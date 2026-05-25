import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PushNotificationData {
  type?: string;
  id?: string;
  url?: string;
  tenantId?: string;
  [key: string]: unknown;
}

// ─── Notification Handler Setup ───────────────────────────────────────────────
let setupDone = false;

/**
 * Configura los manejadores globales de notificaciones push.
 * Debe llamarse UNA VEZ al arrancar la app.
 */
export function setupPushNotifications() {
  if (setupDone) return;
  setupDone = true;

  // ── Foreground handler: mostrar banner ──
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as PushNotificationData | undefined;

      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });

  // ── Tap handler: navegar cuando el usuario toca una notificación ──
  // Manejamos tanto el caso de app abierta como app cerrada

  // 1. App cerrada → la notificación abre la app
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      handleNotificationTap(response.notification.request.content.data);
    }
  }).catch(() => {
    // Ignorar errores al iniciar — posiblemente permisos no concedidos aún
  });

  // 2. App abierta en background → el usuario toca la notificación
  Notifications.addNotificationResponseReceivedListener(
    (response) => {
      handleNotificationTap(response.notification.request.content.data);
    },
  );
}

/**
 * Navega a la pantalla correcta según los datos de la notificación.
 */
function handleNotificationTap(data?: unknown) {
  if (!data) return;

  const payload = data as PushNotificationData;

  // Pequeña demora para asegurar que la navegación esté lista
  setTimeout(() => {
    try {
      // Si la notificación incluye una URL específica, navegar allí
      if (payload.url) {
        router.push(payload.url as any);
        return;
      }

      // Navegación por tipo
      switch (payload.type) {
        case 'lead':
          if (payload.id) {
            router.push(`/(tabs)/hubs?id=${payload.id}` as any);
          } else {
            router.push('/(tabs)/hubs');
          }
          break;

        case 'cita':
        case 'appointment':
          if (payload.id) {
            router.push(`/(tabs)/hubs?id=${payload.id}` as any);
          } else {
            router.push('/(tabs)/hubs');
          }
          break;

        case 'message':
        case 'chat':
          router.push('/(tabs)/gemma');
          break;

        case 'system':
        case 'alert':
        default:
          router.push('/(tabs)/notifications');
          break;
      }
    } catch {
      // Si la navegación falla, ir a notificaciones como fallback
      router.push('/(tabs)/notifications');
    }
  }, 300);
}

// ─── Token Registration ───────────────────────────────────────────────────────
/**
 * Solicita permisos y registra el token push en el backend.
 * Debe llamarse después de que el usuario inicie sesión.
 */
export async function registerPushToken(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    // 1. Solicitar permisos
    let finalStatus = 'denied';
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    } else {
      finalStatus = existingStatus;
    }

    if (finalStatus !== 'granted') {
      console.log('[PushNotifications] Permiso denegado');
      return false;
    }

    // 2. Obtener token Expo Push
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // 3. Registrar en backend
    await api.post('/users/me/push-subscription', {
      permission: 'granted',
      pushToken: token,
      platform: Platform.OS,
    });

    console.log('[PushNotifications] Token registrado:', token.slice(0, 20) + '...');
    return true;
  } catch (error) {
    console.warn('[PushNotifications] Error al registrar token:', error);
    return false;
  }
}

// ─── Badge Management ─────────────────────────────────────────────────────────
/**
 * Actualiza el badge count en el icono de la app
 */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Ignorar en plataformas sin soporte de badge
  }
}

/**
 * Resetea el badge count
 */
export async function resetBadgeCount(): Promise<void> {
  await setBadgeCount(0);
}
