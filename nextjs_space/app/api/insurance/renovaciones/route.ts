import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, ['insurance:read', 'catalogo:read']);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tenantId = auth.tenant!.id;
  const mes = searchParams.get('mes'); // yyyy-MM
  const limite = parseInt(searchParams.get('limite') || '50');

  try {
    let dateFilter = {};
    if (mes) {
      const [year, month] = mes.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      dateFilter = {
        fechaVencimiento: { gte: start, lte: end },
      };
    } else {
      // Default: próximos 90 días
      const now = new Date();
      const in90d = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      dateFilter = {
        fechaVencimiento: { gte: now, lte: in90d },
      };
    }

    const polizas = await prisma.poliza.findMany({
      where: {
        tenantId,
        estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER', 'EN_TRAMITE'] },
        ...dateFilter,
      },
      include: {
        cliente: { select: { id: true, nombre: true, email: true } },
        aseguradora: { select: { id: true, nombre: true } },
        productoSeguro: { select: { id: true, nombre: true, ramo: true } },
      },
      orderBy: { fechaVencimiento: 'asc' },
      take: limite,
    });

    // Agrupar por mes para el calendario
    const porMes: Record<string, typeof polizas> = {};
    const alertas = { rojas: 0, ambar: 0, verdes: 0 };

    for (const p of polizas) {
      const key = p.fechaVencimiento.toISOString().slice(0, 7); // yyyy-MM
      if (!porMes[key]) porMes[key] = [];
      porMes[key].push(p);

      // Clasificar alerta
      const diasRestantes = Math.ceil(
        (p.fechaVencimiento.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (diasRestantes <= 30) alertas.rojas++;
      else if (diasRestantes <= 60) alertas.ambar++;
      else alertas.verdes++;
    }

    return NextResponse.json({
      polizas,
      porMes,
      alertas,
      total: polizas.length,
    });
  } catch (error) {
    console.error('Error fetching renovaciones:', error);
    return NextResponse.json({ error: 'Error al cargar renovaciones' }, { status: 500 });
  }
}
