/**
 * Dispatcher de sincronización (plan maestro §15.2, §29, §30).
 *
 * Cuando una reserva entra/cambia/se cancela, o una unidad cambia de estado,
 * este módulo recalcula la disponibilidad interna y empuja inventario y
 * tarifas hacia la capa de conectividad (UPSERT por rango).
 *
 * Reglas:
 * - La disponibilidad SIEMPRE se calcula desde el estado interno de Volkern.
 * - NO retries ciegos: cada push fallido queda registrado con su causa en
 *   HospitalitySyncLog para revisión manual (plan §30).
 * - Los errores de sincronización nunca rompen el flujo principal: se
 *   registran y se actualiza el contador/estado del proveedor.
 * - Aislamiento multi-tenant: todo se filtra por tenantId.
 */

import { prisma } from '@/lib/db';
import { availabilityByRoomCode, loadAvailabilityContext } from './availability';
import {
  pushInventory,
  pushRates,
  updateConnectivityStatus,
  getConnectivityProvider,
} from './connectivity';

export type SyncOperacion =
  | 'reserva_creada'
  | 'reserva_modificada'
  | 'reserva_cancelada'
  | 'unidad_cambiada'
  | 'manual';

export interface SyncResult {
  ok: boolean;
  inventory: { ok: boolean; error?: string };
  rates: { ok: boolean; error?: string };
  pushCount: number;
  errores: number;
}

/**
 * Registra el resultado de un push en HospitalitySyncLog (nunca lanza).
 */
async function recordSyncLog(input: {
  tenantId: string;
  propertyId: string | null;
  tipo: 'inventory' | 'rates';
  operacion: SyncOperacion;
  ok: boolean;
  httpStatus?: number;
  requestPayload?: unknown;
  responseBody?: unknown;
  errorMensaje?: string;
  duracionMs?: number;
}) {
  try {
    await prisma.hospitalitySyncLog.create({
      data: {
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        tipo: input.tipo,
        operacion: input.operacion,
        estado: input.ok ? 'exito' : 'error',
        httpStatus: input.httpStatus,
        requestPayload: input.requestPayload as any,
        responseBody: input.responseBody as any,
        errorMensaje: input.errorMensaje,
        duracionMs: input.duracionMs,
      },
    });
  } catch (e) {
    console.error('[Hospitality] Error registrando log de sincronización:', e);
  }
}

/**
 * Empuja inventario y tarifas de una propiedad al exterior tras un cambio.
 *
 * @param tenantId Tenant al que pertenece la propiedad.
 * @param propertyId Propiedad afectada (null = todas las del tenant).
 * @param operacion Motivo del push (para auditoría).
 * @param opts.diasHorizonte Cuántos días hacia adelante empujar (default 90).
 * @param opts.skipRates Si solo interesa disponibilidad (p.ej. reserva creada).
 */
export async function dispatchConnectivityPush(
  tenantId: string,
  propertyId: string | null,
  operacion: SyncOperacion,
  opts?: { diasHorizonte?: number; skipRates?: boolean }
): Promise<SyncResult> {
  const dias = opts?.diasHorizonte ?? 90;

  // Si la conectividad no está configurada, no hay nada que empujar.
  const provider = await getConnectivityProvider();
  if (!provider || !provider.partnerIdEnc || !provider.usernameEnc || !provider.passwordEnc) {
    return { ok: false, inventory: { ok: false, error: 'no_configurada' }, rates: { ok: false, error: 'no_configurada' }, pushCount: 0, errores: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + dias);

  const { reservations } = await loadAvailabilityContext(
    prisma,
    tenantId,
    propertyId,
    today,
    horizon
  );

  // Propiedades a sincronizar (una concreta o todas las del tenant).
  const propertyRows = propertyId
    ? [{ id: propertyId }]
    : await prisma.hospitalityProperty.findMany({
        where: { tenantId },
        select: { id: true },
      });

  let pushCount = 0;
  let errores = 0;
  const invResult: { ok: boolean; error?: string } = { ok: true };
  const rateResult: { ok: boolean; error?: string } = { ok: true };

  for (const prop of propertyRows) {
    // hotelCode externo = mapping de propiedad activo.
    const propMapping = await prisma.connectivityMapping.findFirst({
      where: {
        tenantId,
        propertyId: prop.id,
        provider: 'channel_connectivity',
        estado: 'activo',
      },
      orderBy: { fechaCreacion: 'asc' },
    });
    const hotelCode = propMapping?.externalPropertyId;
    if (!hotelCode) continue; // sin mapping externo: nada que empujar

    // Unidades de ESTA propiedad con sus mappings (roomCode + rateplan).
    const unitRows = await prisma.hospitalityUnit.findMany({
      where: { tenantId, propertyId: prop.id },
      include: {
        mappings: {
          where: { provider: 'channel_connectivity', estado: 'activo' },
          select: { unitId: true, externalUnitCode: true, externalRatePlanCode: true },
        },
      },
    });

    const availabilityUnits = unitRows.map((u: any) => ({
      id: u.id,
      propertyId: u.propertyId,
      roomCode: u.mappings?.[0]?.externalUnitCode ?? null,
      estado: u.estado,
      tarifaBase: u.tarifaBase,
    }));

    const byDay = availabilityByRoomCode(availabilityUnits, today, horizon, reservations);

    // ── Inventory Push: agrupar días consecutivos por roomCode con el mismo
    //    conteo para minimizar bloques (UPSERT por rango).
    const invUpdates = buildInventoryUpdates(byDay);
    if (invUpdates.length > 0) {
      const result = await pushInventory(hotelCode, invUpdates);
      pushCount += 1;
      await recordSyncLog({
        tenantId,
        propertyId: prop.id,
        tipo: 'inventory',
        operacion,
        ok: result.ok,
        httpStatus: result.httpStatus,
        requestPayload: { hotelCode, updates: invUpdates },
        responseBody: result.respuestaExterna,
        errorMensaje: result.error,
        duracionMs: result.duracionMs,
      });
      if (!result.ok) {
        errores += 1;
        invResult.ok = false;
        invResult.error = result.error;
      }
    }

    // ── Rate Push: tarifa por (roomCode, rateplanCode) — si hay tarifa base.
    if (!opts?.skipRates) {
      const rateUpdates = buildRateUpdates(availabilityUnits, today, horizon);
      if (rateUpdates.length > 0) {
        const result = await pushRates(hotelCode, rateUpdates);
        pushCount += 1;
        await recordSyncLog({
          tenantId,
          propertyId: prop.id,
          tipo: 'rates',
          operacion,
          ok: result.ok,
          httpStatus: result.httpStatus,
          requestPayload: { hotelCode, updates: rateUpdates },
          responseBody: result.respuestaExterna,
          errorMensaje: result.error,
          duracionMs: result.duracionMs,
        });
        if (!result.ok) {
          errores += 1;
          rateResult.ok = false;
          rateResult.error = result.error;
        }
      }
    }
  }

  // Actualizar estado del proveedor (observabilidad §29).
  if (errores > 0) {
    await updateConnectivityStatus({ estado: 'error', error: true, ultimoEvento: new Date() });
  } else if (pushCount > 0) {
    await updateConnectivityStatus({
      estado: 'conectado',
      resetErrores: true,
      ultimaSincronizacion: new Date(),
      ultimoEvento: new Date(),
    });
  }

  return {
    ok: errores === 0,
    inventory: invResult,
    rates: rateResult,
    pushCount,
    errores,
  };
}

/**
 * Agrupa la disponibilidad diaria por roomCode en bloques de rango contiguo.
 * Cada bloque: { startDate, endDate, rooms: [{roomCode, available}] }.
 */
export function buildInventoryUpdates(
  byDay: Array<{ fecha: string; rooms: Array<{ roomCode: string; available: number }> }>
) {
  // Mapa: roomCode → [{fecha, available}]
  const roomsByCode = new Map<string, Array<{ fecha: string; available: number }>>();
  for (const day of byDay) {
    for (const room of day.rooms) {
      const list = roomsByCode.get(room.roomCode) || [];
      list.push({ fecha: day.fecha, available: room.available });
      roomsByCode.set(room.roomCode, list);
    }
  }

  const updates: Array<{
    startDate: string;
    endDate: string;
    rooms: Array<{ roomCode: string; available: number }>;
  }> = [];

  for (const [roomCode, days] of roomsByCode) {
    // Segmentar en tramos de disponibilidad constante
    let segStart = days[0]?.fecha;
    let segAvail = days[0]?.available;
    let prevDate = days[0]?.fecha;
    for (let i = 1; i < days.length; i++) {
      const d = days[i];
      if (d.available !== segAvail || !isNextDay(prevDate!, d.fecha)) {
        updates.push({
          startDate: segStart!,
          endDate: prevDate!,
          rooms: [{ roomCode, available: segAvail! }],
        });
        segStart = d.fecha;
        segAvail = d.available;
      }
      prevDate = d.fecha;
    }
    if (segStart) {
      updates.push({
        startDate: segStart,
        endDate: prevDate!,
        rooms: [{ roomCode, available: segAvail! }],
      });
    }
  }

  return updates;
}

function isNextDay(prev: string, next: string): boolean {
  const a = new Date(prev + 'T00:00:00');
  const b = new Date(next + 'T00:00:00');
  return b.getTime() - a.getTime() === 86_400_000;
}

/**
 * Construye los updates de tarifas: un bloque por (roomCode, rateplanCode)
 * con tarifa base de la unidad (la primera que tenga tarifaBase definida).
 * Sin tarifa base no se empujan tarifas (no inventar precios).
 */
export function buildRateUpdates(
  units: Array<{ id: string; roomCode: string | null; tarifaBase: number | null }>,
  start: Date,
  end: Date
) {
  const byRoom = new Map<string, { roomCode: string; rate: number; rateplanCode: string | null }>();
  for (const u of units) {
    if (!u.roomCode || u.tarifaBase == null) continue;
    if (!byRoom.has(u.roomCode)) {
      byRoom.set(u.roomCode, { roomCode: u.roomCode, rate: u.tarifaBase, rateplanCode: null });
    }
  }

  if (byRoom.size === 0) return [];

  const updates: Array<{
    startDate: string;
    endDate: string;
    rates: Array<{ roomCode: string; rateplanCode: string; rate: number }>;
  }> = [];

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  const rates: Array<{ roomCode: string; rateplanCode: string; rate: number }> = [];
  for (const [, info] of byRoom) {
    rates.push({
      roomCode: info.roomCode,
      rateplanCode: info.rateplanCode || info.roomCode,
      rate: info.rate,
    });
  }

  const startIso = toIsoLocal(cursor);
  const endIso = toIsoLocal(new Date(last.getTime() - 86_400_000)); // inclusivo
  if (startIso <= endIso) {
    updates.push({ startDate: startIso, endDate: endIso, rates });
  }
  return updates;
}

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}