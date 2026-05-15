import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramWebhook } from '@/lib/agents/telegram-chatbot';
import { prisma } from '@/lib/db';
import { rateLimiter } from '@/lib/agents/rate-limiter';
import { orchestrator } from '@/lib/agents/orchestrator';

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

    const chatId = update.message?.chat?.id?.toString();
    if (!chatId) {
      return NextResponse.json({ error: 'chatId no encontrado' }, { status: 400 });
    }

    // Extraer datos del mensaje
    const message = update.message;
    if (!message || !message.text) {
      return NextResponse.json({ success: true, message: 'No es un mensaje de texto' });
    }

    const telegramUserId = message.from.id.toString();
    const messageText = message.text;

    // 🛡️ Procesar con orchestrator (7 agentes de seguridad)
    const orchestratorResult = await orchestrator.process({
      message: messageText,
      userId: telegramUserId,
      tenantId,
      chatId,
      isAuthenticated: false,
      userRole: 'user'
    });

    // 📤 Enviar respuesta a Telegram
    const botToken = config.botToken;
    if (botToken && orchestratorResult.response) {
      const replyMarkup = orchestratorResult.metadata?.quickReplies ? {
        keyboard: orchestratorResult.metadata.quickReplies.map((reply: string) => [{ text: reply }])
      } : undefined;

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: orchestratorResult.response,
          reply_markup: replyMarkup
        })
      });
    }

    return NextResponse.json({ success: true, processed: true });

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