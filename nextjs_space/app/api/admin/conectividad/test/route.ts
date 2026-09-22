export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  testConnectivityConnection,
  updateConnectivityStatus,
  CONNECTIVITY_SANDBOX_HOTEL,
} from '@/lib/hospitality/connectivity';
import { notifyDeveloperSensitiveAction } from '@/lib/telegram/developer-notify';

// POST /api/admin/conectividad/test — probar conexión con property details
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    });
    if (!user || user.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const hotelCode = typeof body?.hotelCode === 'string' && body.hotelCode.trim()
      ? body.hotelCode.trim()
      : CONNECTIVITY_SANDBOX_HOTEL;

    const result = await testConnectivityConnection(hotelCode);

    // Actualizar estado de conectividad según el resultado. «Probar» es una
    // verificación activa de la capa: deja la misma marca que el health-check
    // diario (ultimaVerificacion), que es lo que ve el panel.
    if (result.ok) {
      await updateConnectivityStatus({ estado: 'conectado', resetErrores: true, ultimaVerificacion: new Date() });
    } else {
      await updateConnectivityStatus({ estado: 'error', error: true, ultimaVerificacion: new Date() });
    }

    // Notificar internamente solo cuando falla (diagnóstico)
    if (!result.ok) {
      await notifyDeveloperSensitiveAction({
        title: '⚠️ Prueba de conectividad fallida',
        accion: `Fallo al probar property_details (hotelCode ${hotelCode})`,
        detalle: result.error || 'Error desconocido',
        quien: user.name || user.email || user.id,
        userId: user.id,
      }).catch(() => {});
    }

    // IMPORTANTE: siempre HTTP 200 con `ok` en el body. Si devolvemos 5xx,
    // el proxy (Cloudflare/Caddy) reemplaza el body por "error code: 502" y
    // el panel admin pierde la causa real. El contrato del panel usa `ok`.
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error probando conectividad:', error);
    return NextResponse.json({ error: 'Error al probar conexión' }, { status: 500 });
  }
}