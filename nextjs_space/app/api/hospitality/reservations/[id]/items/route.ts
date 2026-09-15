export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { lineaParaGuardar } from '@/lib/hospitality/finance-summary';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

const TIPOS_VALIDOS = ['alojamiento', 'limpieza', 'extra', 'otro'];

// GET /api/hospitality/reservations/[id]/items — líneas de desglose
export async function GET(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.ver');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id, tenantId: auth.tenant!.id },
      select: { id: true },
    });
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    const items = await prisma.hospitalityReservationItem.findMany({
      where: { tenantId: auth.tenant!.id, reservationId: reserva.id },
      orderBy: { fechaCreacion: 'asc' },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error obteniendo líneas de la reserva:', error);
    return NextResponse.json({ error: 'Error al obtener las líneas' }, { status: 500 });
  }
}

// POST /api/hospitality/reservations/[id]/items — añadir línea al desglose
// Body: { tipo, concepto, cantidad?, importeUnitario }
export async function POST(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.gestionar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id, tenantId: auth.tenant!.id },
      select: { id: true, externalBookingId: true, propertyId: true, unitId: true, currency: true },
    });
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { tipo, concepto, cantidad, importeUnitario } = body || {};

    if (tipo !== undefined && !TIPOS_VALIDOS.includes(tipo)) {
      return NextResponse.json(
        { error: `Tipo de línea inválido. Válidos: ${TIPOS_VALIDOS.join(', ')}` },
        { status: 400 }
      );
    }

    // El total se calcula, no se acepta del cliente: así cantidad x precio
    // unitario no puede contradecir al total guardado.
    const linea = lineaParaGuardar({ tipo, concepto, cantidad, importeUnitario });
    if (linea.importeTotal <= 0) {
      return NextResponse.json(
        { error: 'La línea debe tener un importe mayor que cero' },
        { status: 400 }
      );
    }

    const item = await prisma.hospitalityReservationItem.create({
      data: {
        tenantId: auth.tenant!.id,
        reservationId: reserva.id,
        propertyId: reserva.propertyId,
        unitId: reserva.unitId,
        tipo: linea.tipo,
        concepto: linea.concepto,
        cantidad: linea.cantidad,
        importeUnitario: linea.importeUnitario,
        importeTotal: linea.importeTotal,
        moneda: reserva.currency,
      },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'crear',
      'hospitality_reservation_item',
      item.id,
      `Línea ${item.concepto} (${item.importeTotal} ${item.moneda}) en reserva ${reserva.externalBookingId}`
    ).catch(() => {});

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('Error creando línea de la reserva:', error);
    return NextResponse.json({ error: 'Error al crear la línea' }, { status: 500 });
  }
}
