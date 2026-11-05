export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { calcularCobrado, redondear, totalDeLineas } from '@/lib/hospitality/finance';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

const METODOS_VALIDOS = ['stripe', 'transferencia', 'efectivo', 'manual', 'otro'];
const ESTADOS_VALIDOS = ['pendiente', 'pagado', 'parcial', 'reembolsado', 'fallido'];

// GET /api/hospitality/reservations/[id]/payments — pagos y estado de cobro
export async function GET(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.ver');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id, tenantId: auth.tenant!.id },
      select: { id: true },
    });
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    const pagos = await prisma.hospitalityPayment.findMany({
      where: { tenantId: auth.tenant!.id, reservationId: reserva.id },
      orderBy: { fechaCreacion: 'desc' },
    });

    // El estado de cobro se deriva siempre de los pagos reales: no se guarda.
    const items = await prisma.hospitalityReservationItem.findMany({
      where: { tenantId: auth.tenant!.id, reservationId: reserva.id },
      select: { tipo: true, concepto: true, cantidad: true, importeUnitario: true, importeTotal: true },
    });

    return NextResponse.json({
      pagos,
      cobrado: calcularCobrado(pagos),
      // La suma vive en el módulo puro, no en la ruta: la analítica de la
      // vertical se audita en un solo sitio.
      totalLineas: totalDeLineas(items),
    });
  } catch (error) {
    console.error('Error obteniendo pagos de la reserva:', error);
    return NextResponse.json({ error: 'Error al obtener los pagos' }, { status: 500 });
  }
}

// POST /api/hospitality/reservations/[id]/payments — registrar pago
// Body: { importe, metodo?, estado?, referenciaExterna?, fechaPago?, notas? }
export async function POST(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.gestionar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id, tenantId: auth.tenant!.id },
      select: {
        id: true,
        externalBookingId: true,
        propertyId: true,
        unitId: true,
        currency: true,
        amountAfterTax: true,
        commission: true,
      },
    });
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { importe, metodo, estado, referenciaExterna, fechaPago, notas } = body || {};

    const importeNumero = Number(importe);
    if (!Number.isFinite(importeNumero) || importeNumero <= 0) {
      return NextResponse.json({ error: 'El importe debe ser mayor que cero' }, { status: 400 });
    }

    const metodoFinal = metodo || 'manual';
    if (!METODOS_VALIDOS.includes(metodoFinal)) {
      return NextResponse.json(
        { error: `Método inválido. Válidos: ${METODOS_VALIDOS.join(', ')}` },
        { status: 400 }
      );
    }

    const estadoFinal = estado || 'pagado';
    if (!ESTADOS_VALIDOS.includes(estadoFinal)) {
      return NextResponse.json(
        { error: `Estado inválido. Válidos: ${ESTADOS_VALIDOS.join(', ')}` },
        { status: 400 }
      );
    }

    const pago = await prisma.hospitalityPayment.create({
      data: {
        tenantId: auth.tenant!.id,
        reservationId: reserva.id,
        propertyId: reserva.propertyId,
        unitId: reserva.unitId,
        importe: redondear(importeNumero),
        moneda: reserva.currency,
        metodo: metodoFinal,
        estado: estadoFinal,
        referenciaExterna: referenciaExterna || null,
        fechaPago: fechaPago ? new Date(fechaPago) : estadoFinal === 'pagado' ? new Date() : null,
        notas: notas || null,
      },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'crear',
      'hospitality_payment',
      pago.id,
      `Pago de ${pago.importe} ${pago.moneda} (${pago.metodo}) en reserva ${reserva.externalBookingId}`
    ).catch(() => {});

    return NextResponse.json({ pago }, { status: 201 });
  } catch (error) {
    console.error('Error registrando pago de la reserva:', error);
    return NextResponse.json({ error: 'Error al registrar el pago' }, { status: 500 });
  }
}
