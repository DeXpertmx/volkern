/**
 * Reservas vivas que el canal reporta y el ERP no tiene — aviso temprano.
 *
 * El barrido de reconciliación SÍ lo detecta (las crea), pero corre una vez al
 * día: un push perdido a las 09:00 se descubre al día siguiente, y mientras
 * tanto el canal tiene vendidas noches que aquí están libres — la sobreventa se
 * cocina en esas horas, no en el momento del barrido. Esto es la misma
 * comparación —el mismo proveedor, la misma ventana, la misma regla de estancia
 * importable— pero **sin escribir absolutamente nada**: devuelve la lista para
 * que el panel de Conectividad avise en el momento y quien opera lance el
 * barrido a mano cuando quiera («Ejecutar reconciliación», que sí escribe).
 *
 * ── Por qué esto NO es un `dryRun` del barrido ─────────────────────────────
 * En este módulo no existe ningún camino que llame a `processBook`,
 * `processModify` o `processCancel`, que escriba un log, que empuje al canal o
 * que toque el estado de la capa. Que un aviso no pueda crear ni cancelar
 * reservas es una propiedad de la ESTRUCTURA —lo único que se importa son
 * lecturas—, no de un condicional que una edición futura pueda olvidar. Una
 * guardia de fuente lo comprueba (`tests/hospitality-reservas-faltantes.test.ts`).
 *
 * ── Lo que comparte con el barrido es a propósito (una sola verdad) ────────
 *   - la ventana del fetch: `ventanaFetchReservas` (fechas de RESERVA),
 *   - la forma del contrato: `normalizePayload`,
 *   - la regla de estancia importable: `estanciaImportable`,
 *   - la resolución del vínculo: `resolveMapping`.
 * Así el número que enseña el aviso es exactamente el que el barrido crearía
 * si se lanzara ahora mismo, y no dos cuentas parecidas.
 *
 * ── Qué NO cubre (límites explícitos, para no prometer de más) ─────────────
 *   - Una reserva que aquí EXISTE pero está cancelada mientras el canal la
 *     sigue vendiendo no aparece: el barrido la ve como `modify` y la deja
 *     cancelada (`processModify` no revive una cancelación), así que no es
 *     «falta» sino otra cosa —sigue fuera de alcance a propósito—.
 *   - Una reserva cuyo `roomCode` no tiene vínculo activo (`sinVinculo`) se
 *     cuenta pero no se lista: traerla necesita vincular la unidad primero, y
 *     el botón de reconciliar no lo haría.
 *   - Un push PERDIDO no es lo único que explica una faltante (también puede
 *     ser un vínculo recién creado o una reserva hecha antes del alta), pero es
 *     el caso que hay que mirar primero: es el único que se repite solo.
 *
 * Aislamiento multi-tenant: la propiedad se resuelve por su mapping y la
 * existencia se busca con la misma clave única del barrido (tenantId + canal +
 * bookingId del canal), nunca con identificadores del cliente HTTP.
 */

import { prisma } from '@/lib/db';
import { fetchReservations } from './connectivity';
// La puerta de forma del contrato vive con el barrido: es su contrato, y el
// aviso no debe tener una copia que pueda divergir. Dependencia de UN sentido
// (el barrido no importa este módulo): nada de ciclos.
import { normalizePayload } from './reconciliation';
import { resolveMapping } from './reservations';
import {
  DIAS_BARRIDO_RESERVAS_ADELANTE,
  DIAS_BARRIDO_RESERVAS_ATRAS,
  estanciaImportable,
  ventanaFetchReservas,
} from './ventana-reservas';

/**
 * Tope de propiedades sondeadas por comprobación: cada una es una llamada al
 * proveedor (medida: 335-602 ms). Lo que quede fuera se cuenta en
 * `propiedadesNoSondeadas` — un silencio acotado se dice, no se esconde.
 */
export const MAX_PROPIEDADES_SONDA = 20;

/** Tope de reservas listadas: el contador `faltantes` es el número real. */
export const MAX_LISTADO_FALTANTES = 50;

/** Una reserva viva del proveedor que el ERP no tiene. */
export interface ReservaFaltante {
  propertyId: string;
  propertyNombre: string;
  hotelCode: string;
  channel: string;
  /** `bookingId` del canal: lo que el operador ve en la extranet de la OTA. */
  externalBookingId: string;
  /** Nombre del huésped si el payload lo trae (reconocerla de un vistazo). */
  huesped: string | null;
  checkIn: string | null;
  checkOut: string | null;
  /** Noches vendidas en el canal que aquí siguen abiertas. */
  noches: number | null;
  /** Cuándo se hizo la reserva (fechas de RESERVA = lo que filtra el proveedor). */
  bookedOn: string | null;
  /** Unidad del catálogo a la que apunta el roomCode, si está vinculada. */
  unidad: string | null;
  huespedes: number;
}

/** Resultado de una comprobación (varias propiedades, solo lectura). */
export interface ResumenReservasFaltantes {
  ok: boolean;
  /** Propiedades con vínculo activo que se sondearon. */
  propiedades: number;
  /** Propiedades con vínculo que quedaron fuera por el tope. */
  propiedadesNoSondeadas: number;
  /** Reservas que devolvió el proveedor en la ventana (todas las propiedades). */
  totalFetch: number;
  /** Las que el ERP no tiene: el barrido las crearía ahora mismo. */
  faltantes: number;
  /** Estancias terminadas hace más de `DIAS_ESTANCIA_IMPORTABLE` días: fuera por diseño. */
  historicas: number;
  /** Items sin la forma del contrato: no se pueden ni comparar. */
  sinForma: number;
  /** Cancelaciones reportadas: no son reservas vivas (las trata el barrido). */
  cancelaciones: number;
  /** Reportadas con una estancia importable pero sin vínculo de unidad activo. */
  sinVinculo: number;
  /** Items cuyo vínculo apunta a OTRA propiedad (dos propiedades, mismo hotelCode). */
  ajenas: number;
  /** Cuándo se preguntó al proveedor (ISO): esto es en vivo, no un log. */
  comprobadoEn: string;
  errores: string[];
  /** Las faltantes, recortadas a `MAX_LISTADO_FALTANTES`. */
  lista: ReservaFaltante[];
}

/** `YYYY-MM-DD` de un campo de fecha del contrato, o null si no tiene esa forma. */
function aFecha(v: unknown): string | null {
  const iso = typeof v === 'string' ? v.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/**
 * Noches entre dos fechas del contrato, en días de calendario.
 *
 * Se calcula sobre las cadenas ISO (UTC): el número de noches de una estancia
 * no puede depender de la zona horaria del servidor, y `new Date('2026-03-29')`
 * cruzaría un cambio de horario si se hiciera con fechas locales.
 */
function nochesEntre(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Huéspedes del primer cuarto del payload, con los MISMOS valores por defecto
 * que usa el barrido al construir la reserva (1 adulto, 0 niños): si aquí se
 * contaran de otra forma, el panel enseñaría otra ocupación que la que entra.
 */
function aHuespedes(payload: { rooms?: Array<{ occupancy?: { adults?: number | null; children?: number | null } | null }> | null }): number {
  const occ = payload.rooms?.[0]?.occupancy;
  return (occ?.adults ?? 1) + (occ?.children ?? 0);
}

/**
 * Comprueba, contra el proveedor y sin escribir nada, qué reservas vivas del
 * canal faltan en el ERP.
 *
 * Sin `tenantId` comprueba todas las propiedades de todos los tenants con
 * vínculo de conectividad activo (la ruta es de superadmin).
 */
export async function detectarReservasFaltantes(input?: {
  tenantId?: string;
  propertyId?: string;
  /** Días hacia atrás del fetch (por defecto, el horizonte de venta). */
  diasAtras?: number;
  /** Tope de propiedades sondeadas. */
  maxPropiedades?: number;
  /** Reloj inyectable (pruebas). */
  hoy?: Date;
}): Promise<ResumenReservasFaltantes> {
  const hoy = input?.hoy ?? new Date();
  const maxPropiedades = input?.maxPropiedades ?? MAX_PROPIEDADES_SONDA;
  const resumen: ResumenReservasFaltantes = {
    ok: true,
    propiedades: 0,
    propiedadesNoSondeadas: 0,
    totalFetch: 0,
    faltantes: 0,
    historicas: 0,
    sinForma: 0,
    cancelaciones: 0,
    sinVinculo: 0,
    ajenas: 0,
    comprobadoEn: new Date().toISOString(),
    errores: [],
    lista: [],
  };

  // Solo propiedades VINCULADAS: sin hotelCode no hay nada que preguntar.
  const candidatas = await prisma.hospitalityProperty.findMany({
    where: {
      ...(input?.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input?.propertyId ? { id: input.propertyId } : {}),
      mappings: { some: { provider: 'channel_connectivity', estado: 'activo' } },
    },
    select: {
      id: true,
      nombre: true,
      tenantId: true,
      mappings: {
        where: { provider: 'channel_connectivity', estado: 'activo' },
        select: { externalPropertyId: true },
        take: 1,
      },
    },
    orderBy: { fechaCreacion: 'asc' },
  });

  const propiedades = candidatas.filter((p) => p.mappings?.[0]?.externalPropertyId);
  resumen.propiedadesNoSondeadas = Math.max(0, propiedades.length - maxPropiedades);

  // La MISMA ventana que el barrido: fechas de RESERVA (ver ventana-reservas.ts).
  const ventana = ventanaFetchReservas(
    input?.diasAtras ?? DIAS_BARRIDO_RESERVAS_ATRAS,
    DIAS_BARRIDO_RESERVAS_ADELANTE,
    hoy
  );

  for (const prop of propiedades.slice(0, maxPropiedades)) {
    const hotelCode = prop.mappings[0].externalPropertyId as string;
    resumen.propiedades += 1;

    const fetch = await fetchReservations(hotelCode, ventana.startDate, ventana.endDate, prop.tenantId);
    if (!fetch.ok || !fetch.reservas) {
      // El fallo se reporta y se sigue con las demás propiedades: una capa
      // caída no puede dejar el aviso en blanco.
      resumen.ok = false;
      resumen.errores.push(`[${prop.nombre}] ${fetch.error || `HTTP ${fetch.httpStatus}`}`);
      continue;
    }

    resumen.totalFetch += fetch.reservas.length;

    // 1. Qué items del proveedor son reservas vivas que podrían faltar aquí.
    const candidatos: Array<{
      payload: NonNullable<ReturnType<typeof normalizePayload>>;
      unidad: string | null;
    }> = [];

    for (const item of fetch.reservas) {
      const payload = normalizePayload(item);
      if (!payload) {
        resumen.sinForma += 1;
        continue;
      }
      // Una cancelación no es una reserva viva: el barrido es quien la aplica.
      if (payload.action === 'cancel') {
        resumen.cancelaciones += 1;
        continue;
      }
      // Estancia terminada hace mucho: historia del hotel, no una incidencia
      // (misma regla que el barrido, para que los números coincidan).
      if (!estanciaImportable(payload.checkout, hoy)) {
        resumen.historicas += 1;
        continue;
      }

      const mapping = await resolveMapping(payload);
      // Sin vínculo (o con un vínculo sin propiedad) no se puede traer:
      // primero hay que vincular la unidad; el botón de reconciliar no lo haría.
      if (!mapping?.property) {
        resumen.sinVinculo += 1;
        continue;
      }
      if (mapping.property.id !== prop.id) {
        resumen.ajenas += 1;
        continue;
      }

      candidatos.push({ payload, unidad: mapping.unit?.nombre ?? null });
    }

    if (candidatos.length === 0) continue;

    // 2. Cuáles existen ya en el ERP. Una sola consulta con la misma clave
    //    única que usa el barrido (tenantId + canal + bookingId del canal).
    const existentes = await prisma.hospitalityReservation.findMany({
      where: {
        tenantId: prop.tenantId,
        channel: { in: [...new Set(candidatos.map((c) => c.payload.channel))] },
        externalBookingId: { in: [...new Set(candidatos.map((c) => c.payload.bookingId))] },
      },
      select: { channel: true, externalBookingId: true },
    });
    const yaEstan = new Set(existentes.map((r) => `${r.channel}|${r.externalBookingId}`));

    for (const c of candidatos) {
      const { payload } = c;
      if (yaEstan.has(`${payload.channel}|${payload.bookingId}`)) continue;

      resumen.faltantes += 1;
      if (resumen.lista.length >= MAX_LISTADO_FALTANTES) continue;

      const checkIn = aFecha(payload.checkin);
      const checkOut = aFecha(payload.checkout);
      const huesped =
        [payload.guest?.firstName, payload.guest?.lastName].filter(Boolean).join(' ').trim() ||
        payload.rooms?.[0]?.guestName?.trim() ||
        null;

      resumen.lista.push({
        propertyId: prop.id,
        propertyNombre: prop.nombre,
        hotelCode,
        channel: payload.channel,
        externalBookingId: payload.bookingId,
        huesped,
        checkIn,
        checkOut,
        noches: nochesEntre(checkIn, checkOut),
        bookedOn: aFecha(payload.bookedOn),
        unidad: c.unidad,
        huespedes: aHuespedes(payload),
      });
    }
  }

  return resumen;
}
