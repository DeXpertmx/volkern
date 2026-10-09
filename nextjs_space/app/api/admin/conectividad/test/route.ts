export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  getConnectivityProvider,
  partnerIdEsDeCadaHotel,
  testConnectivityConnection,
  updateConnectivityStatus,
  resolveProbeHotelCode,
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
    const provider = await getConnectivityProvider();
    // Sin hotel indicado se sondea el de la sonda (el mismo del health-check
    // diario), no un sandbox fijo que puede no estar concedido al partner.
    const hotelCode = typeof body?.hotelCode === 'string' && body.hotelCode.trim()
      ? body.hotelCode.trim()
      : resolveProbeHotelCode(provider);

    // El ID de socio puede ser de cada hotel, que es lo correcto: entonces la
    // prueba de PLATAFORMA no aplica —no hay ID de socio con el que sondear la
    // propiedad de nadie— y NO se marca la capa en error por eso. El estado se
    // deja intacto y se dice dónde sí se puede comprobar: si el hotel ve sus
    // propiedades es el hotel quien lo sabe. `aplica: false` es lo que le dice
    // al panel que esto no es un fallo (nada de rojo ni de aviso al equipo).
    if (partnerIdEsDeCadaHotel(provider)) {
      return NextResponse.json(
        {
          ok: false,
          aplica: false,
          hotelCode,
          error:
            'El ID de socio es de cada hotel: pruébalo desde Conectividad del hotel, con el código de una de sus propiedades.',
        },
        { status: 200 }
      );
    }

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