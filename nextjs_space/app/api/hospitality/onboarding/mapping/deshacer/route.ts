export const dynamic = 'force-dynamic';

/**
 * GET /api/hospitality/onboarding/mapping/deshacer?propertyId=...&unitId=...
 *
 * Preview para el panel de incidencias: lista las reservas vivas (pendiente,
 * confirmada o in-house) de la unidad cuyo vínculo se quiere deshacer. Solo
 * lee: no cambia ningún estado, y el deshacer no depende de él.
 *
 * «Viva» es `esReservaViva` (`lib/hospitality/estados.ts`): una estancia
 * terminada (`checked_out`) o que nunca existió (cancelada, no-show) no se
 * lista. La lista no promete qué noches están ocupadas: eso lo decide el motor
 * de disponibilidad.
 *
 * Deshacer no toca las reservas: las que ya están en la unidad siguen ahí, y
 * esta lista es la que el operador necesita para decidir si las mueve.
 *
 * POST /api/hospitality/onboarding/mapping/deshacer — deshace el vínculo.
 *
 * El vínculo NO se borra: se apaga (`estado: 'inactivo'`) y se marca en su
 * `metadata` que un operador lo rechazó. De ahí salen dos consecuencias:
 *   • deja de contar como vínculo activo (la resolución del webhook lo ignora);
 *   • la vinculación automática no vuelve a crearlo para esa habitación, para
 *     que deshacerlo sirva de algo y no se rehaga en la siguiente reserva.
 *
 * Body: { propertyId: string, unitId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import { PROVIDER_CONECTIVIDAD } from '@/lib/hospitality/incidencias';
import { toIsoDate } from '@/lib/hospitality/calendar';
import { ESTADOS_RESERVA_VIVA } from '@/lib/hospitality/estados';

/** Máximo de reservas listadas en el preview (el aviso no es un informe). */
const MAX_RESERVAS_PREVIEW = 20;

interface ReservaAfectada {
  id: string;
  externalBookingId: string | null;
  channel: string | null;
  estado: string;
  checkIn: string | null;
  checkOut: string | null;
  huesped: string | null;
  huéspedes: number;
}

/** Proyección de reserva para el preview del operador. */
function aReservaAfectada(r: {
  id: string;
  externalBookingId: string | null;
  channel: string | null;
  estado: string;
  checkIn: Date | null;
  checkOut: Date | null;
  guestData: unknown;
  occupancyAdults: number;
  occupancyChildren: number;
}): ReservaAfectada {
  const g = (r.guestData ?? null) as { firstName?: unknown; lastName?: unknown } | null;
  const nombre = [g?.firstName, g?.lastName]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .join(' ');
  return {
    id: r.id,
    externalBookingId: r.externalBookingId,
    channel: r.channel,
    estado: r.estado,
    // Fecha local, no UTC: el día de la reserva es el del hotel.
    checkIn: r.checkIn ? toIsoDate(r.checkIn) : null,
    checkOut: r.checkOut ? toIsoDate(r.checkOut) : null,
    huesped: nombre || null,
    huéspedes: r.occupancyAdults + r.occupancyChildren,
  };
}

async function cargarReservasEnUnidad(
  tenantId: string,
  unitId: string
): Promise<ReservaAfectada[]> {
  const reservas = await prisma.hospitalityReservation
    .findMany({
      where: { tenantId, unitId, estado: { in: [...ESTADOS_RESERVA_VIVA] } },
      orderBy: { checkIn: 'asc' },
      take: MAX_RESERVAS_PREVIEW,
      select: {
        id: true,
        externalBookingId: true,
        channel: true,
        estado: true,
        checkIn: true,
        checkOut: true,
        guestData: true,
        occupancyAdults: true,
        occupancyChildren: true,
      },
    })
    .catch(() => []);
  return reservas.map(aReservaAfectada);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId')?.trim() ?? '';
    const unitId = searchParams.get('unitId')?.trim() ?? '';

    if (!propertyId || !unitId) {
      return NextResponse.json(
        { ok: false, error: 'Indica la propiedad y la unidad.' },
        { status: 200 }
      );
    }

    // Unidad del propio tenant (aislamiento).
    const unidad = await prisma.hospitalityUnit.findFirst({
      where: { id: unitId, tenantId, propertyId },
      select: { id: true, nombre: true },
    });
    if (!unidad) {
      return NextResponse.json(
        { ok: false, error: 'La unidad no pertenece a esta propiedad.' },
        { status: 200 }
      );
    }

    const reservas = await cargarReservasEnUnidad(tenantId, unitId);

    return NextResponse.json({
      ok: true,
      unitId,
      unit: unidad.nombre,
      reservas,
      total: reservas.length,
    });
  } catch (error) {
    console.error('Error listando las reservas de la unidad:', error);
    return NextResponse.json({ ok: false, error: 'Error al listar las reservas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const propertyId = typeof body?.propertyId === 'string' ? body.propertyId.trim() : '';
    const unitId = typeof body?.unitId === 'string' ? body.unitId.trim() : '';

    if (!propertyId || !unitId) {
      return NextResponse.json({ ok: false, error: 'Indica la propiedad y la unidad.' }, { status: 200 });
    }

    // Unidad y propiedad del propio tenant (aislamiento).
    const unidad = await prisma.hospitalityUnit.findFirst({
      where: { id: unitId, tenantId, propertyId },
      select: { id: true, nombre: true, property: { select: { nombre: true } } },
    });
    if (!unidad) {
      return NextResponse.json(
        { ok: false, error: 'La unidad no pertenece a esta propiedad.' },
        { status: 200 }
      );
    }

    const vinculo = await prisma.connectivityMapping.findFirst({
      where: { tenantId, unitId, provider: PROVIDER_CONECTIVIDAD, estado: 'activo' },
      select: {
        id: true,
        externalPropertyId: true,
        externalUnitCode: true,
        externalRatePlanCode: true,
        metadata: true,
      },
    });
    if (!vinculo) {
      return NextResponse.json(
        { ok: false, error: 'Esa unidad no tiene ningún vínculo activo que deshacer.' },
        { status: 200 }
      );
    }

    const metadataPrevio = (vinculo.metadata ?? {}) as Record<string, unknown>;
    const metadata = {
      ...metadataPrevio,
      origen: 'deshecho_por_operador',
      // Lo importante para el futuro: no volver a crearlo solo.
      bloqueaAutoVinculacion: true,
      deshechoEn: new Date().toISOString(),
      deshechoPor: auth.user?.id ?? null,
    };

    await prisma.connectivityMapping.update({
      where: { id: vinculo.id },
      data: { estado: 'inactivo', metadata: metadata as never },
    });

    // Deshacer NO borra reservas: las que ya están en esa unidad siguen ahí, y
    // el operador se lleva la lista para decidir si las mueve.
    const reservas = await cargarReservasEnUnidad(tenantId, unitId);

    if (auth.user?.id) {
      await logAuditAction(
        auth.user.id,
        tenantId,
        'actualizar',
        'hospitality_connectivity_mapping',
        propertyId,
        `Vínculo deshecho: "${unidad.nombre}" ya no está vinculada a ` +
          `${vinculo.externalPropertyId}/${vinculo.externalUnitCode}`
      ).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      unitId,
      hotelCode: vinculo.externalPropertyId,
      roomCode: vinculo.externalUnitCode,
      rateplanCode: vinculo.externalRatePlanCode,
      eraAutomatico: metadataPrevio.origen === 'vinculacion_automatica_webhook',
      reservasEnLaUnidad: reservas.length,
      reservas,
    });
  } catch (error) {
    console.error('Error deshaciendo el vínculo de conectividad:', error);
    return NextResponse.json({ ok: false, error: 'Error al deshacer el vínculo' }, { status: 500 });
  }
}
