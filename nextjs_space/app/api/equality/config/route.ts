
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { TelegramService } from '@/lib/telegram';

/**
 * GET /api/equality/config - Obtener configuración del módulo de igualdad
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const config = await prisma.equalityConfig.findUnique({
      where: { tenantId }
    });
    return NextResponse.json(config || { error: 'No config found' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * POST /api/equality/config - Guardar configuración
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json();
    const { responsibleId, telegramBotToken, telegramChatId, isActive } = body;

    // Validar bot de telegram si se proporciona token
    if (telegramBotToken) {
      const botInfo = await TelegramService.getMe(telegramBotToken);
      if (!botInfo.ok) {
        return NextResponse.json({ error: 'Token de Telegram inválido' }, { status: 400 });
      }
    }

    const config = await prisma.equalityConfig.upsert({
      where: { tenantId },
      update: {
        responsibleId,
        telegramBotToken,
        telegramChatId,
        isActive
      },
      create: {
        tenantId,
        responsibleId,
        telegramBotToken,
        telegramChatId,
        isActive
      }
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error('[EqualityConfigAPI] Error:', error);
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 });
  }
});
