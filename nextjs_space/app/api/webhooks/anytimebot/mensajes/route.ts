export const dynamic = 'force-dynamic';

/**
 * Anytimebot Messages Sync Webhook
 * Receives WhatsApp messages from Anytimebot and syncs to CRM
 * Auto-associates messages with leads by phone number
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAnytimebotWebhook } from '@/lib/anytimebot';

interface AnytimebotMessagePayload {
  conversationId: string;
  messageId: string;
  timestamp: string;
  direction: 'incoming' | 'outgoing'; // incoming = del cliente, outgoing = del bot
  from: {
    phone: string;
    name?: string;
  };
  to: {
    phone: string;
  };
  message: {
    type: 'text' | 'image' | 'document' | 'audio' | 'video';
    content: string;
    mediaUrl?: string;
    caption?: string;
  };
  metadata?: {
    intent?: string;
    sentiment?: string;
    tags?: string[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload: AnytimebotMessagePayload = await request.json();
    
    // Validate webhook signature
    const signature = request.headers.get('x-anytimebot-signature') || '';
    if (!validateAnytimebotWebhook(signature, payload)) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    console.log(`[Anytimebot Messages] New message from ${payload.from.phone}`);

    // Validate required fields
    if (!payload.from?.phone) {
      return NextResponse.json(
        { error: 'Número de teléfono del remitente requerido' },
        { status: 400 }
      );
    }

    if (!payload.message?.content) {
      return NextResponse.json(
        { error: 'Contenido del mensaje requerido' },
        { status: 400 }
      );
    }

    // Find tenant by Anytimebot integration
    const integration = await prisma.anytimebotIntegration.findFirst({
      where: {
        activo: true,
        sincronizarMensajes: true,
      },
      include: {
        tenant: true,
      },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'No se encontró integración activa de Anytimebot para mensajes' },
        { status: 404 }
      );
    }

    const tenantId = integration.tenantId;

    // Clean phone number (remove +, spaces, etc.)
    const cleanPhone = payload.from.phone.replace(/[\s\-\(\)]/g, '');
    
    // Find lead by phone number
    let lead = await prisma.lead.findFirst({
      where: {
        tenantId,
        telefono: {
          contains: cleanPhone.slice(-10), // Match last 10 digits
        },
      },
    });

    // If no lead found, create one
    if (!lead) {
      // Generate a temporary email if not available
      const tempEmail = `whatsapp-${cleanPhone.slice(-10)}@temp.volkern.com`;
      
      lead = await prisma.lead.create({
        data: {
          tenantId,
          nombre: payload.from.name || `WhatsApp ${cleanPhone}`,
          email: tempEmail,
          telefono: payload.from.phone,
          fuente: 'Anytimebot - WhatsApp',
          estado: 'nuevo',
          scoreValue: 20, // Base score for WhatsApp contact
          notas: `Lead creado automáticamente desde mensaje de WhatsApp vía Anytimebot\nPrimer mensaje: ${payload.message.content.substring(0, 100)}...\n\n⚠️ Email temporal generado (actualizar con email real del cliente)`,
          tags: ['anytimebot', 'whatsapp', ...(payload.metadata?.tags || [])].join(','),
          fechaUltimaActividad: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: null,
          accion: 'lead_creado',
          entidad: 'Lead',
          entidadId: lead.id,
          descripcion: `Lead creado desde mensaje de WhatsApp - ${payload.from.phone}`,
        },
      });

      console.log(`[Anytimebot Messages] Created new lead: ${lead.id} for ${payload.from.phone}`);
    } else {
      // Update existing lead activity
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          fechaUltimaActividad: new Date(),
        },
      });

      console.log(`[Anytimebot Messages] Found existing lead: ${lead.id}`);
    }

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        tenantId,
        leadId: lead.id,
        canal: 'whatsapp',
        estado: { not: 'archivada' },
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId,
          leadId: lead.id,
          contactoNombre: lead.nombre,
          contactoTelefono: lead.telefono,
          canal: 'whatsapp',
          estado: 'abierta',
          ultimoMensaje: payload.message.content.substring(0, 200),
          fechaUltimoMensaje: new Date(payload.timestamp),
          noLeidos: payload.direction === 'incoming' ? 1 : 0,
        },
      });

      console.log(`[Anytimebot Messages] Created new conversation: ${conversation.id}`);
    } else {
      // Update conversation with latest message
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          ultimoMensaje: payload.message.content.substring(0, 200),
          fechaUltimoMensaje: new Date(payload.timestamp),
          noLeidos: payload.direction === 'incoming' 
            ? { increment: 1 } 
            : conversation.noLeidos,
          estado: 'abierta', // Reopen if it was closed
        },
      });

      console.log(`[Anytimebot Messages] Updated conversation: ${conversation.id}`);
    }

    // Create message record
    const messageContent = payload.message.type === 'text' 
      ? payload.message.content 
      : `[${payload.message.type.toUpperCase()}] ${payload.message.caption || 'Archivo multimedia'}`;

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contenido: messageContent,
        direccion: payload.direction === 'incoming' ? 'entrante' : 'saliente',
        canal: 'whatsapp',
        estado: 'entregado',
        metadatos: {
          anytimebotMessageId: payload.messageId,
          anytimebotConversationId: payload.conversationId,
          messageType: payload.message.type,
          mediaUrl: payload.message.mediaUrl,
          intent: payload.metadata?.intent,
          sentiment: payload.metadata?.sentiment,
          originalTimestamp: payload.timestamp,
        },
        fechaCreacion: new Date(payload.timestamp),
      },
    });

    // Update integration statistics
    await prisma.anytimebotIntegration.update({
      where: { id: integration.id },
      data: {
        totalMensajesSincronizados: { increment: 1 },
        ultimaSincronizacion: new Date(),
      },
    });

    // If incoming message with high engagement, update lead score
    if (payload.direction === 'incoming' && payload.message.content.length > 50) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          scoreValue: Math.min((lead.scoreValue || 0) + 5, 100),
        },
      });
    }

    console.log(`[Anytimebot Messages] Message synced successfully: ${message.id}`);

    return NextResponse.json({
      success: true,
      messageId: message.id,
      conversationId: conversation.id,
      leadId: lead.id,
      message: 'Mensaje sincronizado exitosamente',
    });

  } catch (error) {
    console.error('Error processing Anytimebot message webhook:', error);
    return NextResponse.json(
      {
        error: 'Error al procesar webhook de mensajes de Anytimebot',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
