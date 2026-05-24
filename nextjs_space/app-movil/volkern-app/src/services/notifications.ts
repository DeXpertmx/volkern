import { api } from './api';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  readAt: string | null;
  data: Record<string, unknown> | null;
  actionUrl: string | null;
  createdAt: string;
  tenantId: string;
  userId: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────
export interface LocalNotification {
  id: string;
  type: 'lead' | 'cita' | 'message' | 'system' | 'alert';
  title: string;
  body: string;
  time: string;
  read: boolean;
  data?: Record<string, unknown>;
}

function mapType(type: string): LocalNotification['type'] {
  const typeMap: Record<string, LocalNotification['type']> = {
    lead: 'lead',
    cita: 'cita',
    appointment: 'cita',
    message: 'message',
    chat: 'message',
    system: 'system',
    alert: 'alert',
    task: 'lead',
  };
  return typeMap[type] || 'system';
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHour < 24) return `Hace ${diffHour}h`;
  if (diffDay < 7) return `Hace ${diffDay}d`;
  return date.toLocaleDateString('es-MX');
}

export function toLocalNotification(n: InAppNotification): LocalNotification {
  return {
    id: n.id,
    type: mapType(n.type),
    title: n.title,
    body: n.body,
    time: timeAgo(n.createdAt),
    read: n.read,
    data: n.data || undefined,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────
export const notificationsService = {
  /**
   * Obtiene las notificaciones del usuario
   */
  async getAll(): Promise<InAppNotification[]> {
    return api.get<InAppNotification[]>('/notifications');
  },

  /**
   * Marca una notificación como leída
   */
  async markAsRead(id: string): Promise<void> {
    await api.patch('/notifications', { id });
  },

  /**
   * Marca todas las notificaciones como leídas
   */
  async markAllAsRead(): Promise<void> {
    await api.patch('/notifications', { all: true });
  },

  /**
   * Obtiene el conteo de no leídas
   */
  async getUnreadCount(): Promise<number> {
    try {
      const all = await this.getAll();
      return all.filter(n => !n.read).length;
    } catch {
      return 0;
    }
  },

  /**
   * Registra el token de push notification en el backend
   */
  async registerPushToken(userId: string): Promise<void> {
    if (Platform.OS === 'web') return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    await api.post('/users/me/push-subscription', {
      userId,
      permission: 'granted',
      pushToken: token,
    });

    // Configurar handler de notificaciones
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  },

  /**
   * Elimina notificaciones antiguas localmente
   */
  async cleanupRead(daysOld: number = 30): Promise<void> {
    // En el backend se puede agregar un cleanup endpoint
    // Por ahora es placeholder
  },
};
