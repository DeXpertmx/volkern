export const dynamic = 'force-dynamic';

/**
 * Unified Anytimebot Webhook Handler
 * Handles all webhook events from Anytimebot:
 * - BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_RESCHEDULED
 * - MESSAGE_RECEIVED
 * 
 * Includes HMAC SHA-256 signature verification for security
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// Verify HMAC signature
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );
  } catch (error) {
    console.error('[Anytimebot Webhook] Error verifying signature:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('\n=== ANYTIMEBOT WEBHOOK RECEIVED ===');
    console.log('Timestamp:', new Date().toISOString());

    // Get headers
    const headersList = headers();
    const signature = headersList.get('x-webhook-signature');
    const webhookId = headersList.get('x-webhook-id');
    const eventType = headersList.get('x-webhook-event');

    console.log('Headers:', {
      signature: signature ? 'Present' : 'Missing',
      webhookId,
      eventType,
      userAgent: headersList.get('user-agent'),
    });

    // Get raw body for signature verification
    const rawBody = await request.text();
    console.log('Raw body length:', rawBody.length);

    let event: any;
    try {
      event = JSON.parse(rawBody);
      console.log('Parsed event:', {
        event: event.event,
        timestamp: event.timestamp,
        dataKeys: Object.keys(event.data || {}),
      });
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!event.event) {
      console.error('❌ Missing event field');
      return NextResponse.json(
        { error: 'Missing required field: event' },
        { status: 400 }
      );
    }

    if (!event.data) {
      console.error('❌ Missing data field');
      return NextResponse.json(
        { error: 'Missing required field: data' },
        { status: 400 }
      );
    }

    // Extract tenant info from URL or payload
    const searchParams = request.nextUrl.searchParams;
    const tenantId = searchParams.get('tenant');

    let integration: any = null;

    if (tenantId) {
      // If tenant ID is provided in URL
      integration = await prisma.anytimebotIntegration.findUnique({
        where: { tenantId: tenantId },
      });
      console.log('Integration lookup by tenantId:', integration ? 'Found' : 'Not found');
    } else {
      // Find by username from event data
      const username = event.data?.booking?.username || event.data?.message?.botOwner;
      if (username) {
        console.log('Looking for integration by username:', username);
        integration = await prisma.anytimebotIntegration.findFirst({
          where: {
            username: username,
            activo: true
          },
        });
      }

      // Fallback: Use first active integration (single-tenant scenario)
      if (!integration) {
        console.log('Looking for first active integration...');
        integration = await prisma.anytimebotIntegration.findFirst({
          where: { activo: true },
        });
      }
    }

    if (!integration) {
      console.error('❌ No active integration found');
      return NextResponse.json(
        { error: 'No active Anytimebot integration found' },
        { status: 404 }
      );
    }

    console.log('✓ Integration found:', integration.id);

    // Verify signature if secret is configured
    if (integration.webhookSecret && signature) {
      const isValid = verifyWebhookSignature(rawBody, signature, integration.webhookSecret);

      if (!isValid) {
        console.error('❌ Invalid signature');
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 401 }
        );
      }

      console.log('✓ Signature verified');
    } else {
      if (!integration.webhookSecret) {
        console.warn('⚠️ No webhook secret configured - skipping verification');
      }
      if (!signature) {
        console.warn('⚠️ No signature provided in headers');
      }
    }

    // Respond immediately (within 3 seconds as recommended)
    const responseTime = Date.now() - startTime;
    console.log(`✓ Responding in ${responseTime}ms`);

    // Create response
    const response = NextResponse.json({
      received: true,
      timestamp: new Date().toISOString(),
      duration: responseTime
    });

    // Process webhook asynchronously after responding
    setImmediate(async () => {
      try {
        console.log(`Processing event type: ${event.event}`);

        let result;

        switch (event.event) {
          case 'BOOKING_CREATED':
            result = await handleBookingCreated(event.data, integration);
            break;

          case 'BOOKING_CANCELLED':
            result = await handleBookingCancelled(event.data, integration);
            break;

          case 'BOOKING_RESCHEDULED':
            result = await handleBookingRescheduled(event.data, integration);
            break;

          case 'MESSAGE_RECEIVED':
            result = await handleMessageReceived(event.data, integration);
            break;

          default:
            console.log(`⚠️ Unknown event type: ${event.event}`);
            return;
        }

        // Update sync timestamp
        await prisma.anytimebotIntegration.update({
          where: { id: integration.id },
          data: { ultimaSincronizacion: new Date() },
        });

        console.log('✓ Processing completed:', result);

      } catch (processError) {
        console.error('❌ Error processing webhook:', processError);
        console.error('Stack:', processError instanceof Error ? processError.stack : 'No stack trace');
        // Log error but don't throw - webhook already responded
      }
    });

    return response;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n=== WEBHOOK ERROR ===');
    console.error('Duration:', duration + 'ms');
    console.error('Error:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration
      },
      { status: 500 }
    );
  }
}

// ========== BOOKING HANDLERS ==========

async function handleBookingCreated(data: any, integration: any) {
  const { booking } = data;

  if (!integration.sincronizarCitas) {
    console.log('[Anytimebot] Booking sync disabled, skipping...');
    return { skipped: true, reason: 'Booking sync disabled' };
  }

  try {
    // Find or create lead by email
    let lead = await prisma.lead.findFirst({
      where: {
        tenantId: integration.tenantId,
        email: booking.guestEmail,
      },
    });

    if (!lead) {
      // Create new lead
      lead = await prisma.lead.create({
        data: {
          tenantId: integration.tenantId,
          nombre: booking.guestName,
          email: booking.guestEmail,
          telefono: booking.guestPhone || null,
          fuente: integration.fuenteLeads,
          estado: integration.estadoLeadsNuevos,
          scoreValue: 60, // Good score for booking
          tags: 'anytimebot,booking-created',
          notas: `Booking ID: ${booking.id}\nTipo de evento: ${booking.eventType}\nTimezone: ${booking.timezone}${booking.formData ? `\n\nDatos del formulario:\n${JSON.stringify(booking.formData, null, 2)}` : ''}`,
        },
      });

      // Update stats
      await prisma.anytimebotIntegration.update({
        where: { id: integration.id },
        data: {
          totalLeadsCapturados: { increment: 1 },
        },
      });

      console.log(`[Anytimebot] ✓ Created lead ${lead.id} from booking`);
    }

    // Create or update appointment
    let cita = await prisma.cita.findFirst({
      where: {
        tenantId: integration.tenantId,
        leadId: lead.id,
        fechaHora: new Date(booking.startTime),
      },
    });

    if (!cita) {
      // Find or create a default service for Anytimebot bookings
      let servicio = await prisma.servicio.findFirst({
        where: {
          tenantId: integration.tenantId,
          nombre: booking.eventType,
        },
      });

      if (!servicio) {
        // Create a default service for this event type
        servicio = await prisma.servicio.create({
          data: {
            tenantId: integration.tenantId,
            nombre: booking.eventType,
            descripcion: `Servicio creado automáticamente desde Anytimebot`,
            duracionMinutos: Math.round((new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / 60000),
            precio: 0,
            activo: true,
          },
        });
      }

      cita = await prisma.cita.create({
        data: {
          tenantId: integration.tenantId,
          leadId: lead.id,
          servicioId: servicio.id,
          titulo: `${booking.eventType} - ${booking.guestName}`,
          descripcion: `Booking desde Anytimebot\nID: ${booking.id}\n\nDatos:\n- Email: ${booking.guestEmail}\n- Teléfono: ${booking.guestPhone || 'No proporcionado'}\n- Timezone: ${booking.timezone}${booking.videoMeetingLink ? `\n- Link de reunión: ${booking.videoMeetingLink}` : ''}${booking.formData ? `\n\nFormulario:\n${JSON.stringify(booking.formData, null, 2)}` : ''}`,
          fechaHora: new Date(booking.startTime),
          duracion: Math.round((new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / 60000), // Duration in minutes
          estado: 'pendiente',
        },
      });

      // Update stats
      await prisma.anytimebotIntegration.update({
        where: { id: integration.id },
        data: {
          totalCitasSincronizadas: { increment: 1 },
        },
      });

      console.log(`[Anytimebot] ✓ Created appointment ${cita.id}`);
    }

    return {
      success: true,
      leadId: lead.id,
      citaId: cita.id,
    };

  } catch (error) {
    console.error('[Anytimebot] Error creating booking:', error);
    throw error;
  }
}

async function handleBookingCancelled(data: any, integration: any) {
  const { booking } = data;

  if (!integration.sincronizarCitas) {
    return { skipped: true, reason: 'Booking sync disabled' };
  }

  try {
    // Find appointment by booking ID or time + email
    const lead = await prisma.lead.findFirst({
      where: {
        tenantId: integration.tenantId,
        email: booking.guestEmail,
      },
    });

    if (!lead) {
      console.log('[Anytimebot] Lead not found for cancelled booking');
      return { skipped: true, reason: 'Lead not found' };
    }

    // Update appointment status
    const cita = await prisma.cita.findFirst({
      where: {
        tenantId: integration.tenantId,
        leadId: lead.id,
        fechaHora: new Date(booking.startTime),
      },
    });

    if (cita) {
      await prisma.cita.update({
        where: { id: cita.id },
        data: {
          estado: 'cancelada',
          descripcion: `${cita.descripcion}\n\n❌ Cancelada el ${new Date(booking.cancelledAt).toLocaleString()}\nBooking ID: ${booking.id}`,
        },
      });

      console.log(`[Anytimebot] ✓ Cancelled appointment ${cita.id}`);
    }

    return {
      success: true,
      citaId: cita?.id,
      status: 'cancelled',
    };

  } catch (error) {
    console.error('[Anytimebot] Error cancelling booking:', error);
    throw error;
  }
}

async function handleBookingRescheduled(data: any, integration: any) {
  const { booking } = data;

  if (!integration.sincronizarCitas) {
    return { skipped: true, reason: 'Booking sync disabled' };
  }

  try {
    // Find appointment
    const lead = await prisma.lead.findFirst({
      where: {
        tenantId: integration.tenantId,
        email: booking.guestEmail,
      },
    });

    if (!lead) {
      console.log('[Anytimebot] Lead not found for rescheduled booking');
      return { skipped: true, reason: 'Lead not found' };
    }

    // Find by old time
    const cita = await prisma.cita.findFirst({
      where: {
        tenantId: integration.tenantId,
        leadId: lead.id,
        fechaHora: new Date(booking.oldStartTime),
      },
    });

    if (cita) {
      const newDuration = Math.round((new Date(booking.newEndTime).getTime() - new Date(booking.newStartTime).getTime()) / 60000);

      await prisma.cita.update({
        where: { id: cita.id },
        data: {
          fechaHora: new Date(booking.newStartTime),
          duracion: newDuration,
          descripcion: `${cita.descripcion}\n\n🔄 Reagendada el ${new Date(booking.rescheduledAt).toLocaleString()}\nAnterior: ${new Date(booking.oldStartTime).toLocaleString()}\nNueva: ${new Date(booking.newStartTime).toLocaleString()}`,
        },
      });

      console.log(`[Anytimebot] ✓ Rescheduled appointment ${cita.id}`);
    }

    return {
      success: true,
      citaId: cita?.id,
      status: 'rescheduled',
    };

  } catch (error) {
    console.error('[Anytimebot] Error rescheduling booking:', error);
    throw error;
  }
}

// ========== MESSAGE HANDLER ==========

async function handleMessageReceived(data: any, integration: any) {
  console.log('[Anytimebot] Processing MESSAGE_RECEIVED event');

  // Validate message structure
  const message = data?.message;
  if (!message) {
    console.error('❌ Missing message field in data');
    throw new Error('Missing required field: data.message');
  }

  console.log('Message data:', {
    botOwner: message.botOwner,
    userMessageLength: message.userMessage?.length || 0,
    botResponseLength: message.botResponse?.length || 0,
    hasAttachments: message.hasAttachments,
  });

  // Validate required fields
  const botOwner = message.botOwner;
  if (!botOwner) {
    console.error('❌ Missing botOwner field');
    throw new Error('Missing required field: data.message.botOwner');
  }

  const userMessage = message.userMessage || '';
  const botResponse = message.botResponse || '';

  if (!userMessage && !botResponse) {
    console.error('❌ Both userMessage and botResponse are empty');
    throw new Error('At least one message (user or bot) must be present');
  }

  if (!integration.sincronizarMensajes) {
    console.log('[Anytimebot] Message sync disabled, skipping...');
    return { skipped: true, reason: 'Message sync disabled' };
  }

  try {
    // Find or create conversation by botOwner
    let conversation = await prisma.conversation.findFirst({
      where: {
        tenantId: integration.tenantId,
        contactoEmail: botOwner, // Using botOwner as unique identifier
        canal: 'anytimebot',
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId: integration.tenantId,
          contactoNombre: `Chatbot ${botOwner}`,
          contactoEmail: botOwner,
          canal: 'anytimebot',
          estado: 'abierta',
          ultimoMensaje: (userMessage || botResponse).substring(0, 200),
          fechaUltimoMensaje: new Date(message.timestamp || new Date()),
          noLeidos: 1,
        },
      });

      console.log(`✓ Created conversation ${conversation.id}`);
    }

    // Create message records (one for user, one for bot if both exist)
    const messages = [];

    if (userMessage) {
      const userMessageRecord = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          contenido: userMessage,
          direccion: 'entrante',
          canal: 'anytimebot',
          estado: 'entregado',
          metadatos: {
            botOwner: botOwner,
            timestamp: message.timestamp,
            source: 'anytimebot',
            hasAttachments: message.hasAttachments || false,
            attachmentCount: message.attachmentCount || 0,
          },
          fechaCreacion: new Date(message.timestamp || new Date()),
        },
      });
      messages.push(userMessageRecord);
      console.log(`✓ Created user message ${userMessageRecord.id}`);
    }

    if (botResponse) {
      const botMessageRecord = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          contenido: botResponse,
          direccion: 'saliente',
          canal: 'anytimebot',
          estado: 'entregado',
          metadatos: {
            botOwner: botOwner,
            timestamp: message.timestamp,
            source: 'anytimebot',
            isAutomated: true,
          },
          fechaCreacion: new Date(message.timestamp || new Date()),
        },
      });
      messages.push(botMessageRecord);
      console.log(`✓ Created bot response ${botMessageRecord.id}`);
    }

    // Update conversation with latest message
    const lastMessage = botResponse || userMessage;
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ultimoMensaje: lastMessage.substring(0, 200),
        fechaUltimoMensaje: new Date(message.timestamp || new Date()),
        noLeidos: userMessage ? { increment: 1 } : conversation.noLeidos, // Only increment for user messages
      },
    });

    // Update stats
    await prisma.anytimebotIntegration.update({
      where: { id: integration.id },
      data: {
        totalMensajesSincronizados: { increment: messages.length },
      },
    });

    console.log(`✓ Synced ${messages.length} message(s) for conversation ${conversation.id}`);

    return {
      success: true,
      conversationId: conversation.id,
      messageIds: messages.map(m => m.id),
      messagesCount: messages.length,
    };

  } catch (error) {
    console.error('❌ Error syncing message:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}
