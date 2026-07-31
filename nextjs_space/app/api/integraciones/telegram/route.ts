export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { chatwootApi } from '@/lib/nexus/chatwoot-api';
import { encrypt } from '@/lib/core/crypto';
import crypto from 'crypto';

/**
 * Valida un token de bot de Telegram
 */
async function validateTelegramToken(botToken: string): Promise<{
  valid: boolean;
  botInfo?: { username: string; firstName: string; id: number };
  error?: string;
}> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();

    if (data.ok && data.result) {
      return {
        valid: true,
        botInfo: {
          username: data.result.username,
          firstName: data.result.first_name,
          id: data.result.id,
        },
      };
    }

    return {
      valid: false,
      error: data.description || 'Token de Telegram inválido',
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Error al conectar con Telegram',
    };
  }
}

/**
 * GET /api/integraciones/telegram
 * Obtiene el estado de la integración de Telegram
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

    // Buscar canal de Telegram (modelo moderno)
    const channel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'telegram',
      },
    });

    // Fallback: integración legacy (modelo Integration con credenciales.bot_token)
    const legacyIntegration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'telegram',
        activo: true,
      },
      select: { id: true, nombre: true, credenciales: true },
    });

    if (!channel && !legacyIntegration) {
      return NextResponse.json({
        configured: false,
      });
    }

    // Username del bot: soporta botUsername (nuevo) y botName (provisioner/legacy)
    const channelConfig = (channel?.config as any) || {};
    const legacyCreds = (legacyIntegration?.credenciales as any) || {};
    const botUsername =
      channelConfig?.botUsername ||
      channelConfig?.botName ||
      legacyCreds?.bot_username ||
      legacyCreds?.botName ||
      legacyCreds?.bot_name ||
      (legacyIntegration?.nombre ? legacyIntegration.nombre.replace(/^Telegram[ -]+@?/i, '') : undefined);

    return NextResponse.json({
      configured: true,
      integration: {
        id: channel?.id || legacyIntegration?.id,
        name: channel?.name || legacyIntegration?.nombre,
        isActive: channel ? channel.isActive : true,
        botUsername: botUsername ?? null,
        chatwootInboxId: channel?.chatwootInboxId ?? null,
        createdAt: channel?.createdAt ?? null,
        updatedAt: channel?.updatedAt ?? null,
        source: channel ? 'channel' : 'integration',
      },
    });
  } catch (error: any) {
    console.error('[Telegram GET] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/integraciones/telegram
 * Configura Telegram Bot y crea inbox en Chatwoot
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

    const { bot_token } = await req.json();

    if (!bot_token) {
      return NextResponse.json(
        { error: 'El token del bot es requerido' },
        { status: 400 }
      );
    }

    // 1. Validar el token de Telegram
    const validation = await validateTelegramToken(bot_token);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'Token inválido' },
        { status: 400 }
      );
    }

    // 2. Verificar si ya existe un canal de Telegram
    const existingChannel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'telegram',
      },
    });

    let chatwootInboxId: number | null = existingChannel?.chatwootInboxId || null;
    let chatwootAccountId: number | null = null;
    let accountAccessToken: string | null = null;

    // 3. Verificar/crear configuración de Nexus
    let hubConfig = await prisma.messagingHubConfig.findUnique({
      where: { tenantId: user.tenantId },
    });

    const chatwootUrl = process.env.CHATWOOT_BASE_URL;
    const chatwootToken = process.env.CHATWOOT_SUPER_ADMIN_TOKEN;

    // 4. Si Chatwoot está configurado, crear cuenta e inbox
    if (chatwootUrl && chatwootToken) {
      try {
        // Si no hay cuenta de Chatwoot, crear una con acceso del bot
        if (!hubConfig?.chatwootAccountId) {
          const { account, accessToken } = await chatwootApi.createAccountWithAccess(
            user.tenant.nombre,
            'es'
          );
          chatwootAccountId = account.id;
          accountAccessToken = accessToken;
          console.log('[Telegram] Chatwoot account created:', chatwootAccountId);
        } else {
          chatwootAccountId = hubConfig.chatwootAccountId;
          // Asegurar que el bot tiene acceso a la cuenta existente
          accountAccessToken = await chatwootApi.ensureBotUserInAccount(chatwootAccountId);
          console.log('[Telegram] Using existing Chatwoot account:', chatwootAccountId);
        }

        // Si no hay inbox de Telegram o estamos actualizando, crear/actualizar
        if (!chatwootInboxId && chatwootAccountId && accountAccessToken) {
          const inbox = await chatwootApi.createTelegramInbox(
            chatwootAccountId,
            bot_token,
            validation.botInfo?.username || 'TelegramBot',
            accountAccessToken // Usar token del bot user, no super admin
          );
          chatwootInboxId = inbox.id;
          console.log('[Telegram] Chatwoot inbox created:', chatwootInboxId);
        }
      } catch (chatwootError: any) {
        console.error('[Telegram] Chatwoot error:', chatwootError);
        // Continuar sin Chatwoot - pero informar del error
        return NextResponse.json(
          { error: `Error configurando canal de comunicación: ${chatwootError.message}` },
          { status: 500 }
        );
      }
    }

    // 5. Crear o actualizar MessagingHubConfig
    const webhookSecret = hubConfig?.webhookSecret || crypto.randomBytes(32).toString('hex');
    const webhookUrl = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhooks/nexus-sync`;

    if (!hubConfig) {
      hubConfig = await prisma.messagingHubConfig.create({
        data: {
          tenantId: user.tenantId,
          isActive: true,
          hubBaseUrl: chatwootUrl || '',
          hubApiToken: chatwootToken ? encrypt(chatwootToken) : '',
          hubAccountId: chatwootAccountId ? String(chatwootAccountId) : undefined,
          chatwootAccountId,
          telegramInboxId: chatwootInboxId,
          autoProvisioned: true,
          provisionedAt: new Date(),
          webhookSecret,
          webhookUrl,
        },
      });
    } else if (chatwootAccountId || chatwootInboxId) {
      hubConfig = await prisma.messagingHubConfig.update({
        where: { tenantId: user.tenantId },
        data: {
          chatwootAccountId: chatwootAccountId || hubConfig.chatwootAccountId,
          telegramInboxId: chatwootInboxId || hubConfig.telegramInboxId,
          isActive: true,
        },
      });
    }

    // 6. Guardar o actualizar canal
    const channelData = {
      name: `Telegram - @${validation.botInfo?.username}`,
      config: {
        botToken: encrypt(bot_token),
        botUsername: validation.botInfo?.username,
        botId: validation.botInfo?.id,
      },
      chatwootInboxId,
      isActive: true,
      isDefault: true,
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
          type: 'telegram',
          ...channelData,
        },
      });
    }

    // 7. Habilitar Nexus en el tenant
    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: { nexusEnabled: true },
    });

    // 8. Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: existingChannel ? 'telegram_actualizado' : 'telegram_configurado',
        entidad: 'Channel',
        entidadId: channel.id,
        descripcion: `Telegram Bot ${existingChannel ? 'actualizado' : 'configurado'}: @${validation.botInfo?.username}`,
        cambiosDespues: {
          botUsername: validation.botInfo?.username,
          chatwootAccountId,
          chatwootInboxId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Telegram Bot configurado correctamente',
      botInfo: validation.botInfo,
      channel: {
        id: channel.id,
        name: channel.name,
        chatwootInboxId,
      },
    });
  } catch (error: any) {
    console.error('[Telegram POST] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al configurar Telegram' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/integraciones/telegram
 * Elimina la integración de Telegram
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
        type: 'telegram',
      },
    });

    if (!channel) {
      return NextResponse.json({ error: 'No hay integración de Telegram' }, { status: 404 });
    }

    await prisma.channel.delete({
      where: { id: channel.id },
    });

    // Limpiar referencia en MessagingHubConfig
    await prisma.messagingHubConfig.updateMany({
      where: { tenantId: user.tenantId },
      data: { telegramInboxId: null },
    });

    return NextResponse.json({
      success: true,
      message: 'Integración de Telegram eliminada',
    });
  } catch (error: any) {
    console.error('[Telegram DELETE] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al eliminar integración' },
      { status: 500 }
    );
  }
}
