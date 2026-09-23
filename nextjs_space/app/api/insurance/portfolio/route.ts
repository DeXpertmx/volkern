export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import {
  fxConvert,
  resumenMoneda,
  CURRENCY_CONSTANTS,
  type Currency,
} from '@/lib/insurance/currency';

/**
 * GET /api/insurance/portfolio
 *
 * Snapshot ejecutivo del vertical Seguros para el dashboard
 * `/dashboard/seguros/portfolio`. Una sola llamada (en lugar de 4)
 * evita que la UI sufra waterfalls al cargar KPIs + alertas + top
 * aseguradoras + últimas pólizas.
 *
 * Devuelve:
 *  - tenantMoneda: 'MXN' (default) — la moneda de reporte del tenant.
 *  - mezclaMonedas: { mezcla, porMoneda, totalEnTarget } — para que la UI
 *    muestre un banner cuando el portfolio combina monedas.
 *  - kpis: aseguradoras activas, productos, pólizas activas/vencidas,
 *    primaTotal (en tenantMoneda), primaPromedio (en tenantMoneda).
 *  - mixPorRamo: sumas en tenantMoneda (pólizas en EUR se convierten).
 *  - topAseguradoras: mismo.
 *  - alertas: counts.
 *  - ultimasPolizas: las top 10 con primaNativa + monedaNativa (sin
 *    convertir) — para que el broker vea los importes exactos preservados.
 *
 * Cambio clave vs versión previa: antes, _sum(primaAnual) sumaba cualquier
 * póliza sin importar su moneda. Ahora, todas las sumas se pasan por
 * fxConvert(amount, from, tenantMoneda) antes de agregarse.
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

    // ─── 0) Cargar moneda del tenant ─────────────────────────────────
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { moneda: true },
    });
    const tenantMoneda: Currency = (tenant?.moneda as Currency | undefined) ??
      (CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY as Currency);

    // ─── 1) KPIs counts (no moneda) ───────────────────────────────────
    const [
      aseguradoras,
      productos,
      polizasActivas,
      polizasVencidas,
      polizasPorVencer30d,
      polizasPorVencer60d,
      polizasSinComisionCount,
    ] = await Promise.all([
      prisma.aseguradora.count({ where: { tenantId, activa: true } }),
      prisma.productoSeguro.count({ where: { tenantId, activo: true } }),
      prisma.poliza.count({ where: { tenantId, estado: { in: [...estadosActivos] } } }),
      prisma.poliza.count({ where: { tenantId, estado: 'VENCIDA' } }),
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

    // ─── 2) Prima total — fetch rows y resumenMoneda (FIX bug monedas) ──
    const polizasParaPrima = await prisma.poliza.findMany({
      where: { tenantId, estado: { in: [...estadosActivos] } },
      select: { primaAnual: true, moneda: true },
    });
    const resumen = resumenMoneda(
      polizasParaPrima.map(p => ({
        monto: Number(p.primaAnual ?? 0),
        moneda: (p.moneda as string) ?? tenantMoneda,
      })),
      tenantMoneda
    );
    const primaTotal = Math.round(resumen.totalEnTarget * 100) / 100;
    const primaPromedio = polizasActivas > 0
      ? Math.round((primaTotal / polizasActivas) * 100) / 100
      : 0;

    // ─── 3) Mix por ramo (suma en tenantMoneda) ──────────────────────
    const polizasPorRamo = await prisma.poliza.findMany({
      where: { tenantId, estado: { in: [...estadosActivos] } },
      select: {
        primaAnual: true,
        moneda: true,
        productoSeguro: { select: { id: true, ramo: true, nombre: true } },
      },
    });
    const ramosAcumulado = new Map<string, { ramo: string; count: number; primaTotal: number }>();
    for (const p of polizasPorRamo) {
      const ramo = p.productoSeguro?.ramo ?? 'OTROS';
      const monto = Number(p.primaAnual ?? 0);
      const enTarget = fxConvert(monto, (p.moneda as string) ?? tenantMoneda, tenantMoneda);
      const entry = ramosAcumulado.get(ramo) ?? { ramo, count: 0, primaTotal: 0 };
      entry.count++;
      entry.primaTotal += enTarget;
      ramosAcumulado.set(ramo, entry);
    }
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
        primaTotal: Math.round(r.primaTotal * 100) / 100,
      }))
      .sort((a, b) => b.primaTotal - a.primaTotal);

    // ─── 4) Top 5 aseguradoras por suma en tenantMoneda ───────────────
    const polizasPorAsegRaw = await prisma.poliza.findMany({
      where: { tenantId, estado: { in: [...estadosActivos] } },
      select: {
        primaAnual: true,
        moneda: true,
        aseguradoraId: true,
        aseguradora: { select: { id: true, nombre: true } },
      },
    });
    const porAseg = new Map<string, { id: string; nombre: string; count: number; primaTotal: number }>();
    for (const p of polizasPorAsegRaw) {
      const entry = porAseg.get(p.aseguradoraId) ??
        { id: p.aseguradoraId, nombre: p.aseguradora?.nombre ?? 'Aseguradora', count: 0, primaTotal: 0 };
      entry.count++;
      entry.primaTotal += fxConvert(Number(p.primaAnual ?? 0), (p.moneda as string) ?? tenantMoneda, tenantMoneda);
      porAseg.set(p.aseguradoraId, entry);
    }
    const topAseguradoras = Array.from(porAseg.values())
      .sort((a, b) => b.primaTotal - a.primaTotal)
      .slice(0, 5)
      .map(a => ({
        id: a.id,
        nombre: a.nombre,
        polizasCount: a.count,
        primaTotal: Math.round(a.primaTotal * 100) / 100,
      }));

    // ─── 5) Últimas 10 pólizas (en su propia moneda, NO convertimos) ─────
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
      primaAnual: Number(p.primaAnual ?? 0),        moneda: p.moneda ?? tenantMoneda,  // ← la nativa de la póliza; si no la trae, la del tenant
      fechaVencimiento: p.fechaVencimiento.toISOString(),
      createdAt: p.createdAt.toISOString(),
    }));

    // ─── 6) Pólizas sin comisión (en su moneda nativa) ───────────────
    const polizasSinComisionRaw = await prisma.poliza.findMany({
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
    // Top 10 sin comisión: ordenar por valor absoluto en tenantMoneda para
    // que el broker vea las que más margen pierden primero.
    const productosSinComision = polizasSinComisionRaw
      .map(p => ({
        polizaId: p.id,
        numeroPoliza: p.numeroPoliza,
        aseguradora: p.aseguradora?.nombre ?? null,
        producto: p.productoSeguro?.nombre ?? null,
        primaAnual: Number(p.primaAnual ?? 0),
        moneda: p.moneda,
        primaEnTarget: fxConvert(Number(p.primaAnual ?? 0), (p.moneda as string) ?? tenantMoneda, tenantMoneda),
      }))
      .sort((a, b) => b.primaEnTarget - a.primaEnTarget)
      .map(p => ({
        polizaId: p.polizaId,
        numeroPoliza: p.numeroPoliza,
        aseguradora: p.aseguradora,
        producto: p.producto,
        primaAnual: p.primaAnual,
        moneda: p.moneda,
      }));

    return NextResponse.json({
      generado: new Date().toISOString(),
      tenantMoneda,
      mezclaMonedas: {
        mezcla: resumen.mezcla,
        porMoneda: Object.entries(resumen.porMoneda).map(([moneda, info]) => ({
          moneda,
          count: info.count,
          totalOriginal: Math.round(info.totalOriginal * 100) / 100,
          totalEnTarget: Math.round(info.totalEnTarget * 100) / 100,
        })),
        totalEnTarget: Math.round(resumen.totalEnTarget * 100) / 100,
      },
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
