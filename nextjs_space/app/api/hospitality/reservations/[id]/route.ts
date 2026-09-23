export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import {
  exigirPermisoHospitality,
  capacidadDeCambioDeReserva,
} from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { dispatchConnectivityPush } from '@/lib/hospitality/sync';
import { toIsoDate } from '@/lib/hospitality/calendar';
import { esEstadoValido } from '@/lib/hospitality/estados';
import { datosDeSalida } from '@/lib/hospitality/checkout';
import { registrarHoldConfirmado } from '@/lib/hospitality/holds-audit';
import { aplicarPenalizacionNoShow } from '@/lib/hospitality/penalizaciones';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}


// GET /api/hospitality/reservations/[id] — detalle
export async function GET(_req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(_req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

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
        propertyId: true,
      },
    });
    if (!existing) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    const body = await req.json();
    const { unitId, canal, checkin, checkout, estado, importe, moneda, notas } = body || {};

    // Modificar no es cancelar: anular una reserva exige el permiso propio
    // (`hospitality_reservas.cancelar`). El resto de cambios basta con poder
    // editarla.
    const sinPermiso = exigirPermisoHospitality(
      auth,
      capacidadDeCambioDeReserva(estado, existing.estado)
    );
    if (sinPermiso) return sinPermiso;

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
    // Salida anticipada (check-out manual): la política de la propiedad decide
    // A (pisar el checkOut) o B (guardar checkOutReal) — la misma que el
    // check-out operativo (módulo checkout).
    let salidaAnticipada: { checkOut?: Date; checkOutReal?: Date } = {};
    const esCheckOut =
      estado === 'checked_out' && existing.estado !== 'checked_out';
    if (esCheckOut) {
      const property = await prisma.hospitalityProperty.findFirst({
        where: { id: existing.propertyId, tenantId: auth.tenant!.id },
        select: { politicaSalidaAnticipada: true },
      });
      salidaAnticipada = datosDeSalida(property?.politicaSalidaAnticipada, {
        checkOutPrevisto: co,
      });
    }

    if (estado !== undefined) {
      if (!esEstadoValido(estado)) {
        return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
      }
      if (existing.estado === 'cancelled' && estado !== 'cancelled') {
        return NextResponse.json(
          { error: 'La reserva está cancelada; no se puede cambiar su estado directamente.' },
          { status: 400 }
        );
      }
      data.estado = estado;
      Object.assign(data, salidaAnticipada);
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
            error: `Conflicto de disponibilidad: la unidad ya tiene una reserva activa del ${toIsoDate(c.checkIn)} al ${toIsoDate(c.checkOut)} (${c.externalBookingId || c.estado}).`,
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

    // Un `pending` que pasa a confirmada es un hold rescatado: deja traza para
    // que la tasa de abandono de holds de Reportes cuadre (el barrido audita el
    // otro desenlace). Nunca lanza ni revierte la edición.
    if (existing.estado === 'pending' && estado === 'confirmed') {
      await registrarHoldConfirmado({
        tenantId: auth.tenant!.id,
        reservationId: reservation.id,
        propertyId: reservation.propertyId,
        channel: reservation.channel,
        origen: 'operador',
      });
    }

    // Push si cambió algo que afecte disponibilidad.
    if (rangoCambia || data.estado !== undefined) {
      try {
        await dispatchConnectivityPush(auth.tenant!.id, reservation.propertyId, 'reserva_modificada', { skipRates: true });
      } catch (e) {
        console.error('[Hospitality] Error en push tras editar reserva:', e);
      }
    }

    // No-show: la unidad vuelve al inventario (el push de arriba ya empuja el
    // hueco) y, a la vez, se emite la penalización de la política de la
    // propiedad. Son dos hechos distintos: uno de inventario y otro de cobro.
    // Si falla la emisión, el no-show ya está aplicado — no se revierte.
    let penalizacion: Awaited<ReturnType<typeof aplicarPenalizacionNoShow>> | null = null;
    if (data.estado === 'no_show') {
      penalizacion = await aplicarPenalizacionNoShow(auth.tenant!.id, reservation.id);
    }

    return NextResponse.json({ reservation, penalizacion });
  } catch (error) {
    console.error('Error actualizando reserva:', error);
    return NextResponse.json({ error: 'Error al actualizar reserva' }, { status: 500 });
  }
}