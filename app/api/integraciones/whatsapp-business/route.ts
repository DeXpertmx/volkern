export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { chatwootApi } from '@/lib/nexus/chatwoot-api';
import { encrypt, decrypt } from '@/lib/core/crypto';

/**
 * GET /api/integraciones/whatsapp-business
 * Obtiene el estado de la integración de WhatsApp Business
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

    // Buscar canal de WhatsApp
    const channel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'whatsapp',
      },
    });

    if (!channel) {
      return NextResponse.json({
        configured: false,
      });
    }

    const config = channel.config as any;

    return NextResponse.json({
      configured: true,
      integration: {
        id: channel.id,
        name: channel.name,
        isActive: channel.isActive,
        phoneNumberId: config?.phoneNumberId,
        businessAccountId: config?.businessAccountId,
        chatwootInboxId: channel.chatwootInboxId,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[WhatsApp Business GET] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/integraciones/whatsapp-business
 * Configura WhatsApp Business y crea inbox en Chatwoot
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

    const { phone_number_id, business_account_id, access_token } = await req.json();

    if (!phone_number_id || !business_account_id || !access_token) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      );
    }

    // 1. Verificar que el tenant tenga configuración de Nexus (Chatwoot)
    const hubConfig = await prisma.messagingHubConfig.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!hubConfig || !hubConfig.chatwootAccountId) {
      return NextResponse.json(
        { error: 'Primero debes configurar tu bot de Telegram en el onboarding' },
        { status: 400 }
      );
    }

    // 2. Verificar si ya existe un canal de WhatsApp
    const existingChannel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'whatsapp',
      },
    });

    let chatwootInboxId: number | null = null;

    // 3. Crear inbox en Chatwoot (si está configurado)
    const chatwootUrl = process.env.CHATWOOT_BASE_URL;
    const chatwootToken = process.env.CHATWOOT_SUPER_ADMIN_TOKEN;

    if (chatwootUrl && chatwootToken && hubConfig.chatwootAccountId) {
      try {
        // Obtener access token del bot user para la cuenta
        const accountAccessToken = await chatwootApi.ensureBotUserInAccount(
          hubConfig.chatwootAccountId
        );

        const inbox = await chatwootApi.createWhatsAppInbox(
          hubConfig.chatwootAccountId,
          `WhatsApp - ${user.tenant.nombre}`,
          phone_number_id,
          business_account_id,
          access_token,
          accountAccessToken // Usar token del bot user, no super admin
        );
        chatwootInboxId = inbox.id;
        console.log('[WhatsApp Business] Chatwoot inbox created:', chatwootInboxId);
      } catch (chatwootError: any) {
        console.error('[WhatsApp Business] Chatwoot error:', chatwootError);
        return NextResponse.json(
          { error: `Error configurando canal de comunicación: ${chatwootError.message}` },
          { status: 500 }
        );
      }
    }

    // 4. Guardar o actualizar canal
    const channelData = {
      name: `WhatsApp Business`,
      config: {
        phoneNumberId: phone_number_id,
        businessAccountId: business_account_id,
        accessToken: encrypt(access_token),
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
          type: 'whatsapp',
          ...channelData,
        },
      });
    }

    // 5. Actualizar MessagingHubConfig si se creó inbox
    if (chatwootInboxId) {
      await prisma.messagingHubConfig.update({
        where: { tenantId: user.tenantId },
        data: { whatsappInboxId: chatwootInboxId },
      });
    }

    // 6. Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: existingChannel ? 'whatsapp_actualizado' : 'whatsapp_configurado',
        entidad: 'Channel',
        entidadId: channel.id,
        descripcion: `WhatsApp Business ${existingChannel ? 'actualizado' : 'configurado'}`,
        cambiosDespues: {
          phoneNumberId: phone_number_id,
          businessAccountId: business_account_id,
          chatwootInboxId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'WhatsApp Business configurado correctamente',
      channel: {
        id: channel.id,
        name: channel.name,
        chatwootInboxId,
      },
    });
  } catch (error: any) {
    console.error('[WhatsApp Business POST] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al configurar WhatsApp' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/integraciones/whatsapp-business
 * Elimina la integración de WhatsApp Business
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

    const channel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'whatsapp',
      },
    });

    if (!channel) {
      return NextResponse.json({ error: 'No hay integración de WhatsApp' }, { status: 404 });
    }

    await prisma.channel.delete({
      where: { id: channel.id },
    });

    // Limpiar referencia en MessagingHubConfig
    await prisma.messagingHubConfig.updateMany({
      where: { tenantId: user.tenantId },
      data: { whatsappInboxId: null },
    });

    return NextResponse.json({
      success: true,
      message: 'Integración de WhatsApp eliminada',
    });
  } catch (error: any) {
    console.error('[WhatsApp Business DELETE] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al eliminar integración' },
      { status: 500 }
    );
  }
}
