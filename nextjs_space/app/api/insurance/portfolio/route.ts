export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

/**
 * GET /api/insurance/portfolio
 *
 * Snapshot ejecutivo del vertical Seguros para el dashboard
 * `/dashboard/seguros/portfolio`. Una sola llamada (en lugar de 4)
 * evita que la UI sufra waterfalls al cargar KPIs + alertas + top
 * aseguradoras + últimas pólizas.
 *
 * Devuelve:
 *  - kpis: aseguradoras activas, productos publicados, pólizas activas,
 *    prima total anual, prima promedio
 *  - mixPorRamo: [{ ramo, count, primaTotal }] ordenado desc por prima
 *  - topAseguradoras: [{ id, nombre, polizasCount, primaTotal }] top 5
 *  - alertas: { productosSinComision, polizasPorVencer30d, polizasPorVencer60d }
 *  - ultimasPolizas: últimas 10 creadas con cliente y aseguradora
 *  - generado: timestamp ISO
 */
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
    const estadosActivos = ['ACTIVA', 'PROXIMA_A_VENCER'] as const;

    // ─── 1) KPIs + alertas (counts + sum) ───────────────────────────────
    const [
      aseguradoras,
      productos,
      polizasActivas,
      polizasVencidas,
      primaAggregate,
      polizasPorVencer30d,
      polizasPorVencer60d,
      polizasSinComisionCount,
    ] = await Promise.all([
      prisma.aseguradora.count({ where: { tenantId, activa: true } }),
      prisma.productoSeguro.count({ where: { tenantId, activo: true } }),
      prisma.poliza.count({ where: { tenantId, estado: { in: [...estadosActivos] } } }),
      prisma.poliza.count({ where: { tenantId, estado: 'VENCIDA' } }),
      prisma.poliza.aggregate({
        where: { tenantId, estado: { in: [...estadosActivos] } },
        _sum: { primaAnual: true },
        _avg: { primaAnual: true },
      }),
      prisma.poliza.count({
        where: {
          tenantId,
          estado: { in: [...estadosActivos] },
          fechaVencimiento: { gte: now, lte: in30d },
        },
      }),
      prisma.poliza.count({
        where: {
          tenantId,
          estado: { in: [...estadosActivos] },
          fechaVencimiento: { gte: now, lte: in60d },
        },
      }),
      prisma.poliza.count({
        where: {
          tenantId,
          estado: { in: [...estadosActivos] },
          OR: [{ comisionPct: null }, { comisionPct: 0 }],
        },
      }),
    ]);

    // ─── 2) Mix por ramo (group by) ─────────────────────────────────────
    const polizasPorRamo = await prisma.poliza.groupBy({
      by: ['productoSeguroId'],
      where: { tenantId, estado: { in: [...estadosActivos] } },
      _count: { _all: true },
      _sum: { primaAnual: true },
    });
    const productosParaMix = await prisma.productoSeguro.findMany({
      where: { id: { in: polizasPorRamo.map(p => p.productoSeguroId) } },
      select: { id: true, ramo: true, nombre: true },
    });
    const ramoIndex = new Map(productosParaMix.map(p => [p.id, p]));
    const ramosAcumulado = new Map<string, { ramo: string; count: number; primaTotal: number }>();
    for (const p of polizasPorRamo) {
      const meta = ramoIndex.get(p.productoSeguroId);
      if (!meta) continue;
      const key = meta.ramo;
      const entry = ramosAcumulado.get(key) ?? { ramo: key, count: 0, primaTotal: 0 };
      entry.count += p._count?._all ?? 0;
      entry.primaTotal += Number(p._sum?.primaAnual ?? 0);
      ramosAcumulado.set(key, entry);
    }
    // Tipos RAMO para mostrar nombres legibles en UI.
    const RAMO_LABELS: Record<string, string> = {
      AUTO: 'Auto',
      HOGAR: 'Hogar',
      VIDA: 'Vida',
      SALUD: 'Salud',
      GASTOS_MEDICOS: 'Gastos médicos',
      EMPRESARIAL: 'Empresarial',
      RESPONSABILIDAD_CIVIL: 'Responsabilidad civil',
      INCENDIO: 'Incendio',
      TRANSPORTE: 'Transporte',
      AHORRO: 'Ahorro',
      JUBILACION: 'Jubilación',
      OTROS: 'Otros',
    };
    const mixPorRamo = Array.from(ramosAcumulado.values())
      .map(r => ({
        ramo: r.ramo,
        ramoLabel: RAMO_LABELS[r.ramo] ?? r.ramo,
        polizasCount: r.count,
        primaTotal: r.primaTotal,
      }))
      .sort((a, b) => b.primaTotal - a.primaTotal);

    // ─── 3) Top 5 aseguradoras por prima ─────────────────────────────────
    const topAseguradorasRaw = await prisma.poliza.groupBy({
      by: ['aseguradoraId'],
      where: { tenantId, estado: { in: [...estadosActivos] } },
      _count: { _all: true },
      _sum: { primaAnual: true },
      // Prisma requiere un orderBy cuando se usa `take`. Ordenamos por
      // aseguradoraId asc para satisfacer el compilador; el sort por suma
      // de prima se hace a mano después del take (que ya estará acotado).
      orderBy: { aseguradoraId: 'asc' },
      take: 5,
    });
    // Ordenar manualmente por suma de prima (groupBy.orderBy en Prisma no acepta
    // aliases como `primaAnual: { _sum }` cuando groupBy no incluye ese campo).
    topAseguradorasRaw.sort(
      (a, b) => Number(b._sum?.primaAnual ?? 0) - Number(a._sum?.primaAnual ?? 0)
    );
    const aseguradorasMeta = await prisma.aseguradora.findMany({
      where: { id: { in: topAseguradorasRaw.map(p => p.aseguradoraId) } },
      select: { id: true, nombre: true },
    });
    const asegIndex = new Map(aseguradorasMeta.map(a => [a.id, a]));
    const topAseguradoras = topAseguradorasRaw.map(p => {
      const meta = asegIndex.get(p.aseguradoraId);
      return {
        id: p.aseguradoraId,
        nombre: meta?.nombre ?? 'Aseguradora desconocida',
        polizasCount: p._count._all,
        primaTotal: Number(p._sum.primaAnual ?? 0),
      };
    });

    // ─── 4) Últimas 10 pólizas ───────────────────────────────────────────
    const ultimasPolizasRaw = await prisma.poliza.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        cliente: { select: { id: true, nombre: true } },
        aseguradora: { select: { id: true, nombre: true } },
        productoSeguro: { select: { id: true, nombre: true, ramo: true } },
      },
    });
    const ultimasPolizas = ultimasPolizasRaw.map(p => ({
      id: p.id,
      numeroPoliza: p.numeroPoliza,
      cliente: p.cliente?.nombre ?? null,
      aseguradora: p.aseguradora?.nombre ?? null,
      producto: p.productoSeguro?.nombre ?? null,
      ramo: p.productoSeguro?.ramo ?? null,
      estado: p.estado,
      primaAnual: Number(p.primaAnual ?? 0),
      fechaVencimiento: p.fechaVencimiento.toISOString(),
      createdAt: p.createdAt.toISOString(),
    }));

    // ─── 5) Pólizas con comisionPct=0 (lista) ───────────────────────────
    const polizasSinComision = await prisma.poliza.findMany({
      where: {
        tenantId,
        estado: { in: [...estadosActivos] },
        OR: [{ comisionPct: null }, { comisionPct: 0 }],
      },
      orderBy: { primaAnual: 'desc' },
      take: 10,
      include: {
        aseguradora: { select: { nombre: true } },
        productoSeguro: { select: { nombre: true } },
      },
    });
    const productosSinComision = polizasSinComision.map(p => ({
      polizaId: p.id,
      numeroPoliza: p.numeroPoliza,
      aseguradora: p.aseguradora?.nombre ?? null,
      producto: p.productoSeguro?.nombre ?? null,
      primaAnual: Number(p.primaAnual ?? 0),
    }));

    const primaTotal = Number(primaAggregate._sum.primaAnual ?? 0);
    const primaPromedio = Number(primaAggregate._avg.primaAnual ?? 0);

    return NextResponse.json({
      generado: new Date().toISOString(),
      kpis: {
        aseguradoras,
        productos,
        polizasActivas,
        polizasVencidas,
        primaTotal,
        primaPromedio,
      },
      alertas: {
        polizasPorVencer30d,
        polizasPorVencer60d,
        polizasSinComisionCount,
      },
      mixPorRamo,
      topAseguradoras,
      ultimasPolizas,
      productosSinComision,
    });
  } catch (error) {
    console.error('Error al obtener snapshot del portfolio:', error);
    return NextResponse.json(
      { error: 'Error al obtener snapshot del portfolio: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
