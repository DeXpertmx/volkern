import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ['insurance:read', 'catalogo:read']);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
  }

  try {
    const tenantId = auth.tenant!.id;
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in60d = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const [totalPolizas, polizasActivas, polizasProximasVencer, polizasVencidas,
      totalAseguradoras, totalProductos, primaTotal, renovaciones30d, renovaciones60d, oportunidadesDetectadas] =
      await Promise.all([
        prisma.poliza.count({ where: { tenantId } }),
        prisma.poliza.count({ where: { tenantId, estado: 'ACTIVA' } }),
        prisma.poliza.count({ where: { tenantId, estado: 'PROXIMA_A_VENCER' } }),
        prisma.poliza.count({ where: { tenantId, estado: 'VENCIDA' } }),
        prisma.aseguradora.count({ where: { tenantId, activa: true } }),
        prisma.productoSeguro.count({ where: { tenantId } }),
        prisma.poliza.aggregate({ where: { tenantId, estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] } }, _sum: { primaAnual: true } }),
        // Renovaciones: contar pólizas con fechaVencimiento en los próximos 30/60 días
        // (el modelo Renovacion aún no está poblado — usamos las fechas de la póliza directamente)
        prisma.poliza.count({ where: { tenantId, estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] }, fechaVencimiento: { lte: in30d, gte: now } } }),
        prisma.poliza.count({ where: { tenantId, estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] }, fechaVencimiento: { lte: in60d, gte: now } } }),
        prisma.oportunidadComercial.count({ where: { tenantId, estado: 'NUEVA' } }),
      ]);

    return NextResponse.json({
      totalPolizas,
      polizasActivas,
      polizasProximasVencer,
      polizasVencidas,
      totalAseguradoras,
      totalProductos,
      primaTotal: Number(primaTotal._sum.primaAnual) || 0,
      renovaciones30d,
      renovaciones60d,
      oportunidadesDetectadas,
      // Divisa de reporte del tenant: la prima total es una cifra agregada de
      // pólizas que pueden venir en divisas distintas, así que el agregado se
      // escribe en la moneda del tenant y no en la de una fila cualquiera.
      tenantMoneda: auth.tenant!.moneda || '',
    });
  } catch (error) {
    console.error('Error fetching insurance stats:', error);
    return NextResponse.json({ error: 'Error al cargar estadísticas' }, { status: 500 });
  }
}
