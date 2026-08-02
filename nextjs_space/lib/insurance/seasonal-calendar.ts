/**
 * Catálogo determinístico de eventos estacionales del vertical Seguros.
 *
 * Define las "ventanas MMDD" (mes*100 + día) por las que sabemos que la
 * prima emitida suele inflarse: Semana Santa, Vuelta al Cole, Fin de Año,
 * Buen Fin, Verano, Renovación de ramo Salud. Se complementa con
 * `seasonal-multiplier.ts` que aprende el factor real desde históricos.
 *
 * Por qué determinístico y no dinámico: las aseguradoras necesitan una
 * referencia estable para comparar entre años. Si la ventana se moviese,
 * el multiplier aprendido se ensuciaría con solapes. La excepción es
 * Semana Santa, que es móvil — se computa en runtime con la fórmula de
 * Gauss (luna pascual + offset).
 *
 * Multipliers por defecto (cuando NO hay histórico):
 *   1.30 = pico típico de 30% sobre baseline
 * El valor real (learned) pesa más cuando hay ≥2 muestras.
 */

export interface SeasonalEvent {
  /** Identificador semántico, única por evento. */
  key: string;
  /** Nombre humano para la UI. */
  nombre: string;
  /** Categoría para agrupar en dashboard. */
  categoria: 'religious' | 'commercial' | 'academic' | 'season';
  /** Ramo predominante al que afecta (null = general). */
  ramo: 'AUTO' | 'HOGAR' | 'VIDA' | 'SALUD' | 'GASTOS_MEDICOS' | 'EMPRESARIAL' | 'RESPONSABILIDAD_CIVIL' | null;
  /** Ventana fija del evento como un par [mes*100+día inicio, fin]. */
  ventanaMd: [number, number];
  /** Multiplier base cuando NO hay histórico (siempre 1.0 si no hay pico). */
  multiplierDefault: number;
  /** Descripción adicional. */
  descripcion: string;
}

// ─── Eventos fijos (MMDD) ────────────────────────────────────────────────
export const SEASONAL_EVENTS_CATALOG: SeasonalEvent[] = [
  {
    key: 'VUELTA_COLE',
    nombre: 'Vuelta al Cole',
    categoria: 'academic',
    ramo: 'AUTO',
    ventanaMd: [901, 915], // 1–15 septiembre (México: inicio del ciclo escolar)
    multiplierDefault: 1.25,
    descripcion: 'Aumento del 25% en pólizas de auto y escolares al inicio del ciclo escolar.',
  },
  {
    key: 'FIN_ANO',
    nombre: 'Fin de Año',
    categoria: 'season',
    ramo: null,
    // 15 noviembre → 31 diciembre: cubre Black Friday + Buen Fin +年终效应 +年终奖.
    ventanaMd: [1115, 1231],
    multiplierDefault: 1.40,
    descripcion: 'Pico comercial del año: Black Friday, Buen Fin,年终奖 + renovaciones de vida.',
  },
  {
    key: 'BUEN_FIN',
    nombre: 'Buen Fin (México)',
    categoria: 'commercial',
    ramo: 'AUTO',
    ventanaMd: [1115, 1121], // 15–21 noviembre: ventana comercial mexicana
    multiplierDefault: 1.20,
    descripcion: 'Pico comercial mexicano; alza en financiamientos de autos y electrodomésticos.',
  },
  {
    key: 'VERANO',
    nombre: 'Vacaciones de Verano',
    categoria: 'season',
    ramo: 'AUTO',
    ventanaMd: [615, 815], // 15 junio → 15 agosto
    multiplierDefault: 1.15,
    descripcion: 'Mayor uso vehicular y viajes familiares: pólizas de auto y viaje.',
  },
  {
    key: 'RAMO_RENOVACION',
    nombre: 'Renovación Anual de Salud',
    categoria: 'season',
    ramo: 'SALUD',
    ventanaMd: [101, 131], // 1–31 enero (renovación al inicio del año fiscal pólizas)
    multiplierDefault: 1.20,
    descripcion: 'Pólizas de salud y vida con aniversario en enero suelen renovarse justo antes.',
  },
];

/**
 * Calcula la fecha de Domingo de Pascua (computus de Gauss).
 * Devuelve Date en UTC midnight para un año dado. Esto fija el rango de
 * Semana Santa, que es móvil (entre 22-mar y 25-abr).
 */
function paschalSunday(year: number): Date {
  // Algoritmo de Gauss/Meeus para el computus eclesiástico (sirve para años 1583+).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Para un año+región, devuelve las instancias completas de todos los eventos
 * que caen dentro del rango. Semana Santa se computa dinámicamente; los
 * demás se materializan con sus ventanas MMDD.
 */
export interface SeasonalEventInstance extends SeasonalEvent {
  fechaInicio: Date;  // 00:00 UTC
  fechaFin: Date;  // 00:00 UTC (inclusivo)
  fuente: 'static' | 'computed';
}

export function eventosParaRango(
  desde: Date,
  hasta: Date,
  year: number = desde.getUTCFullYear()
): SeasonalEventInstance[] {
  const instancias: SeasonalEventInstance[] = [];

  // Fijos
  for (const ev of SEASONAL_EVENTS_CATALOG) {
    const [m1, d1] = [Math.floor(ev.ventanaMd[0] / 100), ev.ventanaMd[0] % 100];
    const [m2, d2] = [Math.floor(ev.ventanaMd[1] / 100), ev.ventanaMd[1] % 100];
    const inicio = new Date(Date.UTC(year, m1 - 1, d1));
    let fin: Date;
    if (m2 >= m1) {
      fin = new Date(Date.UTC(year, m2 - 1, d2));
    } else {
      // Cruza año: ventana 12→01 (ej. 1215 → 0115). Para este catálogo no
      // ocurre, pero se deja defensivo.
      fin = new Date(Date.UTC(year + 1, m2 - 1, d2));
    }
    if (solapa(desde, hasta, inicio, fin)) {
      instancias.push({ ...ev, fechaInicio: inicio, fechaFin: fin, fuente: 'static' });
    }
  }

  // Semana Santa (móvil): 7 días desde Domingo de Ramos hasta Pascua+1 (Lunes).
  const pascua = paschalSunday(year);
  const ramos = new Date(pascua);
  ramos.setUTCDate(pascua.getUTCDate() - 7); // Domingo de Ramos
  const lunesPascua = new Date(pascua);
  lunesPascua.setUTCDate(pascua.getUTCDate() + 1); // Lunes de Pascua

  // Semana Santa solo si cae dentro del rango pedido (cubrimos ambos años por si preguntan a caballo)
  if (solapa(desde, hasta, ramos, lunesPascua)) {
    instancias.push({
      key: 'SEMANA_SANTA',
      nombre: 'Semana Santa',
      categoria: 'religious',
      ramo: 'AUTO',
      ventanaMd: [
        ramos.getUTCMonth() * 100 + ramos.getUTCDate(),
        lunesPascua.getUTCMonth() * 100 + lunesPascua.getUTCDate(),
      ],
      multiplierDefault: 1.30,
      descripcion: 'Pico de pólizas de viaje y auto por vacaciones religiosas.',
      fechaInicio: ramos,
      fechaFin: lunesPascua,
      fuente: 'computed',
    });
  }

  // Repetir para el año siguiente (cubre rangos a caballo de año nuevo).
  if (year !== hasta.getUTCFullYear()) {
    const next = eventosParaRango(desde, hasta, year + 1);
    // Merge evitando duplicar Semana Santa del mismo año (que dos años generen dos).
    for (const ev of next) {
      if (!instancias.some(i => i.key === ev.key && i.fechaInicio.getUTCFullYear() === ev.fechaInicio.getUTCFullYear())) {
        // Solo añade eventos que tocan el segundo año.
        if (ev.fechaFin.getUTCFullYear() === year + 1 || ev.fechaInicio.getUTCFullYear() === year + 1) {
          instancias.push(ev);
        }
      }
    }
  }

  return instancias.sort((a, b) => a.fechaInicio.getTime() - b.fechaInicio.getTime());
}

function solapa(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1 <= b2 && a2 >= b1;
}

/**
 * Devuelve true cuando al menos uno de los eventos cae dentro del rango
 * [desde, hasta] (próximo mes proyectado). Útil para tests rápidos.
 */
export function hayEventoEnRango(desde: Date, hasta: Date): boolean {
  return eventosParaRango(desde, hasta).length > 0;
}

/**
 * Constantes exportadas para tests y consumo externo.
 */
export const SEASONAL_CONSTANTS = {
  CATALOG: SEASONAL_EVENTS_CATALOG,
} as const;
