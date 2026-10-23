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
import { fechaDeIso, startOfDay } from './calendar';
import { DIAS_HORIZONTE_VENTA } from './ventana-reservas';
import {
  normalizarEstacionalidad,
  serieDeTarifas,
  temporadaDeFecha,
  type ConfigEstacionalidad,
} from './estacionalidad';
import {
  pushInventory,
  pushRates,
  pushInventoryRestrictions,
  pushRateRestrictions,
  updateConnectivityStatus,
  getConnectivityCredentials,
  advertenciasDeRespuesta,
} from './connectivity';
import type {
  RestrictionFields,
  InventoryRestrictionsPushUpdate,
  RateRestrictionsPushUpdate,
} from './connectivity';
import {
  rechazoDePush,
  unidadesDelEnvio,
  unidadesFueraDelEnvio,
  type EnvioPush,
  type RechazoDeCanal,
  type UnidadDescartada,
  type UnidadDelPush,
  type UnidadNoEnviada,
} from './rechazo-canal';

export type SyncOperacion =
  | 'reserva_creada'
  | 'reserva_modificada'
  | 'reserva_cancelada'
  | 'unidad_cambiada'
  | 'manual'
  /** Pruebas del onboarding guiado de propiedad (§31). */
  | 'onboarding'
  /**
   * Reposición tras limpiar la reserva de prueba del onboarding (§31).
   *
   * Va aparte de `onboarding` a propósito: el wizard deriva los pasos 7 y 8 del
   * ÚLTIMO registro `inventory`/`rates` con `operacion: 'onboarding'`, así que
   * un push de limpieza marcado como `onboarding` cambiaría el estado de dos
   * pasos que nadie acaba de ejecutar. El resultado de la reposición se le
   * enseña al operador en la respuesta de la prueba, que es donde está mirando.
   */
  | 'onboarding_limpieza'
  /**
   * Push disparado por la reconciliación diaria cuando el barrido tocó algo
   * (recuperó una reserva que el webhook nunca entregó, la actualizó o la
   * canceló). Va aparte de las operaciones de reserva a propósito: el origen no
   * es una reserva concreta sino el barrido, y así se distingue en
   * `HospitalitySyncLog` de un push nacido de un webhook o del operador.
   */
  | 'reconciliacion';

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
  /**
   * Qué descartó el canal, atribuido a las UNIDADES del envío (ver
   * `./rechazo-canal`). El código del proveedor («INVALID_ROOM_CODE : 1a») no le
   * dice al hotel qué unidad arreglar; esto sí.
   */
  rechazo: RechazoDeCanal;
}

/** Rechazo vacío: sin descartes del canal no hay nada que atribuir. */
const SIN_RECHAZO: RechazoDeCanal = {
  noEnviadas: [],
  huboDescartes: false,
  descartadas: [],
  aceptadas: [],
  codigosSinUnidad: [],
  mensaje: null,
};

/**
 * Fusiona los rechazos de las propiedades de un mismo barrido en uno solo.
 *
 * `aceptadas` se recalcula: una unidad descartada en una propiedad no puede
 * aparecer como aceptada porque otra propiedad no la nombrara. La frase de cada
 * propiedad se conserva (lleva sus propios conteos) en vez de resumirlas en una
 * que perdería cuál es cuál.
 */
function fusionarRechazos(rechazos: RechazoDeCanal[]): RechazoDeCanal {
  const conDescarte = rechazos.filter((r) => r.huboDescartes);
  if (conDescarte.length === 0) return SIN_RECHAZO;

  const descartadas: UnidadDescartada[] = [];
  const vistas = new Set<string>();
  for (const r of conDescarte) {
    for (const d of r.descartadas) {
      if (vistas.has(d.unitId)) continue;
      vistas.add(d.unitId);
      descartadas.push(d);
    }
  }

  const aceptadas = new Map<string, { unitId: string; nombre: string }>();
  for (const r of conDescarte) {
    for (const a of r.aceptadas) {
      if (vistas.has(a.unitId)) continue;
      aceptadas.set(a.unitId, a);
    }
  }

  const codigosSinUnidad: string[] = [];
  for (const r of conDescarte) {
    for (const c of r.codigosSinUnidad) {
      if (!codigosSinUnidad.includes(c)) codigosSinUnidad.push(c);
    }
  }

  // Las que no viajaron también se fusionan: cada push de la propiedad las
  // calcula por separado y la misma unidad puede quedarse fuera en varios.
  const noEnviadas: UnidadNoEnviada[] = [];
  const fueraVistas = new Set<string>();
  for (const r of conDescarte) {
    for (const n of r.noEnviadas) {
      const clave = `${n.unitId}\u0000${n.motivo}`;
      if (fueraVistas.has(clave)) continue;
      fueraVistas.add(clave);
      noEnviadas.push(n);
    }
  }

  return {
    huboDescartes: true,
    descartadas,
    aceptadas: [...aceptadas.values()],
    codigosSinUnidad,
    noEnviadas,
    mensaje: conDescarte.map((r) => r.mensaje).filter(Boolean).join(' '),
  };
}

/**
 * Error de un push ya atribuido a unidades: si el canal descartó parte del
 * envío, el operador tiene que leer el nombre de SUS unidades y qué hacer, no el
 * código del proveedor. Un fallo que no sea un descarte conserva su mensaje.
 */
function errorAtribuido(
  result: { error?: string; httpStatus?: number; respuestaExterna?: unknown },
  unidades: UnidadDelPush[],
  noEnviadas: UnidadNoEnviada[] = []
): { error: string; rechazo: RechazoDeCanal } {
  const rechazo = rechazoDePush({
    warnings: advertenciasDeRespuesta(result.respuestaExterna),
    unidades,
    noEnviadas,
  });
  return {
    error: rechazo.mensaje ?? result.error ?? `HTTP ${result.httpStatus ?? 'sin respuesta'}`,
    rechazo,
  };
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
 * Tope del horizonte del push, en días: es el horizonte de venta de los
 * canales (`DIAS_HORIZONTE_VENTA`, el mismo que usa el barrido de reservas).
 * Ninguna OTA deja abrir más calendario que eso, así que publicar más allá no
 * sirve de nada y solo engorda la petición.
 */
export const HORIZONTE_PUSH_MAX_DIAS = DIAS_HORIZONTE_VENTA;

/** Lo que hay que saber de las temporadas configuradas para fijar el horizonte. */
export interface HorizonteDeTemporadas {
  /**
   * Días que hay que empujar para que la última noche de temporada entre en el
   * rango (0 = ninguna temporada futura: manda el horizonte pedido).
   */
  dias: number;
  /** Último día de temporada (ISO), o null si no hay ninguna por delante. */
  hasta: string | null;
  /**
   * La temporada más lejana se sale del tope: se empuja hasta el tope. Lo que
   * queda fuera son fechas que ningún canal puede vender todavía; cuando la
   * ventana ruede hasta ellas, su precio de temporada se publicará igual.
   */
  fueraDelTope: boolean;
}

/**
 * Cuántos días de horizonte hacen falta para que la temporada más lejana
 * configurada viaje.
 *
 * Por qué existe: un plan con estacionalidad se empuja noche a noche con el
 * precio de SU fecha, pero el horizonte del push es una ventana desde hoy —90
 * días por defecto y 180 en las dos puertas del panel—. Una temporada que
 * empieza más allá de esa ventana no viajaba por NINGUNA vía del producto: el
 * canal se quedaba con el precio plano y la temporada solo llegaba si alguien
 * empujaba a mano. Medido en producción (hotel `75fdbbce2e`, 15-oct-2026): la
 * «Tarifa de Verano» de sus cuatro planes (`2027-06-17 → 2027-08-31`, 140 €)
 * viajó una única vez, en un push manual de 365 días; con los 90/180 del
 * producto (13-ene y 13-abr-2027) no llegaba nunca.
 *
 * Se lee el Json crudo de la base a propósito (`normalizarEstacionalidad` es
 * tolerante con lo malformado): una temporada con fechas raras se descarta
 * pieza a pieza y no puede alargar el horizonte por un dato que no existe.
 * Una temporada ya pasada no pide nada (no se empuja hacia atrás).
 */
export function horizonteDeTemporadas(
  planes: Array<{ temporadas?: unknown }>,
  hoy: Date,
  tope: number = HORIZONTE_PUSH_MAX_DIAS
): HorizonteDeTemporadas {
  const desde = startOfDay(hoy).getTime();
  let dias = 0;
  let hasta: string | null = null;
  let fueraDelTope = false;

  for (const plan of planes) {
    const config = normalizarEstacionalidad(plan?.temporadas);
    for (const temporada of config?.temporadas ?? []) {
      const ultimaNoche = fechaDeIso(temporada.hasta);
      if (!ultimaNoche) continue; // fecha imposible: no alarga nada
      const noches = Math.round((ultimaNoche.getTime() - desde) / 86_400_000);
      if (noches < 0) continue; // temporada pasada
      // El horizonte es EXCLUSIVO ([hoy, horizonte)): para que la última noche
      // entre, hay que empujar un día más allá de ella.
      const necesarios = noches + 1;
      if (hasta === null || necesarios > dias) {
        dias = necesarios;
        hasta = temporada.hasta;
      }
    }
  }

  if (dias > tope) {
    dias = tope;
    fueraDelTope = true;
  }
  return { dias, hasta, fueraDelTope };
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
  const diasPedidos = opts?.diasHorizonte ?? 90;

  // Si no hay con qué llamar, no hay nada que empujar. El partner id puede ser
  // el del cliente (su propia fila) o el de plataforma, y
  // `getConnectivityCredentials` resuelve los dos: mirar solo la fila de
  // plataforma dejaba parado —sin empujar nada— a un cliente que ya había
  // registrado su ID de socio.
  const creds = await getConnectivityCredentials(tenantId);
  if (!creds) {
    const sinConfigurar = { ok: false, error: 'no_configurada' };
    return {
      ok: false,
      inventory: sinConfigurar,
      rates: sinConfigurar,
      inventoryRestrictions: sinConfigurar,
      rateRestrictions: sinConfigurar,
      pushCount: 0,
      errores: 0,
      rechazo: SIN_RECHAZO,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // El horizonte no puede quedarse corto respecto a lo que el hotel YA
  // configuró: la temporada más lejana de sus planes activos entra en el push
  // (con el tope del horizonte de venta), así que su precio por fecha viaja por
  // la vía normal en vez de esperar a un push manual. El horizonte pedido nunca
  // se acorta: solo se alarga hasta donde haga falta.
  const planesConTemporada = await prisma.hospitalityRatePlan.findMany({
    where: { tenantId, activo: true, ...(propertyId ? { propertyId } : {}) },
    select: { temporadas: true },
  });
  const temporadas = horizonteDeTemporadas(planesConTemporada, today);
  const dias = Math.min(Math.max(diasPedidos, temporadas.dias), HORIZONTE_PUSH_MAX_DIAS);

  const horizon = new Date(today);
  horizon.setDate(today.getDate() + dias);

  const { reservations, blocks } = await loadAvailabilityContext(
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
  // Atribución de descartes del canal, una por push fallido con avisos.
  const rechazos: RechazoDeCanal[] = [];

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
            temporadas: true,
            finDeSemana: true,
          },
        },
      },
    });

    const availabilityUnits = unitRows.map((u: any) => ({
      id: u.id,
      nombre: u.nombre,
      codigo: u.codigo ?? null,
      propertyId: u.propertyId,
      roomCode: u.mappings?.[0]?.externalUnitCode ?? null,
      // Código de tarifa que el hotel validó contra el catálogo del proveedor
      // al vincular la unidad. Es el respaldo bueno cuando la unidad todavía no
      // tiene planes de tarifa: empujar la tarifa base bajo el ROOMCODE es un
      // código de tarifa inexistente, y el proveedor lo descarta con
      // `INVALID_RATEPLAN_CODE` (medido en producción el 9-oct 2026, hotel
      // 75fdbbce2e).
      rateplanCodeMapeado: u.mappings?.[0]?.externalRatePlanCode ?? null,
      estado: u.estado,
      tarifaBase: u.tarifaBase,
      ratePlans: (u.ratePlans || [])
        .filter((rp: any) => rp.activo)
        // Orden determinista antes de deduplicar: gana el plan con código
        // propio y, entre los que no lo tienen, el de id menor. Dos planes de la
        // misma unidad que acaban en el MISMO código del canal no pueden mandar
        // dos precios distintos y que decida el orden en que los devuelva la
        // base.
        .sort(
          (a: any, b: any) =>
            String(a.codigo ?? '').localeCompare(String(b.codigo ?? '')) ||
            String(a.id).localeCompare(String(b.id))
        )
        .map((rp: any) => ({
          // El código con el que viaja un plan es EL SUYO, y si no lo tiene, el
          // de tarifa que la unidad tiene vinculado (`rateplanCodeMapeado`, que
          // resuelve el builder puro); **nunca la PK interna**. Un plan sin
          // código empujaba su cuid como `rateplanCode` y el proveedor lo
          // descartaba —`INVALID_RATEPLAN_CODE : cmv877haz0072us01nb0np80t`,
          // medido en producción el 14-oct-2026— con un mensaje que mandaba al
          // hotel a «activar en su extranet» un identificador interno nuestro.
          codigo: rp.codigo || null,
          tarifa: rp.tarifa,
          minNoches: rp.minNoches ?? 1,
          maxNoches: rp.maxNoches ?? null,
          checkInDias: rp.checkInDias ?? null,
          checkOutDias: rp.checkOutDias ?? null,
          temporadas: rp.temporadas ?? null,
          finDeSemana: rp.finDeSemana ?? null,
        })),
    }));

    // Las MISMAS unidades, vistas por el canal: con su nombre y todos los
    // códigos que viajan por ellas (habitación y tarifas), que es lo que hace
    // falta para atribuir un descarte del proveedor a la unidad del hotel.
    const unidadesCanal: UnidadDelPush[] = availabilityUnits.map((u) => ({
      unitId: u.id,
      nombre: u.nombre || u.codigo || u.id,
      roomCode: u.roomCode,
      rateplanCodes: [u.rateplanCodeMapeado, ...u.ratePlans.map((rp: any) => rp.codigo)],
    }));

    const byDay = availabilityByRoomCode(availabilityUnits, today, horizon, reservations, blocks);

    // Las unidades que viajan en CADA push, no todas las de la propiedad: el de
    // restricciones de tarifa no lleva las que no tienen plan con código, y
    // contarlas como enviadas sería decir lo contrario de lo que pasó.
    const enviadasYFuera = (envio: EnvioPush) => ({
      enviadas: unidadesDelEnvio(unidadesCanal, envio),
      fuera: unidadesFueraDelEnvio(unidadesCanal, envio),
    });

    // ── Inventory Push: agrupar días consecutivos por roomCode con el mismo
    //    conteo para minimizar bloques (UPSERT por rango).
    const invUpdates = opts?.skipInventory ? [] : buildInventoryUpdates(byDay);
    if (invUpdates.length > 0) {
      const result = await pushInventory(hotelCode, invUpdates, tenantId);
      pushCount += 1;
      const envio = enviadasYFuera({
        roomCodes: invUpdates.flatMap((u) => u.rooms.map((r) => r.roomCode)),
      });
      const { error, rechazo } = result.ok
        ? { error: result.error, rechazo: SIN_RECHAZO }
        : errorAtribuido(result, envio.enviadas, envio.fuera);
      if (rechazo.huboDescartes) rechazos.push(rechazo);
      await recordSyncLog({
        tenantId,
        propertyId: prop.id,
        tipo: 'inventory',
        operacion,
        ok: result.ok,
        httpStatus: result.httpStatus,
        requestPayload: { hotelCode, updates: invUpdates },
        responseBody: result.respuestaExterna,
        errorMensaje: error,
        duracionMs: result.duracionMs,
      });
      if (!result.ok) {
        errores += 1;
        invResult.ok = false;
        invResult.error = error;
      }
    }

    // ── Inventory Restrictions Push (§5): stopSell por tipo de habitación y
    //    restricción de estancia más permisiva entre los planes activos.
    const invRestrictionUpdates = opts?.skipInventory
      ? []
      : buildInventoryRestrictions(availabilityUnits, byDay);
    if (invRestrictionUpdates.length > 0) {
      const result = await pushInventoryRestrictions(hotelCode, invRestrictionUpdates, tenantId);
      pushCount += 1;
      const envio = enviadasYFuera({
        roomCodes: invRestrictionUpdates.flatMap((u) => u.rooms.map((r) => r.roomCode)),
      });
      const { error, rechazo } = result.ok
        ? { error: result.error, rechazo: SIN_RECHAZO }
        : errorAtribuido(result, envio.enviadas, envio.fuera);
      if (rechazo.huboDescartes) rechazos.push(rechazo);
      await recordSyncLog({
        tenantId,
        propertyId: prop.id,
        tipo: 'inventory_restrictions',
        operacion,
        ok: result.ok,
        httpStatus: result.httpStatus,
        requestPayload: { hotelCode, updates: invRestrictionUpdates },
        responseBody: result.respuestaExterna,
        errorMensaje: error,
        duracionMs: result.duracionMs,
      });
      if (!result.ok) {
        errores += 1;
        invRestrictionResult.ok = false;
        invRestrictionResult.error = error;
      }
    }

    // ── Rate Push: tarifa por (roomCode, rateplanCode) — si hay tarifa base.
    if (!opts?.skipRates) {
      const rateUpdates = buildRateUpdates(availabilityUnits, today, horizon);
      if (rateUpdates.length > 0) {
        const result = await pushRates(hotelCode, rateUpdates, tenantId);
        pushCount += 1;
        const envio = enviadasYFuera({
          roomCodes: rateUpdates.flatMap((u) => u.rates.map((r) => r.roomCode)),
          paresTarifa: rateUpdates.flatMap((u) =>
            u.rates.map((r) => ({ roomCode: r.roomCode, rateplanCode: r.rateplanCode }))
          ),
        });
        const { error, rechazo } = result.ok
          ? { error: result.error, rechazo: SIN_RECHAZO }
          : errorAtribuido(result, envio.enviadas, envio.fuera);
        if (rechazo.huboDescartes) rechazos.push(rechazo);
        await recordSyncLog({
          tenantId,
          propertyId: prop.id,
          tipo: 'rates',
          operacion,
          ok: result.ok,
          httpStatus: result.httpStatus,
          requestPayload: { hotelCode, updates: rateUpdates },
          responseBody: result.respuestaExterna,
          errorMensaje: error,
          duracionMs: result.duracionMs,
        });
        if (!result.ok) {
          errores += 1;
          rateResult.ok = false;
          rateResult.error = error;
        }
      }

      // ── Rate Restrictions Push (§5): min/max stay y cierre de llegada o
      //    salida por día de la semana, por (roomCode, rateplanCode).
      const rateRestrictionUpdates = buildRateRestrictions(availabilityUnits, today, horizon);
      if (rateRestrictionUpdates.length > 0) {
        const result = await pushRateRestrictions(hotelCode, rateRestrictionUpdates, tenantId);
        pushCount += 1;
        const envio = enviadasYFuera({
          roomCodes: rateRestrictionUpdates.flatMap((u) => u.rates.map((r) => r.roomCode)),
          paresTarifa: rateRestrictionUpdates.flatMap((u) =>
            u.rates.map((r) => ({ roomCode: r.roomCode, rateplanCode: r.rateplanCode }))
          ),
        });
        const { error, rechazo } = result.ok
          ? { error: result.error, rechazo: SIN_RECHAZO }
          : errorAtribuido(result, envio.enviadas, envio.fuera);
        if (rechazo.huboDescartes) rechazos.push(rechazo);
        await recordSyncLog({
          tenantId,
          propertyId: prop.id,
          tipo: 'rates_restrictions',
          operacion,
          ok: result.ok,
          httpStatus: result.httpStatus,
          requestPayload: { hotelCode, updates: rateRestrictionUpdates },
          responseBody: result.respuestaExterna,
          errorMensaje: error,
          duracionMs: result.duracionMs,
        });
        if (!result.ok) {
          errores += 1;
          rateRestrictionResult.ok = false;
          rateRestrictionResult.error = error;
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
    rechazo: fusionarRechazos(rechazos),
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
 * con los rate plans ACTIVOS de la unidad. El código de cada plan es el suyo y,
 * si no lo tiene, el de tarifa que la unidad haya VINCULADO
 * (`rateplanCodeMapeado`); sin ninguno de los dos esa tarifa no viaja —un
 * precio con un código que no existe no está publicado, y el canal lo descarta
 * con `INVALID_RATEPLAN_CODE`—. Si la unidad no tiene planes configurados, cae
 * a su tarifaBase (compatibilidad con datos existentes) bajo el código
 * vinculado; sin vínculo se usa el roomCode, que es el respaldo histórico.
 * Sin tarifa ni plan no se empujan tarifas (no inventar precios).
 * Dos planes que acaban en el mismo par (roomCode, rateplanCode) empujan un solo
 * precio: el canal tiene un único número por par y elegir por el orden de la
 * base sería un precio que el hotel no decidió.
 *
 * Estacionalidad: un plan con temporadas/fin de semana ya no viaja como un
 * bloque plano — se expande noche a noche con la MISMA regla del booking
 * engine (la noche cuesta la tarifa de su fecha, módulo `./estacionalidad`)
 * y se segmenta en tramos de precio constante para minimizar bloques. Un plan
 * sin estacionalidad sigue empujando su bloque único de siempre.
 *
 * Lo que NO viaja: la capa 2 del precio (antelación, ocupación y duración del
 * plan). Un calendario de tarifas por fecha no puede expresar «si se reserva
 * con 30 días de antelación» ni «si la estancia es de 7 noches», así que el
 * canal recibe la tarifa PUBLICADA y las reglas de demanda ajustan solo la
 * reserva directa. Inventar aquí un calendario distinto sería un precio que el
 * hotel no configuró.
 */
export function buildRateUpdates(
  units: Array<{
    id: string;
    roomCode: string | null;
    tarifaBase: number | null;
    ratePlans?: Array<{ codigo: string | null; tarifa: number; temporadas?: unknown; finDeSemana?: unknown }>;
    /** Código de tarifa vinculado de la unidad (catálogo del proveedor). */
    rateplanCodeMapeado?: string | null;
  }>,
  start: Date,
  end: Date
) {
  const rates: Array<{ roomCode: string; rateplanCode: string; rate: number }> = [];
  // Planes con estacionalidad: (roomCode, rateplanCode) → serie de precios.
  const seriesPorPlan = new Map<string, Array<{ fecha: string; tarifa: number | null }>>();

  for (const u of units) {
    if (!u.roomCode) continue;

    // 1) Rate plans activos de la unidad (cada plan = un rateplanCode).
    const plans = (u.ratePlans || []).filter((p) => p.tarifa != null && p.tarifa > 0);
    if (plans.length > 0) {
      const yaPuestos = new Set<string>();
      for (const p of plans) {
        // El código del plan o, si no tiene, el de tarifa que la unidad tiene
        // vinculado. Sin ninguno de los dos esa tarifa NO viaja: un precio con
        // un código inventado no es un precio publicado, y el informe del push
        // deja la unidad como «no viajó» con su motivo. El respaldo por el
        // ROOMCODE se queda para las unidades que de verdad no tienen planes.
        const rateplanCode = p.codigo || u.rateplanCodeMapeado;
        if (!rateplanCode) continue;
        const clave = `${u.roomCode}\u0000${rateplanCode}`;
        if (yaPuestos.has(clave)) continue; // dos precios en el mismo par: gana el primero
        yaPuestos.add(clave);

        const config = normalizarEstacionalidad(p.temporadas ?? p.finDeSemana);
        if (config) {
          seriesPorPlan.set(clave, serieDeTarifas({
            desde: start,
            hasta: end,
            tarifaBase: null,
            plan: { tarifa: p.tarifa, estacionalidad: config },
          }));
        } else {
          rates.push({
            roomCode: u.roomCode,
            rateplanCode,
            rate: p.tarifa,
          });
        }
      }
      continue;
    }

    // 2) Fallback: tarifa base de la unidad (un solo rateplan), bajo el código
    //    vinculado si lo hay. El roomCode solo como último recurso: no es un
    //    código de tarifa, y un proveedor que lo valide contra su catálogo lo
    //    descarta (la tarifa no llegaría sin que nada lo dijera).
    if (u.tarifaBase == null) continue;
    rates.push({
      roomCode: u.roomCode,
      rateplanCode: u.rateplanCodeMapeado || u.roomCode,
      rate: u.tarifaBase,
    });
  }

  if (rates.length === 0 && seriesPorPlan.size === 0) return [];

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  const updates: Array<{
    startDate: string;
    endDate: string;
    rates: Array<{ roomCode: string; rateplanCode: string; rate: number }>;
  }> = [];

  // Planes planos: un único bloque para todo el horizonte (como siempre).
  if (rates.length > 0) {
    const startIso = toIsoLocal(cursor);
    const endIso = toIsoLocal(new Date(last.getTime() - 86_400_000)); // inclusivo
    if (startIso <= endIso) {
      updates.push({ startDate: startIso, endDate: endIso, rates });
    }
  }

  // Planes con estacionalidad: segmentar la serie en tramos de precio
  // constante (la misma técnica que buildInventoryUpdates usa para cupos).
  for (const [clave, serie] of seriesPorPlan) {
    const [roomCode, rateplanCode] = clave.split('\u0000');
    let tramo: { desde: string; hasta: string; rate: number } | null = null;
    for (const fila of serie) {
      if (fila.tarifa == null) continue; // noche sin precio: no se inventa
      if (tramo && tramo.rate === fila.tarifa && isNextDay(tramo.hasta, fila.fecha)) {
        tramo.hasta = fila.fecha; // extender el tramo
        continue;
      }
      if (tramo) {
        updates.push({ startDate: tramo.desde, endDate: tramo.hasta, rates: [{ roomCode, rateplanCode, rate: tramo.rate }] });
      }
      tramo = { desde: fila.fecha, hasta: fila.fecha, rate: fila.tarifa };
    }
    if (tramo) {
      updates.push({ startDate: tramo.desde, endDate: tramo.hasta, rates: [{ roomCode, rateplanCode, rate: tramo.rate }] });
    }
  }

  return updates;
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
 * - `minimumStayArrival` / `maximumStayArrival` son la estancia mínima y máxima
 *   de la TEMPORADA que contiene cada fecha: aplican a las llegadas de ese día,
 *   que es justo la semántica de esos campos. Fuera de temporada van `null` —
 *   el `minimumStay` / `maximumStay` del plan siguen siendo la regla general y
 *   no se duplican en dos campos. Es la misma regla que validan la web de
 *   reservas y la reserva directa (`reglasDeVentaDeLlegada` y
 *   `validarEstancia`), así que el canal no puede aceptar una estancia que el
 *   motor interno rechaza.
 * - `closeOnArrival` / `closeOnDeparture` se calculan por día con los días de la
 *   semana EFECTIVOS de esa fecha de llegada (los de la temporada si los define,
 *   y si no los del plan), y el rango se segmenta solo cuando el resultado
 *   cambia de un día a otro (el mínimo de temporada, al variar por fecha, parte
 *   el rango en sus propios bloques).
 * - Solo se empujan planes activos con código: sin plan no se inventan
 *   restricciones.
 */
export function buildRateRestrictions(
  units: Array<{
    roomCode: string | null;
    /** Código de tarifa vinculado de la unidad: respaldo del plan sin código. */
    rateplanCodeMapeado?: string | null;
    ratePlans?: Array<{
      codigo: string | null;
      minNoches?: number | null;
      maxNoches?: number | null;
      checkInDias?: unknown;
      checkOutDias?: unknown;
      /** Estacionalidad del plan (Json crudo): su `minNoches` viaja como `minimumStayArrival`. */
      temporadas?: unknown;
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
    /** Temporadas ya normalizadas: se consultan una vez por día, no por plan y día. */
    estacionalidad: ConfigEstacionalidad | null;
  }> = [];

  const vistos = new Set<string>();
  for (const u of units) {
    if (!u.roomCode) continue;
    for (const p of u.ratePlans || []) {
      // Mismo criterio que el push de tarifas: el código del plan o el del
      // vínculo, y sin ninguno no se inventan restricciones para una tarifa que
      // el canal no conoce. El par repetido se cuenta una sola vez.
      const rateplanCode = p.codigo || u.rateplanCodeMapeado;
      if (!rateplanCode) continue;
      const clave = `${u.roomCode}\u0000${rateplanCode}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      plans.push({
        roomCode: u.roomCode,
        rateplanCode,
        minimumStay: typeof p.minNoches === 'number' && p.minNoches > 0 ? p.minNoches : 1,
        maximumStay: typeof p.maxNoches === 'number' && p.maxNoches > 0 ? p.maxNoches : null,
        checkInDias: p.checkInDias ?? null,
        checkOutDias: p.checkOutDias ?? null,
        estacionalidad: normalizarEstacionalidad(p.temporadas),
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
    const rates: RateRestrictionsPushUpdate['rates'] = plans.map((p) => {
      // La temporada de esta FECHA DE LLEGADA (null fuera de temporada): sus
      // reglas reemplazan campo a campo a las del plan, que es la misma decisión
      // que toma el motor interno. Repetir aquí el mínimo o el máximo generales
      // sería una restricción que el hotel no configuró.
      const temporada = temporadaDeFecha(p.estacionalidad, cursor);
      return {
        roomCode: p.roomCode,
        rateplanCode: p.rateplanCode,
        restrictions: restrictionFields({
          minimumStay: p.minimumStay,
          minimumStayArrival: temporada?.minNoches ?? null,
          maximumStay: p.maximumStay,
          maximumStayArrival: temporada?.maxNoches ?? null,
          closeOnArrival: !diaPermitido(temporada?.checkInDias ?? p.checkInDias, cursor),
          closeOnDeparture: !diaPermitido(temporada?.checkOutDias ?? p.checkOutDias, cursor),
        }),
      };
    });
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