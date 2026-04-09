export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validatePlaudernWebhook, type PlaudernWebhookPayload } from '@/lib/plaudern';

/**
 * POST - Recibir webhook de mensajes de Plaudern
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const payload: PlaudernWebhookPayload = JSON.parse(body);

    console.log('📨 Webhook recibido de Plaudern:', {
      eventType: payload.eventType,
      botId: payload.botId,
      conversationId: payload.conversationId,
      customerPhone: payload.customer.phone,
    });

    // Obtener integración por botId
    const integration = await prisma.plaudernIntegration.findFirst({
      where: {
        botId: payload.botId,
        activo: true,
      },
    });

    if (!integration) {
      console.error('❌ Integración no encontrada para botId:', payload.botId);
      return NextResponse.json(
        { error: 'Integración no encontrada o inactiva' },
        { status: 404 }
      );
    }

    // Validar webhook signature si hay secret configurado
    if (integration.webhookSecret) {
      const signature = request.headers.get('x-plaudern-signature') || '';
      const isValid = validatePlaudernWebhook(body, signature, integration.webhookSecret);

      if (!isValid) {
        console.error('❌ Firma de webhook inválida');
        return NextResponse.json(
          { error: 'Firma de webhook inválida' },
          { status: 401 }
        );
      }
    }

    // Procesar según tipo de evento
    switch (payload.eventType) {
      case 'message.received':
        await procesarMensajeRecibido(payload, integration);
        break;

      case 'message.sent':
        await procesarMensajeEnviado(payload, integration);
        break;

      case 'conversation.created':
        await procesarConversacionCreada(payload, integration);
        break;

      case 'conversation.updated':
        await procesarConversacionActualizada(payload, integration);
        break;

      default:
        console.log('⚠️  Tipo de evento no manejado:', payload.eventType);
    }

    // Actualizar estadísticas de integración
    await prisma.plaudernIntegration.update({
      where: { id: integration.id },
      data: {
        totalMensajesSincronizados: { increment: 1 },
        ultimaSincronizacion: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook procesado exitosamente',
    });
  } catch (error: any) {
    console.error('❌ Error procesando webhook de Plaudern:', error);
    return NextResponse.json(
      { error: 'Error procesando webhook', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Procesar mensaje recibido del cliente
 */
async function procesarMensajeRecibido(
  payload: PlaudernWebhookPayload,
  integration: any
) {
  console.log('💬 Procesando mensaje recibido...');

  // Limpiar número de teléfono
  const phoneClean = payload.customer.phone.replace(/\D/g, '');
  const phoneLast10 = phoneClean.slice(-10);

  // Buscar o crear lead
  let lead = await prisma.lead.findFirst({
    where: {
      tenantId: integration.tenantId,
      OR: [
        { telefono: { endsWith: phoneLast10 } },
        { email: payload.customer.phone + '@plaudern.temp' }, // Email temporal
      ],
    },
  });

  if (!lead && integration.crearLeadsAutomatico) {
    // Crear nuevo lead
    console.log('➕ Creando nuevo lead desde Plaudern...');
    lead = await prisma.lead.create({
      data: {
        tenantId: integration.tenantId,
        nombre: payload.customer.name || 'Cliente Plaudern',
        telefono: payload.customer.phone,
        email: payload.customer.phone + '@plaudern.temp',
        fuente: integration.fuenteLeads,
        estado: integration.estadoLeadsNuevos,
        scoreValue: 10, // Score inicial
        tags: 'plaudern,chatbot',
        notas: `Lead creado automáticamente desde Plaudern\n\nBot: ${integration.botName}\nConversación ID: ${payload.conversationId}`,
        metadataExterna: {
          plaudernConversationId: payload.conversationId,
          plaudernBotId: payload.botId,
          plaudernCustomerMetadata: payload.customer.metadata,
        },
        fechaUltimaActividad: new Date(),
        asignadoA: integration.asignacionAutomatica ? integration.usuarioAsignadoId : null,
      },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId: integration.usuarioAsignadoId || 'system',
        tenantId: integration.tenantId,
        accion: 'lead_creado_plaudern',
        entidad: 'Lead',
        entidadId: lead.id,
        descripcion: `Lead creado automáticamente desde Plaudern: ${lead.nombre}`,
        cambiosDespues: {
          conversationId: payload.conversationId,
          botId: payload.botId,
          messageId: payload.message?.id,
        },
      },
    });
  } else if (lead) {
    // Actualizar fecha de última actividad
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        fechaUltimaActividad: new Date(),
        scoreValue: { increment: 5 }, // Incrementar score por interacción
      },
    });
  }

  if (!lead) {
    console.log('⚠️  No se creó lead (crearLeadsAutomatico está desactivado)');
    return;
  }

  // Buscar o crear conversación
  // Buscar por leadId y canal (sin metadata ya que no existe en el modelo)
  let conversation = await prisma.conversation.findFirst({
    where: {
      tenantId: integration.tenantId,
      leadId: lead.id,
      canal: 'whatsapp',
    },
  });

  if (!conversation && integration.sincronizarConversaciones) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId: integration.tenantId,
        leadId: lead.id,
        contactoNombre: lead.nombre || 'Cliente',
        contactoEmail: lead.email,
        contactoTelefono: lead.telefono,
        canal: 'whatsapp',
        estado: 'activo',
        ultimoMensaje: payload.message?.content || '',
        fechaUltimoMensaje: new Date(payload.message?.timestamp || Date.now()),
        noLeidos: 1,
      },
    });
  } else if (conversation) {
    // Actualizar conversación existente
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ultimoMensaje: payload.message?.content || '',
        fechaUltimoMensaje: new Date(payload.message?.timestamp || Date.now()),
        noLeidos: { increment: 1 },
      },
    });
  }

  // Crear mensaje si está habilitada la sincronización
  if (payload.message && integration.sincronizarMensajes && conversation) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direccion: 'entrante',
        canal: 'whatsapp',
        contenido: payload.message.content,
        estado: 'entregado',
        metadatos: {
          plaudernMessageId: payload.message.id,
          plaudernConversationId: payload.conversationId,
          plaudernBotId: payload.botId,
          messageType: payload.message.messageType,
          mediaUrl: payload.message.mediaUrl,
          plaudernMetadata: payload.metadata,
        },
        fechaCreacion: new Date(payload.message.timestamp),
      },
    });
  }

  console.log('✅ Mensaje procesado exitosamente');
}

/**
 * Procesar mensaje enviado al cliente
 */
async function procesarMensajeEnviado(
  payload: PlaudernWebhookPayload,
  integration: any
) {
  console.log('📤 Procesando mensaje enviado...');

  // Similar a procesarMensajeRecibido pero con direction: 'outgoing'
  // y noLeidos no se incrementa

  const phoneClean = payload.customer.phone.replace(/\D/g, '');
  const phoneLast10 = phoneClean.slice(-10);

  const lead = await prisma.lead.findFirst({
    where: {
      tenantId: integration.tenantId,
      OR: [
        { telefono: { endsWith: phoneLast10 } },
        { email: payload.customer.phone + '@plaudern.temp' },
      ],
    },
  });

  if (!lead) {
    console.log('⚠️  Lead no encontrado para mensaje enviado');
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      tenantId: integration.tenantId,
      leadId: lead.id,
      canal: 'whatsapp',
    },
  });

  if (payload.message && integration.sincronizarMensajes && conversation) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direccion: 'saliente',
        canal: 'whatsapp',
        contenido: payload.message.content,
        estado: 'enviado',
        metadatos: {
          plaudernMessageId: payload.message.id,
          plaudernConversationId: payload.conversationId,
          plaudernBotId: payload.botId,
          messageType: payload.message.messageType,
          mediaUrl: payload.message.mediaUrl,
        },
        fechaCreacion: new Date(payload.message.timestamp),
      },
    });

    // Actualizar último mensaje de la conversación
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ultimoMensaje: payload.message.content,
        fechaUltimoMensaje: new Date(payload.message.timestamp),
      },
    });
  }

  console.log('✅ Mensaje enviado procesado');
}

/**
 * Procesar nueva conversación creada
 */
async function procesarConversacionCreada(
  payload: PlaudernWebhookPayload,
  integration: any
) {
  console.log('🆕 Procesando nueva conversación...');

  // Actualizar estadísticas
  await prisma.plaudernIntegration.update({
    where: { id: integration.id },
    data: {
      totalConversaciones: { increment: 1 },
    },
  });
}

/**
 * Procesar actualización de conversación
 */
async function procesarConversacionActualizada(
  payload: PlaudernWebhookPayload,
  integration: any
) {
  console.log('🔄 Procesando actualización de conversación...');

  // Buscar conversación por tenantId y leadId relacionado con el conversationId de Plaudern
  // Como no tenemos campo metadata en Conversation, no podemos buscar por conversationId directamente
  // Simplemente registramos el evento
  console.log(`Conversación ${payload.conversationId} actualizada (evento registrado)`);
}
