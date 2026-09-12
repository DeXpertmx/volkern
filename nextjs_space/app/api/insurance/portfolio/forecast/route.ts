export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { triggerPortfolioRenewalsAlert } from '@/lib/insurance/forecast-alert';
import {
  fxConvert,
  CURRENCY_CONSTANTS,
  type Currency,
} from '@/lib/insurance/currency';
import {
  persistForecastLog,
  backfillForecastLogs,
  FORECAST_SOURCE_VERSION,
} from '@/lib/insurance/forecast-persistence';

/**
 * GET /api/insurance/portfolio/forecast
 *
 * Proyecta la prima del próximo mes con regresión lineal simple sobre los
 * últimos 6 meses y, además:
 *
 *  · Persiste un log en `portfolio_forecast_log` por cada generación (upsert
 *    idempotente por tenant + mes proyectado + sourceVersion).
 *  · Backfillea automáticamente el `real` cuando el mes apuntado por la
 *    proyección ya cerró — así el log se enriquece sin necesidad de job batch.
 *  · Calcula el MAPE histórico (Mean Absolute Percentage Error) sobre los
 *    últimos 30 días de logs ya backfilleados, junto con una racha de aciertos
 *    consecutivos para alimentar el chip "Nuestra predicción acertó en X%".
 *  · Marca `experimental` cuando MAPE > 30 % y ensancha la banda del
 *    ±1 stddev a ±1 stddev × 1.6 para reflejar la menor fidelidad.
 *
 * Respuesta:
 *
 *   {
 *     generado: ISO,
 *     ventana: TimelinePoint[],
 *     proyeccion, confianza (0..1),
 *     rangoMin, rangoMax,
 *     slope, intercept, r2,
 *     mensaje: '...',
 *     accuracy: {
 *       dias: 30,
 *       muestras: 12,
 *       mape: 0.18,           // 0..1
 *       accuracyPct: 82,      // (1 - mape) * 100
 *       mejorRacha: 5,
 *       experimental: false,
 *       bandaMultiplicador: 1
 *     }
 *   }
 *
 * Casos borde:
 *  · <3 meses con actividad → confianza=0, mensaje informativo, accuracy.muestras=0
 *  · sin logs backfilleados → accuracy.muestras=0, experimental=false (no hay base)
 */

interface TimelinePoint {
  mes: string;
  label: string;
  polizasCount: number;
  polizasNuevas: number;
  primaTotal: number;
  primaPromedio: number;
}

interface AccuracyAcc {
  dias: number;
  muestras: number;
  mape: number;
  accuracyPct: number;
  mejorRacha: number;
  experimental: boolean;
  bandaMultiplicador: number;
}

const MONTHS_ES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Umbral de MAPE a partir del cual la predicción se considera "experimental".
// 30 % es estándar en forecasting de ventas/pymes: por encima, el modelo pita.
const EXPERIMENTAL_MAPE_THRESHOLD = 0.30;
// Ancho de banda estándar: ±1 stddev de residuos. En modo experimental se
// multiplica por este factor para reflejar la incertidumbre mayor.
const EXPERIMENTAL_BAND_MULTIPLIER = 1.6;
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildEmptySeries(now: Date, count: number): TimelinePoint[] {
  const series: TimelinePoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = `${MONTHS_ES_SHORT[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    series.push({ mes, label, polizasCount: 0, polizasNuevas: 0, primaTotal: 0, primaPromedio: 0 });
  }
  return series;
}

function linearRegression(points: Array<{ x: number; y: number }>): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) { sumX += p.x; sumY += p.y; }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

function stddev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (n - 1);
  return Math.sqrt(variance);
}

function rSquared(points: Array<{ x: number; y: number; yHat: number }>): number {
  if (points.length < 2) return 0;
  const meanY = points.reduce((acc, p) => acc + p.y, 0) / points.length;
  const ssTot = points.reduce((acc, p) => acc + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((acc, p) => acc + (p.y - p.yHat) ** 2, 0);
  if (ssTot === 0) return 1;
  return 1 - ssRes / ssTot;
}

/**
 * Calcula MAPE + accuracyPct + mejorRacha sobre los logs del tenant cuyo `real`
 * ya está backfilleado y cayeron dentro de la ventana `dias`.
 *
 *  · MAPE = promedio de errorPct/100 sobre las muestras
 *  · mejorRacha = máximo de aciertos consecutivos (errorPct <= 25%) ordenados
 *    cronológicamente ascendente (más recientes al final). Así "mejor racha de
 *    los últimos N" se evalúa en el orden temporal natural.
 *  · experimental = MAPE > 30 % (con un mínimo de 5 muestras para no marcar
 *    como experimental a un tenant con sus 2 primeros logs desafortunados)
 */
async function computeAccuracy(tenantId: string, dias: number): Promise<AccuracyAcc> {
  const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const logs = await prisma.portfolioForecastLog.findMany({
    where: {
      tenantId,
      real: { not: null },
      errorPct: { not: null },
      generadoEn: { gte: cutoff },
    },
    orderBy: { generadoEn: 'asc' },
    select: { errorPct: true },
  });

  const muestras = logs.length;
  if (muestras === 0) {
    return {
      dias,
      muestras: 0,
      mape: 0,
      accuracyPct: 100, // sin datos → optimista por defecto
      mejorRacha: 0,
      experimental: false,
      bandaMultiplicador: 1,
    };
  }

  // MAPE sobre todos los logs (no solo los más recientes). Cast seguro
  // desde Decimal a number usando Number() — errorPct cabe en DECIMAL(7,2).
  const errores: number[] = logs
    .map((l: { errorPct: unknown }): number => {
      const n = Number(l.errorPct ?? 0) / 100;
      return Number.isFinite(n) ? n : 0;
    });
  const mape = errores.reduce((acc: number, v: number) => acc + v, 0) / errores.length;

  // Racha de aciertos consecutivos (errorPct <= 25%). Consideramos "acierto"
  // toda predicción con error relativo inferior al 25 %. Es más permisivo
  // que el threshold experimental (30%) y refleja intuición humana de
  // "el broker estuvo cerca de la realidad".
  const ACIERTO_PCT = 25;
  let racha = 0, mejorRacha = 0;
  for (const e of errores) {
    if (e * 100 <= ACIERTO_PCT) {
      racha++;
      mejorRacha = Math.max(mejorRacha, racha);
    } else {
      racha = 0;
    }
  }

  // Marca experimental sólo con suficientes muestras (no castigar al tenant
  // por sus 2-3 primeros logs desafortunados).
  const experimental = muestras >= 5 && mape > EXPERIMENTAL_MAPE_THRESHOLD;

  return {
    dias,
    muestras,
    mape,
    accuracyPct: Math.round((1 - mape) * 100),
    mejorRacha,
    experimental,
    bandaMultiplicador: experimental ? EXPERIMENTAL_BAND_MULTIPLIER : 1,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ['insurance:read', 'catalogo:read']);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
  }

  try {
    const WINDOW = 6;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - (WINDOW - 1), 1);

    // Cargar moneda del tenant una sola vez; todas las sumas se convierten a ella.
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenant!.id },
      select: { moneda: true },
    });
    const tenantMoneda: Currency = (tenant?.moneda as Currency | undefined) ??
      (CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY as Currency);

    const polizas = await prisma.poliza.findMany({
      where: { tenantId: auth.tenant!.id, fechaEmision: { gte: startDate } },
      select: { fechaEmision: true, primaAnual: true, moneda: true },
    });

    // Serie completa para evitar que el modelo lea meses como ausentes.
    // Sumamos convirtiendo de cada póliza a tenantMoneda (FIX bug monedas).
    const skeleton = buildEmptySeries(now, WINDOW);
    const accumulator = new Map<string, number>();
    for (const p of polizas) {
      const d = new Date(p.fechaEmision);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      const montoEnTarget = fxConvert(
        Number(p.primaAnual ?? 0),
        (p.moneda as string) ?? tenantMoneda,
        tenantMoneda
      );
      accumulator.set(key, (accumulator.get(key) ?? 0) + montoEnTarget);
    }
    const ventana: TimelinePoint[] = skeleton.map(s => {
      const prima = accumulator.get(s.mes) ?? 0;
      return { ...s, primaTotal: prima };
    });
    const ys = ventana.map(p => p.primaTotal);

    // Caso borde: 0 pólizas emitidos en toda la ventana.
    const mesesConActividad = ys.filter(v => v > 0).length;
    if (mesesConActividad < 3) {
      const accuracy = await computeAccuracy(auth.tenant!.id, 30);    return NextResponse.json({
      generado: new Date().toISOString(),
      tenantMoneda,
      ventana,
      proyeccion: ys[ys.length - 1] ?? 0,
      confianza: 0,
      rangoMin: 0,
      rangoMax: 0,
      slope: 0,
      intercept: 0,
      r2: 0,
      mensaje:
        mesesConActividad === 0
          ? 'Sin actividad en los últimos 6 meses'
          : `Pocos meses con actividad (${mesesConActividad}/6) — se necesita más historial`,
        accuracy,
        alert: null, // sin slope real, no hay alerta que evaluar
      });
    }

    // Regresión: x = índice cronológico (0..N-1), y = primaTotal
    const puntos = ventana.map((p, i) => ({ x: i, y: p.primaTotal }));
    const reg = linearRegression(puntos);
    if (!reg) {
      const accuracy = await computeAccuracy(auth.tenant!.id, 30);
      return NextResponse.json({
        generado: new Date().toISOString(),
        tenantMoneda,
        ventana,
        proyeccion: ys[ys.length - 1] ?? 0,
        confianza: 0,
        rangoMin: 0,
        rangoMax: 0,
        slope: 0,
        intercept: ys[ys.length - 1] ?? 0,
        r2: 0,
        mensaje: 'No se pudo estimar la pendiente con los datos disponibles',
        accuracy,
        alert: null, // pendiente indefinida, no hay alerta
      });
    }

    // Proyección: el próximo mes corresponde a x = WINDOW.
    const proyeccionRaw = reg.slope * WINDOW + reg.intercept;
    const proyeccion = Math.max(0, proyeccionRaw);

    // Bondad de ajuste: R² combinado con actividad reciente.
    const yHats = puntos.map(p => reg.slope * p.x + reg.intercept);
    const r2 = rSquared(puntos.map((p, i) => ({ x: p.x, y: p.y, yHat: yHats[i] })));
    const confianza = Math.max(0, Math.min(1, r2));

    const accuracy = await computeAccuracy(auth.tenant!.id, 30);

    // Intervalo: ±1 stddev de residuos (ajustado por banda si "experimental").
    const residuos = puntos.map((p, i) => p.y - yHats[i]);
    const stdResiduos = stddev(residuos);
    const stdAjustado = stdResiduos * accuracy.bandaMultiplicador;
    const rangoMin = Math.max(0, proyeccion - stdAjustado);
    const rangoMax = proyeccion + stdAjustado;

    // Mensaje interpretativo según slope + confianza + accuracy.
    let mensaje = '';
    const slopeFrac = reg.slope;
    if (accuracy.experimental) {
      mensaje = `Modelo experimental (MAPE ${(accuracy.mape * 100).toFixed(0)}% últimos ${accuracy.dias}d) — usa la banda amplia como referencia`;
    } else if (slopeFrac > 0 && r2 > 0.5) {
      mensaje = `Tendencia alcista con buen ajuste (R²=${(r2 * 100).toFixed(0)}%)`;
    } else if (slopeFrac > 0) {
      mensaje = `Tendencia alcista, pero con variabilidad alta (R²=${(r2 * 100).toFixed(0)}%)`;
    } else if (slopeFrac < 0 && r2 > 0.5) {
      mensaje = `Tendencia a la baja — revisar cartera (R²=${(r2 * 100).toFixed(0)}%)`;
    } else if (slopeFrac < 0) {
      mensaje = `Ligera caída — métricas variables`;
    } else {
      mensaje = `Tendencia plana — sin cambio claro`;
    }

    // ─── Persistir log (upsert idempotente) ──────────────────────────
    // El "mes al que apunta" es el primer día del próximo mes. Si la petición
    // se hace el 15 de febrero, el log dice "mesProyectado=2026-03-01".
    const mesProyectado = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const persistedLog = await persistForecastLog(auth.tenant!.id, {
      mesProyectado,
      proyectado: proyeccion,
      slope: reg.slope,
      intercepto: reg.intercept,
      r2,
      ventanaMeses: WINDOW,
      sourceVersion: FORECAST_SOURCE_VERSION,
    });
    const currentForecastLogId = persistedLog?.id ?? null;

    // ─── Proactividad forecast → chatbot ─────────────────────────
    // Si la pendiente es negativa con buen ajuste, abre una conversación
    // proactiva con el chatbot proponiendo revisar las pólizas sin renovación
    // próxima. Idempotente: cooldown interno de 7d vía portfolioForecastLog.
    const alert = await triggerPortfolioRenewalsAlert(
      auth.tenant!.id,
      reg.slope,
      r2,
      currentForecastLogId,
    );

    // ─── Backfill de logs cuyo mes apuntado ya cerró ────────────────
    // Helper idempotente: backfillea `real` + `errorPct` solo en logs con
    // mesProyectado < ahora y real NULL. Idempotente por filtro `real: null`.
    await backfillForecastLogs(auth.tenant!.id, tenantMoneda);

    // Recalcular accuracy tras backfill (los logs que se acaban de cerrar
    // podrían aportar muestras nuevas).
    const accuracyFinal = await computeAccuracy(auth.tenant!.id, 30);
    // Si tras backfill cruzamos el umbral, re-ajustar la banda del mensaje:
    if (accuracyFinal.experimental !== accuracy.experimental) {
      const stdAjustado2 = stdResiduos * accuracyFinal.bandaMultiplicador;
      return NextResponse.json({
        generado: new Date().toISOString(),
        ventana,
        proyeccion,
        confianza,
        rangoMin: Math.max(0, proyeccion - stdAjustado2),
        rangoMax: proyeccion + stdAjustado2,
        slope: reg.slope,
        intercept: reg.intercept,
        r2,
        mensaje: `Modelo experimental (MAPE ${(accuracyFinal.mape * 100).toFixed(0)}% últimos ${accuracyFinal.dias}d) — usa la banda amplia como referencia`,
        accuracy: accuracyFinal,
        alert, // ya calculado antes del backfill
      });
    }

    return NextResponse.json({
      generado: new Date().toISOString(),
      tenantMoneda,
      ventana,
      proyeccion,
      confianza,
      rangoMin,
      rangoMax,
      slope: reg.slope,
      intercept: reg.intercept,
      r2,
      mensaje,
      accuracy: accuracyFinal,
      alert,
    });
  } catch (error) {
    console.error('Error al obtener forecast del portfolio:', error);
    return NextResponse.json(
      { error: 'Error al obtener forecast: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
