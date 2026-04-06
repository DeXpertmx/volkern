export const dynamic = 'force-dynamic';

/**
 * Send Message via Anytimebot API
 * Allows sending WhatsApp messages from Volkern CRM through Anytimebot
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendAnytimebotMessage } from '@/lib/anytimebot';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { conversationId, leadId, to, message, messageType = 'text' } = body;

    // Validate required fields
    if (!message || !to) {
      return NextResponse.json(
        { error: 'Mensaje y destinatario son requeridos' },
        { status: 400 }
      );
    }

    // Get Anytimebot integration
    const integration = await prisma.anytimebotIntegration.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!integration || !integration.activo) {
      return NextResponse.json(
        { error: 'Integración de Anytimebot no configurada o inactiva' },
        { status: 404 }
      );
    }

    // Send message via Anytimebot
    console.log(`[Anytimebot] Sending message to ${to}`);
    const result = await sendAnytimebotMessage(
      integration.username,
      to,
      message,
      messageType as 'text' | 'template'
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Error al enviar mensaje' },
        { status: 500 }
      );
    }

    // If conversationId provided, create message record
    if (conversationId) {
      await prisma.message.create({
        data: {
          conversationId,
          contenido: message,
          direccion: 'saliente',
          canal: 'whatsapp',
          estado: 'enviado',
          metadatos: {
            anytimebotMessageId: result.messageId,
            sentVia: 'anytimebot',
            sentBy: user.id,
            sentAt: new Date().toISOString(),
          },
        },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          ultimoMensaje: message.substring(0, 200),
          fechaUltimoMensaje: new Date(),
        },
      });
    }

    // Update lead activity if leadId provided
    if (leadId) {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          fechaUltimaActividad: new Date(),
        },
      });
    }

    // Log audit event
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'mensaje_enviado',
        entidad: 'Message',
        entidadId: conversationId || 'N/A',
        descripcion: `Mensaje enviado vía Anytimebot a ${to}`,
      },
    });

    console.log(`[Anytimebot] Message sent successfully: ${result.messageId}`);

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Mensaje enviado exitosamente',
    });

  } catch (error) {
    console.error('Error sending message via Anytimebot:', error);
    return NextResponse.json(
      {
        error: 'Error al enviar mensaje',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
