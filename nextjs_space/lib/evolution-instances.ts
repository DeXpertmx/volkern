
/**
 * Evolution API - Gestión de Instancias por Usuario
 * Permite que cada miembro del equipo conecte su propio WhatsApp
 */

import prisma from '@/lib/db';

// Credenciales de Evolution API (desde las API secrets configuradas)
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evo.abacus.ai';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

// Log de configuración para debugging
console.log('🔧 Evolution API Configuration:', {
  url: EVOLUTION_API_URL,
  hasApiKey: !!EVOLUTION_API_KEY,
  apiKeyLength: EVOLUTION_API_KEY?.length || 0
});

export interface EvolutionInstance {
  instanceName: string;
  status: string;
  phoneNumber?: string;
  profileName?: string;
  profilePicUrl?: string;
}

export interface QRCodeData {
  base64: string;
  code: string;
  pairingCode?: string;
}

/**
 * Generar 4 dígitos aleatorios
 */
function generateRandomDigits(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Configurar webhooks para la instancia de Evolution API
 * Documentación: https://doc.evolution-api.com/v1/en/configuration/webhooks
 */
async function configureWebhooks(
  instanceName: string,
  webhookUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔗 Configurando webhooks para instancia:', instanceName);
    console.log('🌐 Webhook URL:', webhookUrl);

    const webhookConfig = {
      enabled: true,
      url: webhookUrl,
      webhook_by_events: false, // Recibir todos los eventos en una sola URL
      webhook_base64: true, // IMPORTANTE: Habilitar Base64 para medios
      events: [
        'QRCODE_UPDATED',
        'CONNECTION_UPDATE',
        'MESSAGES_SET',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE'
      ]
    };

    console.log('📤 Webhook config:', JSON.stringify(webhookConfig, null, 2));

    const response = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify(webhookConfig)
    });

    console.log('📥 Webhook config response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error al configurar webhooks:', errorText);
      console.log('⚠️ Continuando sin webhooks (puede configurarse después)');
      return {
        success: false,
        error: `Error al configurar webhooks: ${response.status}`
      };
    }

    const data = await response.json();
    console.log('✅ Webhooks configurados:', JSON.stringify(data, null, 2));

    return { success: true };
  } catch (error) {
    console.error('❌ Error al configurar webhooks:', error);
    console.log('⚠️ Continuando sin webhooks (puede configurarse después)');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Conectar a una instancia EXISTENTE de Evolution API (NO CREA una nueva)
 * El usuario debe crear la instancia manualmente en el panel de Evolution primero
 */
export async function connectToExistingInstance(
  userId: string,
  tenantId: string,
  instanceName: string
): Promise<{ success: boolean; instance?: any; error?: string }> {
  try {
    console.log('🔗 Conectando a instancia existente:', instanceName);
    console.log('👤 Usuario:', userId);

    // Validar configuración de Evolution API
    if (!EVOLUTION_API_KEY) {
      console.error('❌ EVOLUTION_API_KEY no está configurado');
      return {
        success: false,
        error: 'Evolution API no está configurado. Por favor contacta al administrador.'
      };
    }

    if (!EVOLUTION_API_URL) {
      console.error('❌ EVOLUTION_API_URL no está configurado');
      return {
        success: false,
        error: 'URL de Evolution API no está configurado. Por favor contacta al administrador.'
      };
    }

    // Validar que el nombre de instancia no esté vacío
    if (!instanceName || instanceName.trim() === '') {
      return {
        success: false,
        error: 'Por favor ingresa el nombre de tu instancia de WhatsApp.'
      };
    }

    // Limpiar el nombre de instancia (remover espacios)
    const cleanInstanceName = instanceName.trim();

    // Verificar si el usuario ya tiene una instancia
    const existingInstance = await prisma.userWhatsAppInstance.findFirst({
      where: { userId, tenantId }
    });

    if (existingInstance) {
      console.log('⚠️ Usuario ya tiene una instancia:', existingInstance.instanceName);
      return {
        success: false,
        error: 'Ya tienes una instancia de WhatsApp conectada. Por favor desconecta la actual antes de conectar una nueva.'
      };
    }

    // Verificar que la instancia exista en Evolution API
    console.log('🔍 Verificando que la instancia exista en Evolution API...');
    console.log('🌐 Endpoint:', `${EVOLUTION_API_URL}/instance/fetchInstances`);

    const fetchResponse = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY
      }
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      console.error('❌ Error al verificar instancias:', errorText);
      return {
        success: false,
        error: 'No se pudo verificar si la instancia existe. Verifica que el nombre sea correcto.'
      };
    }

    const instances = await fetchResponse.json();
    console.log('📋 Instancias disponibles:', JSON.stringify(instances, null, 2));

    // Buscar la instancia por nombre
    const foundInstance = Array.isArray(instances) 
      ? instances.find((inst: any) => inst.instance?.instanceName === cleanInstanceName)
      : null;

    if (!foundInstance) {
      console.error('❌ Instancia no encontrada:', cleanInstanceName);
      return {
        success: false,
        error: `La instancia "${cleanInstanceName}" no existe en Evolution API. Por favor:\n\n` +
          '1. Verifica que el nombre esté escrito correctamente\n' +
          '2. Asegúrate de haber creado la instancia en el panel de Evolution API primero\n' +
          '3. El nombre es sensible a mayúsculas y minúsculas'
      };
    }

    console.log('✅ Instancia encontrada en Evolution API:', foundInstance);

    // Configurar webhooks automáticamente
    const webhookUrl = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhook/evolution/${cleanInstanceName}`;
    console.log('🔗 Configurando webhooks para:', cleanInstanceName);
    const webhookResult = await configureWebhooks(cleanInstanceName, webhookUrl);
    
    if (!webhookResult.success) {
      console.warn('⚠️ Advertencia: No se pudieron configurar webhooks:', webhookResult.error);
      // No falla la conexión, solo advierte
    }

    // Guardar en base de datos
    const instance = await prisma.userWhatsAppInstance.create({
      data: {
        userId,
        tenantId,
        instanceName: cleanInstanceName,
        status: 'connecting',
        // Si la instancia ya tiene datos, guardarlos
        phoneNumber: foundInstance.instance?.owner || undefined,
        profileName: foundInstance.instance?.profileName || undefined
      }
    });

    console.log('✅ Instancia guardada en BD:', instance.id);

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId,
        tenantId,
        accion: 'conectar',
        entidad: 'UserWhatsAppInstance',
        entidadId: instance.id,
        descripcion: `Conectado a instancia existente de WhatsApp: ${cleanInstanceName}`
      }
    });

    console.log('✅ Conexión completada exitosamente');

    return { success: true, instance };
  } catch (error) {
    console.error('❌ Error al conectar a instancia de WhatsApp:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido al conectar a instancia'
    };
  }
}

/**
 * Obtener QR Code para conexión de WhatsApp
 * Documentación: https://doc.evolution-api.com/v1/api-reference/instance-controller/instance-connect
 */
export async function getQRCode(
  instanceName: string
): Promise<{ success: boolean; qrCode?: QRCodeData; error?: string }> {
  try {
    console.log('📱 Obteniendo QR Code para instancia:', instanceName);
    console.log('🌐 Endpoint:', `${EVOLUTION_API_URL}/instance/connect/${instanceName}`);

    const response = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY
      }
    });

    console.log('📥 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error al obtener QR:', errorText);
      
      let userMessage = 'Error al obtener QR Code.';
      if (response.status === 404) {
        userMessage = 'Instancia no encontrada. Por favor crea una nueva instancia.';
      } else if (response.status === 401 || response.status === 403) {
        userMessage = 'Error de autenticación con Evolution API.';
      }

      return {
        success: false,
        error: `${userMessage} (Código: ${response.status})`
      };
    }

    const data = await response.json();
    console.log('📥 Response data:', JSON.stringify(data, null, 2));
    
    // Según la documentación de Evolution API, el QR viene en diferentes formatos:
    // - data.base64: QR code en base64
    // - data.code: Código del QR
    // - data.pairingCode: Código de emparejamiento alternativo
    
    let qrBase64 = '';
    if (data.base64) {
      qrBase64 = data.base64;
    } else if (data.qrcode && data.qrcode.base64) {
      qrBase64 = data.qrcode.base64;
    } else if (data.code) {
      qrBase64 = data.code;
    }
    
    if (qrBase64) {
      console.log('✅ QR Code obtenido exitosamente');
      
      // Actualizar QR en base de datos
      await prisma.userWhatsAppInstance.updateMany({
        where: { instanceName },
        data: {
          qrCode: qrBase64,
          qrCodeExpiry: new Date(Date.now() + 60000), // Expira en 60 segundos
          status: 'connecting'
        }
      });

      return {
        success: true,
        qrCode: {
          base64: qrBase64,
          code: data.code || data.qrcode?.code || qrBase64,
          pairingCode: data.pairingCode
        }
      };
    }

    console.log('⚠️ QR Code no disponible en la respuesta');
    console.log('📝 Estructura de respuesta:', JSON.stringify(data, null, 2));
    
    return {
      success: false,
      error: 'QR Code no disponible. La instancia puede estar ya conectada o en proceso.'
    };
  } catch (error) {
    console.error('❌ Error al obtener QR Code:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido al obtener QR'
    };
  }
}

/**
 * Verificar estado de conexión de una instancia
 */
export async function checkInstanceStatus(
  instanceName: string
): Promise<{ success: boolean; status?: string; data?: any; error?: string }> {
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY
      }
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Error al verificar estado: ${response.status}`
      };
    }

    const data = await response.json();
    
    // Mapear estados de Evolution API a nuestros estados
    let status = 'disconnected';
    if (data.state === 'open') {
      status = 'connected';
    } else if (data.state === 'connecting') {
      status = 'connecting';
    }

    // Actualizar estado en base de datos
    const updateData: any = { status };
    
    if (status === 'connected') {
      updateData.fechaConexion = new Date();
      updateData.qrCode = null; // Limpiar QR una vez conectado
      updateData.qrCodeExpiry = null;
    }

    await prisma.userWhatsAppInstance.updateMany({
      where: { instanceName },
      data: updateData
    });

    return {
      success: true,
      status,
      data
    };
  } catch (error) {
    console.error('Error al verificar estado de instancia:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Obtener información del perfil de WhatsApp conectado
 */
export async function getProfileInfo(
  instanceName: string
): Promise<{ success: boolean; profile?: any; error?: string }> {
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/chat/fetchProfile/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: 'me' // Obtener info del propio usuario
      })
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Error al obtener perfil: ${response.status}`
      };
    }

    const profile = await response.json();

    // Actualizar información de perfil en base de datos
    if (profile) {
      await prisma.userWhatsAppInstance.updateMany({
        where: { instanceName },
        data: {
          phoneNumber: profile.id?.replace('@s.whatsapp.net', ''),
          profileName: profile.name || profile.notify,
          profilePicUrl: profile.profilePicUrl
        }
      });
    }

    return { success: true, profile };
  } catch (error) {
    console.error('Error al obtener info de perfil:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Desconectar y eliminar instancia de WhatsApp
 */
export async function deleteInstance(
  userId: string,
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Buscar instancia del usuario
    const instance = await prisma.userWhatsAppInstance.findFirst({
      where: { userId, tenantId }
    });

    if (!instance) {
      return { success: false, error: 'Instancia no encontrada' };
    }

    // Eliminar instancia en Evolution API
    try {
      await fetch(`${EVOLUTION_API_URL}/instance/delete/${instance.instanceName}`, {
        method: 'DELETE',
        headers: {
          'apikey': EVOLUTION_API_KEY
        }
      });
    } catch (error) {
      console.log('Instancia no existe en Evolution API, continuando con eliminación local');
    }

    // Eliminar de base de datos
    await prisma.userWhatsAppInstance.delete({
      where: { id: instance.id }
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId,
        tenantId,
        accion: 'eliminar',
        entidad: 'UserWhatsAppInstance',
        entidadId: instance.id,
        descripcion: `Instancia de WhatsApp eliminada: ${instance.instanceName}`
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Error al eliminar instancia:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Enviar mensaje usando la instancia del usuario
 */
export async function sendMessageWithUserInstance(
  instanceName: string,
  to: string,
  message: string,
  mediaUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Asegurar formato correcto del número
    const formattedNumber = to.includes('@') ? to : `${to}@s.whatsapp.net`;

    const payload: any = {
      number: formattedNumber,
      text: message
    };

    if (mediaUrl) {
      payload.mediaUrl = mediaUrl;
    }

    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Error al enviar mensaje: ${response.status} - ${errorText}`
      };
    }

    const data = await response.json();

    // Actualizar estadísticas
    await prisma.userWhatsAppInstance.updateMany({
      where: { instanceName },
      data: {
        totalMensajes: { increment: 1 },
        ultimoMensaje: new Date()
      }
    });

    return {
      success: true,
      messageId: data.key?.id || data.messageId
    };
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Obtener instancia activa de un usuario
 */
export async function getUserInstance(
  userId: string,
  tenantId: string
): Promise<{ instance?: any; error?: string }> {
  try {
    const instance = await prisma.userWhatsAppInstance.findFirst({
      where: {
        userId,
        tenantId,
        status: 'connected'
      },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!instance) {
      return { error: 'No se encontró instancia activa de WhatsApp' };
    }

    return { instance };
  } catch (error) {
    console.error('Error al obtener instancia de usuario:', error);
    return {
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}
