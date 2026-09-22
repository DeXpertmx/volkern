/**
 * Hoja imprimible de housekeeping — módulo PURO.
 *
 * La lista del día de recepción, pero para quien trabaja en pasillo, no frente
 * a la pantalla: qué unidad se limpia, a qué hora llega o sale el huésped y
 * qué nota lleva. La misma lista que ya filtra la pantalla (y que exporta el
 * CSV), resuelta aquí solo para leerla sobre papel.
 *
 * Lo que NO es esta hoja: una lista de tareas nueva. Las tareas de limpieza
 * viven en `HospitalityCleaningTask` (se crean solas al check-out, con sus
 * notas y su responsable); la hoja las RESUME por unidad, no las duplica.
 *
 * Los horarios son la convención de la vertical (documentada en
 * `lib/hospitality/analytics.ts` y en `lib/hospitality/checkout.ts`): la
 * llegada es a las 15:00 y la salida a las 11:00 — la hora con la que el
 * producto guarda las fechas al crear una reserva y la única definición de
 * «hora prevista» que hay en el sistema.
 */

/** Hora prevista de llegada (convención de la vertical). */
export const HORA_LLEGADA = '15:00';
/** Hora prevista de salida (convención de la vertical). */
export const HORA_SALIDA = '11:00';
/**
 * Hora CONVENCIONAL de llegada, para el respaldo del papel: cuando el huésped
 * respondió la pregunta de hora estimada, la fila dice LA DEL HUÉSPED y esta
 * queda nombrada como lo que es — la hora de siempre, no la real.
 */
export const HORA_LLEGADA_ETIQUETA = `Hora prevista ${HORA_LLEGADA} · si el huésped dio una hora, esa manda`;

/** Unidad con sus tareas de limpieza, tal como la trae la ruta. */
export interface UnidadConLimpieza {
  nombre?: string | null;
  codigo?: string | null;
  estado?: string | null; // available|occupied|cleaning|dirty|maintenance|out_of_service
  cleaningTasks?: Array<{ estado: string; notas: string | null }>;
}

/** Reserva ya resuelta por la ruta (los nombres ya vienen compuestos). */
export interface ReservaParaHoja {
  referencia: string;
  huesped: string;
  unidad: UnidadConLimpieza | null;
  checkIn: Date | string;
  checkOut: Date | string;
  occupancyAdults: number;
  occupancyChildren: number;
  /** Llegada de hoy sin parte (la urgencia de recepción, heredada tal cual). */
  partePendiente: boolean;
  parteDetalle: string;
  /**
   * Hora estimada que respondió el huésped (HH:MM) o null: la resuelve la ruta
   * con `horaEstimadaLlegadaDe` — aquí solo viaja para no recalcular en el papel.
   */
  horaEstimada: string | null;
}

/** Una fila del papel: lo que housekeeping lee de un vistazo. */
export interface FilaHousekeeping {
  referencia: string;
  unidad: string;
  huesped: string;
  /** La hora del papel: la del huésped si la dio; si no, la convención. */
  hora: string;
  /** ¿La hora viene del huésped? La fila la destaca y la sección lo nombra. */
  horaDelHuesped: boolean;
  noches: number;
  /** «2 adultos · 1 niño» — para preparar la unidad. */
  ocupantes: string;
  /** Limpieza que la unidad necesita hoy. */
  limpiezaPendiente: boolean;
  /** Nota de la tarea de limpieza viva, tal cual la escribió el sistema. */
  limpiezaNotas: string;
  partePendiente: boolean;
  parteDetalle: string;
}

export interface HojaHousekeeping {
  fecha: string; // AAAA-MM-DD del día que se imprime
  hotel: string;
  generadoEl: string;
  llegadas: FilaHousekeeping[];
  salidas: FilaHousekeeping[];
  /** Encabezado del papel: «3 llegadas · 2 salidas · 3 limpiezas». */
  resumen: string;
}

const ESTADOS_LIMPIEZA_PENDIENTE = ['pending', 'in_progress'];

/**
 * ¿La unidad necesita limpieza hoy? Lo dicen dos fuentes y basta una: el
 * estado de la unidad (`dirty`/`cleaning`) o una tarea viva del sistema.
 * La nota es la de la tarea viva — la que housekeeping tiene que leer.
 */
export function limpiezaDeUnidad(unidad: UnidadConLimpieza | null | undefined): {
  pendiente: boolean;
  notas: string;
} {
  if (!unidad) return { pendiente: false, notas: '' };
  const tareas = unidad.cleaningTasks ?? [];
  const viva = tareas.find((t) => ESTADOS_LIMPIEZA_PENDIENTE.includes(t.estado));
  const notas = (viva?.notas ?? '').trim();
  const pendiente = unidad.estado === 'dirty' || unidad.estado === 'cleaning' || Boolean(viva);
  return { pendiente, notas };
}

/** «2 adultos · 1 niño» — lo que housekeeping necesita para preparar la unidad. */
export function ocupantesDe(adultos: number, ninos: number): string {
  const a = Math.max(1, Number(adultos) || 0);
  const n = Math.max(0, Number(ninos) || 0);
  const partes = [`${a} adulto${a === 1 ? '' : 's'}`];
  if (n > 0) partes.push(`${n} niño${n === 1 ? '' : 's'}`);
  return partes.join(' · ');
}

function nochesDe(checkIn: Date | string, checkOut: Date | string): number {
  const ci = new Date(checkIn).getTime();
  const co = new Date(checkOut).getTime();
  if (Number.isNaN(ci) || Number.isNaN(co)) return 0;
  return Math.max(0, Math.round((co - ci) / 86_400_000));
}

function filaDe(reserva: ReservaParaHoja, hora: string): FilaHousekeeping {
  const limpieza = limpiezaDeUnidad(reserva.unidad);
  const delHuesped = Boolean(reserva.horaEstimada);
  return {
    referencia: reserva.referencia ?? '',
    unidad: reserva.unidad?.nombre || reserva.unidad?.codigo || '',
    huesped: reserva.huesped || '',
    hora: delHuesped ? reserva.horaEstimada! : hora,
    horaDelHuesped: delHuesped,
    noches: nochesDe(reserva.checkIn, reserva.checkOut),
    ocupantes: ocupantesDe(reserva.occupancyAdults, reserva.occupancyChildren),
    limpiezaPendiente: limpieza.pendiente,
    limpiezaNotas: limpieza.notas,
    partePendiente: Boolean(reserva.partePendiente),
    parteDetalle: reserva.parteDetalle ?? '',
  };
}

/** La urgencia delante; dentro de cada grupo, por unidad (pasillo, no pantalla). */
function urgentePrimero(a: FilaHousekeeping, b: FilaHousekeeping): number {
  if (a.partePendiente !== b.partePendiente) return a.partePendiente ? -1 : 1;
  return a.unidad.localeCompare(b.unidad);
}

/**
 * La hoja completa a partir de las reservas del día (la ruta las trae con la
 * MISMA where que el listado y el CSV: sin segundo criterio). Las limpiezas
 * se cuentan sobre las unidades implicadas del día — es el volumen de trabajo
 * del equipo, no el total de tareas abiertas del hotel.
 */
export function construirHojaHousekeeping(input: {
  fecha: string;
  hotel: string;
  generadoEl: string;
  llegadas: ReservaParaHoja[];
  salidas: ReservaParaHoja[];
}): HojaHousekeeping {
  // Con hora del huésped, la llegada se adelanta a su sitio: el papel ordena
  // por hora real de trabajo, no por la convención. Las que no la dieron
  // quedan después, a su hora de siempre.
  const llegadas = input.llegadas
    .map((r) => filaDe(r, HORA_LLEGADA))
    .sort((a, b) => a.hora.localeCompare(b.hora) || urgentePrimero(a, b));
  const salidas = input.salidas.map((r) => filaDe(r, HORA_SALIDA)).sort(urgentePrimero);
  const unidadesConLimpieza = new Set<string>();
  for (const f of [...llegadas, ...salidas]) {
    if (f.limpiezaPendiente) unidadesConLimpieza.add(f.unidad);
  }
  const limpiezas = unidadesConLimpieza.size;
  return {
    fecha: input.fecha,
    hotel: input.hotel,
    generadoEl: input.generadoEl,
    llegadas,
    salidas,
    resumen: `${llegadas.length} llegada${llegadas.length === 1 ? '' : 's'} · ${salidas.length} salida${salidas.length === 1 ? '' : 's'} · ${limpiezas} limpieza${limpiezas === 1 ? '' : 's'}`,
  };
}
