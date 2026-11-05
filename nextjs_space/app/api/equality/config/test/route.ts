
import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { TelegramService } from '@/lib/telegram';

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { token, chatId } = body;

    if (!token || !chatId) {
      return NextResponse.json({ error: 'Token y Chat ID son requeridos' }, { status: 400 });
    }

    const message = `🛠 <b>Volkern Equality System</b>\n\n` +
                    `✅ La conexión con el Bot de Telegram se ha establecido correctamente para el tenant <b>${auth.tenant!.nombre}</b>.\n\n` +
                    `<i>Este chat ahora recibirá alertas críticas del Canal de Denuncias.</i>`;

    const result = await TelegramService.sendMessage(token, chatId, message);

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}, ['compliance:write']);
