export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// GET /api/hospitality/reservations — listar reservas del tenant
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId');
    const unitId = searchParams.get('unitId');
    const estado = searchParams.get('estado');
    const from = searchParams.get('from'); // ISO fecha inclusiva (check-in >=)
    const to = searchParams.get('to'); // ISO fecha exclusiva (check-in <)

    const where: any = { tenantId: auth.tenant!.id };
    if (propertyId) where.propertyId = propertyId;
    if (unitId) where.unitId = unitId;
    if (estado) where.estado = estado;
    if (from) {
      where.checkOut = { gte: new Date(from) };
    }
    if (to) {
      where.checkIn = { lt: new Date(to) };
    }

    const reservations = await prisma.hospitalityReservation.findMany({
      where,
      include: {
        unit: { select: { id: true, nombre: true, codigo: true } },
        property: { select: { id: true, nombre: true } },
        contact: { select: { id: true, nombre: true, email: true, telefono: true } },
      },
      orderBy: [{ checkIn: 'asc' }],
    });

    return NextResponse.json({ reservations });
  } catch (error) {
    console.error('Error obteniendo reservas:', error);
    return NextResponse.json({ error: 'Error al obtener reservas' }, { status: 500 });
  }
}