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
 */

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
}

export interface CalendarDay {
  /** ISO yyyy-MM-dd (clave del mapa). */
  key: string;
  date: Date;
  label: string; // "Lun 10"
  isToday: boolean;
  isWeekend: boolean;
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

/** ISO local yyyy-MM-dd (sin desfase UTC). */
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