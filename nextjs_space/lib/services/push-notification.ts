import * as OneSignal from '@onesignal/node-onesignal';
import { prisma } from '@/lib/db';

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';

// Configuración del cliente de OneSignal
const configuration = OneSignal.createConfiguration({
  authMethods: {
    rest_api_key: {
      tokenProvider: {
        getToken() {
          return ONESIGNAL_REST_API_KEY;
        },
      },
    },
  },
});

const client = new OneSignal.DefaultApi(configuration);

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
}

/**
 * Envía una notificación push a un usuario específico a través de OneSignal.
 * Utilizamos el 'external_id' de OneSignal, que vinculamos al ID del usuario en nuestra BD.
 */
export async function sendPushNotification(userId: string, payload: PushNotificationPayload) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.warn('OneSignal config missing. Skipping push notification.');
    return { success: false, error: 'Config missing' };
  }

  try {
    // 1. Guardar en la base de datos (In-App History)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true }
    });

    if (user?.tenantId) {
      await prisma.inAppNotification.create({
        data: {
          userId,
          tenantId: user.tenantId,
          title: payload.title,
          body: payload.body,
          type: payload.tag || 'info',
          actionUrl: payload.url,
        }
      });
    }

    // 2. Enviar via OneSignal
    const notification = new OneSignal.Notification();
    notification.app_id = ONESIGNAL_APP_ID;
    
    // Contenido
    notification.headings = { en: payload.title, es: payload.title };
    notification.contents = { en: payload.body, es: payload.body };
    
    // Destinatario por External ID (nuestro User ID)
    // El SDK de OneSignal v9+ usa camelCase o arrays de strings
    (notification as any).include_external_user_ids = [userId];
    
    // Opciones adicionales
    if (payload.url) notification.url = payload.url;
    if (payload.icon) notification.chrome_web_icon = payload.icon;
    
    const response = await client.createNotification(notification);
    
    return { 
      success: true, 
      id: response.id 
    };
  } catch (error: any) {
    console.error('Error in sendPushNotification (OneSignal):', error);
    return { success: false, error: error.message };
  }
}

/**
 * Notifica a los administradores de un tenant vía OneSignal.
 */
export async function notifyAdminsPush(
  payload: PushNotificationPayload & { data?: { url?: string } },
  tenantId: string
) {
  try {
    const finalPayload = { 
      ...payload, 
      url: payload.url || payload.data?.url 
    };

    // Obtenemos los usuarios con rol admin del tenant
    const admins = await prisma.user.findMany({
      where: {
        tenantId,
        role: {
          nombre: 'admin'
        }
      },
      select: { id: true }
    });

    if (!admins.length) return { success: false, error: 'No admins found' };

    const promises = admins.map(admin => sendPushNotification(admin.id, finalPayload));
    await Promise.allSettled(promises);
    
    return { success: true, count: admins.length };
  } catch (error: any) {
    console.error('Error in notifyAdminsPush:', error);
    return { success: false, error: error.message };
  }
}
