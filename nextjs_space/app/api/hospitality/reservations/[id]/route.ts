export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import { dispatchConnectivityPush } from '@/lib/hospitality/sync';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

const ESTADOS_VALIDOS = ['pending', 'confirmed', 'cancelled', 'checked_in', 'checked_out', 'no_show'];

// GET /api/hospitality/reservations/[id] — detalle
export async function GET(_req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(_req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await ctx.params;
    const reservation = await prisma.hospitalityReservation.findFirst({
      where: { id, tenantId: auth.tenant!.id },
      include: {
        unit: { select: { id: true, nombre: true, codigo: true } },
        property: { select: { id: true, nombre: true } },
        contact: { select: { id: true, nombre: true, email: true, telefono: true } },
      },
    });
    if (!reservation) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    return NextResponse.json({ reservation });
  } catch (error) {
    console.error('Error obteniendo reserva:', error);
    return NextResponse.json({ error: 'Error al obtener reserva' }, { status: 500 });
  }
}

// PATCH /api/hospitality/reservations/[id] — editar (reemplazo completo del
// rango; no mezcla parcial, mismo espíritu que modify §13.2).
// Body: { unitId?, canal?, checkin?, checkout?, estado?, importe?, moneda?, notas? }
export async function PATCH(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await ctx.params;
    const existing = await prisma.hospitalityReservation.findFirst({
      where: { id, tenantId: auth.tenant!.id },
      select: {
        id: true, unitId: true, channel: true, checkIn: true, checkOut: true,
        estado: true, amountAfterTax: true, currency: true, specialRequests: true,
      },
    });
    if (!existing) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    const body = await req.json();
    const { unitId, canal, checkin, checkout, estado, importe, moneda, notas } = body || {};

    const data: any = {};

    // Fechas: reemplazo completo (no mezcla).
    let ci = existing.checkIn;
    let co = existing.checkOut;
    if (checkin) {
      ci = new Date(`${checkin}T15:00:00`);
      if (isNaN(ci.getTime())) return NextResponse.json({ error: 'Fecha de entrada inválida' }, { status: 400 });
    }
    if (checkout) {
      co = new Date(`${checkout}T11:00:00`);
      if (isNaN(co.getTime())) return NextResponse.json({ error: 'Fecha de salida inválida' }, { status: 400 });
    }
    if (co.getTime() <= ci.getTime()) {
      return NextResponse.json({ error: 'La salida debe ser posterior a la entrada' }, { status: 400 });
    }
    if (ci.getTime() !== existing.checkIn.getTime()) data.checkIn = ci;
    if (co.getTime() !== existing.checkOut.getTime()) data.checkOut = co;

    // Unidad: validar del tenant y de la misma propiedad.
    let unitIdFinal = existing.unitId;
    if (unitId !== undefined) {
      if (unitId === null || unitId === '') {
        unitIdFinal = null;
        data.unitId = null;
      } else {
        const unit = await prisma.hospitalityUnit.findFirst({
          where: { id: unitId, tenantId: auth.tenant!.id },
          select: { id: true, propertyId: true },
        });
        if (!unit) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });
        unitIdFinal = unit.id;
        data.unitId = unit.id;
      }
    }

    // Estado: transiciones libres excepto desde cancelled (usar reactivar si
    // se desea volver a activa) — coherente con las validaciones del check.
    if (estado !== undefined) {
      if (!ESTADOS_VALIDOS.includes(estado)) {
        return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
      }
      if (existing.estado === 'cancelled' && estado !== 'cancelled') {
        return NextResponse.json(
          { error: 'La reserva está cancelada; no se puede cambiar su estado directamente.' },
          { status: 400 }
        );
      }
      data.estado = estado;
    }

    if (canal !== undefined) data.channel = String(canal).trim() || existing.channel;
    if (importe !== undefined) data.amountAfterTax = importe === null || importe === '' ? null : Number(importe);
    if (moneda !== undefined) data.currency = moneda;
    if (notas !== undefined) data.specialRequests = notas;

    // Overbooking §16: si cambian unidad o fechas, revalidar conflicto
    // (excluyéndose a sí misma).
    const rangoCambia = !!data.checkIn || !!data.checkOut || (data.unitId !== undefined && data.unitId !== existing.unitId);
    if (rangoCambia && unitIdFinal) {
      const candidates = await prisma.hospitalityReservation.findMany({
        where: {
          tenantId: auth.tenant!.id,
          unitId: unitIdFinal,
          id: { not: existing.id },
          estado: { notIn: ['cancelled', 'no_show'] },
          checkIn: { lt: co },
          checkOut: { gt: ci },
        },
        select: { id: true, externalBookingId: true, checkIn: true, checkOut: true, estado: true },
      });
      if (candidates.length > 0) {
        const c = candidates[0];
        return NextResponse.json(
          {
            error: `Conflicto de disponibilidad: la unidad ya tiene una reserva activa del ${c.checkIn.toISOString().slice(0, 10)} al ${c.checkOut.toISOString().slice(0, 10)} (${c.externalBookingId || c.estado}).`,
          },
          { status: 409 }
        );
      }
    }

    const reservation = await prisma.hospitalityReservation.update({
      where: { id: existing.id },
      data,
      include: {
        unit: { select: { id: true, nombre: true } },
        property: { select: { id: true, nombre: true } },
        contact: { select: { id: true, nombre: true } },
      },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'actualizar',
      'hospitality_reservation',
      reservation.id,
      `Reserva ${reservation.externalBookingId} editada`
    ).catch(() => {});

    // Push si cambió algo que afecte disponibilidad.
    if (rangoCambia || data.estado !== undefined) {
      try {
        await dispatchConnectivityPush(auth.tenant!.id, reservation.propertyId, 'reserva_modificada', { skipRates: true });
      } catch (e) {
        console.error('[Hospitality] Error en push tras editar reserva:', e);
      }
    }

    return NextResponse.json({ reservation });
  } catch (error) {
    console.error('Error actualizando reserva:', error);
    return NextResponse.json({ error: 'Error al actualizar reserva' }, { status: 500 });
  }
}