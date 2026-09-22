export const dynamic = 'force-dynamic';

/**
 * Cobro de una reserva directa (FASE 3.C de hospitality).
 *
 * POST /api/hospitality/finanzas/cobrar
 * Body: { reservationId, importe?, concepto? }
 *
 * Crea una sesión de Checkout como CARGO DIRECTO contra la cuenta Stripe
 * Connect del tenant: el dinero del huésped llega a la cuenta del tenant,
 * no a la de Volkern (criterio 4 del plan). El registro del pago ocurre
 * cuando Stripe confirma, vía webhook (`conciliarPagoHospitality`), nunca
 * en este endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import { crearCobroReserva } from '@/lib/stripe/connect';
import { aportaProduccion } from '@/lib/hospitality/estados';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const tenantId = auth.tenant!.id;

    const body = await req.json();
    const { reservationId, importe, concepto } = body || {};
    if (!reservationId) {
      return NextResponse.json({ error: 'La reserva es requerida' }, { status: 400 });
    }

    // La reserva debe ser del tenant; el importe por defecto es el pendiente.
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id: reservationId, tenantId },
      include: {
        items: true,
        payments: true,
        unit: { select: { nombre: true } },
        contact: { select: { email: true } },
      },
    });
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    // El pendiente se deriva con el módulo puro (misma verdad que Finanzas).
    const { calcularRentabilidad, lineasDesdeImporteExterno } = await import('@/lib/hospitality/finance');
    const lineas = reserva.items.length
      ? reserva.items.map((i: any) => ({
          tipo: i.tipo,
          concepto: i.concepto,
          cantidad: i.cantidad,
          importeUnitario: i.importeUnitario,
          importeTotal: i.importeTotal,
        }))
      : lineasDesdeImporteExterno(reserva.amountAfterTax || 0);
    const rent = calcularRentabilidad({ lineas, pagos: reserva.payments, moneda: reserva.currency });

    // La regla de producción es del módulo (una sola definición). **Cobrar no es
    // producir**: un no-show no produce alojamiento, pero su penalización es un
    // cargo que hay que cobrar, así que solo se rechaza cuando no queda nada
    // cobrable (una cancelada nunca tiene penalización emitida).
    if (!aportaProduccion(reserva.estado) && rent.penalizacion <= 0) {
      return NextResponse.json(
        { error: 'No se puede cobrar una reserva cancelada o no-show sin penalización' },
        { status: 400 }
      );
    }

    const importeNum = importe != null && importe !== '' ? Number(importe) : rent.pendiente;
    if (!Number.isFinite(importeNum) || importeNum <= 0) {
      return NextResponse.json({ error: 'Nada pendiente de cobrar en esta reserva' }, { status: 400 });
    }

    // El email del huésped para prellenar el Checkout.
    const guestEmail = (reserva.guestData as any)?.email || reserva.contact?.email || null;

    const origen = new URL(req.url).origin;
    const { url, sessionId, stripeAccountId } = await crearCobroReserva({
      tenantId,
      reservationId: reserva.id,
      importe: importeNum,
      moneda: reserva.currency || 'MXN',
      concepto:
        concepto ||
        `Reserva ${reserva.externalBookingId}${reserva.unit?.nombre ? ` · ${reserva.unit.nombre}` : ''}`,
      email: guestEmail,
      origen,
    });

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'crear',
      'hospitality_checkout_session',
      sessionId,
      `Cobro directo iniciado (${importeNum} ${reserva.currency}) en reserva ${reserva.externalBookingId} → cuenta ${stripeAccountId}`
    ).catch(() => {});

    return NextResponse.json({ url, sessionId, importe: importeNum, moneda: reserva.currency }, { status: 201 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al crear el cobro';
    const codigo = mensaje.includes('no tiene cuenta') || mensaje.includes('no está activa') ? 409 : 500;
    console.error('Error creando cobro directo:', error);
    return NextResponse.json({ error: mensaje }, { status: codigo });
  }
}
