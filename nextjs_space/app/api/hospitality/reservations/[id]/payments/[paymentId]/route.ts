export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import { redondear } from '@/lib/hospitality/finance';

interface Params {
  params: Promise<{ id: string; paymentId: string }> | { id: string; paymentId: string };
}

const METODOS_VALIDOS = ['stripe', 'transferencia', 'efectivo', 'manual', 'otro'];
const ESTADOS_VALIDOS = ['pendiente', 'pagado', 'parcial', 'reembolsado', 'fallido'];

// PATCH /api/hospitality/reservations/[id]/payments/[paymentId]
// Marca un pago como cobrado, pendiente o reembolsado (y ajusta su importe).
export async function PATCH(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id, paymentId } = await ctx.params;
    const existente = await prisma.hospitalityPayment.findFirst({
      where: { id: paymentId, reservationId: id, tenantId: auth.tenant!.id },
    });
    if (!existente) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { importe, metodo, estado, referenciaExterna, fechaPago, notas } = body || {};

    const data: Record<string, unknown> = {};

    if (importe !== undefined) {
      const importeNumero = Number(importe);
      if (!Number.isFinite(importeNumero) || importeNumero <= 0) {
        return NextResponse.json({ error: 'El importe debe ser mayor que cero' }, { status: 400 });
      }
      data.importe = redondear(importeNumero);
    }

    if (metodo !== undefined) {
      if (!METODOS_VALIDOS.includes(metodo)) {
        return NextResponse.json(
          { error: `Método inválido. Válidos: ${METODOS_VALIDOS.join(', ')}` },
          { status: 400 }
        );
      }
      data.metodo = metodo;
    }

    if (estado !== undefined) {
      if (!ESTADOS_VALIDOS.includes(estado)) {
        return NextResponse.json(
          { error: `Estado inválido. Válidos: ${ESTADOS_VALIDOS.join(', ')}` },
          { status: 400 }
        );
      }
      data.estado = estado;
      // Al cobrar se sella la fecha si no venía; al reembolsar se conserva la
      // original del cobro, que es el dato con valor contable.
      if (estado === 'pagado' && !existente.fechaPago && !fechaPago) data.fechaPago = new Date();
    }

    if (referenciaExterna !== undefined) data.referenciaExterna = referenciaExterna || null;
    if (fechaPago !== undefined) data.fechaPago = fechaPago ? new Date(fechaPago) : null;
    if (notas !== undefined) data.notas = notas || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No hay cambios que aplicar' }, { status: 400 });
    }

    const pago = await prisma.hospitalityPayment.update({
      where: { id: existente.id },
      data,
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'actualizar',
      'hospitality_payment',
      pago.id,
      `Pago ${pago.importe} ${pago.moneda} marcado como ${pago.estado}`
    ).catch(() => {});

    return NextResponse.json({ pago });
  } catch (error) {
    console.error('Error actualizando pago:', error);
    return NextResponse.json({ error: 'Error al actualizar el pago' }, { status: 500 });
  }
}

// DELETE /api/hospitality/reservations/[id]/payments/[paymentId]
// Un pago mal registrado se elimina; el estado de cobro se recalcula solo,
// porque se deriva de los pagos que quedan.
export async function DELETE(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id, paymentId } = await ctx.params;
    const existente = await prisma.hospitalityPayment.findFirst({
      where: { id: paymentId, reservationId: id, tenantId: auth.tenant!.id },
      select: { id: true, importe: true, moneda: true, metodo: true, estado: true },
    });
    if (!existente) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });

    await prisma.hospitalityPayment.delete({ where: { id: existente.id } });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'eliminar',
      'hospitality_payment',
      existente.id,
      `Pago de ${existente.importe} ${existente.moneda} (${existente.metodo}) eliminado`
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error eliminando pago:', error);
    return NextResponse.json({ error: 'Error al eliminar el pago' }, { status: 500 });
  }
}
