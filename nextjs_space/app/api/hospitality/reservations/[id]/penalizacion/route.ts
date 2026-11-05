export const dynamic = 'force-dynamic';

/**
 * Penalización por no-show de una reserva.
 *
 *   GET  /api/hospitality/reservations/[id]/penalizacion  → previsualización
 *   POST /api/hospitality/reservations/[id]/penalizacion  → emitir el cargo
 *
 * La decisión de **cuánto** se cobra es del módulo puro (`lib/hospitality/no-show`):
 * aquí solo se expone. El cargo se emite como línea de la propia reserva
 * (`lib/hospitality/penalizaciones`) y la factura legal la emite el ERP en
 * `/penalizacion/facturar`.
 *
 * Emitir no cambia el estado de la reserva ni su ocupación: la unidad sigue
 * vendible (regla 7 del plan) y la analítica sigue sin contarla (el importe no
 * es ingreso de alojamiento, ver `lib/hospitality/finance.ts`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { nightsBetween } from '@/lib/hospitality/calendar';
import {
  calcularPenalizacionNoShow,
  politicaEfectiva,
  esPoliticaNoShow,
  elHotelEmiteElCargo,
} from '@/lib/hospitality/no-show';
import {
  aplicarPenalizacionNoShow,
  TIPO_LINEA_PENALIZACION,
} from '@/lib/hospitality/penalizaciones';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

/** Reserva + penalización emitida (si la hay), o null si no es del tenant. */
async function cargar(tenantId: string, id: string) {
  return prisma.hospitalityReservation.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      estado: true,
      channel: true,
      checkIn: true,
      checkOut: true,
      amountAfterTax: true,
      currency: true,
      externalBookingId: true,
      property: { select: { nombre: true, politicaNoShow: true } },
      items: {
        where: { tipo: TIPO_LINEA_PENALIZACION },
        select: {
          id: true,
          concepto: true,
          importeTotal: true,
          moneda: true,
          invoiceId: true,
          fechaCreacion: true,
        },
      },
    },
  });
}

// GET — qué se cobraría (y qué se cobró) sin tocar nada.
export async function GET(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.ver');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const reserva = await cargar(auth.tenant!.id, id);
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    const politica = politicaEfectiva(reserva.property?.politicaNoShow);
    const noches = nightsBetween(reserva.checkIn, reserva.checkOut);

    // Qué se cobraría si se marcara no-show ahora mismo.
    const previsto = calcularPenalizacionNoShow({
      politica,
      canal: reserva.channel,
      importeTotal: reserva.amountAfterTax,
      noches,
    });

    const emitida = reserva.items[0] || null;

    return NextResponse.json({
      reservaId: reserva.id,
      estado: reserva.estado,
      politica,
      noches,
      canalEmiteElCargo: elHotelEmiteElCargo(reserva.channel),
      previsto,
      emitida: emitida
        ? {
            id: emitida.id,
            concepto: emitida.concepto,
            importe: emitida.importeTotal,
            moneda: emitida.moneda,
            fecha: emitida.fechaCreacion,
            invoiceId: emitida.invoiceId,
            facturada: !!emitida.invoiceId,
          }
        : null,
    });
  } catch (error) {
    console.error('Error consultando la penalización:', error);
    return NextResponse.json({ error: 'Error al consultar la penalización' }, { status: 500 });
  }
}

// POST — emitir el cargo (idempotente).
// Body: { politica?, cobrarEnCanal? }
export async function POST(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.gestionar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const { id } = await ctx.params;
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id, tenantId },
      select: { id: true, estado: true, externalBookingId: true },
    });
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    // Solo un no-show genera penalización (es la misma guarda que el emisor).
    if (reserva.estado !== 'no_show') {
      return NextResponse.json(
        { error: 'Solo se emite penalización sobre una reserva marcada como no-show' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { politica, cobrarEnCanal } = body || {};

    // Una política explícita se valida aquí (el módulo puro la vuelve a validar
    // si llega corrupta desde la BD).
    if (politica !== undefined && !esPoliticaNoShow(politica)) {
      return NextResponse.json({ error: 'Política de no-show inválida' }, { status: 400 });
    }

    const resultado = await aplicarPenalizacionNoShow(tenantId, reserva.id, {
      politica: politica ?? undefined,
      cobrarEnCanal: cobrarEnCanal === true,
    });

    if (resultado.emitida) {
      await logAuditAction(
        auth.user!.id,
        tenantId,
        'crear',
        'hospitality_penalizacion',
        resultado.itemId || reserva.id,
        `Penalización por no-show de ${resultado.importe} ${resultado.moneda} (${resultado.politica}) en la reserva ${reserva.externalBookingId}`
      ).catch(() => {});
    }

    // 201 solo cuando el cargo se acaba de crear; el resto es informativo.
    return NextResponse.json(resultado, { status: resultado.emitida ? 201 : 200 });
  } catch (error) {
    console.error('Error emitiendo la penalización:', error);
    return NextResponse.json({ error: 'Error al emitir la penalización' }, { status: 500 });
  }
}
