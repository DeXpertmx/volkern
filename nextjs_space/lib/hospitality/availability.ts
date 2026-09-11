/**
 * Availability Engine (plan maestro §15 y §16).
 *
 * Regla fundamental: la disponibilidad mostrada y empujada al exterior se
 * calcula SIEMPRE desde el estado interno de Volkern (reservas activas),
 * nunca consultando al proveedor.
 *
 * - Un día está ocupado si existe una reserva activa (no cancelada) cuya
 *   estancia lo cubre. Check-in ocupa su día; check-out NO (plan §8).
 * - La disponibilidad de una unidad es binaria (1 libre / 0 ocupada): las
 *   reservas se asignan a una unidad concreta.
 * - El empuje al exterior agrupa por roomCode (vía ConnectivityMapping):
 *   para cada fecha, disponibilidad = unidades libres de ese tipo.
 */

import { startOfDay, toIsoDate } from './calendar';

export interface AvailabilityUnit {
  id: string;
  propertyId: string;
  /** Código externo del tipo de habitación (mapping); null si no hay mapping. */
  roomCode: string | null;
  estado: string;
}

export interface ActiveReservationSpan {
  unitId: string | null;
  checkIn: Date;
  checkOut: Date;
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
 * Una reserva activa cubre [checkIn, checkOut) — el día de checkout no cuenta.
 */
export function unitOccupiedOnDay(
  unitId: string,
  day: Date,
  reservations: ActiveReservationSpan[]
): boolean {
  const d = startOfDay(day).getTime();
  return reservations.some((r) => {
    if (r.estado === 'cancelled') return false;
    if (!r.unitId || r.unitId !== unitId) return false;
    return startOfDay(r.checkIn).getTime() <= d && startOfDay(r.checkOut).getTime() > d;
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
      if (['maintenance', 'out_of_service'].includes(unit.estado)) continue;
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
        estado: { not: 'cancelled' },
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