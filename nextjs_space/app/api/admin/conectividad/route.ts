export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  getConnectivityPublic,
  saveConnectivityConfig,
  getConnectivityCredentials,
  resetConnectivityCredentials,
  CONNECTIVITY_PROVIDER_NOMBRE,
  type ConnectivityEstado,
} from '@/lib/hospitality/connectivity';
import { notifyDeveloperSensitiveAction } from '@/lib/telegram/developer-notify';
// Preflight puro: valida el formato de lo que llega antes de escribir nada.
// Un espacio de más o un `usuario:contraseña` mal pegado tiene que fallar AQUÍ,
// con su arreglo, y no más tarde como un 401 indistinguible.
import {
  preflightConectividad,
  resumenPreflight,
  type AvisoPreflight,
} from '@/lib/hospitality/connectivity-preflight';

const ESTADOS_VALIDOS: ConnectivityEstado[] = ['sin_configurar', 'configurado', 'conectado', 'error'];

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

// GET /api/admin/conectividad — estado público (sin secretos)
export async function GET() {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const data = await getConnectivityPublic();
    // Preflight de la URL del servidor (variable de entorno): es el otro dato
    // que llega en la respuesta del proveedor y el único que no se configura
    // desde esta pantalla. Se revisa aquí para poder avisar sin llamar a nadie.
    const revisionUrl = preflightConectividad({
      baseUrl: process.env.CONNECTIVITY_BASE_URL ?? '',
    });
    return NextResponse.json({
      ...data,
      preflightBaseUrl: {
        ok: revisionUrl.ok,
        avisos: revisionUrl.avisos,
      },
    });
  } catch (error) {
    console.error('Error obteniendo conectividad:', error);
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 });
  }
}

// PUT /api/admin/conectividad — guardar credenciales
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const { partnerId, username, password, estado } = body || {};

    // Validar que al menos algo llegue
    const hasAny = [partnerId, username, password, estado].some(
      (v) => v !== undefined && v !== null && v !== ''
    );
    if (!hasAny) {
      return NextResponse.json(
        { error: 'No se recibieron datos para guardar' },
        { status: 400 }
      );
    }

    // Los secretos no deben viajar en texto plano por el wire con valores largos
    if (username !== undefined && typeof username !== 'string') {
      return NextResponse.json({ error: 'Usuario inválido' }, { status: 400 });
    }
    if (partnerId !== undefined && typeof partnerId !== 'string') {
      return NextResponse.json({ error: 'ID de socio inválido' }, { status: 400 });
    }
    if (password !== undefined && typeof password !== 'string') {
      return NextResponse.json({ error: 'Contraseña inválida' }, { status: 400 });
    }
    if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }

    // Preflight: formato del partner id y del Basic Auth antes de guardar.
    // Ningún error bloqueante llega a la base de datos, y el guardado usa los
    // valores ya normalizados (usuario y partner id sin espacios de pegado,
    // contraseña byte a byte). Se ejecuta después de las comprobaciones de tipo
    // para que un valor que no sea texto se rechace con su propio mensaje.
    const revision = preflightConectividad({ partnerId, username, password });
    if (!revision.ok) {
      return NextResponse.json(
        {
          error: resumenPreflight(revision),
          avisos: revision.bloqueantes,
        },
        { status: 400 }
      );
    }
    const avisosPreflight: AvisoPreflight[] = revision.advertencias;

    const result = await saveConnectivityConfig({
      partnerId: revision.valores.partnerId ?? undefined,
      username: revision.valores.username ?? undefined,
      password: revision.valores.password ?? undefined,
      estado,
    });

    // Segunda pasada del preflight dentro del guardado: si algo se colara
    // (p. ej. un valor imposible de cifrar) la escritura no ocurre y se dice.
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Las credenciales no pasan la validación', avisos: result.avisos },
        { status: 400 }
      );
    }

    // Verificación de credenciales completas después de guardar
    const creds = await getConnectivityCredentials();
    const completo = !!creds;

    // Notificación interna (solo si se guardaron secretos nuevos)
    if (password !== undefined && password !== '') {
      await notifyDeveloperSensitiveAction({
        title: '🔌 Conectividad de Canales actualizada',
        accion: 'Credenciales de conectividad guardadas',
        detalle: `${CONNECTIVITY_PROVIDER_NOMBRE}: credenciales actualizadas por Superadmin`,
        quien: auth.user.name || auth.user.email || auth.user.id,
        userId: auth.user.id,
      }).catch((err) => console.error('[Conectividad] Error al notificar:', err));
    }  return NextResponse.json({
    success: true,
    ...result,
    completo,
    // Avisos no bloqueantes (caracteres poco habituales, http sin cifrado…):
    // el guardado sigue adelante, pero el panel los muestra para revisarlos.
    avisos: avisosPreflight,
  });
  } catch (error) {
    console.error('Error guardando conectividad:', error);
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 });
  }
}

// DELETE /api/admin/conectividad — reset de credenciales (borrar y reintroducir)
// Para rotar el par o pasar de sandbox a producción: borra los tres secretos
// cifrados y deja el proveedor `sin_configurar`. No toca mapeos ni historial.
export async function DELETE() {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const habia = await getConnectivityCredentials();
    await resetConnectivityCredentials();

    // Acción sensible por antonomasia: quién vació las credenciales del canal.
    await notifyDeveloperSensitiveAction({
      title: '🔓 Conectividad de Canales — credenciales borradas',
      accion: 'Reset de credenciales de conectividad',
      detalle: `${CONNECTIVITY_PROVIDER_NOMBRE}: credenciales eliminadas (había${habia ? '' : ' NO'} partnerId/usuario/contraseña guardados). Quedan los mapeos y el historial.`,
      quien: auth.user.name || auth.user.email || auth.user.id,
      userId: auth.user.id,
    }).catch((err) => console.error('[Conectividad] Error al notificar:', err));

    return NextResponse.json({ success: true, reset: true });
  } catch (error) {
    console.error('Error reseteando conectividad:', error);
    return NextResponse.json({ error: 'Error al resetear las credenciales' }, { status: 500 });
  }
}