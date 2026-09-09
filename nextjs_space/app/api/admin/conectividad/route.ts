export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  getConnectivityPublic,
  saveConnectivityConfig,
  getConnectivityCredentials,
  CONNECTIVITY_PROVIDER_NOMBRE,
  type ConnectivityEstado,
} from '@/lib/hospitality/connectivity';
import { notifyDeveloperSensitiveAction } from '@/lib/telegram/developer-notify';

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
    return NextResponse.json(data);
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

    const result = await saveConnectivityConfig({
      partnerId,
      username,
      password,
      estado,
    });

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
    }

    return NextResponse.json({
      success: true,
      ...result,
      completo,
    });
  } catch (error) {
    console.error('Error guardando conectividad:', error);
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 });
  }
}