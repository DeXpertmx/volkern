export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/public/cms/services?tenantId=xxx
export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }
    const servicios = await prisma.servicio.findMany({
      where: { tenantId, activo: true },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        duracionMinutos: true,
        precio: true,
        moneda: true,
        modalidad: true,
      },
      orderBy: { nombre: 'asc' },
    });
    return NextResponse.json({ items: servicios });
  } catch (error) {
    console.error('Error fetching public services:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
