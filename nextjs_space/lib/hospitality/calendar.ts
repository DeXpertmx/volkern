/**
 * Lógica del planning calendar de Hospitality (módulo PURO, sin BD).
 *
 * Reglas del plan maestro (sección 8 y 9):
 * - Check-in 10 / check-out 15 ocupa las noches 10, 11, 12, 13, 14.
 *   El día de check-out NO se ocupa.
 * - Una reserva es una entidad visual continua: NUNCA dividir en bloques
 *   diarios (no crear 5 bloques para una estancia de 5 noches).
 * - El bloque comienza en check-in y termina el día anterior a check-out.
 * - Agrupación por unidad (filas) y columnas de días.
 *
 * Las preguntas sobre el estado se responden con el vocabulario de
 * `./estados`, no con listas propias: «ocupa» es `aportaProduccion` y
 * «llegó/salió» es `esMovimientoDelDia` (el no-show llegó, pero no ocupa).
 * El fin de la estancia es el REAL (`finEstanciaReal`, módulo `./checkout`):
 * una salida anticipada libera las noches no usadas aquí igual que en el
 * motor de disponibilidad — misma coherencia que ya tiene la analítica.
 */

import { aportaProduccion, esMovimientoDelDia } from './estados';
import { finEstanciaReal } from './checkout';

export interface CalendarReservation {
  id: string;
  unitId: string | null;
  unitNombre: string | null;
  propertyId: string;
  channel: string;
  guestName: string | null;
  email: string | null;
  phone: string | null;
  estado: string;
  checkIn: Date;
  checkOut: Date;
  /** Salida real registrada (política B del apagador de salida anticipada). */
  checkOutReal?: Date | null;
  nights: number;
  amountAfterTax: number | null;
  currency: string | null;
  specialRequests: string | null;
  externalBookingId: string;
}

export interface CalendarUnit {
  id: string;
  nombre: string;
  codigo: string | null;
  propertyId: string;
  /** Publicada en la columna del planning (aforo junto al código). */
  capacidad?: number | null;
  /** Respaldo del precio por día cuando la unidad no tiene plan de tarifa. */
  tarifaBase?: number | null;
  moneda?: string | null;
}

export interface CalendarDay {
  /** ISO yyyy-MM-dd (clave del mapa). */
  key: string;
  date: Date;
  label: string; // "Lun 10"
  isToday: boolean;
  isWeekend: boolean;
  /** Día anterior a hoy: celdas sombreadas y sin precio en el planning. */
  isPast: boolean;
}

export interface CalendarReservationBlock {
  reservation: CalendarReservation;
  unitId: string;
  /** Índice del día de check-in dentro del rango visible. */
  startCol: number;
  /** Número de columnas que ocupa (intersección con el rango visible). */
  colSpan: number;
  /** Noches totales de la estancia (sin truncar). */
  totalNights: number;
  /** La estancia continúa más allá del rango visible. */
  continuesLeft: boolean;
  continuesRight: boolean;
}

/**
 * Normaliza una fecha a medianoche local (sin horas).
 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * La ventana de UN día local completo [00:00, 00:00+1) — la unidad de «día»
 * del módulo. Una sola definición para todo lo que cuenta por días: el
 * planning que pinta días, el CSV que exporta fechas, el filtro de
 * «llegadas/salidas de hoy» de reservas y el tablón de mañana del dashboard.
 */
export function ventanaDeDiaLocal(d: Date): { inicio: Date; fin: Date } {
  const inicio = startOfDay(d);
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio, fin };
}

/**
 * Noches de una estancia: diferencia de días entre check-in y check-out.
 * Check-in 10 / check-out 15 → 5 noches.
 */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const start = startOfDay(checkIn).getTime();
  const end = startOfDay(checkOut).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/**
 * Genera el rango de días visibles (desde fecha inicio hasta fecha fin, ambos
 * inclusive) como columnas del planning.
 */
export function buildDays(start: Date, end: Date, today?: Date): CalendarDay[] {
  const days: CalendarDay[] = [];
  const cursor = startOfDay(start);
  const last = startOfDay(end);
  const refToday = today ? startOfDay(today) : startOfDay(new Date());

  while (cursor.getTime() <= last.getTime()) {
    const dow = cursor.getDay();
    days.push({
      key: toIsoDate(cursor),
      date: new Date(cursor),
      label: `${shortDay(dow)} ${cursor.getDate()}`,
      isToday: cursor.getTime() === refToday.getTime(),
      isWeekend: dow === 0 || dow === 6,
      isPast: cursor.getTime() < refToday.getTime(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Posiciona las reservas dentro del rango visible, agrupadas por unidad.
 *
 * - startCol: columna del check-in (0 = primer día visible).
 * - colSpan: intersección de la estancia con el rango visible; mínimo 1.
 * - La estancia que empieza antes del rango o termina después se marca
 *   continuesLeft/continuesRight (el bloque se recorta pero NO se divide).
 */
export function layoutReservations(
  reservations: CalendarReservation[],
  days: CalendarDay[]
): Map<string, CalendarReservationBlock[]> {
  const dayKeys = days.map((d) => d.key);
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));
  const firstDay = startOfDay(days[0]?.date ?? new Date());
  const lastDay = startOfDay(days[days.length - 1]?.date ?? new Date());

  const byUnit = new Map<string, CalendarReservationBlock[]>();

  for (const r of reservations) {
    if (!r.unitId) continue; // reservas sin unidad no se posicionan en planning
    const checkIn = startOfDay(r.checkIn);
    const checkOut = startOfDay(r.checkOut);

    // Fuera del rango visible por completo → ignorar
    if (checkOut.getTime() <= firstDay.getTime()) continue;
    if (checkIn.getTime() > lastDay.getTime()) continue;

    // Columna de inicio: día del check-in, clamp al rango
    let startCol = dayIndex.get(toIsoDate(checkIn));
    let continuesLeft = false;
    if (startCol === undefined) {
      // Check-in antes del rango visible
      if (checkIn.getTime() < firstDay.getTime()) {
        startCol = 0;
        continuesLeft = true;
      } else {
        continue; // fuera por el final
      }
    }

    // Columna final (exclusiva): día del check-out, clamp al rango
    let endCol = dayIndex.get(toIsoDate(checkOut));
    let continuesRight = false;
    if (endCol === undefined) {
      if (checkOut.getTime() > lastDay.getTime()) {
        endCol = days.length;
        continuesRight = true;
      } else {
        endCol = startCol + 1; // raro: checkout dentro de un día no visible
      }
    }

    const colSpan = Math.max(1, endCol - startCol);
    const totalNights = nightsBetween(r.checkIn, r.checkOut);

    const list = byUnit.get(r.unitId) || [];
    list.push({
      reservation: r,
      unitId: r.unitId,
      startCol,
      colSpan,
      totalNights,
      continuesLeft,
      continuesRight,
    });
    byUnit.set(r.unitId, list);
  }

  return byUnit;
}

/**
 * Rango de días del mes que contiene `ref` (lunes a domingo, 4-6 semanas).
 * Devuelve el primer día visible y el número de días para la cuadrícula.
 */
export function buildMonthGrid(ref?: Date): { start: Date; end: Date; days: CalendarDay[] } {
  const base = ref ? startOfDay(ref) : startOfDay(new Date());
  const firstOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  // 0 = domingo; offset para que la semana empiece en lunes
  const lead = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(1 - lead);
  // Celdas: lead (relleno) + días del mes, redondeado a semanas completas
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const end = new Date(start);
  end.setDate(start.getDate() + totalCells - 1);
  return { start, end, days: buildDays(start, end, ref) };
}

/** ISO local yyyy-MM-dd (sin desfase UTC). */
/**
 * La fecha LOCAL de un día en forma `YYYY-MM-DD` — la que usan las APIs de
 * bloqueos, los filtros y el propio calendario.
 *
 * Devuelve `null` si no encaja en vez de inventar una fecha: `new Date('2026-02-31')`
 * da una fecha válida en JavaScript, y un «31 de febrero» no es un día.
 */
export function fechaDeIso(iso: unknown): Date | null {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const fecha = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return null;
  // Ida y vuelta: descarta días que no existen (31 de febrero) y horas raras.
  return toIsoDate(fecha) === iso ? fecha : null;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Semana por defecto: lunes a domingo de la semana actual. */
export function currentWeekRange(today?: Date): { start: Date; end: Date } {
  const ref = today ? startOfDay(today) : startOfDay(new Date());
  const dow = (ref.getDay() + 6) % 7; // 0=lunes
  const start = new Date(ref);
  start.setDate(ref.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

const SHORT_DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function shortDay(dow: number): string {
  return SHORT_DAYS[dow];
}

/**
 * Colores y etiquetas por canal. La lista exacta se deriva de los datos reales;
 * los canales conocidos tienen identidad visual reconocible y el resto un
 * fallback consistente.
 */
export interface ChannelStyle {
  label: string;
  /** Clases tailwind para el bloque. */
  block: string;
  /** Color hex para leyenda/bordes. */
  color: string;
}

export function channelStyle(channel: string): ChannelStyle {
  const c = (channel || '').toLowerCase();
  if (c.includes('airbnb')) return { label: 'Airbnb', color: '#FF5A5F', block: 'bg-[#FF5A5F] text-white' };
  if (c.includes('booking') || c.includes('booking.com')) return { label: 'Booking.com', color: '#003580', block: 'bg-[#003580] text-white' };
  if (c.includes('expedia')) return { label: 'Expedia', color: '#00355F', block: 'bg-[#00355F] text-white' };
  if (c.includes('agoda')) return { label: 'Agoda', color: '#DF7A00', block: 'bg-[#DF7A00] text-white' };
  if (c === 'direct' || c.includes('directa') || c.includes('volkern')) return { label: 'Directa', color: '#4F46E5', block: 'bg-[#4F46E5] text-white' };
  return { label: channel || 'Canal', color: '#64748B', block: 'bg-slate-500 text-white' };
}

/** Estados con estilo visual para la leyenda y el bloque. */
export const RESERVATION_STATUS: Record<string, { label: string; dot: string }> = {
  pending: { label: 'Pendiente', dot: 'bg-amber-400' },
  confirmed: { label: 'Confirmada', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelada', dot: 'bg-red-500' },
  checked_in: { label: 'Check-in', dot: 'bg-blue-500' },
  checked_out: { label: 'Check-out', dot: 'bg-slate-400' },
  no_show: { label: 'No show', dot: 'bg-zinc-500' },
};

export function statusLabel(estado: string): string {
  return RESERVATION_STATUS[estado]?.label || estado;
}

/**
 * Reservas que llegan o salen en una fecha concreta (para la vista Mes y
 * el Operations Board).
 *
 * Es la pregunta «¿hubo movimiento?» (`esMovimientoDelDia`): una reserva
 * cancelada no llegó ni salió —nunca existió—, pero un **no-show sí figura
 * como llegada del día** (fue un huésped esperado; es el mismo criterio con el
 * que los reportes calculan la tasa de no-show).
 */
export function arrivalsOn(reservations: CalendarReservation[], dayKey: string): CalendarReservation[] {
  return reservations.filter(
    (r) => esMovimientoDelDia(r.estado) && toIsoDate(r.checkIn) === dayKey
  );
}

export function departuresOn(reservations: CalendarReservation[], dayKey: string): CalendarReservation[] {
  return reservations.filter(
    (r) => esMovimientoDelDia(r.estado) && toIsoDate(r.checkOut) === dayKey
  );
}

/**
 * Mini-bloques por día para la vista Mes: reservas que OCUPAN cada fecha.
 *
 * Es ocupación, no movimiento: la decide la regla de producción
 * (`aportaProduccion`) más la del plan (check-out no ocupa su día). Un no-show
 * no pinta la noche como ocupada — el motor de disponibilidad ya la da por
 * libre y los canales la están vendiendo.
 *
 * El fin es el REAL (`finEstanciaReal` = `min(checkOut, checkOutReal)`, módulo
 * `./checkout`): con salida anticipada —pise A o anote B— la vista Mes deja de
 * pintar como ocupadas las noches que el motor ya publica como disponibles.
 */
export function reservationsOnDay(
  reservations: CalendarReservation[],
  dayKey: string
): CalendarReservation[] {
  const d = startOfDay(new Date(dayKey + 'T00:00:00'));
  return reservations
    .filter((r) => aportaProduccion(r.estado))
    .filter((r) => {
      const inDay = startOfDay(r.checkIn);
      const finReal = startOfDay(finEstanciaReal(r.checkOut, r.checkOutReal));
      return inDay.getTime() <= d.getTime() && finReal.getTime() > d.getTime();
    });
}

/**
 * Agrupa reservas activas por día del rango (para la vista Mes).
 * Clave: ISO yyyy-MM-dd → reservas que ocupan esa noche.
 */
export function occupancyByDay(
  reservations: CalendarReservation[],
  days: CalendarDay[]
): Map<string, CalendarReservation[]> {
  const map = new Map<string, CalendarReservation[]>();
  for (const day of days) {
    map.set(day.key, reservationsOnDay(reservations, day.key));
  }  return map;
}
