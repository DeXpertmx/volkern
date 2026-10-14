/**
 * Choque entre un BLOQUEO de fechas y una estancia ya CONTRATADA — módulo PURO,
 * sin BD.
 *
 * La regla del producto es una: **las fechas vendidas no se cierran**. Un
 * bloqueo (uso del propietario, visita de un familiar, mantenimiento, cierre
 * administrativo, noches cedidas o vendidas a una empresa fuera de canal) resta
 * disponibilidad igual que una reserva —los dos los trata el mismo motor—, pero
 * detrás de la reserva hay un huésped con una confirmación: el bloqueo no puede
 * pasar por encima. Si las noches están vendidas, primero se liberan o se mueven
 * esas reservas, o se bloquea solo lo que está libre.
 *
 * Qué cuenta como «contratada» es la MISMA definición de ocupación del motor de
 * disponibilidad, no una segunda copia (el fallo clásico de este vertical: dos
 * reglas y una de las dos miente):
 *
 *  - Solo las reservas que **aportan producción**: una cancelada o un no-show
 *    liberan sus noches (`aportaProduccion`, `estados.ts`).
 *  - La estancia ocupa `[checkIn, finEstanciaReal)`: el día de salida no ocupa,
 *    y una **salida anticipada libera las noches no usadas** (`finEstanciaReal`,
 *    `checkout.ts`).
 *
 * Los extremos se comparan por **día local** (`startOfDay`), como todo el
 * inventario: comparar instantes haría que una salida a las 11:00 bloqueara la
 * noche siguiente.
 *
 * Lo consumen las tres puertas que cierran fechas —la API de bloqueos (POST y
 * PATCH), el asistente (`registrar_incidencia`) y la pantalla del planning—,
 * para que no exista una variante por puerta.
 */

import { startOfDay, toIsoDate } from './calendar';
import { aportaProduccion } from './estados';
import { finEstanciaReal } from './checkout';

/**
 * Lo mínimo que hace falta saber de una reserva para decidir si estorba.
 *
 * `huesped` es el nombre ya resuelto (la pantalla lo tiene en su modelo); si no
 * viene, se lee de `guestData`/`contact`, que es como lo guarda la reserva.
 */
export interface ReservaContratada {
  id: string;
  estado: string;
  checkIn: Date;
  checkOut: Date;
  checkOutReal?: Date | null;
  channel?: string | null;
  externalBookingId?: string | null;
  huesped?: string | null;
  guestData?: unknown;
  contact?: { nombre?: string | null } | null;
}

/** Un choque listo para la respuesta de la API y para pintarlo en la pantalla. */
export interface ChoqueBloqueo {
  id: string;
  /** Canal, referencia y huésped en una línea. */
  etiqueta: string;
  canal: string | null;
  referencia: string | null;
  huesped: string | null;
  /** Primera noche ocupada (ISO). */
  desde: string;
  /** Día de salida (ISO) — **exclusivo**, como `fechaFin` de un bloqueo. */
  hasta: string;
  estado: string;
}

/** Las noches de `[inicio, fin)`, en días locales, como fechas ISO. */
export function nochesDeRango(inicio: Date, fin: Date): string[] {
  const noches: string[] = [];
  const cursor = startOfDay(inicio);
  const hasta = startOfDay(fin).getTime();
  while (cursor.getTime() < hasta) {
    noches.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return noches;
}

function nombreDeReserva(reserva: ReservaContratada): string | null {
  if (typeof reserva.huesped === 'string' && reserva.huesped.trim()) {
    return reserva.huesped.trim();
  }
  const datos = reserva.guestData as
    | { firstName?: string | null; lastName?: string | null; guestName?: string | null }
    | null
    | undefined;
  const compuesto = [datos?.firstName, datos?.lastName]
    .map((parte) => (typeof parte === 'string' ? parte.trim() : ''))
    .filter(Boolean)
    .join(' ');
  const nombre = compuesto || datos?.guestName?.trim() || reserva.contact?.nombre?.trim() || '';
  return nombre || null;
}

/** «booking.com · 5084548141 · Mohamed» — lo que identifica la reserva al operador. */
export function etiquetaReserva(reserva: ReservaContratada): string {
  const partes = [reserva.channel, reserva.externalBookingId, nombreDeReserva(reserva)]
    .map((parte) => (typeof parte === 'string' ? parte.trim() : ''))
    .filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : 'Reserva';
}

/** El rango que ocupa una reserva para la ocupación: `[checkIn, fin real)`. */
function rangoOcupado(reserva: ReservaContratada): { desde: number; hasta: number } {
  return {
    desde: startOfDay(reserva.checkIn).getTime(),
    hasta: startOfDay(finEstanciaReal(reserva.checkOut, reserva.checkOutReal)).getTime(),
  };
}

/**
 * Las reservas contratadas del rango, en el orden en que llegan.
 *
 * Un rango vacío o invertido no choca con nada: no es un bloqueo válido (la API
 * responde 400 con eso) y aquí no se inventa un choque.
 */
export function reservasQueChocan(
  reservas: readonly ReservaContratada[],
  inicio: Date,
  fin: Date
): ReservaContratada[] {
  const desde = startOfDay(inicio).getTime();
  const hasta = startOfDay(fin).getTime();
  if (hasta <= desde) return [];
  return reservas.filter((reserva) => {
    if (!aportaProduccion(reserva.estado)) return false;
    const ocupado = rangoOcupado(reserva);
    return ocupado.desde < hasta && ocupado.hasta > desde;
  });
}

/** Las noches CONCRETAS del rango que ya están vendidas (ISO), sin repetir. */
export function nochesVendidas(
  reservas: readonly ReservaContratada[],
  inicio: Date,
  fin: Date
): string[] {
  const chocan = reservasQueChocan(reservas, inicio, fin);
  if (chocan.length === 0) return [];
  return nochesDeRango(inicio, fin).filter((noche) => {
    const dia = startOfDay(new Date(`${noche}T00:00:00`)).getTime();
    return chocan.some((reserva) => {
      const ocupado = rangoOcupado(reserva);
      return ocupado.desde <= dia && ocupado.hasta > dia;
    });
  });
}

/**
 * Los choques ya formateados para la respuesta (`conflicto`) y para la
 * pantalla: con el rango de la ESTANCIA completa —que puede sobresalir del
 * bloqueo— para que el operador sepa hasta cuándo tiene que esperar.
 */
export function choquesParaRespuesta(
  reservas: readonly ReservaContratada[],
  inicio: Date,
  fin: Date
): ChoqueBloqueo[] {
  return reservasQueChocan(reservas, inicio, fin).map((reserva) => {
    const ocupado = rangoOcupado(reserva);
    return {
      id: reserva.id,
      etiqueta: etiquetaReserva(reserva),
      canal: reserva.channel ?? null,
      referencia: reserva.externalBookingId ?? null,
      huesped: nombreDeReserva(reserva),
      desde: toIsoDate(new Date(ocupado.desde)),
      hasta: toIsoDate(new Date(ocupado.hasta)),
      estado: reserva.estado,
    };
  });
}

function listar(noches: readonly string[], tope = 4): string {
  const visibles = noches.slice(0, tope).join(', ');
  return noches.length > tope ? `${visibles} y ${noches.length - tope} más` : visibles;
}

/**
 * El texto que lee el operador. Dice las TRES cosas que hacen falta para
 * resolverlo: cuántas noches están vendidas (las fechas), quién las tiene y qué
 * se puede hacer — liberar o mover la reserva, o cerrar solo lo libre.
 */
export function mensajeConflictoBloqueo(
  choques: readonly ChoqueBloqueo[],
  noches: readonly string[] = []
): string {
  if (choques.length === 0) return '';
  const cuantas = choques.length === 1 ? 'una reserva' : `${choques.length} reservas`;
  const fechas = noches.length > 0 ? ` (${listar(noches)})` : '';
  const detalle = choques
    .slice(0, 3)
    .map((choque) => `${choque.etiqueta} del ${choque.desde} al ${choque.hasta}`)
    .join('; ');
  const resto = choques.length > 3 ? ` y ${choques.length - 3} más` : '';
  return (
    `No se puede cerrar ese rango: ya hay ${cuantas} en esas fechas${fechas} — ${detalle}${resto}. ` +
    'Libera o mueve esas reservas, o bloquea solo las noches libres.'
  );
}
