export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { checkPermission } from '@/lib/permissions';
import {
  crearEnlaceVinculoAdmin,
  desvincularChatAdmin,
  estadoVinculoAdmin,
} from '@/lib/telegram/admin-link';
import { auditarChatAdmin } from '@/lib/telegram/admin-chat-audit';

export const ROLES_CON_VINCULO = ['Superadmin', 'OWNER', 'Admin'];

type Acceso = { ok: true; userId: string; tenantId: string } | { ok: false; res: NextResponse };

/**
 * Sesión + rol de administración del tenant, compartido por GET y POST: quien
 * puede ver el chat vinculado es quien puede cambiarlo.
 */
async function accesoAdmin(): Promise<Acceso> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { role: true },
  });

  if (!user?.tenantId) {
    return { ok: false, res: NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 }) };
  }

  const esAdmin =
    ROLES_CON_VINCULO.includes(user.role?.nombre || '') ||
    (await checkPermission(user.id, 'configuracion', 'editar'));

  if (!esAdmin) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Solo un administrador puede gestionar el chat de la empresa' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id, tenantId: user.tenantId };
}

/** Sin bot no hay chat: mismo estado vacío que un tenant sin vínculo. */
const SIN_VINCULO = { vinculado: false, chatId: null, desde: null, botUsername: null };

/**
 * GET /api/integraciones/telegram/enlace-admin
 *
 * Estado del chat de administración: si está vinculado, a qué chat y desde
 * cuándo. Lo usa el panel para no ofrecer «vincular» a ciegas cuando ya hay un
 * chat recibiendo los avisos.
 */
export async function GET() {
  try {
    const acceso = await accesoAdmin();
    if (!acceso.ok) return acceso.res;

    const estado = await estadoVinculoAdmin(acceso.tenantId);
    return NextResponse.json(estado ?? SIN_VINCULO);
  } catch (error) {
    console.error('[TelegramAdminLink] Error leyendo el estado del vínculo:', error);
    return NextResponse.json({ error: 'No se pudo leer el vínculo' }, { status: 500 });
  }
}

/**
 * DELETE /api/integraciones/telegram/enlace-admin
 *
 * Desvincula el chat de administración del tenant: deja de recibir los avisos
 * de la empresa y se invalida el enlace pendiente. Es idempotente (si no había
 * chat responde `desvinculado: false`), para que el panel pueda reintentar sin
 * tener que distinguir «ya estaba» de «se acaba de hacer».
 */
export async function DELETE() {
  try {
    const acceso = await accesoAdmin();
    if (!acceso.ok) return acceso.res;

    // Se lee antes de borrar: la auditoría tiene que decir qué chat se quitó y
    // desde cuándo estaba recibiendo los avisos, y eso deja de existir después.
    const previo = await estadoVinculoAdmin(acceso.tenantId);
    const desvinculado = await desvincularChatAdmin(acceso.tenantId);

    if (desvinculado) {
      // La baja ya está hecha: si la auditoría fallara no se convierte en un
      // 500 que haría pensar que el chat sigue vinculado.
      await auditarChatAdmin({
        accion: 'desvinculado',
        tenantId: acceso.tenantId,
        userId: acceso.userId,
        chatId: previo?.chatId ?? null,
        vinculadoDesde: previo?.desde ?? null,
      }).catch((error) => console.error('[TelegramAdminLink] Auditoría de la baja fallida:', error));
    }

    return NextResponse.json({ desvinculado });
  } catch (error) {
    console.error('[TelegramAdminLink] Error desvinculando el chat:', error);
    return NextResponse.json({ error: 'No se pudo desvincular el chat' }, { status: 500 });
  }
}

/**
 * POST /api/integraciones/telegram/enlace-admin
 *
 * Genera el enlace de un solo uso con el que el administrador del tenant
 * vincula su chat de Telegram (`/start a_<token>`). Sustituye a
 * `/start <tenantId>`, que vinculaba por posesión de un identificador público.
 *
 * Solo puede pedirlo quien administra la cuenta: el chat que se vincula pasa a
 * recibir los avisos de la empresa.
 */
export async function POST() {
  try {
    const acceso = await accesoAdmin();
    if (!acceso.ok) return acceso.res;

    // El solicitante viaja con el token: cuando el `/start` llegue desde
    // Telegram, la auditoría del vínculo sabrá a nombre de quién se pidió.
    const enlace = await crearEnlaceVinculoAdmin(acceso.tenantId, acceso.userId);
    if (!enlace) {
      return NextResponse.json(
        {
          error: 'No hay un bot de Telegram conectado en esta cuenta',
          detalle:
            'Conecta el bot primero (token de BotFather). Sin bot propio no hay chat al que enviar los avisos.',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      enlace: enlace.enlace,
      expiraEn: enlace.expiraEn,
      botUsername: enlace.botUsername,
    });
  } catch (error) {
    console.error('[TelegramAdminLink] Error generando el enlace:', error);
    return NextResponse.json({ error: 'No se pudo generar el enlace' }, { status: 500 });
  }
}
