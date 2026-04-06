export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { chatwootApi } from '@/lib/nexus/chatwoot-api';
import { encrypt } from '@/lib/core/crypto';

/**
 * GET /api/integraciones/whatsapp-twilio
 * Obtiene el estado de la integración de WhatsApp vía Twilio
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Buscar canal de WhatsApp Twilio
    const channel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'whatsapp_twilio',
      },
    });

    if (!channel) {
      return NextResponse.json({ configured: false });
    }

    const config = channel.config as any;

    return NextResponse.json({
      configured: true,
      integration: {
        id: channel.id,
        name: channel.name,
        isActive: channel.isActive,
        phoneNumber: config?.phoneNumber,
        chatwootInboxId: channel.chatwootInboxId,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[WhatsApp Twilio GET] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/integraciones/whatsapp-twilio
 * Configura WhatsApp vía Twilio y crea inbox en Chatwoot
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    });

    if (!user || !user.tenantId || !user.tenant) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const { account_sid, auth_token, phone_number } = await req.json();

    if (!account_sid || !auth_token || !phone_number) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos: Account SID, Auth Token y Número de teléfono' },
        { status: 400 }
      );
    }

    // Validar formato E.164
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(phone_number)) {
      return NextResponse.json(
        { error: 'El número de teléfono debe estar en formato E.164 (ej: +14155238886)' },
        { status: 400 }
      );
    }

    // 1. Verificar que el tenant tenga configuración de Nexus (Chatwoot)
    const hubConfig = await prisma.messagingHubConfig.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!hubConfig || !hubConfig.chatwootAccountId) {
      return NextResponse.json(
        { error: 'Primero debes configurar un canal de comunicación (Telegram) en el onboarding para habilitar el hub de mensajería' },
        { status: 400 }
      );
    }

    // 2. Verificar si ya existe un canal de WhatsApp Twilio
    const existingChannel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'whatsapp_twilio',
      },
    });

    let chatwootInboxId: number | null = null;

    // 3. Crear inbox en Chatwoot
    const chatwootUrl = process.env.CHATWOOT_BASE_URL;
    const chatwootToken = process.env.CHATWOOT_SUPER_ADMIN_TOKEN;

    if (chatwootUrl && chatwootToken && hubConfig.chatwootAccountId) {
      try {
        // Obtener access token del bot user para la cuenta
        const accountAccessToken = await chatwootApi.ensureBotUserInAccount(
          hubConfig.chatwootAccountId
        );

        const inbox = await chatwootApi.createTwilioWhatsAppInbox(
          hubConfig.chatwootAccountId,
          `WhatsApp Twilio - ${user.tenant.nombre}`,
          phone_number,
          account_sid,
          auth_token,
          accountAccessToken
        );
        chatwootInboxId = inbox.id;
        console.log('[WhatsApp Twilio] Chatwoot inbox created:', chatwootInboxId);

        // 4. Configurar webhook de Chatwoot hacia Volkern
        const volkernUrl = process.env.NEXTAUTH_URL || `https://volkern.app`;
        try {
          await chatwootApi.configureWebhook(
            hubConfig.chatwootAccountId,
            `${volkernUrl}/api/integrations/webhook/chatwoot`,
            accountAccessToken
          );
          console.log('[WhatsApp Twilio] Chatwoot webhook configured');
        } catch (webhookError: any) {
          // El webhook puede ya existir, no es error crítico
          console.warn('[WhatsApp Twilio] Webhook setup warning:', webhookError.message);
        }
      } catch (chatwootError: any) {
        console.error('[WhatsApp Twilio] Chatwoot error:', chatwootError);
        return NextResponse.json(
          { error: `Error configurando canal en Chatwoot: ${chatwootError.message}` },
          { status: 500 }
        );
      }
    }

    // 5. Guardar o actualizar canal
    const channelData = {
      name: 'WhatsApp Twilio',
      config: {
        phoneNumber: phone_number,
        accountSid: encrypt(account_sid),
        authToken: encrypt(auth_token),
        provider: 'twilio',
      },
      chatwootInboxId,
      isActive: true,
    };

    let channel;
    if (existingChannel) {
      channel = await prisma.channel.update({
        where: { id: existingChannel.id },
        data: channelData,
      });
    } else {
      channel = await prisma.channel.create({
        data: {
          tenantId: user.tenantId,
          type: 'whatsapp_twilio',
          ...channelData,
        },
      });
    }

    // 6. Actualizar MessagingHubConfig
    if (chatwootInboxId) {
      await prisma.messagingHubConfig.update({
        where: { tenantId: user.tenantId },
        data: { whatsappInboxId: chatwootInboxId },
      });
    }

    // 7. Guardar también como Integration para visibilidad en la UI
    const existingIntegration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'whatsapp_twilio',
      },
    });

    if (existingIntegration) {
      await prisma.integration.update({
        where: { id: existingIntegration.id },
        data: {
          credenciales: {
            account_sid: encrypt(account_sid),
            phone_number,
            inbox_id: String(chatwootInboxId || ''),
            provider: 'twilio',
          },
          activo: true,
        },
      });
    } else {
      await prisma.integration.create({
        data: {
          tenantId: user.tenantId,
          tipo: 'whatsapp_twilio',
          nombre: 'WhatsApp Twilio',
          credenciales: {
            account_sid: encrypt(account_sid),
            phone_number,
            inbox_id: String(chatwootInboxId || ''),
            provider: 'twilio',
          },
          activo: true,
        },
      });
    }

    // 8. Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: existingChannel ? 'whatsapp_twilio_actualizado' : 'whatsapp_twilio_configurado',
        entidad: 'Channel',
        entidadId: channel.id,
        descripcion: `WhatsApp Twilio ${existingChannel ? 'actualizado' : 'configurado'} con número ${phone_number}`,
        cambiosDespues: {
          phoneNumber: phone_number,
          chatwootInboxId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'WhatsApp vía Twilio configurado correctamente. El webhook de Chatwoot ha sido configurado automáticamente.',
      channel: {
        id: channel.id,
        name: channel.name,
        chatwootInboxId,
        phoneNumber: phone_number,
      },
      webhookInfo: {
        twilioWebhook: `${chatwootUrl}/webhooks/twilio`,
        chatwootWebhook: `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/integrations/webhook/chatwoot`,
        note: 'Configura el webhook de Twilio (Incoming Messages) apuntando a la URL de Chatwoot indicada arriba.',
      },
    });
  } catch (error: any) {
    console.error('[WhatsApp Twilio POST] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al configurar WhatsApp Twilio' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/integraciones/whatsapp-twilio
 * Elimina la integración de WhatsApp Twilio
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Eliminar canal
    const channel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'whatsapp_twilio',
      },
    });

    if (channel) {
      await prisma.channel.delete({ where: { id: channel.id } });
    }

    // Eliminar integración
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'whatsapp_twilio',
      },
    });

    if (integration) {
      await prisma.integration.delete({ where: { id: integration.id } });
    }

    // Limpiar referencia en MessagingHubConfig
    await prisma.messagingHubConfig.updateMany({
      where: { tenantId: user.tenantId },
      data: { whatsappInboxId: null },
    });

    return NextResponse.json({
      success: true,
      message: 'Integración de WhatsApp Twilio eliminada',
    });
  } catch (error: any) {
    console.error('[WhatsApp Twilio DELETE] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al eliminar integración' },
      { status: 500 }
    );
  }
}
