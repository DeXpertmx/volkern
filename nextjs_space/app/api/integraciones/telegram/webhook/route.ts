export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/core/crypto';
import { estadoWebhookBot, registrarWebhookBot } from '@/lib/telegram/webhook-registro';

/**
 * Estado y reparación del webhook del bot de Telegram del tenant.
 *
 * GET  → si el bot apunta al endpoint de Volkern, updates pendientes y último
 *        error que reporta Telegram.
 * POST → vuelve a registrar el webhook (repara un bot que apunta a otro sitio
 *        o que se quedó sin webhook). Exige sesión del tenant dueño del bot.
 */

async function tokenDelTenant(): Promise<
  { ok: true; tenantId: string; userId: string; botToken: string | null } | { ok: false; respuesta: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false, respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user?.tenantId) {
    return { ok: false, respuesta: NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 }) };
  }

  const [channel, integracion] = await Promise.all([
    prisma.channel.findFirst({ where: { tenantId: user.tenantId, type: 'telegram' } }),
    prisma.integration.findFirst({
      where: { tenantId: user.tenantId, tipo: 'telegram', activo: true },
      select: { credenciales: true },
    }),
  ]);

  const config = (channel?.config as any) || {};
  const credenciales = (integracion?.credenciales as any) || {};

  let botToken: string | null = null;
  try {
    if (config.botToken) botToken = decrypt(String(config.botToken));
    else if (credenciales.bot_token) botToken = String(credenciales.bot_token);
  } catch (error) {
    console.error('[TelegramWebhookState] No se pudo descifrar el token del bot:', error);
  }

  return { ok: true, tenantId: user.tenantId, userId: user.id, botToken };
}

export async function GET() {
  const contexto = await tokenDelTenant();
  if (!contexto.ok) return contexto.respuesta;

  const estado = await estadoWebhookBot(contexto.botToken || '');
  return NextResponse.json({ ...estado, tieneBot: Boolean(contexto.botToken) });
}

export async function POST(req: NextRequest) {
  const contexto = await tokenDelTenant();
  if (!contexto.ok) return contexto.respuesta;

  if (!contexto.botToken) {
    return NextResponse.json(
      { error: 'Esta cuenta no tiene un bot de Telegram conectado' },
      { status: 409 }
    );
  }

  const cuerpo = await req.json().catch(() => ({} as { forzar?: boolean }));
  const resultado = await registrarWebhookBot(contexto.botToken, { forzar: cuerpo?.forzar !== false });

  // Queda constancia de la reparación: un webhook que nadie registró fue la
  // causa de que el bot no recibiera mensajes.
  await prisma.auditLog
    .create({
      data: {
        tenantId: contexto.tenantId,
        userId: contexto.userId,
        accion: resultado.ok ? 'telegram_webhook_reparado' : 'telegram_webhook_fallo',
        entidad: 'Channel',
        entidadId: contexto.tenantId,
        descripcion: resultado.ok
          ? 'Webhook de Telegram registrado desde Integraciones'
          : `No se pudo registrar el webhook de Telegram: ${resultado.descripcion || 'error'}`,
        cambiosDespues: { url: resultado.url },
      },
    })
    .catch((error) => console.error('[TelegramWebhookState] Audit log falló:', error));

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 502 });
}
