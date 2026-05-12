import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramWebhook } from '@/lib/agents/telegram-chatbot';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId es requerido' },
        { status: 400 }
      );
    }

    // Verificar que el tenant existe y tiene el chatbot activo
    const config = await prisma.telegramChatbotConfig.findUnique({
      where: { tenantId }
    });

    if (!config || !config.isActive) {
      return NextResponse.json(
        { error: 'Chatbot de Telegram no está activo para este tenant' },
        { status: 403 }
      );
    }

    // Verificar secret token si está configurado
    const secretToken = searchParams.get('token');
    if (config.webhookUrl) {
      const expectedToken = config.webhookUrl.split('token=')[1];
      if (expectedToken && secretToken !== expectedToken) {
        return NextResponse.json(
          { error: 'Token inválido' },
          { status: 401 }
        );
      }
    }

    // Parsear el body como JSON
    const update = await request.json();

    // Validar que es un update de Telegram válido
    if (!update.update_id) {
      return NextResponse.json(
        { error: 'Update inválido' },
        { status: 400 }
      );
    }

    // Procesar el webhook
    const result = await handleTelegramWebhook(tenantId, update);

    if (result.error) {
      console.error('[TelegramWebhook] Error:', result.error);
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[TelegramWebhook] Error fatal:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const action = searchParams.get('action');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'tenantId es requerido' },
      { status: 400 }
    );
  }

  try {
    const config = await prisma.telegramChatbotConfig.findUnique({
      where: { tenantId }
    });

    if (!config) {
      return NextResponse.json(
        { error: 'Configuración no encontrada' },
        { status: 404 }
      );
    }

    switch (action) {
      case 'status':
        return NextResponse.json({
          isActive: config.isActive,
          webhookUrl: config.webhookUrl,
          botToken: config.botToken ? '***' + config.botToken.slice(-4) : null
        });

      case 'setWebhook':
        if (!config.botToken) {
          return NextResponse.json(
            { error: 'No hay bot token configurado' },
            { status: 400 }
          );
        }

        const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook?tenantId=${tenantId}&token=${Date.now()}`;
        const { TelegramGatewayAgent } = await import('@/lib/agents/telegram-gateway');
        
        const webhookResult = await TelegramGatewayAgent.setWebhook(
          config.botToken,
          webhookUrl
        );

        if (!webhookResult.success) {
          return NextResponse.json(
            { error: webhookResult.error },
            { status: 500 }
          );
        }

        // Guardar el webhook URL en la config
        await prisma.telegramChatbotConfig.update({
          where: { tenantId },
          data: { webhookUrl }
        });

        return NextResponse.json({
          success: true,
          webhookUrl
        });

      default:
        return NextResponse.json({
          message: 'Usa action=status para ver el estado o action=setWebhook para configurar',
          config: {
            isActive: config.isActive,
            welcomeMessage: config.welcomeMessage,
            fallbackMessage: config.fallbackMessage,
            maxContextMessages: config.maxContextMessages,
            sessionTimeoutMinutes: config.sessionTimeoutMinutes
          }
        });
    }

  } catch (error) {
    console.error('[TelegramWebhook] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}