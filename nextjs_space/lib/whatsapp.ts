
/**
 * WhatsApp Integration via Evolution API
 * Funciones para enviar mensajes y gestionar instancia
 */

import prisma from '@/lib/db'

interface WhatsAppCredentials {
  api_key: string
  instance_name: string
  api_url?: string
}

/**
 * Cargar credenciales desde la base de datos
 * @param tenantId ID del tenant (opcional si se usa con sesión)
 *
 * Prioridad:
 * 1. Instancia de WhatsApp del Negocio conectada desde Volkern
 *    (TenantWhatsAppInstance status=connected). Usa la API Key global del
 *    servidor (EVOLUTION_API_KEY/EVOLUTION_API_URL).
 * 2. Integración legacy de Evolution API (credenciales por tenant).
 */
async function loadCredentialsFromDB(tenantId: string): Promise<WhatsAppCredentials> {
  try {
    // 1. Instancia del WhatsApp del Negocio (conectada desde Configuración)
    const instance = await prisma.tenantWhatsAppInstance.findFirst({
      where: { tenantId, status: 'connected' },
      orderBy: { fechaConexion: 'desc' },
      select: { instanceName: true },
    })

    if (instance?.instanceName) {
      const apiKey = process.env.EVOLUTION_API_KEY
      const apiUrl = process.env.EVOLUTION_API_URL || 'https://api.dimension.expert'
      if (apiKey) {
        return {
          api_key: apiKey,
          instance_name: instance.instanceName,
          api_url: apiUrl,
        }
      }
    }

    // 2. Fallback: canal whatsapp configurado (provider evolution)
    const channel = await prisma.channel.findFirst({
      where: { tenantId, type: 'whatsapp', isActive: true },
      select: { config: true },
    })
    const channelConfig = (channel?.config as any) || {}
    if (channelConfig.instanceName) {
      const apiKey = channelConfig.apiKey || process.env.EVOLUTION_API_KEY
      const apiUrl = channelConfig.apiUrl || process.env.EVOLUTION_API_URL || 'https://api.dimension.expert'
      if (apiKey) {
        return {
          api_key: apiKey,
          instance_name: channelConfig.instanceName,
          api_url: apiUrl,
        }
      }
    }

    // 3. Integración legacy de Evolution API para el tenant
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: tenantId,
        tipo: 'evolution',
        activo: true
      }
    })

    if (!integration || !integration.credenciales) {
      throw new Error('WhatsApp no está conectado. Conecta el número del negocio en Configuración → WhatsApp del Negocio.')
    }

    const creds = integration.credenciales as any

    if (!creds.api_key || !creds.instance_name) {
      throw new Error('La configuración de WhatsApp está incompleta.')
    }

    return {
      api_key: creds.api_key,
      instance_name: creds.instance_name,
      api_url: creds.api_url || 'https://evo.abacus.ai'
    }
  } catch (error) {
    console.error('❌ Error al cargar credenciales de Evolution API:', error)
    throw error
  }
}

/**
 * Enviar mensaje de texto por WhatsApp
 */
export async function sendWhatsAppMessage(to: string, message: string, tenantId: string) {
  try {
    console.log('📤 [WhatsApp] Intentando enviar mensaje...')
    console.log('📤 [WhatsApp] Tenant ID:', tenantId)
    
    const creds = await loadCredentialsFromDB(tenantId)
    
    console.log('📤 [WhatsApp] Credenciales cargadas:')
    console.log('  - API URL:', creds.api_url)
    console.log('  - Instance Name:', creds.instance_name)
    console.log('  - API Key:', creds.api_key ? `${creds.api_key.substring(0, 10)}...` : 'NO CONFIGURADA')
    
    // Limpiar número de teléfono (remover espacios, guiones, etc.)
    const cleanPhone = to.replace(/[^\d+]/g, '')
    console.log('📤 [WhatsApp] Teléfono limpio:', cleanPhone)
    
    const url = `${creds.api_url}/message/sendText/${creds.instance_name}`
    console.log('📤 [WhatsApp] URL completa:', url)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': creds.api_key,
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: message,
      }),
    })

    console.log('📤 [WhatsApp] Respuesta HTTP:', response.status, response.statusText)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [WhatsApp] Error de API:', errorText)
      
      // Mensaje de error más específico
      let errorMessage = `Error ${response.status}: `
      
      if (response.status === 403) {
        errorMessage += 'Acceso denegado. Verifica que:\n' +
          '1. La API Key sea correcta\n' +
          '2. La instancia de WhatsApp esté conectada\n' +
          '3. El nombre de la instancia sea correcto'
      } else if (response.status === 404) {
        errorMessage += 'Instancia no encontrada. Verifica el nombre de la instancia.'
      } else if (response.status === 401) {
        errorMessage += 'API Key inválida o expirada.'
      } else {
        errorMessage += errorText
      }
      
      throw new Error(errorMessage)
    }

    const result = await response.json()
    console.log('✅ [WhatsApp] Mensaje enviado exitosamente:', result.key?.id)
    
    return {
      success: true,
      messageId: result.key?.id,
      data: result,
    }
  } catch (error: any) {
    console.error('❌ [WhatsApp] Error enviando mensaje:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Enviar mensaje con imagen
 */
export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption: string | undefined,
  tenantId: string
) {
  try {
    const creds = await loadCredentialsFromDB(tenantId)
    const cleanPhone = to.replace(/[^\d+]/g, '')
    
    const response = await fetch(`${creds.api_url}/message/sendMedia/${creds.instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': creds.api_key,
      },
      body: JSON.stringify({
        number: cleanPhone,
        media: imageUrl,
        caption: caption || '',
        mediatype: 'image'
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`WhatsApp API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    return {
      success: true,
      messageId: result.key?.id,
      data: result,
    }
  } catch (error: any) {
    console.error('Error sending WhatsApp image:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Enviar mensaje con documento
 */
export async function sendWhatsAppDocument(
  to: string,
  documentUrl: string,
  filename: string,
  caption: string | undefined,
  tenantId: string
) {
  try {
    const creds = await loadCredentialsFromDB(tenantId)
    const cleanPhone = to.replace(/[^\d+]/g, '')
    
    const response = await fetch(`${creds.api_url}/message/sendMedia/${creds.instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': creds.api_key,
      },
      body: JSON.stringify({
        number: cleanPhone,
        media: documentUrl,
        caption: caption || '',
        fileName: filename,
        mediatype: 'document'
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`WhatsApp API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    return {
      success: true,
      messageId: result.key?.id,
      data: result,
    }
  } catch (error: any) {
    console.error('Error sending WhatsApp document:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Enviar mensaje con media (flexible)
 * @deprecated Usar sendWhatsAppImage o sendWhatsAppDocument
 */
export async function sendWhatsAppMessageWithMedia(
  to: string,
  message: string,
  mediaUrl: string,
  mediaType: 'image' | 'video' | 'document' = 'document',
  tenantId: string
) {
  try {
    console.log('📤 [WhatsApp Media] Intentando enviar mensaje con media...')
    console.log('📤 [WhatsApp Media] Tenant ID:', tenantId)
    console.log('📤 [WhatsApp Media] Tipo de media:', mediaType)
    
    const creds = await loadCredentialsFromDB(tenantId)
    
    console.log('📤 [WhatsApp Media] Credenciales cargadas:')
    console.log('  - API URL:', creds.api_url)
    console.log('  - Instance Name:', creds.instance_name)
    console.log('  - API Key:', creds.api_key ? `${creds.api_key.substring(0, 10)}...` : 'NO CONFIGURADA')
    
    const cleanPhone = to.replace(/[^\d+]/g, '')
    console.log('📤 [WhatsApp Media] Teléfono limpio:', cleanPhone)
    
    const body: any = {
      number: cleanPhone,
      caption: message,
      media: mediaUrl,
      mediatype: mediaType
    }

    const url = `${creds.api_url}/message/sendMedia/${creds.instance_name}`
    console.log('📤 [WhatsApp Media] URL completa:', url)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': creds.api_key,
      },
      body: JSON.stringify(body),
    })

    console.log('📤 [WhatsApp Media] Respuesta HTTP:', response.status, response.statusText)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [WhatsApp Media] Error de API:', errorText)
      
      // Mensaje de error más específico
      let errorMessage = `Error ${response.status}: `
      
      if (response.status === 403) {
        errorMessage += 'Acceso denegado. Verifica que:\n' +
          '1. La API Key sea correcta\n' +
          '2. La instancia de WhatsApp esté conectada\n' +
          '3. El nombre de la instancia sea correcto'
      } else if (response.status === 404) {
        errorMessage += 'Instancia no encontrada. Verifica el nombre de la instancia.'
      } else if (response.status === 401) {
        errorMessage += 'API Key inválida o expirada.'
      } else {
        errorMessage += errorText
      }
      
      throw new Error(errorMessage)
    }

    const result = await response.json()
    console.log('✅ [WhatsApp Media] Mensaje enviado exitosamente:', result.key?.id)
    
    return {
      success: true,
      messageId: result.key?.id,
      data: result,
    }
  } catch (error: any) {
    console.error('❌ [WhatsApp Media] Error enviando mensaje:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Obtener el estado de la instancia de WhatsApp
 */
export async function getInstanceStatus(tenantId: string) {
  try {
    const creds = await loadCredentialsFromDB(tenantId)
    
    const response = await fetch(`${creds.api_url}/instance/connectionState/${creds.instance_name}`, {
      method: 'GET',
      headers: {
        'apikey': creds.api_key,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const result = await response.json()
    return {
      success: true,
      connected: result.state === 'open',
      state: result.state,
      data: result,
    }
  } catch (error: any) {
    console.error('Error checking instance status:', error)
    return {
      success: false,
      connected: false,
      error: error.message,
    }
  }
}

/**
 * Obtener información de la instancia
 */
export async function getInstanceInfo(tenantId: string) {
  try {
    const creds = await loadCredentialsFromDB(tenantId)
    
    const response = await fetch(`${creds.api_url}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': creds.api_key,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const result = await response.json()
    
    // Buscar la instancia específica en el array
    const instances = Array.isArray(result) ? result : [result];
    const instance = instances.find((inst: any) => 
      inst.instance?.instanceName === creds.instance_name
    );
    
    return {
      success: true,
      instance: instance || null,
      data: result,
    }
  } catch (error: any) {
    console.error('Error fetching instance info:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Obtener QR code de la instancia (para conectar WhatsApp)
 */
export async function getInstanceQRCode(tenantId: string) {
  try {
    const creds = await loadCredentialsFromDB(tenantId)
    
    const response = await fetch(`${creds.api_url}/instance/connect/${creds.instance_name}`, {
      method: 'GET',
      headers: {
        'apikey': creds.api_key,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const result = await response.json()
    return {
      success: true,
      qrcode: result.qrcode?.base64 || result.base64,
      data: result,
    }
  } catch (error: any) {
    console.error('Error fetching QR code:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Reiniciar la instancia
 */
export async function restartInstance(tenantId: string) {
  try {
    const creds = await loadCredentialsFromDB(tenantId)
    
    const response = await fetch(`${creds.api_url}/instance/restart/${creds.instance_name}`, {
      method: 'PUT',
      headers: {
        'apikey': creds.api_key,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const result = await response.json()
    return {
      success: true,
      data: result,
    }
  } catch (error: any) {
    console.error('Error restarting instance:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Logout de la instancia (desconectar WhatsApp)
 */
export async function logoutInstance(tenantId: string) {
  try {
    const creds = await loadCredentialsFromDB(tenantId)
    
    const response = await fetch(`${creds.api_url}/instance/logout/${creds.instance_name}`, {
      method: 'DELETE',
      headers: {
        'apikey': creds.api_key,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const result = await response.json()
    return {
      success: true,
      data: result,
    }
  } catch (error: any) {
    console.error('Error logging out instance:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}
