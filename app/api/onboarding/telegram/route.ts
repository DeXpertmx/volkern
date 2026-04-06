export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { provisionTenant, addWhatsAppChannel } from '@/lib/provisioning/tenant-provisioner';

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
      error: 'Error al conectar con Telegram. Verifica tu conexión.',
    };
  }
}

/**
 * POST /api/onboarding/telegram
 * Configura el bot de Telegram y realiza el auto-provisioning en Chatwoot
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

    const { botToken, botUsername } = await req.json();

    if (!botToken) {
      return NextResponse.json(
        { error: 'El token del bot es requerido' },
        { status: 400 }
      );
    }

    // 1. Validar el token de Telegram
    const validation = await validateTelegramToken(botToken);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'Token inválido' },
        { status: 400 }
      );
    }

    // 2. Verificar si ya existe configuración de Nexus
    const existingConfig = await prisma.messagingHubConfig.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (existingConfig?.isActive) {
      // Ya está configurado, solo actualizar el canal de Telegram
      return NextResponse.json({
        success: true,
        message: 'Canal de Telegram ya configurado',
        botInfo: validation.botInfo,
      });
    }

    // 3. Auto-provisioning en Chatwoot
    // Nota: Si CHATWOOT_BASE_URL no está configurado, simulamos éxito
    const chatwootUrl = process.env.CHATWOOT_BASE_URL;
    const chatwootToken = process.env.CHATWOOT_SUPER_ADMIN_TOKEN;

    let provisioningResult: {
      success: boolean;
      chatwootAccountId?: number;
      telegramInboxId?: number;
      error?: string;
    } = { success: false };

    if (chatwootUrl && chatwootToken) {
      // Importar dinámicamente para evitar errores si no hay Chatwoot
      const { chatwootApi } = await import('@/lib/nexus/chatwoot-api');
      const { encrypt } = await import('@/lib/core/crypto');
      const crypto = await import('crypto');

      try {
        // Crear cuenta en Chatwoot
        const account = await chatwootApi.createAccount(user.tenant.nombre, 'es');
        
        // Crear inbox de Telegram
        const inbox = await chatwootApi.createTelegramInbox(
          account.id,
          botToken,
          validation.botInfo?.username || botUsername || 'TelegramBot',
          chatwootToken
        );

        // Generar webhook secret
        const webhookSecret = crypto.randomBytes(32).toString('hex');
        const webhookUrl = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhooks/nexus-sync`;

        // Guardar configuración de Nexus
        await prisma.messagingHubConfig.create({
          data: {
            tenantId: user.tenantId,
            isActive: true,
            hubBaseUrl: chatwootUrl,
            hubApiToken: encrypt(chatwootToken),
            hubAccountId: String(account.id),
            chatwootAccountId: account.id,
            telegramInboxId: inbox.id,
            autoProvisioned: true,
            provisionedAt: new Date(),
            webhookSecret,
            webhookUrl,
          },
        });

        // Guardar canal de Telegram
        await prisma.channel.create({
          data: {
            tenantId: user.tenantId,
            type: 'telegram',
            name: `Telegram - @${validation.botInfo?.username || botUsername}`,
            config: {
              botToken: encrypt(botToken),
              botUsername: validation.botInfo?.username || botUsername,
              botId: validation.botInfo?.id,
            },
            chatwootInboxId: inbox.id,
            isActive: true,
            isDefault: true,
          },
        });

        // Configurar webhook en Chatwoot
        try {
          await chatwootApi.configureWebhook(account.id, webhookUrl, chatwootToken);
        } catch (webhookError) {
          console.warn('[Onboarding] Webhook configuration warning:', webhookError);
          // No es crítico, continuar
        }

        provisioningResult = {
          success: true,
          chatwootAccountId: account.id,
          telegramInboxId: inbox.id,
        };
      } catch (chatwootError: any) {
        console.error('[Onboarding] Chatwoot provisioning error:', chatwootError);
        provisioningResult = {
          success: false,
          error: chatwootError.message,
        };
      }
    } else {
      // Sin Chatwoot configurado - guardar solo el canal localmente
      console.log('[Onboarding] Chatwoot not configured, saving channel locally');
      const { encrypt } = await import('@/lib/core/crypto');
      
      // Buscar canal existente
      const existingChannel = await prisma.channel.findFirst({
        where: {
          tenantId: user.tenantId,
          type: 'telegram',
        },
      });

      const channelData = {
        name: `Telegram - @${validation.botInfo?.username || botUsername}`,
        config: {
          botToken: encrypt(botToken),
          botUsername: validation.botInfo?.username || botUsername,
          botId: validation.botInfo?.id,
        },
        isActive: true,
      };

      if (existingChannel) {
        await prisma.channel.update({
          where: { id: existingChannel.id },
          data: channelData,
        });
      } else {
        await prisma.channel.create({
          data: {
            tenantId: user.tenantId,
            type: 'telegram',
            ...channelData,
            isDefault: true,
          },
        });
      }

      provisioningResult = { success: true };
    }

    // 4. Actualizar progreso de onboarding
    await prisma.onboardingProgress.upsert({
      where: { tenantId: user.tenantId },
      update: { configuracionCanales: true },
      create: {
        tenantId: user.tenantId,
        configuracionCanales: true,
      },
    });

    // 5. Habilitar Nexus en el tenant
    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: { nexusEnabled: true },
    });

    // 6. Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'telegram_configurado',
        entidad: 'Channel',
        entidadId: user.tenantId,
        descripcion: `Bot de Telegram configurado: @${validation.botInfo?.username || botUsername}`,
        cambiosDespues: {
          botUsername: validation.botInfo?.username || botUsername,
          chatwootProvisioned: provisioningResult.success,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Bot de Telegram configurado correctamente',
      botInfo: validation.botInfo,
      provisioning: {
        success: provisioningResult.success,
        chatwootAccountId: provisioningResult.chatwootAccountId,
      },
    });
  } catch (error: any) {
    console.error('[Onboarding Telegram] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al configurar Telegram' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/onboarding/telegram
 * Obtiene el estado actual de la configuración de Telegram
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

    // Buscar canal de Telegram existente
    const channel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'telegram',
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
      botUsername: config?.botUsername,
      isActive: channel.isActive,
    });
  } catch (error: any) {
    console.error('[Onboarding Telegram GET] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}
