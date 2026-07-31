import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ['insurance:read', 'catalogo:read']);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const tenantId = auth.tenant!.id;
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  try {
    // 1. Distribución por ramo
    const porRamo = await prisma.poliza.groupBy({
      by: ['productoSeguroId'],
      where: {
        tenantId,
        estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER', 'EN_TRAMITE'] },
      },
      _count: true,
      _sum: { primaAnual: true },
    });

    // Obtener nombres de productos
    const productoIds = porRamo.map(p => p.productoSeguroId);
    const productos = await prisma.productoSeguro.findMany({
      where: { id: { in: productoIds } },
      select: { id: true, nombre: true, ramo: true },
    });

    const distribucionRamo: Record<string, { polizas: number; prima: number }> = {};
    for (const item of porRamo) {
      const prod = productos.find(p => p.id === item.productoSeguroId);
      const ramo = prod?.ramo || 'OTROS';
      if (!distribucionRamo[ramo]) distribucionRamo[ramo] = { polizas: 0, prima: 0 };
      distribucionRamo[ramo].polizas += item._count;
      distribucionRamo[ramo].prima += Number(item._sum.primaAnual) || 0;
    }

    // 2. Total cartera
    const totalPolizas = await prisma.poliza.count({
      where: { tenantId, estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER', 'EN_TRAMITE'] } },
    });

    const primaTotal = await prisma.poliza.aggregate({
      where: { tenantId, estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] } },
      _sum: { primaAnual: true },
    });

    // 3. Clientes sin contacto
    const clientesConPoliza = await prisma.poliza.findMany({
      where: { tenantId, estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] } },
      select: { clienteId: true },
      distinct: ['clienteId'],
    });

    const todosClienteIds = clientesConPoliza.map(p => p.clienteId);

    const clientesActivos = await prisma.cita.findMany({
      where: {
        tenantId,
        fechaHora: { gte: sixMonthsAgo },
        contactId: { in: todosClienteIds },
      },
      select: { contactId: true },
      distinct: ['contactId'],
    });

    const activosSet = new Set(clientesActivos.map(c => c.contactId).filter(Boolean));
    const sinContacto = todosClienteIds.filter(id => !activosSet.has(id));

    // 4. Renovaciones por mes (próximos 12 meses)
    const renovacionesPorMes: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const mesInicio = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mesFin = new Date(now.getFullYear(), now.getMonth() + i + 1, 0, 23, 59, 59);
      const count = await prisma.poliza.count({
        where: {
          tenantId,
          estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER', 'EN_TRAMITE'] },
          fechaVencimiento: { gte: mesInicio, lte: mesFin },
        },
      });
      const key = `${mesInicio.getFullYear()}-${String(mesInicio.getMonth() + 1).padStart(2, '0')}`;
      renovacionesPorMes[key] = count;
    }

    // 5. Tasa de renovación (último año: renovadas / (renovadas + perdidas))
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const polizasUltimoAno = await prisma.poliza.findMany({
      where: {
        tenantId,
        fechaVencimiento: { gte: oneYearAgo, lte: now },
        estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER', 'CANCELADA', 'VENCIDA'] },
      },
      select: { estado: true },
    });

    const renovadas = polizasUltimoAno.filter(p => p.estado === 'ACTIVA' || p.estado === 'PROXIMA_A_VENCER').length;
    const perdidas = polizasUltimoAno.filter(p => p.estado === 'CANCELADA').length;
    const tasaRenovacion = renovadas + perdidas > 0
      ? Math.round((renovadas / (renovadas + perdidas)) * 100)
      : 100;

    // 6. Oportunidades IA
    const oportunidadesIA = await prisma.oportunidadComercial.count({
      where: { tenantId, estado: 'NUEVA' },
    });

    // 7. Aseguradoras top
    const topAseguradoras = await prisma.poliza.groupBy({
      by: ['aseguradoraId'],
      where: { tenantId, estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] } },
      _count: true,
      _sum: { primaAnual: true },
      orderBy: { _count: { aseguradoraId: 'desc' } },
      take: 5,
    });

    const asegIds = topAseguradoras.map(a => a.aseguradoraId);
    const asegNombres = await prisma.aseguradora.findMany({
      where: { id: { in: asegIds } },
      select: { id: true, nombre: true },
    });

    const topAsegData = topAseguradoras.map(a => ({
      id: a.aseguradoraId,
      nombre: asegNombres.find(n => n.id === a.aseguradoraId)?.nombre || '—',
      polizas: a._count,
      prima: Number(a._sum.primaAnual) || 0,
    }));

    return NextResponse.json({
      totalPolizas,
      primaTotal: Number(primaTotal._sum.primaAnual) || 0,
      totalClientes: todosClienteIds.length,
      clientesSinContacto: sinContacto.length,
      tasaRenovacion,
      oportunidadesIA,
      distribucionRamo,
      renovacionesPorMes,
      topAseguradoras: topAsegData,
    });
  } catch (error) {
    console.error('Error fetching portfolio stats:', error);
    return NextResponse.json({ error: 'Error al cargar estadísticas' }, { status: 500 });
  }
}
