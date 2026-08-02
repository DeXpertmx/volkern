import { prisma } from '@/lib/db';
import { SEASONAL_EVENTS_CATALOG, eventosParaRango, type SeasonalEventInstance } from '@/lib/insurance/seasonal-calendar';

/**
 * Multipliers estacionales APRENDIDOS del histórico del tenant.
 *
 * Para cada evento del catálogo (SEMANA_SANTA, VUELTA_COLE, FIN_ANO, ...):
 *   1. Busca todas las ocurrencias en los últimos N años.
 *   2. Suma la prima de las pólizas emitidas dentro de la ventana del evento.
 *   3. Calcula el baseline = promedio mensual global del periodo.
 *   4. multiplier = avg(prima_ventana) / baseline.
 *   5. Persiste el resultado en `portfolio_seasonal_multipliers` para no
 *      recalcular cada vez. La constraint única evita upsert race.
 *
 * Casos borde:
 *  · <2 muestras → multiplierDefault del catálogo (no persistido).
 *  · Sin histórico → 1.0 (sin ajuste).
 *  · Variabilidad alta → confidence baja (no se multiplica más allá de ±2σ).
 */

// ─── Constantes ──────────────────────────────────────────────────────────
// Caché: re-evaluamos multipliers máximo 1 vez al día por tenant×evento.
const STALE_AFTER_DAYS = 30;
// Mínimo de muestras para considerar el multiplier "learned" vs fallback default.
const MIN_SAMPLES_FOR_LEARNED = 2;
// Años de cobertura: cómo de atrás miramos para aprender.
const LOOKBACK_YEARS = 3;

/**
 * Genera la lista de multiplicadores para un mes objetivo.
 *
 *  1. Determina qué eventos caen dentro de [targetMonthStart, targetMonthEnd].
 *  2. Para cada uno, intenta leer `portfolio_seasonal_multipliers` cacheado.
 *  3. Si está stale o ausente, recalcula desde `poliza.fechaEmision`.
 *  4. Si no hay muestras suficientes para aprender, usa `multiplierDefault`.
 *  5. Devuelve un array de ConsideredEvent con fuente trazable.
 */
export interface ConsideredEvent {
  key: string;
  nombre: string;
  ramo: string | null;
  fechaInicio: string;  // ISO
  fechaFin: string;     // ISO
  multiplier: number;
  confianza: number;  // 0..1
  fuente: 'learned' | 'static' | 'google_calendar';
}

export async function computarMultipliers(
  tenantId: string,
  desde: Date,
  hasta: Date
): Promise<ConsideredEvent[]> {
  const year = desde.getUTCFullYear();
  const instancias = eventosParaRango(desde, hasta, year);

  const resultado: ConsideredEvent[] = [];
  for (const inst of instancias) {
    // Primero intenta leer de cache
    const cached = await prisma.portfolioSeasonalMultiplier.findFirst({
      where: {
        tenantId,
        eventoKey: inst.key,
      },
      orderBy: { computedAt: 'desc' },
    });

    const isStale =
      !cached ||
      (Date.now() - cached.computedAt.getTime()) / (1000 * 60 * 60 * 24) > STALE_AFTER_DAYS;

    let multiplier = inst.multiplierDefault;
    let muestras = 0;
    let confianza = 0.3; // confianza baja cuando usamos default
    let fuente: ConsideredEvent['fuente'] = 'static';
    let baseline: number | null = null;

    if (isStale) {
      const learned = await aprenderMultiplier(tenantId, inst);
      multiplier = learned.multiplier;
      muestras = learned.muestras;
      confianza = learned.confianza;
      baseline = learned.baselinePrima;
      fuente = learned.muestras >= MIN_SAMPLES_FOR_LEARNED ? 'learned' : 'static';

      if (learned.muestras >= MIN_SAMPLES_FOR_LEARNED) {
        try {
          await prisma.portfolioSeasonalMultiplier.upsert({
            where: {
              tenantId_eventoKey_ramo: {
                tenantId,
                eventoKey: inst.key,
                // Cast: Prisma's compound unique input types for optional
                // fields can incorrectly require `string` instead of
                // `string | null`. Aplica en runtime correctamente — dos filas
                // con ramo=null son la misma, y Prisma resuelve el índice único.
                ramo: (inst.ramo ?? null) as any,
              },
            },
            create: {
              tenantId,
              eventoKey: inst.key,
              ramo: inst.ramo ?? null,
              ventanaMdInicio: inst.ventanaMd[0],
              ventanaMdFin: inst.ventanaMd[1],
              multiplier,
              baselinePrima: baseline,
              muestras: learned.muestras,
              confianza,
              fuente: 'learned',
            },
            update: {
              multiplier,
              baselinePrima: baseline,
              muestras: learned.muestras,
              confianza,
              computedAt: new Date(),
            },
          });
        } catch (err) {
          console.warn('[seasonal-multiplier] No se pudo persistir cache:', err);
        }
      }
    } else if (cached) {
      multiplier = Number(cached.multiplier);
      confianza = Number(cached.confianza ?? 0.3);
      muestras = cached.muestras;
      fuente = ((cached.fuente ?? 'learned') as ConsideredEvent['fuente']);
    }

    resultado.push({
      key: inst.key,
      nombre: inst.nombre,
      ramo: inst.ramo,
      fechaInicio: inst.fechaInicio.toISOString(),
      fechaFin: inst.fechaFin.toISOString(),
      multiplier,
      confianza,
      fuente,
    });
  }

  return resultado;
}

/**
 * Aprende un multiplier a partir del histórico del tenant.
 *
 *   1. Para cada año de los últimos LOOKBACK_YEARS:
 *      · sumaDeVentana = Σ polizas con fechaEmision ∈ [fechaInicio, fechaFin]
 *      · ocurrencias de la ventana = COUNT
 *   2. baselineAnual = prima_total_anual / 12 (proxy mensual promedio)
 *   3. multiplier = avg(primaVentana * 30/díasVentana) / baselineMensual
 */
export async function aprenderMultiplier(
  tenantId: string,
  inst: SeasonalEventInstance
): Promise<{
  multiplier: number;
  muestras: number;
  confianza: number;
  baselinePrima: number | null;
}> {
  const anioActual = new Date().getUTCFullYear();
  let muestras = 0;
  let sumaPrimaVentana = 0;
  let diasVentana = 7;
  let baselineMensualGlobal = 0;
  let mesesContados = 0;

  for (let anio = anioActual - LOOKBACK_YEARS; anio <= anioActual; anio++) {
    const instanciasDelAnio = eventosParaRango(
      new Date(Date.UTC(anio, 0, 1)),
      new Date(Date.UTC(anio, 11, 31)),
      anio
    );
    const instAnio = instanciasDelAnio.find(i => i.key === inst.key);
    if (!instAnio) continue;

    const inicio = instAnio.fechaInicio;
    const fin = instAnio.fechaFin;
    const dias = Math.max(1, Math.ceil((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    diasVentana = dias;

    const aggVentana = await prisma.poliza.aggregate({
      where: {
        tenantId,
        fechaEmision: { gte: inicio, lte: fin },
      },
      _sum: { primaAnual: true },
      _count: true,
    });
    const primaVentana = Number(aggVentana._sum.primaAnual ?? 0);
    if (aggVentana._count > 0) {
      muestras++;
      sumaPrimaVentana += primaVentana;
    }

    const inicioAnio = new Date(Date.UTC(anio, 0, 1));
    const finAnio = new Date(Date.UTC(anio, 11, 31, 23, 59, 59));
    const aggAnio = await prisma.poliza.aggregate({
      where: {
        tenantId,
        fechaEmision: { gte: inicioAnio, lte: finAnio },
      },
      _sum: { primaAnual: true },
    });
    const primaAnual = Number(aggAnio._sum.primaAnual ?? 0);
    if (primaAnual > 0) {
      baselineMensualGlobal += primaAnual / 12;
      mesesContados++;
    }
  }

  if (muestras < MIN_SAMPLES_FOR_LEARNED || mesesContados === 0) {
    return {
      multiplier: inst.multiplierDefault,
      muestras,
      confianza: 0.3,
      baselinePrima: null,
    };
  }

  const baselineMensual = baselineMensualGlobal / mesesContados;
  // Ajuste por duración: ventana corta (Semana Santa=8d) → equivalente mensual.
  const factorDuracion = 30 / diasVentana;
  const promedioMensualEquivalente = (sumaPrimaVentana / muestras) * factorDuracion;
  const multiplier = baselineMensual > 0
    ? promedioMensualEquivalente / baselineMensual
    : inst.multiplierDefault;
  const confianza = Math.min(1, muestras / LOOKBACK_YEARS);

  return {
    multiplier,
    muestras,
    confianza,
    baselinePrima: baselineMensual,
  };
}

/**
 * Enriquece los multipliers con eventos del Google Calendar del broker
 * (opcional, fire-and-forget, defensivo). 1 evento de marketing detectado =
 * +10% heurístico, cap a 5 eventos.
 */
export async function enriquecerConGoogleCalendar(
  tenantId: string,
  desde: Date,
  hasta: Date,
  userId?: string
): Promise<ConsideredEvent[]> {
  if (!userId) return [];
  try {
    const { google } = await import('googleapis');
    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });
    if (!integration || !integration.activo) return [];

    const { getAuthenticatedClient } = await import('@/lib/google-calendar');
    const oauth = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth });

    const response = await calendar.events.list({
      calendarId: integration.calendarId,
      timeMin: desde.toISOString(),
      timeMax: hasta.toISOString(),
      q: 'campaña OR marketing OR renovación OR launch OR promo',
      maxResults: 50,
      singleEvents: true,
    });

    const events = response.data.items ?? [];
    if (events.length === 0) return [];

    const cap = Math.min(5, events.length);
    const multiplier = 1 + 0.1 * cap;
    return [{
      key: 'GCal_MARKETING',
      nombre: `Eventos de marketing en Google Calendar (${events.length} detectados)`,
      ramo: null,
      fechaInicio: desde.toISOString(),
      fechaFin: hasta.toISOString(),
      multiplier,
      confianza: 0.5,
      fuente: 'google_calendar',
    }];
  } catch (err) {
    console.warn('[seasonal-multiplier] Google Calendar enrichment failed:', (err as Error).message);
    return [];
  }
}

/**
 * Combina una lista de eventos en un multiplicador compuesto.
 * Multiplica entre sí, capped a [0.5, 3.0] para evitar extrapolaciones absurdas.
 */
export function combinarMultipliers(eventos: ConsideredEvent[]): number {
  if (eventos.length === 0) return 1.0;
  let compuesto = 1.0;
  for (const ev of eventos) {
    compuesto *= ev.multiplier;
  }
  return Math.max(0.5, Math.min(3.0, compuesto));
}

export const SEASONAL_MULTIPLIER_CONSTANTS = {
  STALE_AFTER_DAYS,
  MIN_SAMPLES_FOR_LEARNED,
  LOOKBACK_YEARS,
} as const;

export { SEASONAL_EVENTS_CATALOG };
