/**
 * Noches sin justificante en el proveedor — guardia de inventario (§29).
 *
 * No le pedimos inventario al proveedor: el contrato lista `Fetch Inventory`
 * (`POST /data/{pms}`) pero el adapter no lo implementa —solo pide reservas por
 * ese endpoint—, así que lo único que sabemos de lo que él cree es **lo último
 * que le empujamos**. Ese es el agujero por el que se cuelan las noches fantasma:
 * el push de una reserva de prueba cerró dos noches, la reserva se borró del ERP
 * y nadie volvió a empujar, así que el canal siguió vendiéndolas como ocupadas
 * durante días sin que nada lo dijera.
 *
 * Cuando `Fetch Inventory` esté implementado y verificado contra la cuenta real,
 * su respuesta será la fuente preferida y este replay quedará como respaldo; hoy
 * este es el único dato honesto, y cubre los dos sentidos del defecto.
 *
 * Esa guardia reconstruye el estado que el proveedor tiene por bueno —replay
 * de los pushes de inventario con éxito, el último que cubre cada noche es el
 * que manda— y lo compara con la disponibilidad que justifica el estado interno
 * (`availabilityByRoomCode`, la misma definición que empuja). Dos sentidos, y
 * los dos importan:
 *
 *   - `cerradas`   → el proveedor no vende una noche que aquí está libre:
 *                    se pierden ventas (noches fantasma).
 *   - `abiertas`   → el proveedor vende una noche que aquí ya está ocupada:
 *                    riesgo de SOBREVENTA (típico cuando un push falla).
 *
 * Reglas:
 *   - Solo se juzga lo que se empujó alguna vez: una noche sin ningún push con
 *     éxito queda como «sin dato» (no se inventa una divergencia).
 *   - Solo cuentan los pushes con `estado: 'exito'`: un push fallido no llegó al
 *     proveedor y no describe nada.
 *   - Diagnóstico, nunca acción: no se empuja nada por su cuenta. Reabrir las
 *     noches es un push manual (o el re-empuje de la limpieza del onboarding).
 *   - Aislamiento multi-tenant: todo se filtra por tenantId.
 */

import { prisma } from '@/lib/db';
import { availabilityByRoomCode, loadAvailabilityContext } from './availability';
import { toIsoDate } from './calendar';
import type { InventoryPushUpdate } from './connectivity';

/** Tipo de SyncLog del barrido: se guarda aparte de `inventory` a propósito. */
export const TIPO_LOG_DIVERGENCIAS_INVENTARIO = 'divergencias_inventario';

/**
 * Ventana de logs de push que pueden describir el presente: un push cubre como
 * mucho su horizonte (90 días por defecto), así que lo anterior ya solo habla
 * de fechas pasadas.
 */
const VENTANA_LOGS_DIAS = 100;
/**
 * Tope de logs por propiedad: acota el barrido sin perder el presente (en la
 * práctica el último push cubre todo el horizonte, así que sobran). Si alguna
 * noche se quedara fuera por este tope, saldría como «sin dato» — un silencio
 * honesto — y nunca como una divergencia inventada.
 */
const MAX_LOGS = 200;
/** Tope de noches listadas por sentido y propiedad: el log no es un volcado. */
const MAX_LISTADO = 50;
/** Tope de días que puede cubrir un tramo guardado (payload corrupto). */
const MAX_DIAS_TRAMO = 400;

/** Lo que el proveedor tiene por bueno de una noche de un tipo de habitación. */
export interface CeldaEmpujada {
  roomCode: string;
  fecha: string;
  /** Disponibilidad que se le comunicó. */
  available: number;
  /** Cuándo se le comunicó (antigüedad de la creencia). */
  empujadoEn: string;
}

/** Una noche en la que lo que cree el proveedor no lo justifica el estado interno. */
export interface NocheDivergente {
  roomCode: string;
  fecha: string;
  /** Disponibilidad que el proveedor tiene por buena. */
  proveedor: number;
  /** Disponibilidad que justifica el estado interno ahora mismo. */
  interno: number;
  /** Cuándo se empujó la creencia actual (null si no consta). */
  empujadoEn: string | null;
}

/** Resultado de la comparación para una propiedad. */
export interface DivergenciaPropiedad {
  propertyId: string;
  propertyNombre: string;
  hotelCode: string | null;
  /** El proveedor no vende noches que aquí sí son vendibles (se pierden ventas). */
  cerradasSinJustificar: number;
  /** El proveedor vende noches que el estado interno ya no justifica (sobreventa). */
  abiertasSinJustificar: number;
  /** Noches juzgadas (cubiertas por algún push con éxito). */
  comparadas: number;
  /** Noches de la ventana que ningún push cubre: no se pueden juzgar. */
  sinDato: number;
  /** Cuántos pushes con éxito contribuyeron al estado reconstruido. */
  logsUsados: number;
  /** Las noches concretas (recortadas a `MAX_LISTADO` por sentido). */
  cerradas: NocheDivergente[];
  abiertas: NocheDivergente[];
}

/** Resultado del barrido completo (varias propiedades). */
export interface ResumenDivergenciasInventario {
  ok: boolean;
  propiedades: number;
  cerradasSinJustificar: number;
  abiertasSinJustificar: number;
  comparadas: number;
  sinDato: number;
  /** Lo que hay que mirar, en una frase por propiedad afectada. */
  avisos: string[];
  errores: string[];
  detalle: DivergenciaPropiedad[];
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `YYYY-MM-DD` → fecha local. Estricto a propósito: un payload corrupto
 * (`2026-02-31`, que JS corre al 3 de marzo) no puede inventar noches.
 */
function fechaDeIso(iso: string): Date | null {
  if (!RE_FECHA.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null;
  return fecha;
}

function clave(roomCode: string, fecha: string): string {
  return `${roomCode}|${fecha}`;
}

/**
 * Interpreta `requestPayload` de un log de push como tramos de inventario.
 * Solo acepta la forma del contrato; cualquier otra cosa se ignora.
 */
export function leerTramos(payload: unknown): InventoryPushUpdate[] {
  const updates = (payload as { updates?: unknown } | null)?.updates;
  if (!Array.isArray(updates)) return [];
  return updates.filter((u): u is InventoryPushUpdate => {
    if (typeof u !== 'object' || u === null) return false;
    const t = u as Partial<InventoryPushUpdate>;
    return (
      typeof t.startDate === 'string' &&
      typeof t.endDate === 'string' &&
      Array.isArray(t.rooms)
    );
  });
}

/**
 * Reconstruye el estado que el proveedor tiene por bueno.
 *
 * Recorre los logs del más NUEVO al más viejo y se queda con el primero que
 * cubre cada noche: es exactamente el «UPSERT por rango» que recibe el
 * proveedor, donde el último push que cubre una fecha la sobrescribe.
 * `rango` acota a las fechas que se van a juzgar (la ventana interna).
 */
export function estadoEmpujado(
  logs: Array<{ fechaCreacion: Date | string; estado?: string | null; requestPayload?: unknown }>,
  rango: { desde: string | null; hasta: string | null }
): { celdas: Map<string, CeldaEmpujada>; logsUsados: number } {
  const celdas = new Map<string, CeldaEmpujada>();
  let logsUsados = 0;

  const ordenados = [...logs].sort(
    (a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()
  );

  for (const log of ordenados) {
    // Un push fallido no llegó al proveedor: no describe nada.
    if (log.estado && log.estado !== 'exito') continue;

    const empujadoEn = new Date(log.fechaCreacion).toISOString();
    let aporto = false;

    for (const tramo of leerTramos(log.requestPayload)) {
      const inicio = fechaDeIso(tramo.startDate);
      const fin = fechaDeIso(tramo.endDate);
      if (!inicio || !fin || fin.getTime() < inicio.getTime()) continue;

      const cursor = new Date(inicio);
      let dias = 0;
      while (cursor.getTime() <= fin.getTime() && dias < MAX_DIAS_TRAMO) {
        const fecha = toIsoDate(cursor);
        const dentroDelRango =
          (!rango.desde || fecha >= rango.desde) && (!rango.hasta || fecha <= rango.hasta);

        if (dentroDelRango) {
          for (const room of tramo.rooms) {
            const roomCode = typeof room?.roomCode === 'string' ? room.roomCode : null;
            // Estricto con el tipo: `Number(null)` es 0 y convertiría un payload
            // corrupto en una noche «cerrada» falsa.
            const available = room?.available;
            if (!roomCode || typeof available !== 'number' || !Number.isFinite(available)) continue;
            const k = clave(roomCode, fecha);
            if (celdas.has(k)) continue; // el push más nuevo ya la fijó
            celdas.set(k, { roomCode, fecha, available, empujadoEn });
            aporto = true;
          }
        }

        cursor.setDate(cursor.getDate() + 1);
        dias += 1;
      }
    }

    if (aporto) logsUsados += 1;
  }

  return { celdas, logsUsados };
}

/** Disponibilidad interna por noche y roomCode (la que justifica el ERP). */
export function indiceInterno(
  serie: Array<{ fecha: string; rooms: Array<{ roomCode: string; available: number }> }>
): Map<string, { fecha: string; roomCode: string; available: number }> {
  const indice = new Map<string, { fecha: string; roomCode: string; available: number }>();
  for (const dia of serie) {
    for (const room of dia.rooms) {
      indice.set(clave(room.roomCode, dia.fecha), {
        fecha: dia.fecha,
        roomCode: room.roomCode,
        available: room.available,
      });
    }
  }
  return indice;
}

/**
 * Compara lo que el proveedor cree con lo que justifica el estado interno.
 * Nunca juzga una noche que no se empujó: eso es «sin dato», no divergencia.
 */
export function compararInventario(input: {
  celdas: Map<string, CeldaEmpujada>;
  interno: Map<string, { fecha: string; roomCode: string; available: number }>;
  maxListado?: number;
}): {
  cerradas: NocheDivergente[];
  abiertas: NocheDivergente[];
  cerradasSinJustificar: number;
  abiertasSinJustificar: number;
  comparadas: number;
  sinDato: number;
} {
  const maxListado = input.maxListado ?? MAX_LISTADO;
  const cerradas: NocheDivergente[] = [];
  const abiertas: NocheDivergente[] = [];
  let cerradasSinJustificar = 0;
  let abiertasSinJustificar = 0;
  let comparadas = 0;
  let sinDato = 0;

  for (const [k, celda] of input.celdas) {
    // Sin fila interna el roomCode ya no existe aquí (o ninguna de sus unidades
    // se vende): lo que justifica el ERP es 0.
    const interno = input.interno.get(k)?.available ?? 0;
    comparadas += 1;

    if (celda.available === interno) continue;

    const noche: NocheDivergente = {
      roomCode: celda.roomCode,
      fecha: celda.fecha,
      proveedor: celda.available,
      interno,
      empujadoEn: celda.empujadoEn,
    };

    if (celda.available < interno) {
      cerradasSinJustificar += 1;
      if (cerradas.length < maxListado) cerradas.push(noche);
    } else {
      abiertasSinJustificar += 1;
      if (abiertas.length < maxListado) abiertas.push(noche);
    }
  }

  // Noches con estado interno que ningún push cubre: no se pueden juzgar.
  for (const k of input.interno.keys()) {
    if (!input.celdas.has(k)) sinDato += 1;
  }

  return {
    cerradas,
    abiertas,
    cerradasSinJustificar,
    abiertasSinJustificar,
    comparadas,
    sinDato,
  };
}

/**
 * Aviso legible de una propiedad con divergencias (null si está cuadrada).
 * Los dos sentidos van separados porque duelen distinto: uno pierde ventas y el
 * otro vende lo que no hay.
 */
export function avisoDePropiedad(d: DivergenciaPropiedad): string | null {
  const partes: string[] = [];
  if (d.cerradasSinJustificar > 0) {
    partes.push(
      `${d.cerradasSinJustificar} noche(s) que el proveedor NO vende y aquí sí están libres (se pierden ventas)`
    );
  }
  if (d.abiertasSinJustificar > 0) {
    partes.push(
      `${d.abiertasSinJustificar} noche(s) que el proveedor vende y el estado interno ya no justifica (riesgo de sobreventa)`
    );
  }
  if (partes.length === 0) return null;
  return `[${d.propertyNombre}] ${partes.join('; ')}.`;
}

/**
 * Barrido de divergencias de inventario de un tenant (§29).
 *
 * NO llama al proveedor: lee los pushes que ya le enviamos y los compara con el
 * estado interno. Deja una traza por propiedad en HospitalitySyncLog (tipo
 * `divergencias_inventario`), que es lo que lee el panel de conectividad.
 *
 * Diagnóstico, no acción: no empuja nada. Reabrir las noches es un push —el del
 * panel de conectividad o el de la limpieza del onboarding, que ya lo hace solo—.
 */
export async function detectarDivergenciasInventario(input: {
  tenantId: string;
  /** Si se omite, todas las propiedades del tenant con mapping activo. */
  propertyId?: string;
  /** Días hacia adelante que se juzgan (default 30). */
  dias?: number;
}): Promise<ResumenDivergenciasInventario> {
  const dias = input.dias ?? 30;
  const resumen: ResumenDivergenciasInventario = {
    ok: true,
    propiedades: 0,
    cerradasSinJustificar: 0,
    abiertasSinJustificar: 0,
    comparadas: 0,
    sinDato: 0,
    avisos: [],
    errores: [],
    detalle: [],
  };

  // Solo propiedades vinculadas: sin hotelCode no se empujó nada nunca, así que
  // no hay creencia del proveedor que auditar.
  const propiedades = await prisma.hospitalityProperty.findMany({
    where: { tenantId: input.tenantId, ...(input.propertyId ? { id: input.propertyId } : {}) },
    select: {
      id: true,
      nombre: true,
      mappings: {
        where: { provider: 'channel_connectivity', estado: 'activo' },
        select: { externalPropertyId: true },
        take: 1,
      },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizonte = new Date(today);
  horizonte.setDate(today.getDate() + dias);

  for (const prop of propiedades) {
    const hotelCode = prop.mappings?.[0]?.externalPropertyId ?? null;
    if (!hotelCode) continue;
    resumen.propiedades += 1;

    try {
      // 1. La disponibilidad que JUSTIFICA el estado interno: la misma función
      //    que se empuja, para que no haya dos verdades.
      const ctx = await loadAvailabilityContext(prisma, input.tenantId, prop.id, today, horizonte);
      const serie = availabilityByRoomCode(ctx.units, today, horizonte, ctx.reservations, ctx.blocks);
      const interno = indiceInterno(serie);
      const fechas = serie.map((d) => d.fecha).sort();

      // 2. Lo que el proveedor tiene por bueno: replay de los pushes con éxito.
      const desdeLogs = new Date(today);
      desdeLogs.setDate(today.getDate() - VENTANA_LOGS_DIAS);
      const logs = await prisma.hospitalitySyncLog.findMany({
        where: {
          tenantId: input.tenantId,
          propertyId: prop.id,
          tipo: 'inventory',
          estado: 'exito',
          fechaCreacion: { gte: desdeLogs },
        },
        orderBy: { fechaCreacion: 'desc' },
        take: MAX_LOGS,
        select: { fechaCreacion: true, estado: true, requestPayload: true },
      });

      const { celdas, logsUsados } = estadoEmpujado(logs, {
        desde: fechas[0] ?? null,
        hasta: fechas[fechas.length - 1] ?? null,
      });

      const comparacion = compararInventario({ celdas, interno });

      const detalle: DivergenciaPropiedad = {
        propertyId: prop.id,
        propertyNombre: prop.nombre,
        hotelCode,
        cerradasSinJustificar: comparacion.cerradasSinJustificar,
        abiertasSinJustificar: comparacion.abiertasSinJustificar,
        comparadas: comparacion.comparadas,
        sinDato: comparacion.sinDato,
        logsUsados,
        cerradas: comparacion.cerradas,
        abiertas: comparacion.abiertas,
      };

      resumen.detalle.push(detalle);
      resumen.cerradasSinJustificar += detalle.cerradasSinJustificar;
      resumen.abiertasSinJustificar += detalle.abiertasSinJustificar;
      resumen.comparadas += detalle.comparadas;
      resumen.sinDato += detalle.sinDato;

      const aviso = avisoDePropiedad(detalle);
      if (aviso) resumen.avisos.push(aviso);

      // 3. Traza por propiedad (§29/§30): el panel lee estos logs.
      try {
        await prisma.hospitalitySyncLog.create({
          data: {
            tenantId: input.tenantId,
            propertyId: prop.id,
            tipo: TIPO_LOG_DIVERGENCIAS_INVENTARIO,
            operacion: 'reconciliacion',
            estado: 'exito',
            requestPayload: {
              hotelCode,
              rango: `${fechas[0] ?? '—'} → ${fechas[fechas.length - 1] ?? '—'}`,
              dias,
              logsLeidos: logs.length,
            } as any,
            responseBody: {
              cerradasSinJustificar: detalle.cerradasSinJustificar,
              abiertasSinJustificar: detalle.abiertasSinJustificar,
              comparadas: detalle.comparadas,
              sinDato: detalle.sinDato,
              logsUsados: detalle.logsUsados,
              cerradas: detalle.cerradas,
              abiertas: detalle.abiertas,
            } as any,
          },
        });
      } catch (e) {
        console.error('[Hospitality] Error registrando divergencias de inventario:', e);
      }
    } catch (e: any) {
      // Un fallo en una propiedad no tumba el barrido de las demás.
      resumen.ok = false;
      resumen.errores.push(`[${prop.nombre}] ${e?.message ?? String(e)}`);
      console.error('[Hospitality] Error analizando inventario del proveedor:', e);
    }
  }

  return resumen;
}
