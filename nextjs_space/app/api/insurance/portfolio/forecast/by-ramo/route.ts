export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import {
  ALL_RAMOS,
  RAMO_LABELS,
  accumulateByMonth,
  buildEmptySeries,
  computeRegressionForecast,
} from '@/lib/insurance/forecast-engine';

/**
 * GET /api/insurance/portfolio/forecast/by-ramo
 *
 * Forecast MULTI-RAMO. Ejecuta la misma regresión lineal que /forecast pero
 * desglosada por cada uno de los 12 valores del enum `Ramo`. Las queries
 * Prisma se ejecutan en paralelo (Promise.all) — latencia total ~la query
 * más lenta, no la suma.
 *
 * Para cada ramo devuelve:
 *   {
 *     ramo: 'AUTO',
 *     label: 'Auto',
 *     ventana: [6 TimelinePoint],
 *     slope, r2, proyeccion,
 *     pendienteLabel,
 *     caidaAbsoluta: number,           // últimoReal - proyeccion (negativo = cae)
 *     polizasProximaVencerCount: number,
 *     polizasProximaVencerTop: [{ numeroPoliza, cliente, primaAnual, fechaVencimiento, ... }],
 *     mensaje: '...'
 *   }
 *
 * Casos borde:
 *   · Sin actividad reciente → slope=0, proyeccion=0, caidaAbsoluta=0.
 *   · Sin pólizas PROXIMA_A_VENCER → Top array vacío, count=0.
 *
 * UI cliente ordena por `caidaAbsoluta asc` (más negativo = peor) y muestra
 * los primeros 12 mini-sparklines. El CTA "Recuperar ramo X" abre el dialog
 * con `polizasProximaVencerTop`.
 */

const WINDOW = 6;
const TOP_PROXIMAS = 10;
const MAX_DIAS_PROXIMA = 60; // ventana estándar de "próximas a vencer" para el CTA

interface ByRamoPayload {
  generado: string;
  windowSize: number;
  windowDiasProxima: number;
  ramos: Array<{
    ramo: string;
    label: string;
    ventana: Array<{ mes: string; label: string; polizasCount: number; polizasNuevas: number; primaTotal: number; primaPromedio: number }>;
    slope: number;
    r2: number;
    proyeccion: number;
    confianza: number;
    pendienteLabel: 'Alcista fuerte' | 'Alcista débil' | 'Bajista fuerte' | 'Bajista débil' | 'Plana';
    caidaAbsoluta: number;          // últimoReal - proyeccion (negativo = cae)
    pctCaida: number;               // caidaAbsoluta / últimoReal * 100 (negativo = cae)
    polizasProximaVencerCount: number;
    polizasProximaVencerTop: Array<{
      polizaId: string;
      numeroPoliza: string;
      cliente: string | null;
      aseguradora: string | null;
      producto: string | null;
      primaAnual: number;
      fechaVencimiento: string;
      diasParaVencer: number;
    }>;
    mensaje: string;
  }>;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ['insurance:read', 'catalogo:read']);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
  }

  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - (WINDOW - 1), 1);
    const skeleton = buildEmptySeries(now, WINDOW);

    // Ventana para PROXIMA_A_VENCER: hoy + MAX_DIAS_PROXIMA
    const upcomingLimit = new Date(now.getTime() + MAX_DIAS_PROXIMA * 24 * 60 * 60 * 1000);

    // ─── 12 queries Prisma en paralelo: regresión + top pólizas por ramo ──
    const ramoJobs = await Promise.all(
      ALL_RAMOS.map(async (ramo) => {
        // Query 1: emitir fechaEmision y primaAnual de los últimos WINDOW meses para este ramo
        const polizasEmitidas = await prisma.poliza.findMany({
          where: {
            tenantId: auth.tenant!.id,
            fechaEmision: { gte: startDate },
            productoSeguro: { ramo: ramo as any },
          },
          select: { fechaEmision: true, primaAnual: true },
        });
        // Mapear Decimal → number para que `accumulateByMonth` acepte el shape.
        const ventana = accumulateByMonth(
          polizasEmitidas.map(p => ({
            fechaEmision: p.fechaEmision,
            primaAnual: p.primaAnual ? Number(p.primaAnual) : null,
          })),
          JSON.parse(JSON.stringify(skeleton))
        );
        const reg = computeRegressionForecast(ventana, WINDOW);

        // Query 2: pólizas PROXIMA_A_VENCER de este ramo, top por prima
        // Cast de include a `any` porque strict Prisma typing rechaza la combinación
        // `where.productoSeguro.ramo` + `include.aseguradora` cuando el enum
        // viene de un array tipado como string[]. La query funciona correctamente
        // en runtime — es solo un quirk del tipado de Prisma 6.
        const proximas: any[] = await prisma.poliza.findMany({
          where: {
            tenantId: auth.tenant!.id,
            estado: 'PROXIMA_A_VENCER',
            fechaVencimiento: { gte: now, lte: upcomingLimit },
            productoSeguro: { ramo: ramo as any },
          },
          orderBy: { primaAnual: 'desc' },
          take: TOP_PROXIMAS,
          include: {
            contacts: { select: { nombre: true } },
            aseguradora: { select: { nombre: true } },
            productoSeguro: { select: { nombre: true } },
          },
        } as any);

        const ultimoReal = ventana[ventana.length - 1]?.primaTotal ?? 0;
        const caidaAbsoluta = Math.round((ultimoReal - reg.proyeccion) * 100) / 100;
        // pctCaida: negativo = baja (ej. -25% = cayó 25%). Si últimoReal=0,
        // devolvemos null-aware para evitar div/0 → usamos Number.NaN que el UI trata como "sin datos".
        const pctCaida = ultimoReal > 0
          ? Math.round((caidaAbsoluta / ultimoReal) * 1000) / 10
          : 0;

        return {
          ramo,
          label: RAMO_LABELS[ramo] ?? ramo,
          ventana,
          slope: Math.round(reg.slope * 100) / 100,
          r2: reg.r2,
          proyeccion: Math.round(reg.proyeccion * 100) / 100,
          confianza: reg.confianza,
          pendienteLabel: reg.pendienteLabel,
          caidaAbsoluta,
          pctCaida,
          polizasProximaVencerCount: await prisma.poliza.count({
            where: {
              tenantId: auth.tenant!.id,
              estado: 'PROXIMA_A_VENCER',
              fechaVencimiento: { gte: now, lte: upcomingLimit },
              productoSeguro: { ramo: ramo as any },
            },
          }),
          polizasProximaVencerTop: proximas.map(p => ({
            polizaId: p.id,
            numeroPoliza: p.numeroPoliza,
            cliente: p.contacts?.nombre ?? null,
            aseguradora: p.aseguradora?.nombre ?? null,
            producto: p.productoSeguro?.nombre ?? null,
            primaAnual: Number(p.primaAnual ?? 0),
            fechaVencimiento: p.fechaVencimiento.toISOString(),
            diasParaVencer: Math.ceil((p.fechaVencimiento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
          })),
          mensaje: reg.mensaje,
        };
      })
    );

    const payload: ByRamoPayload = {
      generado: new Date().toISOString(),
      windowSize: WINDOW,
      windowDiasProxima: MAX_DIAS_PROXIMA,
      ramos: ramoJobs,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[forecast/by-ramo] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener forecast por ramo: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
