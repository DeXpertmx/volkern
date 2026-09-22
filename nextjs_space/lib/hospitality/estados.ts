/**
 * Estados de una reserva y sus reglas transversales — módulo puro, sin BD.
 *
 * Una reserva **cancelada o no-show no produce ingreso ni ocupación**: no
 * bloquea la unidad, no entra en las analíticas, no se puede cobrar y no suma
 * en los totales del huésped. Es la regla que el plan repite en Finanzas,
 * Reportes y el planning; vivía copiada literalmente en una decena de sitios
 * (y de ahí salían las variantes: unas partes excluían el no-show y otras no).
 *
 * Hay TRES preguntas distintas sobre el estado —no una—, y cada una tiene aquí
 * su única definición:
 *
 *  1. `aportaProduccion` — ¿ocupa y factura? Excluye cancelada y no-show.
 *  2. `esReservaViva` — ¿la estancia sigue en curso? Excluye también
 *     `checked_out`: una estancia terminada no está «activa» aunque sus fechas
 *     cubran el día.
 *  3. `esMovimientoDelDia` — ¿pudo haber llegada/salida ese día? Solo la
 *     cancelada carece de movimiento.
 *
 * Confundirlas fue la causa de que el mismo día diera respuestas distintas: el
 * motor bloqueaba la unidad por una reserva que el panel de operaciones ya daba
 * por terminada, y «llegadas de hoy» contaba distinto en el dashboard y en los
 * reportes. `docs/hospitality-estados-auditoria.md` tiene la matriz completa.
 */

/** Estados válidos de una reserva (mismo vocabulario en toda la vertical). */
export const ESTADOS_RESERVA = [
  'pending',
  'confirmed',
  'cancelled',
  'checked_in',
  'checked_out',
  'no_show',
] as const;

export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

/**
 * Estados que no producen producción (ni ocupación, ni ingreso, ni cobro).
 * El vocabulario es el de la reserva; «no-show» es una cancelación de hecho.
 */
export const ESTADOS_SIN_PRODUCCION = ['cancelled', 'no_show'] as const;

/**
 * ¿La reserva aporta producción (ocupa y factura)?
 * Acepta cualquier string porque los estados llegan de la BD y del webhook.
 */
export function aportaProduccion(estado: string | null | undefined): boolean {
  if (!estado) return false;
  return !(ESTADOS_SIN_PRODUCCION as readonly string[]).includes(estado);
}

/** Lista lista para un `notIn` de Prisma. */
export function estadosSinProduccion(): string[] {
  return [...ESTADOS_SIN_PRODUCCION];
}

/** Lista lista para un `in` de Prisma: los estados que sí producen. */
export function estadosConProduccion(): string[] {
  return ESTADOS_RESERVA.filter((e) => aportaProduccion(e));
}

/**
 * Estados de una reserva **en curso**: la estancia no ha terminado.
 *
 * NO es la regla de ocupación: `checked_out` es una estancia terminada (no
 * está viva) aunque sus fechas cubran el día; y una reserva viva sí ocupa
 * (`aportaProduccion`).
 *
 * Se usa para lo que pregunta «¿qué hay activo?», no «¿está ocupada la
 * unidad?»: las reservas activas del dashboard, el preview de un deshacer de
 * vínculo y la reconciliación de reservas vivas contra el proveedor.
 */
export const ESTADOS_RESERVA_VIVA = ['pending', 'confirmed', 'checked_in'] as const;

/** ¿La estancia sigue en curso (no terminada, no cancelada, no no-show)? */
export function esReservaViva(estado: string | null | undefined): boolean {
  if (!estado) return false;
  return (ESTADOS_RESERVA_VIVA as readonly string[]).includes(estado);
}

/**
 * Estados en los que la reserva pudo tener movimiento ese día (llegada o
 * salida): todos menos la cancelada.
 *
 * El **no-show sí cuenta como llegada** —fue un huésped esperado, y la tasa de
 * no-show necesita el no-show en el denominador (`noShows / llegadas`)—, pero
 * no ocupa ni factura. Por eso esta pregunta es distinta de `aportaProduccion`.
 */
export const ESTADOS_CON_MOVIMIENTO = [
  'pending',
  'confirmed',
  'checked_in',
  'checked_out',
  'no_show',
] as const;

/** ¿La reserva pudo tener llegada/salida ese día? (La cancelada, no.) */
export function esMovimientoDelDia(estado: string | null | undefined): boolean {
  if (!estado) return false;
  return (ESTADOS_CON_MOVIMIENTO as readonly string[]).includes(estado);
}

/** Lista lista para un `notIn` de Prisma: estados que no fueron movimiento. */
export function estadosSinMovimiento(): string[] {
  return ESTADOS_RESERVA.filter((e) => !esMovimientoDelDia(e));
}

/** ¿Es un estado de reserva válido? Una sola lista para validar en las APIs. */
export function esEstadoValido(estado: unknown): estado is EstadoReserva {
  return typeof estado === 'string' && (ESTADOS_RESERVA as readonly string[]).includes(estado);
}
