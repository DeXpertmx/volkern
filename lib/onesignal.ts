import * as OneSignal from '@onesignal/node-onesignal';
import prisma from './db';

// Helper to get client on the fly (important for environment hot-reloading)
const getOneSignalClient = () => {
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!restApiKey) return null;
  
  const configuration = OneSignal.createConfiguration({
    restApiKey: restApiKey,
  });
  return new OneSignal.DefaultApi(configuration);
};

/**
 * Sends a push notification via OneSignal and logs it to the database.
 */
export const sendNotification = async (
  title: string,
  message: string,
  externalIds: string[],
  tenantId?: string
) => {
  const appId = process.env.ONESIGNAL_APP_ID;
  const client = getOneSignalClient();

  if (!appId || !client) {
    console.error('OneSignal credentials missing');
    return { success: false, error: 'Credenciales de OneSignal no configuradas' };
  }

  const notification = new OneSignal.Notification();
  notification.app_id = appId;
  notification.contents = { en: message, es: message };
  notification.headings = { en: title, es: title };
  (notification as any).include_external_user_ids = externalIds;

  try {
    const response = await client.createNotification(notification);
    
    // Log success
    if (tenantId) {
      await prisma.notificationLog.create({
        data: {
          tenantId,
          channel: 'push',
          recipientType: 'external_id',
          recipientId: externalIds.join(','),
          body: message,
          status: 'sent',
          metadata: { response: JSON.parse(JSON.stringify(response)) }
        }
      });
    }

    return { success: true, response };
  } catch (error: any) {
    console.error('Error sending OneSignal notification:', error);
    
    // Log failure
    if (tenantId) {
      await prisma.notificationLog.create({
        data: {
          tenantId,
          channel: 'push',
          recipientType: 'external_id',
          recipientId: externalIds.join(','),
          body: message,
          status: 'failed',
          errorMessage: error.message || 'Error desconocido al enviar push',
          metadata: { error: JSON.parse(JSON.stringify(error)) }
        }
      });
    }

    return { success: false, error: error.message };
  }
};

/**
 * Checks if OneSignal connectivity is healthy by attempting to view the app details.
 */
export const checkOneSignalHealth = async () => {
  const appId = process.env.ONESIGNAL_APP_ID;
  const client = getOneSignalClient();

  if (!appId || !client) {
    return {
      status: 'unconfigured',
      message: 'Variables de entorno faltantes'
    };
  }

  try {
    // Attempt to get app details - this verifies both APP_ID and REST_API_KEY
    const app = await client.getApp(appId);
    return { 
      status: 'healthy', 
      message: 'Conexión exitosa',
      appName: app.name 
    };
  } catch (error: any) {
    console.error('OneSignal Health Check failed:', error);
    return { 
      status: 'critical', 
      message: error.message || 'Fallo de autenticación con OneSignal' 
    };
  }
};
