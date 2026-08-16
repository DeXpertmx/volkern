
/**
 * Evolution API - Gestión de Instancias por Usuario
 * Permite que cada miembro del equipo conecte su propio WhatsApp
 */

import crypto from 'node:crypto';
import prisma from '@/lib/db';

// ─────────────────────────────────────────────────────────────────────────────
// Registro en memoria de claves de mensaje enviadas POR EL PUENTE
// (sendMessageWithUserInstance). Evolution reenvía un evento messages.upsert
// (fromMe) cuando nosotros mismos enviamos un mensaje: ese "eco" no debe
// volver a sincronizarse a Chatwoot ni crear mensaje local, porque provocaría
// un bucle infinito (Chatwoot → webhook → Evolution → eco → Chatwoot → ...).
// Con la clave registrada, el webhook reconoce el eco y lo descarta.
// ─────────────────────────────────────────────────────────────────────────────
const recentlySentMessageKeys = new Map<string, number>();
const SENT_KEY_TTL_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Marca una clave de mensaje de Evolution como enviada por nuestro puente.
 */
export function markMessageKeyAsSent(keyId?: string | null): void {
  if (!keyId) return;
  recentlySentMessageKeys.set(keyId, Date.now());
  if (recentlySentMessageKeys.size > 5000) {
    const now = Date.now();
    for (const [k, ts] of recentlySentMessageKeys) {
      if (now - ts > SENT_KEY_TTL_MS) recentlySentMessageKeys.delete(k);
    }
  }
}

/**
 * ¿Esta clave de mensaje fue enviada recientemente por nuestro puente?
 * (es decir, el messages.upsert que llega es el eco de nuestro propio envío)
 */
export function isMessageKeyRecentlySent(keyId?: string | null): boolean {
  if (!keyId) return false;
  const ts = recentlySentMessageKeys.get(keyId);
  if (!ts) return false;
  if (Date.now() - ts > SENT_KEY_TTL_MS) {
    recentlySentMessageKeys.delete(keyId);
    return false;
  }
  return true;
}

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

    // Evolution API v2 exige envolver el payload en un objeto `webhook`:
    // { webhook: { url, events, ... } }. Sin el wrapper devuelve 400
    // "instance requires property webhook" y la instancia queda sin eventos.
    const webhookConfig = {
      webhook: {
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
      }
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
 * Crear una instancia nueva en Evolution API, configurar sus webhooks y dejarla
 * lista para que el usuario escanee el QR desde Volkern.
 */
export async function createAndConnectInstance(
  userId: string,
  tenantId: string,
  requestedName?: string
): Promise<{ success: boolean; instance?: any; error?: string }> {
  const cleanInstanceName = (requestedName || `volkern_${tenantId.slice(-8)}_${crypto.randomBytes(3).toString('hex')}`)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40)

  try {
    if (!EVOLUTION_API_KEY) {
      return { success: false, error: 'El servicio de WhatsApp no está configurado en el servidor.' }
    }

    const existingLocal = await prisma.userWhatsAppInstance.findFirst({
      where: { userId, tenantId },
    })
    if (existingLocal) {
      return { success: false, error: 'Ya tienes una instancia de WhatsApp. Desconecta la actual antes de crear otra.' }
    }

    const response = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        instanceName: cleanInstanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      await response.text()
      if (response.status === 409) {
        return { success: false, error: `La instancia "${cleanInstanceName}" ya existe. Elige otro nombre.` }
      }
      return { success: false, error: `No se pudo crear la instancia de WhatsApp (HTTP ${response.status}).` }
    }

    const created = await response.json()
    const webhookUrl = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhook/evolution/${cleanInstanceName}`
    await configureWebhooks(cleanInstanceName, webhookUrl)

    let qrBase64 = created.base64 || created.qrcode?.base64 || created.qrCode?.base64 || ''
    let qrCode = created.code || created.qrcode?.code || created.qrCode?.code || ''
    let pairingCode = created.pairingCode || created.qrcode?.pairingCode

    if (!qrBase64) {
      const qrResult = await getQRCode(cleanInstanceName)
      if (qrResult.success && qrResult.qrCode) {
        qrBase64 = qrResult.qrCode.base64
        qrCode = qrResult.qrCode.code
        pairingCode = qrResult.qrCode.pairingCode
      }
    }

    const instance = await prisma.userWhatsAppInstance.create({
      data: {
        userId,
        tenantId,
        instanceName: cleanInstanceName,
        status: 'connecting',
        qrCode: qrBase64 || undefined,
        qrCodeExpiry: qrBase64 ? new Date(Date.now() + 60000) : undefined,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId,
        tenantId,
        accion: 'crear_conectar',
        entidad: 'UserWhatsAppInstance',
        entidadId: instance.id,
        descripcion: `Instancia de WhatsApp creada desde Volkern: ${cleanInstanceName}`,
      },
    })

    return {
      success: true,
      instance: {
        ...instance,
        qrCode: qrBase64 || null,
        qrCodeData: qrBase64 ? { base64: qrBase64, code: qrCode, pairingCode } : null,
      },
    }
  } catch (error) {
    console.error('❌ Error al crear instancia de WhatsApp:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido al crear la instancia',
    }
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
        error: 'El servicio de WhatsApp no está configurado. Por favor contacta al administrador.'
      };
    }

    if (!EVOLUTION_API_URL) {
      console.error('❌ EVOLUTION_API_URL no está configurado');
      return {
        success: false,
        error: 'La URL del servicio de WhatsApp no está configurada. Por favor contacta al administrador.'
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
        error: `La instancia "${cleanInstanceName}" no existe. Por favor:\n\n` +
          '1. Verifica que el nombre esté escrito correctamente\n' +
          '2. Asegúrate de haber creado la instancia en el panel de WhatsApp primero\n' +
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
        userMessage = 'Error de autenticación con el servicio de WhatsApp.';
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
 * Mapea el estado de Evolution API (v2: `data.instance.state`, v1: `data.state`)
 * a los estados internos de Volkern.
 */
export function mapEvolutionState(state: string | undefined): 'connected' | 'connecting' | 'disconnected' {
  if (state === 'open') return 'connected';
  if (state === 'connecting') return 'connecting';
  return 'disconnected';
}

/**
 * Extrae el número y perfil del propietario desde el payload de CONNECTION_UPDATE
 * de Evolution API (campos `phone`, `name`, `id`/`ownerJid`, `profilePicUrl`).
 */
export function extractOwnerProfileFromConnection(data: any): {
  phoneNumber?: string;
  profileName?: string;
  profilePicUrl?: string;
} {
  if (!data) return {};
  const raw = data.phone || data.id || data.ownerJid || data.remoteJid || '';
  const phoneNumber = String(raw).replace('@s.whatsapp.net', '').replace('@g.us', '');
  return {
    phoneNumber: phoneNumber || undefined,
    profileName: data.name || data.profileName || data.notify || undefined,
    profilePicUrl: data.profilePicUrl || data.profilePic || undefined,
  };
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

    // Evolution API v2 devuelve el estado en `data.instance.state`
    // (versiones antiguas en `data.state`). Soportar ambas.
    const state = data?.instance?.state ?? data?.state;

    // Mapear estados de Evolution API a nuestros estados
    const status = mapEvolutionState(state);

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
 * Obtener información del perfil de WhatsApp conectado.
 *
 * fetchProfile con `number: 'me'` no funciona en algunas versiones de
 * Evolution (devuelve 400); por eso primero se intenta con 'me', y si no hay
 * datos se obtiene el ownerJid desde fetchInstances y se reintenta el perfil
 * con el número real del propietario.
 */
export async function getProfileInfo(
  instanceName: string
): Promise<{ success: boolean; profile?: any; error?: string }> {
  let profile: any = {};

  // 1. Intento con `number: 'me'` (funciona en la mayoría de versiones)
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/chat/fetchProfile/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({ number: 'me' })
    });
    if (response.ok) {
      const json = await response.json();
      if (json && (json.id || json.name)) {
        profile = json;
      }
    } else {
      console.warn(`⚠️ fetchProfile(me) devolvió ${response.status}; se usará el fallback por ownerJid`);
    }
  } catch (profileErr) {
    console.warn('⚠️ Error en fetchProfile(me):', profileErr);
  }

  let phoneNumber = String(profile?.id || '').replace('@s.whatsapp.net', '').replace('@g.us', '');
  let profileName = profile?.name || profile?.notify;
  let profilePicUrl = profile?.profilePicUrl;

  // 2. Fallback: obtener ownerJid desde fetchInstances (siempre disponible
  //    con la instancia conectada) y reintentar el perfil con el número real.
  if (!phoneNumber || !profileName) {
    try {
      const instancesRes = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
        headers: { apikey: EVOLUTION_API_KEY },
      });
      if (instancesRes.ok) {
        const instances = await instancesRes.json();
        const found = Array.isArray(instances)
          ? instances.find((inst: any) => inst?.instance?.instanceName === instanceName || inst?.name === instanceName)
          : null;
        const ownerJid = found?.ownerJid || found?.instance?.ownerJid || '';
        const ownerNumber = String(ownerJid).replace('@s.whatsapp.net', '').replace('@g.us', '');

        if (!phoneNumber && ownerNumber) {
          phoneNumber = ownerNumber;
        }
        if (!profileName) {
          profileName = found?.profileName || found?.instance?.profileName || undefined;
        }
        if (!profilePicUrl) {
          profilePicUrl = found?.profilePicUrl || found?.instance?.profilePicUrl || undefined;
        }

        // Reintento del perfil con el número real del propietario
        if (ownerNumber && (!profile?.name || !profile?.profilePicUrl)) {
          try {
            const retry = await fetch(`${EVOLUTION_API_URL}/chat/fetchProfile/${instanceName}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
              body: JSON.stringify({ number: ownerNumber }),
            });
            if (retry.ok) {
              const retryJson = await retry.json();
              // Algunas versiones devuelven `wuid`/`picture` en vez de `id`/`profilePicUrl`
              profile = {
                ...profile,
                ...(retryJson?.id || retryJson?.wuid ? { id: retryJson.id || retryJson.wuid } : {}),
                ...(retryJson?.name ? { name: retryJson.name } : {}),
                ...(retryJson?.profilePicUrl || retryJson?.picture ? { profilePicUrl: retryJson.profilePicUrl || retryJson.picture } : {}),
              };
              profileName = profile.name || profileName;
              profilePicUrl = profile.profilePicUrl || profilePicUrl;
            }
          } catch (retryErr) {
            console.warn('⚠️ Error reintentando fetchProfile con número real:', retryErr);
          }
        }
      }
    } catch (instErr) {
      console.warn('⚠️ No se pudo obtener el ownerJid desde fetchInstances:', instErr);
    }
  }

  // Actualizar información de perfil en base de datos
  if (phoneNumber || profileName || profilePicUrl) {
    await prisma.userWhatsAppInstance.updateMany({
      where: { instanceName },
      data: {
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(profileName ? { profileName } : {}),
        ...(profilePicUrl ? { profilePicUrl } : {}),
      },
    });
  }

  return {
    success: true,
    profile: {
      ...profile,
      id: phoneNumber ? `${phoneNumber}@s.whatsapp.net` : profile?.id,
      name: profileName,
      profilePicUrl,
    },
  };
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
 * Añade como miembros del inbox de Chatwoot al bot y a los usuarios Admin del
 * tenant (mapeo por email, creando el usuario en Chatwoot si no existe). Sin
 * membresía, los agentes no ven las conversaciones del inbox en el hub.
 */
async function syncInboxMembers(
  tenantId: string,
  chatwootAccountId: number,
  inboxId: number,
  accountAccessToken: string,
  chatwootApi: any,
): Promise<number[]> {
  const memberIds: number[] = []

  // El bot siempre: el puente API opera con él.
  try {
    const botUser = await chatwootApi.getOrCreateBotUser()
    if (botUser?.id && !memberIds.includes(botUser.id)) memberIds.push(botUser.id)
  } catch (botErr) {
    console.warn('[Chatwoot] No se pudo obtener el bot:', botErr instanceof Error ? botErr.message : botErr)
  }

  // Admins del tenant (rol Admin) vinculados por email
  const tenantAdmins = await prisma.user.findMany({
    where: {
      tenantId,
      role: { nombre: { in: ['Admin', 'admin', 'Administrador', 'administrator'] } },
    },
    select: { email: true, name: true },
  })
  for (const admin of tenantAdmins) {
    if (!admin.email) continue
    try {
      const userId = await chatwootApi.ensureUserInAccountByEmail(
        chatwootAccountId,
        admin.email,
        admin.name || admin.email,
        accountAccessToken,
      )
      if (userId && !memberIds.includes(userId)) memberIds.push(userId)
    } catch (adminErr) {
      console.warn('[Chatwoot] No se pudo vincular admin del tenant:', adminErr instanceof Error ? adminErr.message : adminErr)
    }
  }

  if (memberIds.length > 0) {
    await chatwootApi.addInboxMembers(chatwootAccountId, inboxId, memberIds, accountAccessToken)
    console.log('[Chatwoot] Miembros del inbox añadidos:', memberIds.join(','))
  }
  return memberIds
}

/**
 * Conecta la instancia de WhatsApp a Chatwoot creando el inbox Evolution.
 * Se ejecuta automáticamente cuando la instancia queda conectada (open) para
 * tener el número real del propietario antes de crear el canal.
 */
export async function ensureChatwootInboxForInstance(
  instanceName: string
): Promise<{ success: boolean; inboxId?: number; error?: string }> {
  const chatwootUrl = process.env.CHATWOOT_BASE_URL
  const chatwootToken = process.env.CHATWOOT_SUPER_ADMIN_TOKEN
  if (!chatwootUrl || !chatwootToken) {
    return { success: false, error: 'El centro de comunicaciones no está configurado en el servidor.' }
  }
  if (!EVOLUTION_API_KEY) {
    return { success: false, error: 'El servicio de WhatsApp no está configurado en el servidor.' }
  }

  try {
    const instance = await prisma.userWhatsAppInstance.findFirst({
      where: { instanceName },
      include: { tenant: { select: { nombre: true } } },
    })
    if (!instance) {
      return { success: false, error: 'Instancia no encontrada.' }
    }

    // Evitar duplicados: si ya existe un canal WhatsApp del tenant, reutilizar.
    const existingChannel = await prisma.channel.findFirst({
      where: { tenantId: instance.tenantId, type: 'whatsapp' },
    })
    if (existingChannel?.chatwootInboxId) {
      // Asegurar también la membresía del inbox (bot + admins del tenant) en
      // caso de que se haya creado antes de este fix, y persistir el asignado
      // por defecto si el canal no lo tiene.
      try {
        const hubConfigEarly = await prisma.messagingHubConfig.findUnique({
          where: { tenantId: instance.tenantId },
        })
        if (hubConfigEarly?.chatwootAccountId) {
          const chatwootApiEarly = (await import('@/lib/nexus/chatwoot-api')).chatwootApi
          const accountTokenEarly = await chatwootApiEarly.ensureBotUserInAccount(hubConfigEarly.chatwootAccountId)
          const memberIds = await syncInboxMembers(instance.tenantId, hubConfigEarly.chatwootAccountId, existingChannel.chatwootInboxId, accountTokenEarly, chatwootApiEarly)
          const existingConfig: any = existingChannel.config || {}
          if (!existingConfig.defaultAssigneeId && memberIds.length > 0) {
            const botUserEarly = await chatwootApiEarly.getOrCreateBotUser()
            const defaultAssignee = memberIds.find((id: number) => id !== botUserEarly?.id)
            if (defaultAssignee) {
              existingConfig.defaultAssigneeId = defaultAssignee
              await prisma.channel.update({
                where: { id: existingChannel.id },
                data: { config: existingConfig },
              })
              console.log('[Chatwoot] Asignado por defecto persistido para canal existente:', defaultAssignee)
            }
          }
        }
      } catch (earlyErr) {
        console.warn('[Chatwoot] No se pudo sincronizar miembros del inbox existente:', earlyErr instanceof Error ? earlyErr.message : earlyErr)
      }
      return { success: true, inboxId: existingChannel.chatwootInboxId }
    }

    const hubConfig = await prisma.messagingHubConfig.findUnique({
      where: { tenantId: instance.tenantId },
    })

    const chatwootApi = (await import('@/lib/nexus/chatwoot-api')).chatwootApi
    let chatwootAccountId = hubConfig?.chatwootAccountId ?? null
    let accountAccessToken: string | null = null

    if (!chatwootAccountId) {
      const { account, accessToken } = await chatwootApi.createAccountWithAccess(
        instance.tenant?.nombre || 'Empresa',
        'es',
      )
      chatwootAccountId = account.id
      accountAccessToken = accessToken
    } else {
      accountAccessToken = await chatwootApi.ensureBotUserInAccount(chatwootAccountId)
    }

    // Teléfono real del propietario (puede llegar del perfil ya sincronizado)
    let phoneNumber = instance.phoneNumber || ''
    if (!phoneNumber) {
      const profileResult = await getProfileInfo(instanceName)
      phoneNumber = profileResult.profile?.id?.replace('@s.whatsapp.net', '') || phoneNumber
    }
    if (!phoneNumber) {
      return { success: false, error: 'Aún no hay número de WhatsApp disponible para crear el canal.' }
    }

    // Canal API de Chatwoot (4.x no soporta provider 'evolution'; el puente
    // entrante lo hace Volkern vía REST y el webhook de cuenta devuelve las
    // respuestas del agente para reenviarlas por Evolution).
    const inbox = await chatwootApi.createApiInbox(
      chatwootAccountId,
      `WhatsApp - ${instance.tenant?.nombre || 'Empresa'}`,
      '',
      accountAccessToken,
    )

    // Webhook de CUENTA de Chatwoot → Volkern: recibe las respuestas del
    // agente (message_created outgoing) para reenviarlas a WhatsApp.
    // Chatwoot devuelve el `secret` al crear el webhook; ese secret es el que
    // firma cada payload y debe guardarse para validar los eventos.
    const chatwootWebhookUrl = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/integrations/webhook/chatwoot`
    let chatwootWebhookSecret = hubConfig?.webhookSecret || ''
    try {
      const webhookResult = await chatwootApi.configureWebhook(
        chatwootAccountId,
        chatwootWebhookUrl,
        accountAccessToken,
      )
      if (webhookResult.secret) {
        chatwootWebhookSecret = webhookResult.secret
      }
    } catch (webhookError) {
      // Puede ya existir (url única por cuenta); no es crítico.
      console.warn('[Chatwoot] Webhook de cuenta ya existente o error:', webhookError)
    }

    const webhookUrl = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhook/evolution/${instanceName}`
    // Guardar el canal y la referencia del inbox. El secret del webhook de
    // Chatwoot va en el config del canal (NO en messagingHubConfig.webhookSecret,
    // que es exclusivo del flujo Telegram/nexus-sync y es UNIQUE).
    const channelConfig: {
      provider: string;
      instanceName: string;
      phoneNumber: string;
      apiUrl: string;
      webhookUrl: string;
      chatwootWebhookSecret: string;
      defaultAssigneeId?: number;
    } = {
      provider: 'evolution',
      instanceName,
      phoneNumber,
      apiUrl: EVOLUTION_API_URL,
      webhookUrl,
      chatwootWebhookSecret,
    }
    if (existingChannel) {
      await prisma.channel.update({
        where: { id: existingChannel.id },
        data: {
          isActive: true,
          chatwootInboxId: inbox.id,
          config: channelConfig,
        },
      })
    } else {
      await prisma.channel.create({
        data: {
          tenantId: instance.tenantId,
          type: 'whatsapp',
          name: `WhatsApp - ${instance.tenant?.nombre || 'Empresa'}`,
          chatwootInboxId: inbox.id,
          isActive: true,
          isDefault: true,
          config: channelConfig,
        },
      })
    }

    // Actualizar hub config (se crea si el tenant aún no tiene uno) sin tocar
    // webhookSecret (puede estar en uso por el flujo Telegram).
    const syncWebhookUrl = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhooks/nexus-sync`
    if (hubConfig) {
      await prisma.messagingHubConfig.update({
        where: { tenantId: instance.tenantId },
        data: {
          isActive: true,
          chatwootAccountId,
          whatsappInboxId: inbox.id,
        },
      })
    } else {
      const webhookSecret = crypto.randomBytes(32).toString('hex')
      await prisma.messagingHubConfig.create({
        data: {
          tenantId: instance.tenantId,
          isActive: true,
          hubBaseUrl: chatwootUrl,
          hubApiToken: chatwootToken,
          hubAccountId: String(chatwootAccountId),
          chatwootAccountId,
          whatsappInboxId: inbox.id,
          webhookSecret,
          webhookUrl: syncWebhookUrl,
          autoProvisioned: true,
          provisionedAt: new Date(),
        },
      })
    }

    // Habilitar Nexus en el tenant
    await prisma.tenant.update({
      where: { id: instance.tenantId },
      data: { nexusEnabled: true },
    })

    // Miembros del inbox: el bot siempre + usuarios Admin del tenant (mapeo por
    // email). Sin membresía, los agentes no ven las conversaciones del inbox
    // en el hub ("Sin asignar"/"Todas" quedan vacías). Se guarda además el
    // primer agente no-bot como asignado por defecto para las conversaciones.
    try {
      const memberIds = await syncInboxMembers(instance.tenantId, chatwootAccountId, inbox.id, accountAccessToken, chatwootApi)
      if (memberIds.length > 0 && !channelConfig.defaultAssigneeId) {
        const botUser = await chatwootApi.getOrCreateBotUser()
        const defaultAssignee = memberIds.find((id: number) => id !== botUser?.id)
        if (defaultAssignee) {
          channelConfig.defaultAssigneeId = defaultAssignee
          // Persistir en el canal (se creó/actualizó justo arriba con la
          // config sin el asignado; aquí se completa).
          const channelRow = await prisma.channel.findFirst({
            where: { tenantId: instance.tenantId, type: 'whatsapp' },
          })
          if (channelRow) {
            await prisma.channel.update({
              where: { id: channelRow.id },
              data: { config: channelConfig },
            })
            console.log('[Chatwoot] Asignado por defecto persistido:', defaultAssignee)
          }
        }
      }
    } catch (memberErr) {
      console.warn('[Chatwoot] Error añadiendo miembros al inbox:', memberErr instanceof Error ? memberErr.message : memberErr)
    }

    console.log('[Chatwoot] Inbox Evolution creado para instancia:', instanceName, 'id:', inbox.id)
    return { success: true, inboxId: inbox.id }
  } catch (error) {
    console.error('❌ Error conectando instancia a Chatwoot:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido conectando el canal de mensajería',
    }
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
    // Asegurar formato correcto del número: normalizar a JID (sin '+', sin
    // sufijo @s.whatsapp.net) — puede llegar como '5215...', '+5215...' o
    // '5215...@s.whatsapp.net' (p.ej. desde conversation.contact.phone_number).
    const cleanNumber = to
      .replace('@s.whatsapp.net', '')
      .replace('@g.us', '')
      .replace(/\+/g, '')
      .replace(/[\s\-\()]/g, '');
    const formattedNumber = `${cleanNumber}@s.whatsapp.net`;

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

    // Registrar la clave del mensaje enviado: cuando Evolution reenvíe el eco
    // (messages.upsert fromMe), el webhook lo reconocerá y no lo re-sincronizará
    // a Chatwoot (evita el bucle infinito del puente).
    const messageKey = data.key?.id || data.messageId;
    markMessageKeyAsSent(messageKey);

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
      messageId: messageKey
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
