import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { handleTelegramWebhook } from '@/lib/agents/telegram-chatbot';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimiter } from '@/lib/agents/rate-limiter';
import { orchestrator } from '@/lib/agents/orchestrator';

/**
 * Ruta de entrada ANTIGUA de Telegram (motor propio, sin bandeja de gastos).
 *
 * Su `GET` es una acción de administración, no un webhook: antes no pedía
 * sesión, solo el `tenantId` de la URL. Cualquiera que conociera o adivinara
 * ese id podía ejecutar `action=setWebhook` y re-registrar el webhook del bot
 * apuntándolo a esta ruta, dejando al pipeline unificado sin recibir updates
 * (y, de paso, `action=status` devolvía los últimos cuatro caracteres del
 * token). Ahora exige sesión de superadmin, igual que el resto de acciones de
 * plataforma.
 */
async function requireSuperadmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });
  if (!user || user.role?.nombre !== 'Superadmin') {
    return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) };
  }
  return { user };
}

export async function POST(request: NextRequest) {
  console.log(`[TelegramWebhook] Received POST request at ${new Date().toISOString()}`);
  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    console.log(`[TelegramWebhook] Body: ${JSON.stringify(body).substring(0, 200)}`);
    console.log(`[TelegramWebhook] TenantId: ${tenantId}`);

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
    const update = body;

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
  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;

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
        // Retirado a propósito: esta acción apuntaba el bot a esta misma ruta,
        // que usa otro motor y no tiene bandeja de gastos. Se responde con el
        // motivo en vez de cambiar el enrutamiento de un canal en producción.
        return NextResponse.json(
          {
            error: 'Registrar el webhook desde esta ruta está desactivado',
            detalle:
              'La ruta antigua ya no puede apuntarse a sí misma. El webhook se registra ' +
              'con scripts/register-telegram-webhooks.ts (sin --apply muestra el plan y ' +
              'omite los bots que apuntan a otra dirección); si el bot usa el inbox de ' +
              'Telegram del hub de comunicaciones, no se toca.',
          },
          { status: 409 }
        );

      default:
        return NextResponse.json({
          message: 'Usa action=status para ver el estado. setWebhook está retirado: registra el webhook con scripts/register-telegram-webhooks.ts',
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