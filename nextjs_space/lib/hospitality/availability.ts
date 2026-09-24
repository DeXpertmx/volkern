/**
 * Availability Engine (plan maestro §15 y §16).
 *
 * Regla fundamental: la disponibilidad mostrada y empujada al exterior se
 * calcula SIEMPRE desde el estado interno de Volkern (reservas activas),
 * nunca consultando al proveedor.
 *
 * - Un día está ocupado si existe una reserva **que produce** cuya estancia lo
 *   cubre. Check-in ocupa su día; check-out NO (plan §8).
 * - «Que produce» es una sola definición, compartida con la analítica y el
 *   resto de la vertical: `aportaProduccion` (§ estados.ts). Cancelada y
 *   **no-show no bloquean la unidad**: una habitación que nadie ocupó vuelve al
 *   inventario vendible, y el no-show sigue siendo un hecho facturable en su
 *   reserva (el bloqueo es de inventario, no de cobro).
 * - La disponibilidad de una unidad es binaria (1 libre / 0 ocupada): las
 *   reservas se asignan a una unidad concreta.
 * - El empuje al exterior agrupa por roomCode (vía ConnectivityMapping):
 *   para cada fecha, disponibilidad = unidades libres de ese tipo.
 */

import { startOfDay, toIsoDate } from './calendar';
import { aportaProduccion, estadosSinProduccion } from './estados';
import { finEstanciaReal } from './checkout';

export interface AvailabilityUnit {
  id: string;
  propertyId: string;
  /** Código externo del tipo de habitación (mapping); null si no hay mapping. */
  roomCode: string | null;
  estado: string;
}

/** Estados que sacan una unidad del inventario vendible (ni se vende ni cuenta). */
export const ESTADOS_FUERA_DE_VENTA = ['maintenance', 'out_of_service'];

export interface ActiveReservationSpan {
  unitId: string | null;
  checkIn: Date;
  checkOut: Date;
  /** Salida real (check-out anticipado, opción B); null si no hubo. */
  checkOutReal?: Date | null;
  estado: string;
}

export interface ActiveUnitBlockSpan {
  unitId: string;
  fechaInicio: Date;
  fechaFin: Date;
  estado: string;
}

/**
 * ¿Una unidad está ocupada en una fecha concreta?
 * Una reserva activa cubre [checkIn, finReal) — el día de salida no cuenta.
 *
 * `finReal` es `min(checkOut, checkOutReal)` vía `finEstanciaReal` (módulo
 * checkout): con salida anticipada, la habitación vacía vuelve a ser vendible
 * desde la salida real. Con `cerrar_estancia` (A) el propio checkOut ya está
 * acortado y esta función es inocua.
 */
export function unitOccupiedOnDay(
  unitId: string,
  day: Date,
  reservations: ActiveReservationSpan[]
): boolean {
  const d = startOfDay(day).getTime();
  return reservations.some((r) => {
    if (!aportaProduccion(r.estado)) return false;
    if (!r.unitId || r.unitId !== unitId) return false;
    const fin = finEstanciaReal(r.checkOut, r.checkOutReal);
    return startOfDay(r.checkIn).getTime() <= d && startOfDay(fin).getTime() > d;
  });
}

/**
 * Disponibilidad diaria de una unidad dentro de un rango [start, end).
 * Devuelve por cada fecha: 1 = libre, 0 = ocupada.
 */
export function unitBlockedOnDay(
  unitId: string,
  day: Date,
  blocks: ActiveUnitBlockSpan[]
): boolean {
  const d = startOfDay(day).getTime();
  return blocks.some((b) => {
    if (b.estado !== 'activo' || b.unitId !== unitId) return false;
    return startOfDay(b.fechaInicio).getTime() <= d && startOfDay(b.fechaFin).getTime() > d;
  });
}

/**
 * Devuelve si la unidad no puede venderse en el día por reserva o bloqueo.
 */
export function unitUnavailableOnDay(
  unitId: string,
  day: Date,
  reservations: ActiveReservationSpan[],
  blocks: ActiveUnitBlockSpan[] = []
): boolean {
  return unitOccupiedOnDay(unitId, day, reservations) || unitBlockedOnDay(unitId, day, blocks);
}

/**
 * Disponibilidad diaria de una unidad dentro de un rango [start, end).
 * Devuelve por cada fecha: 1 = libre, 0 = ocupada/bloqueada.
 */
export function unitAvailability(
  unit: AvailabilityUnit,
  start: Date,
  end: Date,
  reservations: ActiveReservationSpan[],
  blocks: ActiveUnitBlockSpan[] = []
): Array<{ fecha: string; disponible: boolean }> {
  const out: Array<{ fecha: string; disponible: boolean }> = [];
  const cursor = startOfDay(start);
  const last = startOfDay(end);
  while (cursor.getTime() < last.getTime()) {
    out.push({
      fecha: toIsoDate(cursor),
      disponible: !unitUnavailableOnDay(unit.id, cursor, reservations, blocks),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Disponibilidad agregada por roomCode dentro de un rango [start, end).
 * Para cada fecha: count = unidades libres de ese tipo de habitación.
 * Las unidades sin mapping (roomCode null) no participan del empuje.
 */
export function availabilityByRoomCode(
  units: AvailabilityUnit[],
  start: Date,
  end: Date,
  reservations: ActiveReservationSpan[],
  blocks: ActiveUnitBlockSpan[] = []
): Array<{ fecha: string; rooms: Array<{ roomCode: string; available: number }> }> {
  const cursor = startOfDay(start);
  const last = startOfDay(end);
  const out: Array<{ fecha: string; rooms: Array<{ roomCode: string; available: number }> }> = [];

  while (cursor.getTime() < last.getTime()) {
    const rooms = new Map<string, number>();
    for (const unit of units) {
      if (!unit.roomCode) continue; // sin mapping externo: no participa
      // Estados que sacan la unidad del inventario vendible
      if (ESTADOS_FUERA_DE_VENTA.includes(unit.estado)) continue;
      const unavailable = unitUnavailableOnDay(unit.id, cursor, reservations, blocks);
      const current = rooms.get(unit.roomCode) ?? 0;
      rooms.set(unit.roomCode, current + (unavailable ? 0 : 1));
    }
    out.push({
      fecha: toIsoDate(cursor),
      rooms: Array.from(rooms.entries()).map(([roomCode, available]) => ({
        roomCode,
        available,
      })),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Ocupación diaria de una propiedad dentro de un rango [start, end): por cada
 * fecha, el % de unidades **vendibles** que ya no están libres.
 *
 * Es la lectura de demanda que consume el pricing dinámico (capa 2, regla de
 * ocupación): la propiedad medio vacía justifica un precio más bajo y las
 * últimas habitaciones, uno más alto. Se calcula con la MISMA regla de
 * ocupación del engine (`unitUnavailableOnDay`): aquí no hay una segunda forma
 * de decidir si una unidad está libre. Una unidad bloqueada tampoco está en
 * venta, así que cuenta igual que una ocupada — el porcentaje mide cuánta
 * habitación le queda al hotel, no cuánta demanda hay en el mercado.
 *
 * Las unidades en mantenimiento o fuera de servicio no entran en el
 * denominador. Sin unidades vendibles devuelve un mapa vacío: **sin dato, la
 * regla de ocupación no aplica** (mejor que inventarse un 0 %).
 */
export function ocupacionPorNoche(
  units: AvailabilityUnit[],
  start: Date,
  end: Date,
  reservations: ActiveReservationSpan[],
  blocks: ActiveUnitBlockSpan[] = []
): Record<string, number> {
  const vendibles = units.filter((u) => !ESTADOS_FUERA_DE_VENTA.includes(u.estado));
  const out: Record<string, number> = {};
  if (vendibles.length === 0) return out;

  const cursor = startOfDay(start);
  const last = startOfDay(end);
  while (cursor.getTime() < last.getTime()) {
    const ocupadas = vendibles.filter((u) =>
      unitUnavailableOnDay(u.id, cursor, reservations, blocks)
    ).length;
    // Un decimal basta para comparar con los tramos configurados, y evita
    // porcentajes con cola de coma flotante (33.33333333333333).
    out[toIsoDate(cursor)] = Math.round((ocupadas / vendibles.length) * 1000) / 10;
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Carga desde BD: unidades + mappings de un tenant, y reservas activas en
 * el rango. Helper para que el dispatcher no repita la consulta.
 */
export async function loadAvailabilityContext(
  prisma: any,
  tenantId: string,
  propertyId: string | null,
  start: Date,
  end: Date
) {
  const whereUnits: any = { tenantId };
  if (propertyId) whereUnits.propertyId = propertyId;

  const [units, reservations, blocks] = await Promise.all([
    prisma.hospitalityUnit.findMany({
      where: whereUnits,
      include: {
        mappings: {
          where: { provider: 'channel_connectivity', estado: 'activo' },
          select: { unitId: true, externalUnitCode: true },
        },
      },
    }),
    prisma.hospitalityReservation.findMany({
      where: {
        tenantId,
        ...(propertyId ? { propertyId } : {}),
        estado: { notIn: estadosSinProduccion() },
        checkIn: { lt: end },
        checkOut: { gt: start },
      },
    }),
    prisma.hospitalityUnitBlock.findMany({
      where: {
        tenantId,
        ...(propertyId ? { unit: { propertyId } } : {}),
        estado: 'activo',
        fechaInicio: { lt: end },
        fechaFin: { gt: start },
      },
      select: { unitId: true, fechaInicio: true, fechaFin: true, estado: true },
    }),
  ]);

  const availabilityUnits: AvailabilityUnit[] = units.map((u: any) => ({
    id: u.id,
    propertyId: u.propertyId,
    roomCode: u.mappings?.[0]?.externalUnitCode ?? null,
    estado: u.estado,
  }));

  return {
    units: availabilityUnits,
    reservations: reservations as ActiveReservationSpan[],
    blocks: blocks as ActiveUnitBlockSpan[],
  };
}