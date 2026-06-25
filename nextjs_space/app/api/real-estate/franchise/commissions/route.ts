export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/real-estate/franchise/commissions
 *
 * Reporte de comisiones de la franquicia.
 * Filtros: ?agenteId, ?desde, ?hasta, ?estado, ?incluirHijas
 */
export const GET = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;
  const { searchParams } = new URL(req.url);

  try {
    const agenteId = searchParams.get('agenteId');
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    const estado = searchParams.get('estado');
    const incluirHijas = searchParams.get('incluirHijas') !== 'false';

    // Determinar qué tenants incluir
    const tenantIds = [tenantId];
    if (incluirHijas) {
      const children = await prisma.tenant.findMany({
        where: { parentId: tenantId },
        select: { id: true, nombre: true },
      });
      tenantIds.push(...children.map(c => c.id));
    }

    // Construir filtros
    const where: any = {
      tenantId: { in: tenantIds },
    };

    if (agenteId) {
      where.userId = agenteId;
    }

    if (estado) {
      where.estado = estado;
    }

    if (desde || hasta) {
      where.fechaCreacion = {};
      if (desde) where.fechaCreacion.gte = new Date(desde);
      if (hasta) {
        const hastaDate = new Date(hasta);
        hastaDate.setHours(23, 59, 59, 999);
        where.fechaCreacion.lte = hastaDate;
      }
    }

    // Obtener todas las comisiones (una sola query)
    const comisiones = await prisma.comision.findMany({
      where,
      include: {
        usuario: { select: { id: true, name: true, email: true } },
        deal: { select: { titulo: true, valor: true, valorReal: true, moneda: true } },
        tenant: { select: { id: true, nombre: true } },
      },
      orderBy: { fechaCreacion: 'desc' },
    });

    // Calcular totales
    const totalMonto = comisiones.reduce((s, c) => s + c.montoCalculado, 0);
    const pendientes = comisiones
      .filter(c => c.estado === 'pendiente')
      .reduce((s, c) => s + c.montoCalculado, 0);
    const aprobadas = comisiones
      .filter(c => c.estado === 'aprobada')
      .reduce((s, c) => s + c.montoCalculado, 0);
    const pagadas = comisiones
      .filter(c => c.estado === 'pagada')
      .reduce((s, c) => s + c.montoCalculado, 0);

    // Agrupar por agente (en memoria, usando los mismos datos filtrados)
    const agentMap = new Map<string, {
      agenteId: string;
      agenteNombre: string;
      totalComisiones: number;
      cantidad: number;
      pendientes: number;
      pagadas: number;
    }>();

    for (const c of comisiones) {
      if (!agentMap.has(c.userId)) {
        agentMap.set(c.userId, {
          agenteId: c.userId,
          agenteNombre: c.usuario?.name || c.usuario?.email || 'Desconocido',
          totalComisiones: 0,
          cantidad: 0,
          pendientes: 0,
          pagadas: 0,
        });
      }
      const entry = agentMap.get(c.userId)!;
      entry.totalComisiones += c.montoCalculado;
      entry.cantidad++;
      if (c.estado === 'pendiente') entry.pendientes += c.montoCalculado;
      if (c.estado === 'pagada') entry.pagadas += c.montoCalculado;
    }

    const byAgent = Array.from(agentMap.values())
      .sort((a, b) => b.totalComisiones - a.totalComisiones);

    return NextResponse.json({
      data: comisiones.map(c => ({
        id: c.id,
        dealId: c.dealId,
        dealTitulo: c.deal?.titulo || '—',
        agenteId: c.userId,
        agenteNombre: c.usuario?.name || c.usuario?.email || 'Desconocido',
        oficina: c.tenant?.nombre || '—',
        tipo: c.tipo,
        porcentaje: c.porcentaje,
        montoFijo: c.montoFijo,
        montoCalculado: c.montoCalculado,
        moneda: c.moneda,
        estado: c.estado,
        fechaCreacion: c.fechaCreacion,
        fechaAprobacion: c.fechaAprobacion,
        fechaPago: c.fechaPago,
      })),
      totals: {
        total: totalMonto,
        pendientes,
        aprobadas,
        pagadas,
        cantidad: comisiones.length,
        moneda: comisiones[0]?.moneda || 'EUR',
      },
      byAgent,
    });
  } catch (error) {
    console.error('[Franchise Commissions] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener comisiones' },
      { status: 500 }
    );
  }
});
