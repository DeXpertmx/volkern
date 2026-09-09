export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import {
  computarMultipliers,
  enriquecerConGoogleCalendar,
  combinarMultipliers,
} from '@/lib/insurance/seasonal-multiplier';
import { persistSmartForecastLog } from '@/lib/insurance/forecast-persistence';

/**
 * GET /api/insurance/portfolio/forecast/smart
 *
 * Forecast "smart" = regresión lineal (mismo motor que /forecast) +
 * multipliers estacionales aprendidos del histórico + enriquecimiento
 * opcional desde Google Calendar.
 *
 * Respuesta:
 *   {
 *     generado: ISO,
 *     ventana: TimelinePoint[],          // 6 meses (mismo scope)
 *     proyectadoBase: number,             // forecast SIN multiplicadores
 *     proyectadoAjustado: number,         // forecast × multipliers compuesto
 *     ajusteTotal: number,                // multiplicador compuesto (1.0 = sin cambio)
 *     eventosConsiderados: [              // trazables
 *       { key, nombre, ramo, fechaInicio, fechaFin, multiplier, confianza, fuente }
 *     ],
 *     mejoraMapeEstimada: number,         // % esperado (heurístico)
 *     accuracy: { mape, accuracyPct, ... },
 *     mensaje: '...'
 *   }
 *
 * Diferencias con /forecast:
 *  · Reusa TODO el motor lineal (sin duplicar lógica).
 *  · Lee/calcula multipliers seasonal (cacheado 30d).
 *  · Enriquece con Google Calendar si el broker tiene OAuth configurado.
 *  · Devuelve además proyectadoBase (sin ajuste) para comparabilidad.
 *
 * Notas:
 *  · Cache STALE_AFTER_DAYS = 30d (re-evalúa pasado ese tiempo automáticamente).
 *  · Multiplier compuesto cap [0.5, 3.0].
 *  · Si <3 muestras: usa multipliersDefault del catálogo (igual que /forecast).
 */

interface SmartPayload {
  generado: string;
  ventana: Array<{ mes: string; label: string; primaTotal: number; polizasCount: number; polizasNuevas: number; primaPromedio: number }>;
  slope: number;
  r2: number;
  confianza: number;
  proyectadoBase: number;
  proyectadoAjustado: number;
  ajusteTotal: number;
  eventosConsiderados: Array<{
    key: string;
    nombre: string;
    ramo: string | null;
    fechaInicio: string;
    fechaFin: string;
    multiplier: number;
    confianza: number;
    fuente: 'learned' | 'static' | 'google_calendar';
  }>;
  mejoraMapeEstimada: number;
  accuracy: {
    dias: number;
    muestras: number;
    mape: number;
    accuracyPct: number;
    mejorRacha: number;
    experimental: boolean;
    bandaMultiplicador: number;
  };
  mensaje: string;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ['insurance:read', 'catalogo:read']);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
  }

  try {
    // ─── 1. Reutilizar el forecast base vía fetch interno ──────────
    //   En lugar de duplicar la regresión lineal, hacemos una llamada al
    //   propio endpoint /forecast con la misma auth. Esto garantiza que
    //   smart = base + multipliers sin divergencia.
    const base = await fetchBaseForecast(request, auth.tenant!.id);
    if (!base.ok) {
      return NextResponse.json(
        { error: 'No pude obtener el forecast base: ' + (base.error || 'desconocido') },
        { status: 502 }
      );
    }

    // ─── 2. Rango objetivo: próximos 30 días desde hoy ─────────────
    const ahora = new Date();
    const targetMonthStart = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getMonth(), 1));
    const targetMonthEnd = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59));

    // ─── 3. Cómputo de multipliers learned + static ─────────────────
    let considerados = await computarMultipliers(auth.tenant!.id, targetMonthStart, targetMonthEnd);

    // ─── 4. Enriquecimiento con Google Calendar (opcional) ─────────
    try {
      // Si el caller autenticó con userId (API key vinculada), úsalo.
      const userId = (auth as any).userId as string | undefined;
      const gcal = await enriquecerConGoogleCalendar(auth.tenant!.id, targetMonthStart, targetMonthEnd, userId);
      considerados = [...considerados, ...gcal];
    } catch (err) {
      console.warn('[forecast/smart] Google Calendar enrichment silenciado:', err);
    }

    // ─── 5. Multiplicador compuesto y proyectado ajustado ──────────
    const ajusteTotal = combinarMultipliers(considerados);
    const proyectadoBase = Math.max(0, base.proyeccion ?? 0);
    const proyectadoAjustado = Math.max(0, proyectadoBase * ajusteTotal);

    // ─── 6. Mejora MAPE esperada ───────────────────────────────────
    //   Heurístico: cuanto más se aleja el ajuste de 1.0 y más confianza
    //   tienen los multipliers, mayor será la mejora de MAPE. Cap a 35%.
    const mejoraMapeEstimada = calcularMejoraMapeEsperada(considerados, base.accuracy?.mape ?? 0);

    // ─── 7. Mensaje interpretativo ─────────────────────────────────
    let mensaje = '';
    if (considerados.length === 0) {
      mensaje = 'Sin eventos estacionales próximos — forecast equivale al base.';
    } else if (ajusteTotal > 1.15) {
      const evs = considerados.map(e => e.nombre).join(', ');
      mensaje = `Próximo mes coincide con ${evs}. Multiplicador compuesto ${ajusteTotal.toFixed(2)}× sobre baseline.`;
    } else if (ajusteTotal < 0.85) {
      mensaje = `Próximo mes cae en valle estacional (${(1 - ajusteTotal) * 100 | 0}% bajo baseline).`;
    } else {
      mensaje = `Eventos estacionales con ajuste moderado (${ajusteTotal.toFixed(2)}×).`;
    }

    // ─── 8. Persistir log de auditoría para análisis offline ──────
    // Helper idempotente (sourceVersion `v2-smart-seasonal`): fire-and-forget,
    // no rompe la respuesta si falla.
    await persistSmartForecastLog(auth.tenant!.id, {
      mesProyectado: targetMonthStart,
      proyectado: proyectadoAjustado,
      slope: base.slope ?? 0,
      intercepto: base.intercept ?? 0,
      r2: base.r2 ?? 0,
    });

    // Normalizamos el shape con defaults no-undefined para evitar Optional Chaining
    // en cascada en el payload (que ensucia la inferencia del tipo SmartPayload).
    const ventana = base.ventana ?? [];
    const slope = base.slope ?? 0;
    const r2 = base.r2 ?? 0;
    const confianza = base.confianza ?? 0;
    const accuracy = base.accuracy ?? {
      dias: 30, muestras: 0, mape: 0, accuracyPct: 100,
      mejorRacha: 0, experimental: false, bandaMultiplicador: 1,
    };

    const payload: SmartPayload = {
      generado: new Date().toISOString(),
      ventana,
      slope,
      r2,
      confianza,
      proyectadoBase,
      proyectadoAjustado,
      ajusteTotal,
      eventosConsiderados: considerados,
      mejoraMapeEstimada,
      accuracy,
      mensaje,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[forecast/smart] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener forecast smart: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface BaseForecastResponse {
  ok: boolean;
  error?: string;
  ventana?: SmartPayload['ventana'];
  proyeccion?: number;
  slope?: number;
  intercept?: number;
  r2?: number;
  confianza?: number;
  accuracy?: SmartPayload['accuracy'];
}

/**
 * Llama internamente al endpoint /forecast con la misma autenticación.
 * Devuelve un shape normalizado o un error si falla.
 */
async function fetchBaseForecast(request: NextRequest, tenantId: string): Promise<BaseForecastResponse> {
  try {
    const internalUrl = new URL(request.url);
    internalUrl.pathname = '/api/insurance/portfolio/forecast';

    const headers = new Headers(request.headers);
    const response = await fetch(internalUrl.toString(), { headers });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return {
      ok: true,
      ventana: data.ventana,
      proyeccion: Math.max(0, Number(data.proyeccion) || 0),
      slope: Number(data.slope) || 0,
      intercept: Number(data.intercept) || 0,
      r2: Number(data.r2) || 0,
      confianza: Number(data.confianza) || 0,
      accuracy: data.accuracy ?? {
        dias: 30, muestras: 0, mape: 0, accuracyPct: 100,
        mejorRacha: 0, experimental: false, bandaMultiplicador: 1,
      },
      error: data.error,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Heurístico conservador: si los multipliers son correctos, el MAPE
 * debería mejorar proporcionalmente a la "fuerza" del ajuste. Cap a 35%.
 *
 *   mejoraMape = (|ajusteTotal - 1| × promedioConfianza) × constante
 *
 * Cuando no hay eventos (ajuste = 1.0), mejora = 0. Cuando hay muchos con
 * alta confianza, mejora ~25-35%.
 */
function calcularMejoraMapeEsperada(
  eventos: SmartPayload['eventosConsiderados'],
  mapeActual: number
): number {
  if (eventos.length === 0) return 0;
  const fuerza = Math.abs(eventos.reduce((acc, e) => acc * e.multiplier, 1) - 1);
  const promedioConf = eventos.reduce((a, e) => a + e.confianza, 0) / eventos.length;
  const mejora = fuerza * promedioConf * 100;
  return Math.min(35, Math.round(mejora));
}
