export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import {
  oficinasDeFranquicia,
  enCadaConexion,
  sumarPorMoneda,
} from '@/lib/real-estate/franquicia';

/**
 * GET /api/real-estate/franchise/commissions
 *
 * Reporte de comisiones de la franquicia.
 * Filtros: ?agenteId, ?desde, ?hasta, ?estado, ?incluirHijas
 *
 * Las comisiones se leen en la conexión de cada oficina (`enCadaConexion`): una
 * matriz con base de datos propia no ve las filas de sus oficinas, que viven en
 * la base compartida, y la consulta devolvería el reporte vacío sin dar error.
 *
 * Los totales van agrupados por divisa. `totals` es una cifra única solo cuando
 * toda la red cobra en la misma divisa; con varias vale `null` y el desglose
 * está en `totalesPorMoneda`.
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

    // Qué tenants entran en el reporte: la matriz y, si se piden, sus oficinas
    // vigentes (las suspendidas o eliminadas no aportan cifras).
    const oficinas = incluirHijas ? await oficinasDeFranquicia(tenantId) : [];
    const nombres = new Map(oficinas.map(o => [o.id, o.nombre]));
    nombres.set(tenantId, auth.tenant!.nombre);
    const alcanceIds = [tenantId, ...oficinas.map(o => o.id)];

    const comisiones = (
      await enCadaConexion(alcanceIds, async (idsDeLaConexion) => {
        const where: Record<string, unknown> = {
          tenantId: { in: idsDeLaConexion },
        };

        if (agenteId) where.userId = agenteId;
        if (estado) where.estado = estado;

        if (desde || hasta) {
          const rango: Record<string, Date> = {};
          if (desde) rango.gte = new Date(desde);
          if (hasta) {
            const hastaDate = new Date(hasta);
            hastaDate.setHours(23, 59, 59, 999);
            rango.lte = hastaDate;
          }
          where.fechaCreacion = rango;
        }

        return prisma.comision.findMany({
          where: where as never,
          include: {
            usuario: { select: { id: true, name: true, email: true } },
            deal: { select: { titulo: true, valor: true, valorReal: true, moneda: true } },
          },
          orderBy: { fechaCreacion: 'desc' },
        });
      })
    ).flat();

    const totalesPorMoneda = sumarPorMoneda(
      comisiones.map(c => ({ moneda: c.moneda, monto: c.montoCalculado, estado: c.estado })),
    );
    const unaSolaDivisa = totalesPorMoneda.length <= 1;

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
        // El nombre de la oficina sale de la lista global de tenants: así no hace
        // falta unir con la tabla `Tenant` desde la conexión del tenant.
        oficina: nombres.get(c.tenantId) || '—',
        tenantId: c.tenantId,
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
        total: unaSolaDivisa ? (totalesPorMoneda[0]?.total ?? 0) : null,
        pendientes: unaSolaDivisa ? (totalesPorMoneda[0]?.pendientes ?? 0) : null,
        aprobadas: unaSolaDivisa ? (totalesPorMoneda[0]?.aprobadas ?? 0) : null,
        pagadas: unaSolaDivisa ? (totalesPorMoneda[0]?.pagadas ?? 0) : null,
        cantidad: comisiones.length,
        moneda: unaSolaDivisa ? (totalesPorMoneda[0]?.moneda ?? null) : null,
        multiDivisa: !unaSolaDivisa,
        porMoneda: totalesPorMoneda,
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
}, ['real-estate:read']);
