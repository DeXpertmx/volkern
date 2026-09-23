export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { lineaParaGuardar } from '@/lib/hospitality/finance-summary';

interface Params {
  params: Promise<{ id: string; itemId: string }> | { id: string; itemId: string };
}

const TIPOS_VALIDOS = ['alojamiento', 'limpieza', 'extra', 'otro'];

// PATCH /api/hospitality/reservations/[id]/items/[itemId] — editar línea
export async function PATCH(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.gestionar');
    if (sinPermiso) return sinPermiso;

    const { id, itemId } = await ctx.params;
    const existente = await prisma.hospitalityReservationItem.findFirst({
      where: { id: itemId, reservationId: id, tenantId: auth.tenant!.id },
    });
    if (!existente) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { tipo, concepto, cantidad, importeUnitario } = body || {};

    if (tipo !== undefined && !TIPOS_VALIDOS.includes(tipo)) {
      return NextResponse.json(
        { error: `Tipo de línea inválido. Válidos: ${TIPOS_VALIDOS.join(', ')}` },
        { status: 400 }
      );
    }

    const linea = lineaParaGuardar({
      tipo: tipo ?? existente.tipo,
      concepto: concepto ?? existente.concepto,
      cantidad: cantidad ?? existente.cantidad,
      importeUnitario: importeUnitario ?? existente.importeUnitario,
    });

    if (linea.importeTotal <= 0) {
      return NextResponse.json(
        { error: 'La línea debe tener un importe mayor que cero' },
        { status: 400 }
      );
    }

    const item = await prisma.hospitalityReservationItem.update({
      where: { id: existente.id },
      data: {
        tipo: linea.tipo,
        concepto: linea.concepto,
        cantidad: linea.cantidad,
        importeUnitario: linea.importeUnitario,
        importeTotal: linea.importeTotal,
      },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'actualizar',
      'hospitality_reservation_item',
      item.id,
      `Línea ${item.concepto} actualizada a ${item.importeTotal} ${item.moneda}`
    ).catch(() => {});

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Error actualizando línea de la reserva:', error);
    return NextResponse.json({ error: 'Error al actualizar la línea' }, { status: 500 });
  }
}

// DELETE /api/hospitality/reservations/[id]/items/[itemId] — quitar línea
export async function DELETE(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.gestionar');
    if (sinPermiso) return sinPermiso;

    const { id, itemId } = await ctx.params;
    const existente = await prisma.hospitalityReservationItem.findFirst({
      where: { id: itemId, reservationId: id, tenantId: auth.tenant!.id },
      select: { id: true, concepto: true, importeTotal: true, moneda: true },
    });
    if (!existente) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 });

    await prisma.hospitalityReservationItem.delete({ where: { id: existente.id } });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'eliminar',
      'hospitality_reservation_item',
      existente.id,
      `Línea ${existente.concepto} (${existente.importeTotal} ${existente.moneda}) eliminada`
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error eliminando línea de la reserva:', error);
    return NextResponse.json({ error: 'Error al eliminar la línea' }, { status: 500 });
  }
}
