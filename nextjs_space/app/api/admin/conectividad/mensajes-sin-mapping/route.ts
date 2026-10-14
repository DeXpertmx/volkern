export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/conectividad/mensajes-sin-mapping — `hotel_id` del canal que
 * están mandando mensajes de huésped y no se pueden entregar.
 *
 * Un mensaje de un hotelCode sin mapping no tiene tenant (no hay a quién
 * entregarlo), así que no puede salir en el panel del cliente: sale aquí, en el
 * panel de Conectividad de plataforma, con **el código** y **cuántos intentos**
 * lleva. Es el mismo camino que una reserva sin mapping, que ya se audita en
 * `hospitality_webhook_events`; la diferencia es que el proveedor reintenta el
 * mismo mensaje cada 5 minutos, así que la incidencia es una fila por
 * (código, canal) con contador en vez de una fila por entrega.
 *
 * Sin `payload` a propósito: lo que hay que ver es el código y los intentos, y
 * el mensaje del huésped lleva datos personales. El motivo sí viaja
 * (`errorMensaje`), porque es lo que explica qué falta.
 *
 * Solo Superadmin: vincular un `hotel_id` que no es de nadie es una decisión de
 * plataforma, no de un hotel.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { listarIncidenciasMensajeSinMapping } from '@/lib/hospitality/mensajes-service';

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

export async function GET() {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const incidencias = await listarIncidenciasMensajeSinMapping();

    // Ayuda para actuar sin salir del panel: si el código pertenece a una
    // propiedad que ya existe en algún tenant, se dice cuál y si le falta el
    // mapping (el caso típico: el hotel está dado de alta y el vínculo no).
    const codigos = incidencias.map((i) => i.hotelCode).filter(Boolean);
    const mappings = codigos.length
      ? await prisma.connectivityMapping.findMany({
          where: { provider: 'channel_connectivity', externalPropertyId: { in: codigos } },
          select: {
            externalPropertyId: true,
            estado: true,
            tenantId: true,
            property: { select: { id: true, nombre: true } },
          },
        })
      : [];

    const porCodigo = new Map<
      string,
      { propertyId: string | null; property: string | null; tenantId: string; estado: string }[]
    >();
    for (const m of mappings) {
      const lista = porCodigo.get(m.externalPropertyId) ?? [];
      lista.push({
        propertyId: m.property?.id ?? null,
        property: m.property?.nombre ?? null,
        tenantId: m.tenantId,
        estado: m.estado,
      });
      porCodigo.set(m.externalPropertyId, lista);
    }

    return NextResponse.json({
      incidencias: incidencias.map((i) => ({
        ...i,
        // Lo que ya existe en Volkern para ese código (puede estar inactivo:
        // entonces el arreglo es reactivarlo, no crearlo).
        vinculos: porCodigo.get(i.hotelCode) ?? [],
      })),
      total: incidencias.length,
    });
  } catch (error) {
    console.error('Error listando mensajes sin mapping:', error);
    return NextResponse.json({ error: 'Error al listar los mensajes sin mapping' }, { status: 500 });
  }
}
