export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

/**
 * GET /api/insurance/portfolio/forecast
 *
 * Proyecta la prima del próximo mes con regresión lineal simple sobre los
 * últimos 6 meses (los mismos buckets del timeline endpoint). Devuelve:
 *
 *   {
 *     proyeccion: number,            // valor estimado para el mes siguiente
 *     confianza: 0..1,               // qué tan lineal es la tendencia (1 = perfecta)
 *     rangoMin: number,              // límite inferior (proyeccion - stddev)
 *     rangoMax: number,              // límite superior (proyeccion + stddev)
 *     slope: number,                 // pendiente por mes
 *     ventana: TimelinePoint[],      // últimos 6 meses usados en el modelo
 *     mensaje: '...'                 // texto humano interpretativo
 *   }
 *
 * Notas:
 *  · Si menos de 3 meses tienen prima > 0, retornamos `{ confianza: 0,
 *    mensaje: 'datos insuficientes' }` y `proyeccion = 0`.
 *  · Si los 6 meses están en cero, devolvemos `stddev = 0` (sin ruido).
 */

interface TimelinePoint {
  mes: string;
  label: string;
  polizasCount: number;
  polizasNuevas: number;
  primaTotal: number;
  primaPromedio: number;
}

const MONTHS_ES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

/** Regresión lineal (least squares) sobre los puntos (x, y).
 *  Devuelve { slope, intercept } y null si hay menos de 2 puntos válidos. */
function linearRegression(points: Array<{ x: number; y: number }>): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
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

/** Desviación estándar muestral (N-1) en una sola pasada sin sqrt si todos
 *  los valores son el mismo → 0. */
function stddev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (n - 1);
  return Math.sqrt(variance);
}

/** Bondad de ajuste R² (qué porcentaje de la varianza explica el modelo). */
function rSquared(points: Array<{ x: number; y: number; yHat: number }>): number {
  if (points.length < 2) return 0;
  const meanY = points.reduce((acc, p) => acc + p.y, 0) / points.length;
  const ssTot = points.reduce((acc, p) => acc + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((acc, p) => acc + (p.y - p.yHat) ** 2, 0);
  if (ssTot === 0) return 1; // sin varianza todos los puntos son iguales
  return 1 - ssRes / ssTot;
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

    const polizas = await prisma.poliza.findMany({
      where: {
        tenantId: auth.tenant!.id,
        fechaEmision: { gte: startDate },
      },
      select: {
        fechaEmision: true,
        primaAnual: true,
      },
    });

    // Serie completa para evitar que el modelo lea meses como ausentes.
    const skeleton = buildEmptySeries(now, WINDOW);
    const accumulator = new Map<string, number>();
    for (const p of polizas) {
      const d = new Date(p.fechaEmision);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      accumulator.set(key, (accumulator.get(key) ?? 0) + Number(p.primaAnual ?? 0));
    }
    const ventana: TimelinePoint[] = skeleton.map(s => {
      const prima = accumulator.get(s.mes) ?? 0;
      return { ...s, primaTotal: prima };
    });
    const ys = ventana.map(p => p.primaTotal);

    // Caso borde: 0 pólizas emitidos en toda la ventana — sin suficientes datos.
    const mesesConActividad = ys.filter(v => v > 0).length;
    if (mesesConActividad < 3) {
      return NextResponse.json({
        generado: new Date().toISOString(),
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
      });
    }

    // Regresión: x = índice cronológico (0..N-1), y = primaTotal
    const puntos = ventana.map((p, i) => ({ x: i, y: p.primaTotal }));
    const reg = linearRegression(puntos);
    if (!reg) {
      return NextResponse.json({
        generado: new Date().toISOString(),
        ventana,
        proyeccion: ys[ys.length - 1] ?? 0,
        confianza: 0,
        rangoMin: 0,
        rangoMax: 0,
        slope: 0,
        intercept: ys[ys.length - 1] ?? 0,
        r2: 0,
        mensaje: 'No se pudo estimar la pendiente con los datos disponibles',
      });
    }

    // Proyección: el próximo mes corresponde a x = WINDOW.
    const proyeccionRaw = reg.slope * WINDOW + reg.intercept;
    // Si la proyección es negativa y la actividad reciente fue baja, devolver 0.
    const proyeccion = Math.max(0, proyeccionRaw);

    // Bondad de ajuste: R² combinado con actividad reciente para evitar
    // que el modelo reporte alta confianza con datos triviales.
    const yHats = puntos.map(p => reg.slope * p.x + reg.intercept);
    const r2 = rSquared(puntos.map((p, i) => ({ x: p.x, y: p.y, yHat: yHats[i] })));
    const confianza = Math.max(0, Math.min(1, r2));

    // Intervalo de confianza: ±1 stddev de los residuos.
    const residuos = puntos.map((p, i) => p.y - yHats[i]);
    const stdResiduos = stddev(residuos);
    const rangoMin = Math.max(0, proyeccion - stdResiduos);
    const rangoMax = proyeccion + stdResiduos;

    // Mensaje interpretativo según slope + confianza.
    let mensaje = '';
    if (reg.slope > 0 && r2 > 0.5) {
      mensaje = `Tendencia alcista con buen ajuste (R²=${(r2 * 100).toFixed(0)}%)`;
    } else if (reg.slope > 0) {
      mensaje = `Tendencia alcista, pero con variabilidad alta (R²=${(r2 * 100).toFixed(0)}%)`;
    } else if (reg.slope < 0 && r2 > 0.5) {
      mensaje = `Tendencia a la baja — revisar cartera (R²=${(r2 * 100).toFixed(0)}%)`;
    } else if (reg.slope < 0) {
      mensaje = `Ligera caída — métricas variables`;
    } else {
      mensaje = `Tendencia plana — sin cambio claro`;
    }

    return NextResponse.json({
      generado: new Date().toISOString(),
      ventana,
      proyeccion,
      confianza,
      rangoMin,
      rangoMax,
      slope: reg.slope,
      intercept: reg.intercept,
      r2,
      mensaje,
    });
  } catch (error) {
    console.error('Error al obtener forecast del portfolio:', error);
    return NextResponse.json(
      { error: 'Error al obtener forecast: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
