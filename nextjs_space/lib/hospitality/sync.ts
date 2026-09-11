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
  pushInventoryRestrictions,
  pushRateRestrictions,
  updateConnectivityStatus,
  getConnectivityProvider,
} from './connectivity';
import type {
  RestrictionFields,
  InventoryRestrictionsPushUpdate,
  RateRestrictionsPushUpdate,
} from './connectivity';

export type SyncOperacion =
  | 'reserva_creada'
  | 'reserva_modificada'
  | 'reserva_cancelada'
  | 'unidad_cambiada'
  | 'manual'
  /** Pruebas del onboarding guiado de propiedad (§31). */
  | 'onboarding';

export interface SyncResult {
  ok: boolean;
  inventory: { ok: boolean; error?: string };
  rates: { ok: boolean; error?: string };
  /** Restricciones por tipo de habitación (§5). */
  inventoryRestrictions: { ok: boolean; error?: string };
  /** Restricciones por (room, rateplan) (§5). */
  rateRestrictions: { ok: boolean; error?: string };
  pushCount: number;
  errores: number;
}

/**
 * Registra el resultado de un push en HospitalitySyncLog (nunca lanza).
 */
async function recordSyncLog(input: {
  tenantId: string;
  propertyId: string | null;
  tipo: 'inventory' | 'rates' | 'inventory_restrictions' | 'rates_restrictions';
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
 * @param opts.skipInventory Si solo interesan tarifas y restricciones de tarifa
 *   (prueba de tarifas del onboarding §31).
 */
export async function dispatchConnectivityPush(
  tenantId: string,
  propertyId: string | null,
  operacion: SyncOperacion,
  opts?: { diasHorizonte?: number; skipRates?: boolean; skipInventory?: boolean }
): Promise<SyncResult> {
  const dias = opts?.diasHorizonte ?? 90;

  // Si la conectividad no está configurada, no hay nada que empujar.
  const provider = await getConnectivityProvider();    if (!provider || !provider.partnerIdEnc || !provider.usernameEnc || !provider.passwordEnc) {
    const sinConfigurar = { ok: false, error: 'no_configurada' };
    return {
      ok: false,
      inventory: sinConfigurar,
      rates: sinConfigurar,
      inventoryRestrictions: sinConfigurar,
      rateRestrictions: sinConfigurar,
      pushCount: 0,
      errores: 0,
    };
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
  const invRestrictionResult: { ok: boolean; error?: string } = { ok: true };
  const rateRestrictionResult: { ok: boolean; error?: string } = { ok: true };

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

    // Unidades de ESTA propiedad con sus mappings (roomCode + rateplan)
    // y sus planes de tarifa activos (se empujan como rateplanCode).
    const unitRows = await prisma.hospitalityUnit.findMany({
      where: { tenantId, propertyId: prop.id },
      include: {
        mappings: {
          where: { provider: 'channel_connectivity', estado: 'activo' },
          select: { unitId: true, externalUnitCode: true, externalRatePlanCode: true },
        },
        ratePlans: {
          where: { activo: true },
          select: {
            id: true,
            codigo: true,
            tarifa: true,
            activo: true,
            minNoches: true,
            maxNoches: true,
            checkInDias: true,
            checkOutDias: true,
          },
        },
      },
    });

    const availabilityUnits = unitRows.map((u: any) => ({
      id: u.id,
      propertyId: u.propertyId,
      roomCode: u.mappings?.[0]?.externalUnitCode ?? null,
      estado: u.estado,
      tarifaBase: u.tarifaBase,
      ratePlans: (u.ratePlans || [])
        .filter((rp: any) => rp.activo)
        .map((rp: any) => ({
          codigo: rp.codigo || rp.id,
          tarifa: rp.tarifa,
          minNoches: rp.minNoches ?? 1,
          maxNoches: rp.maxNoches ?? null,
          checkInDias: rp.checkInDias ?? null,
          checkOutDias: rp.checkOutDias ?? null,
        })),
    }));

    const byDay = availabilityByRoomCode(availabilityUnits, today, horizon, reservations);

    // ── Inventory Push: agrupar días consecutivos por roomCode con el mismo
    //    conteo para minimizar bloques (UPSERT por rango).
    const invUpdates = opts?.skipInventory ? [] : buildInventoryUpdates(byDay);
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

    // ── Inventory Restrictions Push (§5): stopSell por tipo de habitación y
    //    restricción de estancia más permisiva entre los planes activos.
    const invRestrictionUpdates = opts?.skipInventory
      ? []
      : buildInventoryRestrictions(availabilityUnits, byDay);
    if (invRestrictionUpdates.length > 0) {
      const result = await pushInventoryRestrictions(hotelCode, invRestrictionUpdates);
      pushCount += 1;
      await recordSyncLog({
        tenantId,
        propertyId: prop.id,
        tipo: 'inventory_restrictions',
        operacion,
        ok: result.ok,
        httpStatus: result.httpStatus,
        requestPayload: { hotelCode, updates: invRestrictionUpdates },
        responseBody: result.respuestaExterna,
        errorMensaje: result.error,
        duracionMs: result.duracionMs,
      });
      if (!result.ok) {
        errores += 1;
        invRestrictionResult.ok = false;
        invRestrictionResult.error = result.error;
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

      // ── Rate Restrictions Push (§5): min/max stay y cierre de llegada o
      //    salida por día de la semana, por (roomCode, rateplanCode).
      const rateRestrictionUpdates = buildRateRestrictions(availabilityUnits, today, horizon);
      if (rateRestrictionUpdates.length > 0) {
        const result = await pushRateRestrictions(hotelCode, rateRestrictionUpdates);
        pushCount += 1;
        await recordSyncLog({
          tenantId,
          propertyId: prop.id,
          tipo: 'rates_restrictions',
          operacion,
          ok: result.ok,
          httpStatus: result.httpStatus,
          requestPayload: { hotelCode, updates: rateRestrictionUpdates },
          responseBody: result.respuestaExterna,
          errorMensaje: result.error,
          duracionMs: result.duracionMs,
        });
        if (!result.ok) {
          errores += 1;
          rateRestrictionResult.ok = false;
          rateRestrictionResult.error = result.error;
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
    inventoryRestrictions: invRestrictionResult,
    rateRestrictions: rateRestrictionResult,
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
 * con los rate plans ACTIVOS de la unidad. Si la unidad no tiene planes
 * configurados, cae a su tarifaBase (compatibilidad con datos existentes).
 * Sin tarifa ni plan no se empujan tarifas (no inventar precios).
 */
export function buildRateUpdates(
  units: Array<{
    id: string;
    roomCode: string | null;
    tarifaBase: number | null;
    ratePlans?: Array<{ codigo: string; tarifa: number }>;
  }>,
  start: Date,
  end: Date
) {
  const rates: Array<{ roomCode: string; rateplanCode: string; rate: number }> = [];

  for (const u of units) {
    if (!u.roomCode) continue;

    // 1) Rate plans activos de la unidad (cada plan = un rateplanCode).
    const plans = (u.ratePlans || []).filter((p) => p.tarifa != null && p.tarifa > 0);
    if (plans.length > 0) {
      for (const p of plans) {
        rates.push({
          roomCode: u.roomCode,
          rateplanCode: p.codigo || u.roomCode,
          rate: p.tarifa,
        });
      }
      continue;
    }

    // 2) Fallback: tarifa base de la unidad (un solo rateplan).
    if (u.tarifaBase == null) continue;
    rates.push({
      roomCode: u.roomCode,
      rateplanCode: u.roomCode,
      rate: u.tarifaBase,
    });
  }

  if (rates.length === 0) return [];

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  const startIso = toIsoLocal(cursor);
  const endIso = toIsoLocal(new Date(last.getTime() - 86_400_000)); // inclusivo
  if (startIso <= endIso) {
    return [{ startDate: startIso, endDate: endIso, rates }];
  }
  return [];
}

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Restricciones de venta (plan maestro §5, contrato) ──────────────────
//
// El contrato define que las restricciones viajan por los endpoints ya
// existentes (`/update/{pms}` y `/update-rates/{pms}`) y que los campos
// opcionales se envían como `null`, nunca omitidos. No se inventa ningún
// campo: el objeto `restrictions` tiene exactamente los diez campos del
// contrato.

/** Estados internos que sacan la unidad del inventario vendible (§17). */
const ESTADOS_NO_VENDIBLES = ['maintenance', 'out_of_service'];

/**
 * Objeto `restrictions` del contrato con los opcionales en `null`. Se parte
 * de un valor neutro (sin restricción) y se sobrescribe lo que aplique.
 */
function restrictionFields(overrides: Partial<RestrictionFields> = {}): RestrictionFields {
  return {
    stopSell: false,
    exactStayArrival: null,
    maximumStayArrival: null,
    minimumAdvanceReservation: null,
    minimumStay: 1,
    closeOnArrival: false,
    minimumStayArrival: null,
    maximumStay: null,
    maximumAdvanceReservation: null,
    closeOnDeparture: false,
    ...overrides,
  };
}

/**
 * ¿El plan permite llegada/salida ese día de la semana?
 * `checkInDias`/`checkOutDias` vacíos o nulos = sin restricción de día; en el
 * contrato eso se expresa como `closeOnArrival`/`closeOnDeparture` en `false`.
 */
function diaPermitido(dias: unknown, day: Date): boolean {
  if (!Array.isArray(dias) || dias.length === 0) return true;
  return dias.some((d) => Number(d) === day.getDay());
}

/**
 * Construye las restricciones POR TIPO DE HABITACIÓN del contrato
 * (Inventory Restrictions): `{roomCode, available, restrictions}`.
 *
 * - `stopSell` = el tipo entero está fuera de servicio (ninguna unidad
 *   vendible). Se toma la lista de tipos desde las UNIDADES, no desde la
 *   disponibilidad, porque un tipo fuera de servicio no aparece en ella y su
 *   cierre debe comunicarse igual.
 * - La estancia mínima/máxima a nivel de habitación es la MÁS PERMISIVA entre
 *   los planes activos (cada plan aplica la suya en su propio push de
 *   tarifas), de modo que nunca se estrecha lo que un plan sí permite.
 */
export function buildInventoryRestrictions(
  units: Array<{
    roomCode: string | null;
    estado: string;
    ratePlans?: Array<{ minNoches?: number | null; maxNoches?: number | null }>;
  }>,
  byDay: Array<{ fecha: string; rooms: Array<{ roomCode: string; available: number }> }>
): InventoryRestrictionsPushUpdate[] {
  if (byDay.length === 0) return [];

  const unitsByRoom = new Map<string, typeof units>();
  for (const u of units) {
    if (!u.roomCode) continue;
    const list = unitsByRoom.get(u.roomCode) || [];
    list.push(u);
    unitsByRoom.set(u.roomCode, list);
  }
  if (unitsByRoom.size === 0) return [];

  const roomRestrictions = new Map<string, RestrictionFields>();
  for (const [roomCode, roomUnits] of unitsByRoom) {
    const vendible = roomUnits.some((u) => !ESTADOS_NO_VENDIBLES.includes(u.estado));
    const planes = roomUnits.flatMap((u) => u.ratePlans || []);
    const minimos = planes
      .map((p) => p.minNoches)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    const maximos = planes.map((p) => p.maxNoches);
    const hayMaximoAbierto = maximos.length === 0 || maximos.some((m) => m == null);
    roomRestrictions.set(
      roomCode,
      restrictionFields({
        stopSell: !vendible,
        minimumStay: minimos.length > 0 ? Math.min(...minimos) : 1,
        maximumStay: hayMaximoAbierto
          ? null
          : Math.max(...(maximos as number[])),
      })
    );
  }

  // Agrupar días consecutivos con el mismo contenido en un solo bloque
  // (UPSERT por rango, igual que el inventario).
  const updates: InventoryRestrictionsPushUpdate[] = [];
  let segStart: string | null = null;
  let segEnd = '';
  let segSig = '';
  let segRooms: InventoryRestrictionsPushUpdate['rooms'] = [];

  for (const day of byDay) {
    const availableByRoom = new Map(day.rooms.map((r) => [r.roomCode, r.available]));
    const rooms: InventoryRestrictionsPushUpdate['rooms'] = [];
    for (const [roomCode, restrictions] of roomRestrictions) {
      rooms.push({
        roomCode,
        available: availableByRoom.get(roomCode) ?? 0,
        restrictions,
      });
    }
    const sig = JSON.stringify(rooms);

    if (segStart !== null && sig === segSig && isNextDay(segEnd, day.fecha)) {
      segEnd = day.fecha;
      continue;
    }
    if (segStart !== null) {
      updates.push({ startDate: segStart, endDate: segEnd, rooms: segRooms });
    }
    segStart = day.fecha;
    segEnd = day.fecha;
    segSig = sig;
    segRooms = rooms;
  }
  if (segStart !== null) {
    updates.push({ startDate: segStart, endDate: segEnd, rooms: segRooms });
  }

  return updates;
}

/**
 * Construye las restricciones POR (room, rateplan) del contrato (Rate
 * Restrictions): `{roomCode, rateplanCode, restrictions}`.
 *
 * - `minimumStay` / `maximumStay` vienen del plan de tarifas (`minNoches`,
 *   `maxNoches`; sin máximo = `null`).
 * - `closeOnArrival` / `closeOnDeparture` se calculan por día según los días
 *   de la semana permitidos, y el rango se segmenta solo cuando el resultado
 *   cambia de un día a otro.
 * - Solo se empujan planes activos con código: sin plan no se inventan
 *   restricciones.
 */
export function buildRateRestrictions(
  units: Array<{
    roomCode: string | null;
    ratePlans?: Array<{
      codigo: string;
      minNoches?: number | null;
      maxNoches?: number | null;
      checkInDias?: unknown;
      checkOutDias?: unknown;
    }>;
  }>,
  start: Date,
  end: Date
): RateRestrictionsPushUpdate[] {
  const plans: Array<{
    roomCode: string;
    rateplanCode: string;
    minimumStay: number;
    maximumStay: number | null;
    checkInDias: unknown;
    checkOutDias: unknown;
  }> = [];

  for (const u of units) {
    if (!u.roomCode) continue;
    for (const p of u.ratePlans || []) {
      plans.push({
        roomCode: u.roomCode,
        rateplanCode: p.codigo || u.roomCode,
        minimumStay: typeof p.minNoches === 'number' && p.minNoches > 0 ? p.minNoches : 1,
        maximumStay: typeof p.maxNoches === 'number' && p.maxNoches > 0 ? p.maxNoches : null,
        checkInDias: p.checkInDias ?? null,
        checkOutDias: p.checkOutDias ?? null,
      });
    }
  }
  if (plans.length === 0) return [];

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  const updates: RateRestrictionsPushUpdate[] = [];
  let segStart: string | null = null;
  let segEnd = '';
  let segSig = '';
  let segRates: RateRestrictionsPushUpdate['rates'] = [];

  while (cursor.getTime() < last.getTime()) {
    const rates: RateRestrictionsPushUpdate['rates'] = plans.map((p) => ({
      roomCode: p.roomCode,
      rateplanCode: p.rateplanCode,
      restrictions: restrictionFields({
        minimumStay: p.minimumStay,
        maximumStay: p.maximumStay,
        closeOnArrival: !diaPermitido(p.checkInDias, cursor),
        closeOnDeparture: !diaPermitido(p.checkOutDias, cursor),
      }),
    }));
    const fecha = toIsoLocal(cursor);
    const sig = JSON.stringify(rates);

    if (segStart !== null && sig === segSig && isNextDay(segEnd, fecha)) {
      segEnd = fecha;
    } else {
      if (segStart !== null) {
        updates.push({ startDate: segStart, endDate: segEnd, rates: segRates });
      }
      segStart = fecha;
      segEnd = fecha;
      segSig = sig;
      segRates = rates;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (segStart !== null) {
    updates.push({ startDate: segStart, endDate: segEnd, rates: segRates });
  }

  return updates;
}