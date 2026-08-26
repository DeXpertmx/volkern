export const dynamic = 'force-dynamic';

/**
 * Evolution API Webhook (Multi-Tenant) + Chatbot Integrado
 * 
 * Cada tenant tiene su propia configuración de Evolution API:
 * - api_key: API key única del tenant
 * - instance_name: Nombre de instancia único
 * - api_url: URL de la API (puede variar por tenant)
 * 
 * El webhook identifica el tenant por el instance_name que viene en el payload
 * y procesa el mensaje con el chatbot integrado si está activo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processChatbotMessage } from '@/lib/chatbot-engine';
import { isChatRateLimited } from '@/lib/telegram/chat-rate-limit';

// Respuesta 429 explícita: Evolution API reintenta el webhook con backoff y el
// mensaje no se pierde (mismo patrón que el webhook de Telegram).
function rateLimitedResponse(instanceName: string) {
  return NextResponse.json(
    {
      status: 'error',
      error: 'rate_limited',
      retry_after: 2,
      instance: instanceName,
    },
    { status: 429, headers: { 'Retry-After': '2' } }
  );
}

/**
 * GET /api/webhooks/evolution
 * Webhook verification for Evolution API
 */
export async function GET(request: NextRequest) {
  console.log('🔍 Evolution Webhook - Verificación GET recibida');
  
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('hub.challenge') || searchParams.get('challenge');
  
  if (challenge) {
    console.log('✅ Respondiendo challenge:', challenge);
    return new Response(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization'
      }
    });
  }

  return NextResponse.json({ 
    status: 'Evolution API Webhook Ready (Multi-Tenant)',
    timestamp: new Date().toISOString(),
    service: 'Volkern CRM'
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization'
    }
  });
}

/**
 * OPTIONS - CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization'
    }
  });
}

/**
 * Busca la integración de Evolution API por instance_name
 * Retorna el tenantId y la configuración si existe
 */
async function findIntegrationByInstance(instanceName: string) {
  if (!instanceName) return null;
  
  console.log(`🔍 Buscando integración para instancia: ${instanceName}`);
  
  // Buscar todas las integraciones de tipo 'evolution'
  const integrations = await prisma.integration.findMany({
    where: {
      tipo: 'evolution',
      activo: true,
    },
    select: {
      id: true,
      tenantId: true,
      credenciales: true,
      conectado: true,
      tenant: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        }
      }
    }
  });

  console.log(`📋 Integraciones Evolution activas: ${integrations.length}`);

  // Buscar la que coincida con el instance_name
  for (const integration of integrations) {
    const creds = integration.credenciales as any;
    
    if (creds?.instance_name === instanceName) {
      console.log(`✅ Integración encontrada:`);
      console.log(`   - Tenant: ${integration.tenant?.nombre} (${integration.tenantId})`);
      console.log(`   - Instance: ${creds.instance_name}`);
      console.log(`   - API URL: ${creds.api_url}`);
      
      return {
        integrationId: integration.id,
        tenantId: integration.tenantId,
        tenantNombre: integration.tenant?.nombre,
        instanceName: creds.instance_name,
        apiUrl: creds.api_url,
        apiKey: creds.api_key,
      };
    }
  }

  console.log(`⚠️ No se encontró integración para instancia: ${instanceName}`);
  return null;
}

/**
 * POST /api/webhooks/evolution
 * Recibe mensajes de WhatsApp desde Evolution API
 */
export async function POST(request: NextRequest) {
  try {
    console.log('\n🚀 ========== EVOLUTION WEBHOOK ==========');
    console.log('📅 Timestamp:', new Date().toISOString());
    
    const body = await request.json();
    
    // Log básico del payload
    console.log('📨 Payload recibido:');
    console.log('   - Instance:', body.instance);
    console.log('   - Event:', body.event);

    // Obtener el instance_name del payload
    const instanceName = body.instance;
    
    if (!instanceName) {
      console.log('❌ No se recibió instance en el payload');
      return NextResponse.json({ 
        status: 'error',
        message: 'Missing instance name in payload'
      }, { status: 400 });
    }

    // ========== MULTI-TENANT: Buscar integración por instance_name ==========
    const integration = await findIntegrationByInstance(instanceName);
    
    if (!integration) {
      console.log(`❌ No hay integración configurada para: ${instanceName}`);
      console.log('   Asegúrate de que el tenant tenga Evolution API configurado en Volkern CRM');
      return NextResponse.json({ 
        status: 'error',
        message: `No integration found for instance: ${instanceName}`
      }, { status: 404 });
    }

    const { tenantId, tenantNombre } = integration;
    console.log(`✅ Tenant identificado: ${tenantNombre} (${tenantId})`);

    // Parsear mensaje
    const message = parseEvolutionMessage(body);
    if (!message) {
      console.log('⚠️ Mensaje no válido o no reconocido');
      return NextResponse.json({ status: 'no_message' });
    }

    console.log('📱 Mensaje parseado:');
    console.log('   - ID:', message.id);
    console.log('   - From:', message.from);
    console.log('   - Nombre:', message.fromName || '(sin nombre)');
    console.log('   - Dirección:', message.direction);
    console.log('   - Texto:', message.message.substring(0, 80) + (message.message.length > 80 ? '...' : ''));
    
    // Solo procesar mensajes entrantes
    if (message.direction !== 'incoming') {
      console.log('🔄 Mensaje saliente ignorado');
      return NextResponse.json({ status: 'ignored_outgoing' });
    }

    // ⏱️ Rate-limit por chat (compartido entre instancias vía Redis): si el
    // mismo remitente envía más rápido que la ventana, se responde 429 +
    // Retry-After para que Evolution reintente el payload en vez de procesarlo
    // sin límite. Se evalúa ANTES de crear/actualizar el lead.
    const chatKey = message.from.replace(/[\s\-\()]/g, '');
    if (await isChatRateLimited(chatKey, 'evolution')) {
      console.log('⏱️ Rate-limit: mensaje de', message.from, 'rechazado con 429 (Evolution reintentará)');
      return rateLimitedResponse(instanceName);
    }

    // ========== BUSCAR O CREAR LEAD EN EL TENANT CORRECTO ==========
    const cleanPhone = message.from.replace(/[\s\-\(\)\+]/g, '');
    
    let lead = await prisma.lead.findFirst({
      where: {
        tenantId: tenantId,
        telefono: {
          contains: cleanPhone.slice(-10),
        },
      },
    });

    if (!lead) {
      console.log(`🆕 Creando lead para ${message.from} en tenant ${tenantNombre}`);
      
      lead = await prisma.lead.create({
        data: {
          nombre: message.fromName || `WhatsApp ${cleanPhone.slice(-4)}`,
          email: `wa-${cleanPhone.slice(-10)}@temp.volkern.com`,
          telefono: message.from,
          fuente: 'whatsapp-evolution',
          estado: 'nuevo',
          scoreValue: 30,
          tags: 'whatsapp,evolution-api',
          tenantId: tenantId,
          notas: `Lead creado desde WhatsApp (${instanceName})`,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: null,
          accion: 'crear',
          entidad: 'lead',
          entidadId: lead.id,
          descripcion: `Lead creado desde WhatsApp Evolution (${instanceName}): ${message.from}`,
          tenantId: tenantId,
        },
      });

      console.log(`✅ Lead creado: ${lead.id}`);
    } else {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { fechaUltimaActividad: new Date() },
      });
      console.log(`📝 Lead existente: ${lead.id}`);
    }

    // ========== CONVERSACIÓN ==========
    let conversation = await prisma.conversation.findFirst({
      where: {
        leadId: lead.id,
        canal: 'whatsapp',
        tenantId: tenantId,
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactoNombre: lead.nombre,
          contactoEmail: lead.email,
          contactoTelefono: lead.telefono,
          canal: 'whatsapp',
          estado: 'abierta',
          leadId: lead.id,
          ultimoMensaje: message.message,
          fechaUltimoMensaje: new Date(),
          noLeidos: 1,
          tenantId: tenantId,
        },
      });
      console.log(`🆕 Conversación creada: ${conversation.id}`);
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          ultimoMensaje: message.message,
          fechaUltimoMensaje: new Date(),
          noLeidos: { increment: 1 },
          estado: 'abierta',
        },
      });
    }

    // ========== GUARDAR MENSAJE ==========
    const newMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contenido: message.message,
        direccion: 'entrante',
        canal: 'whatsapp',
        estado: 'entregado',
        metadatos: {
          evolutionMessageId: message.id,
          evolutionInstance: instanceName,
          fromNumber: message.from,
          fromName: message.fromName,
          tenantId: tenantId,
        },
      },
    });

    // Incrementar score si mensaje largo
    if (message.message.length > 50) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { scoreValue: { increment: 5 } },
      });
    }

    console.log(`✅ Mensaje guardado: ${newMessage.id}`);

    // ========== PROCESAR CON CHATBOT ==========
    // Verificar si el chatbot está activo para este tenant
    const chatbotConfig = await prisma.chatbotConfig.findUnique({
      where: { tenantId }
    });

    let chatbotResponse = null;
    if (chatbotConfig?.activo) {
      console.log('🤖 Procesando mensaje con chatbot...');
      
      try {
        chatbotResponse = await processChatbotMessage(
          tenantId,
          message.from,
          message.message,
          lead.id,
          conversation.id
        );
        
        if (chatbotResponse.success) {
          console.log('🤖 Chatbot respondió:', chatbotResponse.response?.substring(0, 50));
        } else {
          console.log('⚠️ Chatbot no pudo responder:', chatbotResponse.error);
        }
      } catch (chatbotError) {
        console.error('❌ Error en chatbot:', chatbotError);
        // No fallar el webhook si el chatbot falla
      }
    } else {
      console.log('ℹ️ Chatbot no activo para este tenant');
    }

    console.log('========== FIN WEBHOOK ==========\n');

    return NextResponse.json({ 
      status: 'processed',
      tenant: tenantNombre,
      tenantId: tenantId,
      instance: instanceName,
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: newMessage.id,
      chatbot: chatbotResponse ? {
        responded: chatbotResponse.success,
        action: chatbotResponse.action,
      } : { responded: false, reason: 'chatbot_inactive' }
    });

  } catch (error) {
    console.error('❌ Error en webhook:', error);
    return NextResponse.json({ 
      error: 'Error interno',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}

/**
 * Parser para mensajes de Evolution API
 */
export function parseEvolutionMessage(body: any) {
  try {
    let messageData;
    
    // Detectar formato del payload
    if (body.event === 'messages.upsert' && body.data?.length > 0) {
      messageData = body.data[0];
    } else if (Array.isArray(body.data) && body.data.length > 0) {
      messageData = body.data[0];
    } else if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
      messageData = body.data;
    } else if (body.key || body.message) {
      messageData = body;
    } else {
      return null;
    }

    let messageText = '';
    let fromNumber = '';
    let fromName = '';
    let messageId = '';
    let direction: 'incoming' | 'outgoing' = 'incoming';

    // Dirección
    if (messageData.key?.fromMe === true || messageData.fromMe === true) {
      direction = 'outgoing';
    }

    // Número
    if (messageData.key?.remoteJid) {
      fromNumber = messageData.key.remoteJid
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '');
    } else if (messageData.from) {
      fromNumber = messageData.from
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '');
    }

    // Nombre
    fromName = messageData.pushName || messageData.key?.pushName || '';

    // Texto
    if (messageData.message) {
      messageText = messageData.message.conversation || 
                   messageData.message.extendedTextMessage?.text ||
                   messageData.message.imageMessage?.caption ||
                   messageData.message.documentMessage?.caption ||
                   messageData.message.videoMessage?.caption ||
                   '';
    } else if (messageData.body) {
      messageText = messageData.body;
    }

    // ID
    messageId = messageData.key?.id || messageData.id || `evo_${Date.now()}`;

    // Validar
    if (!fromNumber || !messageText) return null;

    // Filtrar mensajes del sistema
    if (messageText.includes('This message was deleted') || 
        messageText.includes('missed voice call') ||
        messageText.includes('missed video call')) {
      return null;
    }

    return {
      id: messageId,
      from: fromNumber,
      fromName,
      message: messageText,
      timestamp: new Date().toISOString(),
      direction,
    };

  } catch (error) {
    console.error('Error parseando mensaje:', error);
    return null;
  }
}
