/**
 * Incidencias de conectividad: reservas que el webhook NO pudo registrar
 * porque el `roomCode` del payload no tenía vínculo con una unidad (guardia de
 * resolución, ver docs/hospitality-connectivity-contract.md).
 *
 * Aquí vive lo que comparten el listado de incidencias y el reenvío: cómo
 * reconocer los hotelCode propios de un tenant y cómo leer la habitación del
 * payload bruto guardado en el evento.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizeExternalCode } from './codigos';
import { testConnectivityConnection } from './connectivity';
import { TIPO_LINEA_PENALIZACION } from './penalizaciones';
import { CAPACIDADES_HOSPITALITY } from './capacidades';
import { hasPermisoDeRol } from '@/lib/permissions-core';
import { MONEDA_MINIMA_ESQUEMA } from '@/lib/moneda';

/** Vínculo activo que podría resolver una incidencia. */
export interface VinculoActivo {
  externalUnitCode: string | null;
  unit: { id: string; nombre: string } | null;
}

/**
 * Edad a partir de la cual un niño cuenta como huésped para la capacidad de la
 * unidad, al desempatar la vinculación automática.
 *
 * El payload del proveedor no trae edades (solo `children`), así que es una
 * política de la plataforma, no un dato: los menores de esta edad (bebés en
 * cuna) no consumen plaza. Configurable con `HOSPITALITY_EDAD_NINO_UMBRAL`.
 */
export const EDAD_NINO_UMBRAL = 4;

/** Umbral configurable: los menores de esa edad no cuentan como huésped. */
export function edadNinoUmbral(): number {
  // Vacío o ausente → default. `Number('')` es 0, y una variable copiada vacía
  // del .env.example no puede desactivar la exención de bebés por accidente.
  const crudo = process.env.HOSPITALITY_EDAD_NINO_UMBRAL?.trim();
  if (!crudo) return EDAD_NINO_UMBRAL;
  const n = Number(crudo);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : EDAD_NINO_UMBRAL;
}

/** Incidencia de conectividad: reservas rechazadas por una misma habitación. */
export interface IncidenciaConectividad {
  hotelCode: string;
  propertyId: string | null;
  property: string | null;
  roomCode: string | null;
  rateplanCode: string | null;
  /** `propiedad_sin_mapping`: el hotelCode entero está sin vincular. */
  tipo: 'roomcode_sin_mapping' | 'propiedad_sin_mapping' | 'multi_habitacion';
  /** Solo multi_habitación: habitaciones del booking con su estado de registro. */
  habitaciones?: Array<{
    indice: number;
    roomCode: string | null;
    /** bookingId completo del evento (las partes derivan como bookingId#n). */
    bookingId: string | null;
    roomGuestName: string | null;
    ocupacion: { adultos: number; ninos: number } | null;
    /** Ids derivados ya registrados como reservas (bookingId#n). */
    registradas: string[];
  }>;
  intentos: number;
  primeraFecha: string;
  ultimaFecha: string;
  canales: string[];
  acciones: string[];
  /** Muestra de reservas afectadas (hasta 5). */
  bookingIds: string[];
  /** Reservas de este grupo que ya están registradas en el sistema. */
  registradas: number;
  /**
   * Eventos que se pueden reenviar ahora con
   * POST /api/hospitality/incidencias/reintentar: vacío mientras falte el
   * vínculo, y sin las reservas que ya están registradas.
   */
  eventoIds: string[];
  /** Vínculo que resolvería la incidencia (si ya existe, solo falta reenviar). */
  vinculo: { unitId: string | null; unit: string | null; externalUnitCode: string } | null;
  /**
   * Huéspedes reales de las reservas del grupo, según el payload. `null` cuando
   * el canal no los publica: entonces la ocupación real no participa.
   */
  ocupacion: OcupacionReserva | null;
  /**
   * Payload bruto del evento más reciente que publicó la `ocupacion`: permite
   * leer las edades de los niños (los menores del umbral no consumen plaza).
   * `null` cuando la reserva no publica ocupación.
   */
  payload: unknown;
  /** Mensaje del intento más reciente, tal como quedó auditado. */
  errorMensaje: string | null;
}

export interface ResumenIncidencias {
  pendientes: number;
  vinculadas: number;
  resueltas: number;
  eventosAnalizados: number;
}

/** Todo lo que sabemos de un hotelCode por pertenecer al tenant. */
export interface InfoHotelCode {
  propertyId: string;
  property: string;
  activos: VinculoActivo[];
}

/**
 * Huéspedes que vienen en la reserva según el payload (`rooms[0].occupancy`).
 *
 * Es la ocupación **real** de esa reserva, no el rango que el proveedor publica
 * para el tipo de habitación: sirve para desempatar la unidad cuando el rango
 * no distingue (una reserva de 2 personas no es lo mismo que el máximo del tipo).
 */
export interface OcupacionReserva {
  adultos: number;
  ninos: number;
  total: number;
}

/**
 * Ocupación real que publica el payload, o `null` si no dice cuántos vienen.
 *
 * `null` no es "cero huéspedes": es "no se sabe", y entonces la ocupación real
 * no participa en la decisión. Nunca se inventa una ocupación.
 */
export function ocupacionDePayload(payload: unknown): OcupacionReserva | null {
  const rooms = (payload as { rooms?: unknown } | null)?.rooms;
  const room = Array.isArray(rooms) ? (rooms[0] as Record<string, unknown> | undefined) : undefined;
  const occ = room?.occupancy;
  if (!occ || typeof occ !== 'object') return null;
  const crudo = occ as Record<string, unknown>;
  const adultos = numeroOcupacion(crudo.adults) ?? 0;
  const ninos = numeroOcupacion(crudo.children) ?? 0;
  const total = adultos + ninos;
  if (total <= 0) return null;
  return { adultos, ninos, total };
}

/**
 * ¿El payload trae más de una habitación? El motor no registra estos payloads
 * (una reserva por booking): quedan como incidente para que decida una persona.
 */
export function esPayloadMultiHabitacion(payload: unknown): boolean {
  const rooms = (payload as { rooms?: unknown } | null)?.rooms;
  return Array.isArray(rooms) && rooms.length > 1;
}

/** Lee roomCode/rateplanCode y la ocupación real del payload de un evento. */
export function leerHabitacion(payload: unknown): {
  roomCode: string | null;
  rateplanCode: string | null;
  ocupacion: OcupacionReserva | null;
} {
  const rooms = (payload as { rooms?: unknown } | null)?.rooms;
  const room = Array.isArray(rooms) ? (rooms[0] as Record<string, unknown> | undefined) : undefined;
  const roomCode = typeof room?.roomCode === 'string' ? room.roomCode.trim() || null : null;
  const rateplanCode = typeof room?.rateplanCode === 'string' ? room.rateplanCode.trim() || null : null;
  return { roomCode, rateplanCode, ocupacion: ocupacionDePayload(payload) };
}

/** Eventos analizados por petición (los más recientes primero). */
const MAX_EVENTOS = 300;
/** Reservas distintas que se guardan por grupo (para mostrar y reenviar). */
const MAX_RESERVAS_POR_GRUPO = 20;
/** Reservas distintas que se listan en la respuesta (las demás solo cuentan). */
const MAX_RESERVAS_VISIBLES = 5;

/**
 * Lista las incidencias del tenant (todas sus propiedades o solo una).
 *
 * `ok: false` solo cuando se pidió una propiedad que no es del tenant; el
 * resto de casos devuelve una lista (posiblemente vacía).
 */
export async function listarIncidencias(
  tenantId: string,
  propertyId?: string | null
): Promise<
  | { ok: true; incidencias: IncidenciaConectividad[]; resumen: ResumenIncidencias }
  | { ok: false; status: number; error: string }
> {
  const porHotelCode = await cargarHotelCodesDelTenant(tenantId, propertyId);
  if (!porHotelCode) {
    return { ok: false, status: 404, error: 'La propiedad no existe en este tenant' };
  }

  const resumenVacio: ResumenIncidencias = {
    pendientes: 0,
    vinculadas: 0,
    resueltas: 0,
    eventosAnalizados: 0,
  };
  if (porHotelCode.size === 0) return { ok: true, incidencias: [], resumen: resumenVacio };

  const eventos = await prisma.hospitalityWebhookEvent.findMany({
    where: { estado: 'sin_mapping', hotelCode: { in: [...porHotelCode.keys()] } },
    orderBy: { fechaCreacion: 'desc' },
    take: MAX_EVENTOS,
    select: {
      id: true,
      hotelCode: true,
      bookingId: true,
      channel: true,
      action: true,
      errorMensaje: true,
      payload: true,
      fechaCreacion: true,
    },
  });

  interface Grupo extends IncidenciaConectividad {
    reservas: Array<{ bookingId: string | null; eventoId: string }>;
  }
  const grupos = new Map<string, Grupo>();

  for (const ev of eventos) {
    const hotelCode = ev.hotelCode ?? '';
    const info = porHotelCode.get(hotelCode);
    const { roomCode, rateplanCode, ocupacion } = leerHabitacion(ev.payload);
    const clave = `${hotelCode}|${normalizeExternalCode(roomCode)}|${normalizeExternalCode(rateplanCode)}`;

    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = {
        hotelCode,
        propertyId: info?.propertyId ?? null,
        property: info?.property ?? null,
        roomCode,
        rateplanCode,
        tipo: info && info.activos.length > 0 ? 'roomcode_sin_mapping' : 'propiedad_sin_mapping',
        intentos: 0,
        primeraFecha: ev.fechaCreacion.toISOString(),
        ultimaFecha: ev.fechaCreacion.toISOString(),
        canales: [],
        acciones: [],
        bookingIds: [],
        registradas: 0,
        eventoIds: [],
        vinculo: null,
        ocupacion: null,
        payload: null,
        errorMensaje: null,
        reservas: [],
      };
      grupos.set(clave, grupo);
    }

    // Los eventos llegan del más reciente al más antiguo: la ocupación de la
    // reserva más reciente que la publique representa al grupo, y su payload
    // viaja con ella (las edades de los niños se leen de ahí).
    if (!grupo.ocupacion && ocupacion) {
      grupo.ocupacion = ocupacion;
      grupo.payload = ev.payload;
    }

    // Multi-habitación: el problema no es el vínculo, es que el booking trae
    // varias habitaciones y este sistema registra una por booking.
    if (esPayloadMultiHabitacion(ev.payload)) grupo.tipo = 'multi_habitacion';

    // Los eventos llegan del más reciente al más antiguo: el primero fija la
    // fecha y el mensaje, y el último que pasa deja la fecha más antigua.
    grupo.intentos += 1;
    grupo.primeraFecha = ev.fechaCreacion.toISOString();
    if (!grupo.errorMensaje) grupo.errorMensaje = ev.errorMensaje;
    if (ev.channel && !grupo.canales.includes(ev.channel)) grupo.canales.push(ev.channel);
    if (ev.action && !grupo.acciones.includes(ev.action)) grupo.acciones.push(ev.action);

    // Una reserva puede llegar varias veces (reenvíos del canal): se conserva
    // el evento más reciente de cada una.
    const repetida = ev.bookingId
      ? grupo.reservas.some((r) => r.bookingId === ev.bookingId)
      : false;
    if (!repetida && grupo.reservas.length < MAX_RESERVAS_POR_GRUPO) {
      grupo.reservas.push({ bookingId: ev.bookingId ?? null, eventoId: ev.id });
    }
  }

  // Reservas que ya están registradas: no hay que reenviarlas.
  const bookingIds = [
    ...new Set(
      [...grupos.values()].flatMap((g) =>
        g.reservas.map((r) => r.bookingId).filter((b): b is string => !!b)
      )
    ),
  ];
  const registradas = bookingIds.length
    ? await prisma.hospitalityReservation.findMany({
        where: {
          tenantId,
          OR: [
            { externalBookingId: { in: bookingIds } },
            // Partes derivadas de bookings multi-habitación (bookingId#n).
            ...bookingIds.map((b) => ({ externalBookingId: { startsWith: `${b}#` } })),
          ],
        },
        select: { externalBookingId: true, estado: true },
      })
    : [];
  const yaRegistradas = new Set(registradas.map((r) => r.externalBookingId));
  // Un cancel solo tiene efecto sobre reservas registradas que siguen vivas:
  // las ya canceladas no necesitan nada.
  const canceladas = new Set(
    registradas.filter((r) => r.estado === 'cancelled').map((r) => r.externalBookingId)
  );

  let pendientes = 0;
  let vinculadas = 0;
  let resueltas = 0;
  const conIncidencia: Grupo[] = [];

  for (const grupo of grupos.values()) {
    const info = porHotelCode.get(grupo.hotelCode);
    const vinculo = vinculoParaRoomCode(info, grupo.roomCode);
    grupo.vinculo = vinculo
      ? {
          unitId: vinculo.unit?.id ?? null,
          unit: vinculo.unit?.nombre ?? null,
          externalUnitCode: vinculo.externalUnitCode ?? '',
        }
      : null;

    const registradasDeGrupo = grupo.reservas.filter(
      (r) => r.bookingId && yaRegistradas.has(r.bookingId)
    ).length;
    const esCancel = grupo.acciones.length === 1 && grupo.acciones[0] === 'cancel';
    const esMulti = grupo.tipo === 'multi_habitacion';
    // Reenviables: book/modify sin registrar (el vínculo decide si se ofrece);
    // en un grupo de cancel, las reservas registradas que siguen vivas — el
    // cancel se aplica por bookingId aunque la unidad siga sin mapping.
    // Un grupo multi-habitación nunca se ofrece: reenviar reproduciría el
    // mismo rechazo (el booking trae varias habitaciones, no falta un vínculo).
    const aReenviar = esMulti
      ? []
      : esCancel
        ? grupo.reservas.filter(
            (r) => r.bookingId && yaRegistradas.has(r.bookingId) && !canceladas.has(r.bookingId)
          )
        : grupo.reservas.filter((r) => !r.bookingId || !yaRegistradas.has(r.bookingId));

    // Habitaciones de un booking multi-habitación, con lo ya registrado: una
    // parte existe si algún bookingId#n derivado está entre las reservas.
    let habitacionesMulti: IncidenciaConectividad['habitaciones'] = undefined;
    if (esMulti) {
      // El evento más reciente del grupo manda: sus habitaciones son las que
      // se ofrecen a partir (un reenvío del canal refresca el payload).
      const eventosMulti = eventos.filter(
        (e) =>
          esPayloadMultiHabitacion(e.payload) &&
          e.hotelCode === grupo.hotelCode &&
          grupo.reservas.some((r) => r.eventoId === e.id)
      );
      const bookingBase = grupo.reservas.map((r) => r.bookingId).find((b) => !!b) ?? null;
      const partesRegistradas = bookingBase
        ? registradas.filter((r) => r.externalBookingId.startsWith(`${bookingBase}#`))
        : [];
      habitacionesMulti = eventosMulti.slice(0, 1).flatMap((e) => {
        const rooms = Array.isArray((e.payload as { rooms?: unknown } | null)?.rooms)
          ? ((e.payload as { rooms: unknown[] }).rooms as Array<Record<string, unknown>>)
          : [];
        return rooms.map((room, indice) => ({
          indice,
          roomCode: typeof room?.roomCode === 'string' ? room.roomCode : null,
          bookingId: bookingBase,
          roomGuestName: typeof room?.guestName === 'string' ? room.guestName : null,
          ocupacion: (() => {
            const occ = room?.occupancy as Record<string, unknown> | undefined;
            if (!occ) return null;
            const adultos = Number(occ.adults);
            const ninos = Number(occ.children);
            if (!Number.isFinite(adultos) && !Number.isFinite(ninos)) return null;
            return {
              adultos: Number.isFinite(adultos) ? adultos : 0,
              ninos: Number.isFinite(ninos) ? ninos : 0,
            };
          })(),
          registradas: partesRegistradas
            .filter((r) => r.externalBookingId === `${bookingBase}#${indice + 1}`)
            .map((r) => r.externalBookingId),
        }));
      });
      grupo.habitaciones = habitacionesMulti;
    }

    grupo.registradas = registradasDeGrupo;
    // Solo se ofrece reenviar lo que el reenvío puede procesar: book/modify
    // exigen vínculo, y un cancel sin reserva registrada no tiene efecto.
    // Un grupo multi-habitación no se reenvía (reproduciría el rechazo), pero
    // se mantiene OFRECIDO mientras queden habitaciones sin su parte: el evento
    // viaja en eventoIds para el registro manual partido.
    const quedanPartes =
      esMulti && habitacionesMulti ? habitacionesMulti.some((h) => h.registradas.length === 0) : false;
    grupo.eventoIds =
      esMulti
        ? quedanPartes && grupo.reservas.length > 0
          ? grupo.reservas.map((r) => r.eventoId)
          : []
        : (esCancel || grupo.vinculo)
          ? aReenviar.map((r) => r.eventoId)
          : [];
    grupo.bookingIds = grupo.reservas
      .map((r) => r.bookingId)
      .filter((b): b is string => !!b)
      .slice(0, MAX_RESERVAS_VISIBLES);

    // Todos los efectos del grupo ya están aplicados: los book/modify están
    // registrados, y los cancel dejaron la reserva cancelada. Un cancel cuya
    // reserva nunca llegó no se da por resuelto: se queda a la vista. Un
    // multi-habitación se resuelve cuando TODAS sus habitaciones tienen su
    // parte registrada (bookingId#n).
    const resuelto =
      esMulti
        ? (habitacionesMulti?.length ?? 0) > 0 &&
          habitacionesMulti!.every((h) => h.registradas.length > 0)
        : esCancel
          ? grupo.reservas.length > 0 &&
            grupo.reservas.every((r) => r.bookingId && canceladas.has(r.bookingId))
          : grupo.reservas.length > 0 && aReenviar.length === 0;
    if (resuelto) {
      resueltas += 1;
      continue;
    }

    // Un grupo de cancel no pide vincular nada: su acción es cancelar, y el
    // reenvío (si procede) no depende del mapping de la unidad. Un grupo
    // multi-habitación tampoco: su arreglo es partir la reserva, y se cuenta
    // como pendiente mientras queden habitaciones sin registrar.
    const esSoloCancel = grupo.acciones.length === 1 && grupo.acciones[0] === 'cancel';
    if (grupo.tipo === 'multi_habitacion') {
      if (quedanPartes) pendientes += 1;
    } else if (esSoloCancel) {
      // Se queda visible mientras quede algo por aplicar (la reserva registrada
      // y viva que espera su cancel).
    } else if (grupo.vinculo) {
      vinculadas += 1;
    } else {
      pendientes += 1;
    }
    conIncidencia.push(grupo);
  }

  conIncidencia.sort((a, b) => {
    // Primero lo que no se resuelve vinculando (multi-habitación); luego lo que
    // falta vincular; dentro de cada bloque, lo más reciente.
    const bloqueA = a.tipo === 'multi_habitacion' ? 0 : a.vinculo ? 1 : 0;
    const bloqueB = b.tipo === 'multi_habitacion' ? 0 : b.vinculo ? 1 : 0;
    if (bloqueA !== bloqueB) return bloqueA - bloqueB;
    return new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime();
  });

  // Los campos internos (reservas por grupo) no salen al cliente.
  const incidencias = conIncidencia.map(({ reservas: _reservas, ...incidencia }) => incidencia);

  return {
    ok: true,
    incidencias,
    resumen: { pendientes, vinculadas, resueltas, eventosAnalizados: eventos.length },
  };
}

/**
 * Moneda del cargo de no-show cuando la reserva no la trae.
 *
 * Es el mínimo que acepta el esquema —las columnas de moneda no admiten
 * nulos—, no una divisa elegida: vive en `lib/moneda.ts` para que no haya un
 * código suelto fuera del único módulo que puede tenerlos.
 */
export const PENALIZACION_MONEDA_DEFECTO = MONEDA_MINIMA_ESQUEMA;

/** Una reserva que el canal reportó como no-show, para el panel. */
export interface NoShowCanal {
  reservationId: string;
  bookingId: string | null;
  /** Referencia del canal tal como la ve el operador. */
  referencia: string;
  canal: string;
  hotelCode: string;
  propertyId: string | null;
  property: string | null;
  /** Unidad, si la reserva aún tiene una asignada. */
  unit: string | null;
  huesped: string | null;
  email: string | null;
  checkIn: string;
  checkOut: string;
  /** Cuándo reportó el canal el no-show (evento más reciente). */
  reportadoEn: string;
  /** Cuántas veces reenvió el canal el evento. */
  intentos: number;
  estado: string;
  /** El cargo emitido por la transición (regla 8). `null` si no se emitió. */
  penalizacion: { importe: number; moneda: string; facturada: boolean } | null;
}

export interface ResumenNoShowsCanal {
  total: number;
  conPenalizacion: number;
}

/**
 * No-shows que el canal reportó por el webhook (`action: "no_show"`), con el
 * importe emitido de cada penalización.
 *
 * Es el mismo dato que ya vive en `HospitalityWebhookEvent`, presentado al
 * operador: qué reservas marcó el canal, cuándo, y cuánto se le está cobrando.
 * No es un módulo nuevo de negocio — solo lectura, agrupada por reserva
 * (un canal que reintenta el evento no debe producir dos filas).
 */
export async function listarNoShowsCanal(
  tenantId: string,
  propertyId?: string | null
): Promise<
  | { ok: true; noShows: NoShowCanal[]; resumen: ResumenNoShowsCanal }
  | { ok: false; status: number; error: string }
> {
  const porHotelCode = await cargarHotelCodesDelTenant(tenantId, propertyId);
  if (!porHotelCode) {
    return { ok: false, status: 404, error: 'La propiedad no existe en este tenant' };
  }
  if (porHotelCode.size === 0) return { ok: true, noShows: [], resumen: { total: 0, conPenalizacion: 0 } };

  // Los eventos de no_show se registran CON tenantId y reservationId, pero se
  // filtra por hotelCode igual que las incidencias: la pertenencia al tenant
  // se deriva del hotelCode, no del campo (defensa en profundidad).
  const eventos = await prisma.hospitalityWebhookEvent.findMany({
    where: { action: 'no_show', estado: 'procesado', hotelCode: { in: [...porHotelCode.keys()] } },
    orderBy: { fechaCreacion: 'desc' },
    take: MAX_EVENTOS,
    select: {
      reservationId: true,
      bookingId: true,
      channel: true,
      hotelCode: true,
      fechaCreacion: true,
    },
  });

  // La reserva más reciente de cada bookingId: los reintentos del canal no
  // producen filas repetidas.
  const porReserva = new Map<string, (typeof eventos)[number]>();
  for (const ev of eventos) {
    if (!ev.reservationId || !ev.bookingId) continue;
    if (!porReserva.has(ev.bookingId)) porReserva.set(ev.bookingId, ev);
  }
  if (porReserva.size === 0) return { ok: true, noShows: [], resumen: { total: 0, conPenalizacion: 0 } };

  const reservas = await prisma.hospitalityReservation.findMany({
    where: {
      tenantId,
      id: { in: [...porReserva.values()].map((e) => e.reservationId as string) },
    },
    select: {
      id: true,
      propertyId: true,
      unitId: true,
      channel: true,
      externalBookingId: true,
      estado: true,
      checkIn: true,
      checkOut: true,
      guestData: true,
      unit: { select: { nombre: true } },
      property: { select: { nombre: true } },
      items: {
        where: { tipo: TIPO_LINEA_PENALIZACION },
        select: { importeTotal: true, moneda: true, invoiceId: true },
        take: 1,
      },
    },
  });

  const filas: NoShowCanal[] = [];
  let conPenalizacion = 0;

  for (const r of reservas) {
    const ev = porReserva.get(r.externalBookingId);
    if (!ev) continue; // la reserva se borró; el evento viejo no se muestra solo
    const item = r.items[0];
    if (item) conPenalizacion += 1;
    const huesped = (r.guestData as { firstName?: string | null; lastName?: string | null; email?: string | null } | null) ?? null;
    const nombre = [huesped?.firstName, huesped?.lastName].filter(Boolean).join(' ') || null;

    filas.push({
      reservationId: r.id,
      bookingId: ev.bookingId,
      referencia: r.externalBookingId,
      canal: r.channel || ev.channel || '',
      hotelCode: ev.hotelCode ?? '',
      propertyId: r.propertyId,
      property: r.property?.nombre ?? null,
      unit: r.unit?.nombre ?? null,
      huesped: nombre,
      email: huesped?.email ?? null,
      checkIn: r.checkIn.toISOString(),
      checkOut: r.checkOut.toISOString(),
      reportadoEn: ev.fechaCreacion.toISOString(),
      intentos: eventos.filter((e) => e.bookingId === ev.bookingId).length,
      estado: r.estado,
      penalizacion: item
        ? {
            importe: item.importeTotal,
            moneda: item.moneda || PENALIZACION_MONEDA_DEFECTO,
            facturada: !!item.invoiceId,
          }
        : null,
    });
  }

  filas.sort((a, b) => new Date(b.reportadoEn).getTime() - new Date(a.reportadoEn).getTime());

  return {
    ok: true,
    noShows: filas,
    resumen: { total: filas.length, conPenalizacion },
  };
}

/**
 * Carga los hotelCode de las propiedades del tenant con los vínculos que
 * podrían resolver una incidencia.
 *
 * Incluye los vínculos inactivos a propósito: sirven para reconocer un
 * hotelCode como propio, y las incidencias de tipo "propiedad sin mapping"
 * ocurren precisamente cuando no hay ningún vínculo activo todavía.
 *
 * Devuelve `null` cuando se pidió una propiedad que no es del tenant.
 */
export async function cargarHotelCodesDelTenant(
  tenantId: string,
  propertyId?: string | null
): Promise<Map<string, InfoHotelCode> | null> {
  const properties = await prisma.hospitalityProperty.findMany({
    where: { tenantId, ...(propertyId ? { id: propertyId } : {}) },
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      nombre: true,
      mappings: {
        where: { provider: 'channel_connectivity' },
        select: {
          externalPropertyId: true,
          externalUnitCode: true,
          estado: true,
          unit: { select: { id: true, nombre: true } },
        },
      },
    },
  });

  if (propertyId && properties.length === 0) return null;

  const porHotelCode = new Map<string, InfoHotelCode>();
  for (const p of properties) {
    for (const m of p.mappings) {
      const code = m.externalPropertyId?.trim();
      if (!code) continue;
      let entrada = porHotelCode.get(code);
      if (!entrada) {
        entrada = { propertyId: p.id, property: p.nombre, activos: [] };
        porHotelCode.set(code, entrada);
      }
      if (m.estado === 'activo') {
        entrada.activos.push({ externalUnitCode: m.externalUnitCode, unit: m.unit });
      }
    }
  }
  return porHotelCode;
}

/** Proveedor de conectividad de canal (único adapter de la plataforma). */
export const PROVIDER_CONECTIVIDAD = 'channel_connectivity';

/** Detalle de una vinculación automática, para la traza. */
export interface OrigenVinculacionTraza {
  origen: 'webhook' | 'manual';
  motivo: string;
  hotelCode: string;
  roomCode: string;
  rateplanCode: string | null;
  /** Huéspedes reales de la reserva que provocó el vínculo (si se conocen). */
  ocupacion?: number | null;
  unit: string;
  bookingId?: string | null;
  channel?: string | null;
}

/**
 * Vincula una unidad con su habitación del proveedor.
 *
 * Misma semántica que el paso 6 del wizard: una unidad nunca empuja a dos
 * habitaciones a la vez (los vínculos anteriores se apagan) y el vínculo es
 * idempotente por [provider, hotelCode, roomCode].
 */
export async function vincularUnidadAMapping(input: {
  tenantId: string;
  propertyId: string;
  hotelCode: string;
  unitId: string;
  roomCode: string;
  rateplanCode: string | null;
  /** Se guarda en el propio vínculo: por qué y desde dónde se creó. */
  metadata?: Record<string, unknown>;
  /** Cuando viene de una vinculación automática, deja traza en el sync log. */
  traza?: OrigenVinculacionTraza;
}): Promise<void> {
  const { tenantId, propertyId, hotelCode, unitId, roomCode, rateplanCode, metadata, traza } = input;

  const previos = await prisma.connectivityMapping.findMany({
    where: { tenantId, unitId, provider: PROVIDER_CONECTIVIDAD, estado: 'activo' },
    select: { id: true, externalPropertyId: true, externalUnitCode: true },
  });
  const yaCorrecto = previos.find(
    (p) => p.externalPropertyId === hotelCode && p.externalUnitCode === roomCode
  );
  for (const previo of previos) {
    if (previo.id === yaCorrecto?.id) continue;
    await prisma.connectivityMapping.update({
      where: { id: previo.id },
      data: { estado: 'inactivo' },
    });
  }

  await prisma.connectivityMapping.upsert({
    where: {
      provider_externalPropertyId_externalUnitCode: {
        provider: PROVIDER_CONECTIVIDAD,
        externalPropertyId: hotelCode,
        externalUnitCode: roomCode,
      },
    },
    create: {
      tenantId,
      propertyId,
      unitId,
      provider: PROVIDER_CONECTIVIDAD,
      externalPropertyId: hotelCode,
      externalUnitCode: roomCode,
      externalRatePlanCode: rateplanCode,
      estado: 'activo',
      ...(metadata && { metadata: metadata as Prisma.InputJsonValue }),
    },
    update: {
      tenantId,
      propertyId,
      unitId,
      externalRatePlanCode: rateplanCode,
      estado: 'activo',
      ...(metadata && { metadata: metadata as Prisma.InputJsonValue }),
    },
  });

  if (traza) {
    // Traza de conectividad: qué se vinculó, por qué y desde dónde. Nunca
    // rompe la operación que la originó.
    try {
      await prisma.hospitalitySyncLog.create({
        data: {
          tenantId,
          propertyId,
          tipo: 'mapping_automatico',
          operacion: traza.origen,
          estado: 'exito',
          responseBody: {
            origen: traza.origen,
            motivo: traza.motivo,
            hotelCode: traza.hotelCode,
            roomCode: traza.roomCode,
            rateplanCode: traza.rateplanCode,
            ocupacionReserva: traza.ocupacion ?? null,
            unitId,
            unit: traza.unit,
            bookingId: traza.bookingId ?? null,
            channel: traza.channel ?? null,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      console.error('[Hospitality] Error registrando el vínculo automático:', e);
    }
  }
}

// ── Vinculación automática ──────────────────────────────────────────────────
//
// Cuando una reserva llega con una habitación sin vínculo no siempre hay un
// humano delante: si el catálogo del proveedor tiene esa habitación y hay una
// única unidad libre que le corresponde, vincularla recupera la reserva.
// Se aplica SOLO cuando no hay duda (código o nombre exactos, o una única
// unidad libre); el resto sigue siendo decisión del operador.

/** Por qué se eligió (o no) una unidad para una habitación. */
export type MotivoVinculacion =
  | 'codigo_de_unidad'
  | 'nombre_de_unidad'
  | 'ocupacion_compatible'
  | 'capacidad_exacta'
  | 'ocupacion_reserva'
  | 'unica_unidad_libre'
  | 'ambiguo'
  | 'sin_unidades_libres'
  | 'sin_unidad_compatible'
  | 'sin_capacidad_suficiente'
  | 'no_esta_en_catalogo'
  | 'catalogo_no_disponible'
  | 'hotel_de_otra_cuenta'
  | 'sin_propiedad'
  | 'rechazado_por_operador';

export interface CandidatoUnidad {
  unitId: string;
  unit: string;
  codigo: string | null;
  /** Huéspedes que admite la unidad. */
  capacidad?: number | null;
  /**
   * La unidad encaja con la ocupación que el proveedor publica para esa
   * habitación (`min_occ`/`max_occ`). `undefined` cuando el catálogo no la
   * publica: no se sabe, y eso no es lo mismo que "no encaja".
   */
  admiteOcupacion?: boolean;
  /**
   * La unidad puede alojar a los huéspedes que trae la reserva
   * (`capacidad >= ocupación real`). `undefined` cuando el payload no publica
   * la ocupación real.
   */
  admiteReserva?: boolean;
}

export interface ResultadoVinculacion {
  estado: 'aplicada' | 'propuesta' | 'no_aplicable';
  motivo: MotivoVinculacion;
  detalle?: string;
  candidatos: CandidatoUnidad[];
  aplicada?: CandidatoUnidad & {
    roomCode: string;
    rateplanCode: string | null;
    motivo: MotivoVinculacion;
  };
}

/** De dónde salió el vínculo, para dejar traza. */
export interface OrigenVinculacion {
  origen: 'webhook' | 'manual';
  bookingId?: string | null;
  channel?: string | null;
}

interface UnidadLibre {
  id: string;
  nombre: string;
  codigo: string | null;
  /** `null` cuando la unidad no publica capacidad: entonces no descarta nada. */
  capacidad: number | null;
}

interface HabitacionCatalogo {
  roomId: string;
  roomName: string;
  rateplans: Set<string>;
  /** Ocupación publicada por el proveedor para esa habitación. */
  minOcc: number | null;
  maxOcc: number | null;
}

/** Rango de ocupación publicado, o `null` si el catálogo no dice nada. */
interface RangoOcupacion {
  min: number | null;
  max: number | null;
}

/** El proveedor puede mandar la ocupación como número o como texto: se normaliza. */
function numeroOcupacion(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor))) {
    return Number(valor);
  }
  return null;
}

function rangoOcupacion(habitacion: HabitacionCatalogo): RangoOcupacion | null {
  if (habitacion.minOcc === null && habitacion.maxOcc === null) return null;
  return { min: habitacion.minOcc, max: habitacion.maxOcc };
}

/**
 * ¿Puede la unidad alojar esa habitación? La capacidad debe caber dentro del
 * rango que publica el proveedor: una unidad de 6 huéspedes no sirve para una
 * habitación de 2, aunque el código no diga nada al respecto.
 */
function admiteOcupacion(unidad: UnidadLibre, rango: RangoOcupacion): boolean {
  // Capacidad desconocida no es "no encaja": no se descarta por lo que no consta.
  if (unidad.capacidad === null) return true;
  if (rango.min !== null && unidad.capacidad < rango.min) return false;
  if (rango.max !== null && unidad.capacidad > rango.max) return false;
  return true;
}

/** "2 a 4 huéspedes", "hasta 4", "desde 2". Para el detalle que lee el operador. */
function describirOcupacion(rango: RangoOcupacion): string {
  if (rango.min !== null && rango.max !== null) return `${rango.min} a ${rango.max} huéspedes`;
  if (rango.max !== null) return `hasta ${rango.max} huéspedes`;
  return `desde ${rango.min} huéspedes`;
}

/** ¿Cabe la reserva en la unidad? La capacidad manda sobre los huéspedes reales. */
function admiteReserva(unidad: UnidadLibre, ocupacion: OcupacionReserva): boolean {
  if (unidad.capacidad === null) return true;
  return unidad.capacidad >= ocupacion.total;
}

/** "3 huéspedes (2 adultos + 1 niño)", para el detalle que lee el operador. */
function describirReserva(ocupacion: OcupacionReserva): string {
  const huespedes = `${ocupacion.total} huésped(es)`;
  if (ocupacion.ninos <= 0) return huespedes;
  return `${huespedes} (${ocupacion.adultos} adulto(s) + ${ocupacion.ninos} niño(s))`;
}

/**
 * ¿El payload dice cuántos años tienen los niños? El proveedor solo manda el
 * número (`children`): las edades, si llegan, viajan en campos no documentados
 * que se leen sin creérselo del todo.
 */
function edadesNinosDelPayload(payload: unknown): number[] | null {
  const rooms = (payload as { rooms?: unknown } | null)?.rooms;
  const room = Array.isArray(rooms) ? (rooms[0] as Record<string, unknown> | undefined) : undefined;
  const occ = room?.occupancy as Record<string, unknown> | undefined;
  if (!occ) return null;
  for (const campo of ['childrenAges', 'children_ages', 'childAges', 'child_ages']) {
    const crudo = occ[campo];
    if (Array.isArray(crudo) && crudo.length > 0) {
      const edades = crudo
        .map((e) => (typeof e === 'number' && Number.isFinite(e) ? e : Number(e)))
        .filter((e) => Number.isFinite(e));
      if (edades.length > 0) return edades;
    }
  }
  return null;
}

/**
 * Huéspedes que CONSUMEN capacidad: los adultos y los niños desde el umbral.
 *
 * Los bebés en cuna no ocupan plaza. El payload no trae edades (solo
 * `children`), así que la regla es conservadora: si no se sabe la edad de un
 * niño, cuenta; si el canal publica las edades, los menores del umbral no
 * cuentan. `HOSPITALITY_EDAD_NINO_UMBRAL` (años, por defecto 4).
 */
export function ocupacionEfectiva(
  ocupacion: OcupacionReserva,
  payload?: unknown
): OcupacionReserva {
  const umbral = edadNinoUmbral();
  if (ocupacion.ninos <= 0) return ocupacion;
  if (umbral <= 0) return ocupacion;
  const edades = payload ? edadesNinosDelPayload(payload) : null;
  if (!edades) return ocupacion;
  const ninosContables = edades.filter((e) => e >= umbral).length;
  if (ninosContables === ocupacion.ninos) return ocupacion;
  const ninos = Math.max(0, Math.min(ocupacion.ninos, ninosContables));
  return { adultos: ocupacion.adultos, ninos, total: ocupacion.adultos + ninos };
}

/** Caché por petición: el catálogo se pide una vez por hotelCode. */
export interface CacheVinculacion {
  catalogos: Map<string, Map<string, HabitacionCatalogo> | null>;
}

export function crearCacheVinculacion(): CacheVinculacion {
  return { catalogos: new Map() };
}

/**
 * ¿Se permite vincular desde el webhook? Interruptor de producción: con
 * `HOSPITALITY_AUTO_MAPPING=off` el webhook vuelve a rechazar sin tocar config.
 */
export function vinculacionAutomaticaEnWebhookActiva(): boolean {
  return process.env.HOSPITALITY_AUTO_MAPPING !== 'off';
}

/**
 * Elige la unidad destino; `unidad: null` cuando hay que preguntar a alguien.
 *
 * Orden: código exacto → nombre exacto → ocupación del catálogo → ocupación real
 * de la reserva → única unidad libre. La ocupación solo decide cuando
 * **descarta** alguna unidad libre: si todas encajan, no aporta información y
 * manda la regla de siempre.
 */
function elegirUnidad(
  libres: UnidadLibre[],
  habitacion: HabitacionCatalogo,
  ocupacion: OcupacionReserva | null
): { unidad: UnidadLibre | null; motivo: MotivoVinculacion; detalle?: string } {
  const roomCode = habitacion.roomId;
  const roomName = habitacion.roomName;

  const porCodigo = libres.filter(
    (u) => normalizeExternalCode(u.codigo) === normalizeExternalCode(roomCode)
  );
  if (porCodigo.length === 1) return { unidad: porCodigo[0], motivo: 'codigo_de_unidad' };

  const porNombre = libres.filter(
    (u) => normalizeExternalCode(u.nombre) === normalizeExternalCode(roomName)
  );
  if (porNombre.length === 1) return { unidad: porNombre[0], motivo: 'nombre_de_unidad' };

  const rango = rangoOcupacion(habitacion);
  if (rango) {
    const admiten = libres.filter((u) => admiteOcupacion(u, rango));
    // Solo cuenta si descarta alguna: si todas admiten la ocupación, no dice nada.
    if (admiten.length < libres.length) {
      const ocupacion = describirOcupacion(rango);
      if (admiten.length === 1) {
        return { unidad: admiten[0], motivo: 'ocupacion_compatible' };
      }
      if (admiten.length === 0) {
        return {
          unidad: null,
          motivo: 'sin_unidad_compatible',
          detalle:
            `Ninguna de las ${libres.length} unidad(es) libre(s) admite la ocupación que publica el ` +
            `proveedor para esa habitación (${ocupacion})`,
        };
      }
      return {
        unidad: null,
        motivo: 'ambiguo',
        detalle:
          `Quedan ${admiten.length} unidades libres compatibles con la ocupación (${ocupacion}) y ` +
          'ninguna coincide por código ni nombre',
      };
    }
  }

  // Ocupación REAL de la reserva: cuando el rango del tipo de habitación no
  // distingue (todas las libres encajan en él, o hay varias), los huéspedes que
  // vienen de verdad deciden. Mismo espíritu que el código y el nombre: solo
  // actúa cuando es inequívoco, nunca para elegir "lo más parecido".
  if (ocupacion) {
    const delTamanoJusto = libres.filter(
      (u) => u.capacidad !== null && u.capacidad === ocupacion.total
    );
    if (delTamanoJusto.length === 1) {
      return { unidad: delTamanoJusto[0], motivo: 'capacidad_exacta' };
    }

    const caben = libres.filter((u) => admiteReserva(u, ocupacion));
    if (caben.length < libres.length) {
      const huespedes = describirReserva(ocupacion);
      if (caben.length === 1) return { unidad: caben[0], motivo: 'ocupacion_reserva' };
      if (caben.length === 0) {
        return {
          unidad: null,
          motivo: 'sin_capacidad_suficiente',
          detalle:
            `Ninguna de las ${libres.length} unidad(es) libre(s) tiene capacidad para los ` +
            `${huespedes} de la reserva`,
        };
      }
      // Varias caben: la más ajustada, y solo si no hay empate de capacidad ni
      // alguna sin capacidad conocida (con esas no se puede comparar).
      const conCapacidad = caben.filter(
        (u): u is UnidadLibre & { capacidad: number } => u.capacidad !== null
      );
      if (conCapacidad.length === caben.length) {
        const ajuste = Math.min(...conCapacidad.map((c) => c.capacidad));
        const ajustadas = conCapacidad.filter((u) => u.capacidad === ajuste);
        if (ajustadas.length === 1) return { unidad: ajustadas[0], motivo: 'ocupacion_reserva' };
      }
      return {
        unidad: null,
        motivo: 'ambiguo',
        detalle:
          `Quedan ${caben.length} unidades libres con capacidad para los ${huespedes} de la ` +
          'reserva y ninguna coincide por código, nombre ni capacidad exacta',
      };
    }
  }

  if (libres.length === 1) return { unidad: libres[0], motivo: 'unica_unidad_libre' };

  return { unidad: null, motivo: libres.length === 0 ? 'sin_unidades_libres' : 'ambiguo' };
}

/** Plan de tarifa del vínculo: el del incidente si el proveedor lo acepta. */
function elegirRateplan(rateplans: Set<string>, delIncidente: string | null): string | null {
  if (delIncidente && rateplans.has(delIncidente)) return delIncidente;
  if (rateplans.size === 1) return [...rateplans][0];
  return null;
}

/**
 * Propone —y aplica— el vínculo de una habitación con una unidad libre.
 * La habitación debe existir en el catálogo REAL del proveedor: nada se inventa.
 *
 * Si llega también el `payload` bruto de la reserva, la ocupación efectiva se
 * calcula con las edades que el canal publique: los niños menores del umbral
 * (`HOSPITALITY_EDAD_NINO_UMBRAL`, por defecto 4) no consumen capacidad.
 */
export async function proponerVinculacion(input: {
  tenantId: string;
  propertyId: string;
  hotelCode: string;
  roomCode: string;
  rateplanCode: string | null;
  /** Huéspedes reales de la reserva (payload), si el canal los publica. */
  ocupacion?: OcupacionReserva | null;
  /**
   * Payload bruto de la reserva: solo sirve para leer las edades de los niños
   * si el canal las publica. Sin él, cada niño cuenta como huésped.
   */
  payload?: unknown;
  aplicar: boolean;
  traza?: OrigenVinculacion;
  cache?: CacheVinculacion;
}): Promise<ResultadoVinculacion> {
  const { tenantId, propertyId, hotelCode, roomCode, rateplanCode, aplicar, traza } = input;
  const ocupacion = input.ocupacion
    ? ocupacionEfectiva(input.ocupacion, input.payload)
    : null;

  // El código de propiedad no puede ser de otra cuenta.
  const ajeno = await prisma.connectivityMapping.findFirst({
    where: { externalPropertyId: hotelCode, estado: 'activo', tenantId: { not: tenantId } },
    select: { tenantId: true },
  });
  if (ajeno) {
    return {
      estado: 'no_aplicable',
      motivo: 'hotel_de_otra_cuenta',
      candidatos: [],
      detalle: 'El código de propiedad está vinculado a otra cuenta',
    };
  }

  // Si un operador deshizo este vínculo, no se vuelve a crear solo: deshacer
  // tiene que servir de algo (el vínculo inactivo queda marcado al deshacerlo).
  const rechazados = await prisma.connectivityMapping.findMany({
    where: {
      provider: PROVIDER_CONECTIVIDAD,
      externalPropertyId: hotelCode,
      estado: 'inactivo',
      metadata: { path: ['bloqueaAutoVinculacion'], equals: true },
    },
    select: { externalUnitCode: true },
  });
  if (
    rechazados.some(
      (r) => normalizeExternalCode(r.externalUnitCode) === normalizeExternalCode(roomCode)
    )
  ) {
    return {
      estado: 'no_aplicable',
      motivo: 'rechazado_por_operador',
      candidatos: [],
      detalle: `Un operador deshizo el vínculo de "${roomCode}": asígnalo a mano si vuelve a hacer falta`,
    };
  }

  // Catálogo real del proveedor (una consulta por hotelCode y petición).
  let catalogo: Map<string, HabitacionCatalogo> | null;
  const cacheado = input.cache?.catalogos.get(hotelCode);
  if (cacheado !== undefined) {
    catalogo = cacheado;
  } else {
    const respuesta = await testConnectivityConnection(hotelCode);
    catalogo =
      respuesta.ok && respuesta.property
        ? new Map(
            (respuesta.property.rooms || []).map((room) => [
              normalizeExternalCode(room.room_id),
              {
                roomId: room.room_id,
                roomName: room.room_name ?? room.room_id,
                rateplans: new Set((room.rateplans || []).map((rp) => rp.rateplan_id)),
                minOcc: numeroOcupacion(room.min_occ),
                maxOcc: numeroOcupacion(room.max_occ),
              },
            ])
          )
        : null;
    input.cache?.catalogos.set(hotelCode, catalogo);
  }
  if (!catalogo) {
    return {
      estado: 'no_aplicable',
      motivo: 'catalogo_no_disponible',
      candidatos: [],
      detalle: 'No se pudo consultar el catálogo del proveedor',
    };
  }

  const habitacion = catalogo.get(normalizeExternalCode(roomCode));
  if (!habitacion) {
    return {
      estado: 'no_aplicable',
      motivo: 'no_esta_en_catalogo',
      candidatos: [],
      detalle: `La habitación "${roomCode}" no existe en el catálogo del proveedor`,
    };
  }

  // Unidades libres de la propiedad (sin ningún vínculo activo).
  const units = await prisma.hospitalityUnit.findMany({
    where: { tenantId, propertyId },
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      nombre: true,
      codigo: true,
      capacidad: true,
      mappings: {
        where: { provider: PROVIDER_CONECTIVIDAD, estado: 'activo' },
        select: { id: true },
      },
    },
  });
  const libres: UnidadLibre[] = units
    .filter((u) => u.mappings.length === 0)
    .map((u) => ({
      id: u.id,
      nombre: u.nombre,
      codigo: u.codigo,
      capacidad: typeof u.capacidad === 'number' ? u.capacidad : null,
    }));
  const rango = rangoOcupacion(habitacion);
  // Los candidatos se marcan con la capacidad: el operador ve de un vistazo
  // cuáles encajan con la ocupación que publica el proveedor y con los
  // huéspedes reales de la reserva.
  const candidatos: CandidatoUnidad[] = libres.map((u) => ({
    unitId: u.id,
    unit: u.nombre,
    codigo: u.codigo,
    capacidad: u.capacidad,
    ...(rango && { admiteOcupacion: admiteOcupacion(u, rango) }),
    ...(ocupacion && u.capacidad !== null && { admiteReserva: admiteReserva(u, ocupacion) }),
  }));

  const eleccion = elegirUnidad(libres, habitacion, ocupacion);
  if (!eleccion.unidad) {
    return {
      estado: 'no_aplicable',
      motivo: eleccion.motivo,
      candidatos,
      detalle:
        eleccion.detalle ??
        (eleccion.motivo === 'ambiguo'
          ? 'Hay varias unidades libres y ninguna coincide por código ni nombre'
          : eleccion.motivo === 'sin_unidad_compatible'
            ? 'Ninguna unidad libre admite la ocupación que publica el proveedor'
            : eleccion.motivo === 'sin_capacidad_suficiente'
              ? 'Ninguna unidad libre tiene capacidad para los huéspedes de la reserva'
              : `La propiedad no tiene unidades libres (${libres.length})`),
    };
  }

  const rateplan = elegirRateplan(habitacion.rateplans, rateplanCode);
  const elegida: CandidatoUnidad = {
    unitId: eleccion.unidad.id,
    unit: eleccion.unidad.nombre,
    codigo: eleccion.unidad.codigo,
  };

  if (!aplicar) {
    return { estado: 'propuesta', motivo: eleccion.motivo, candidatos: [elegida] };
  }

  await vincularUnidadAMapping({
    tenantId,
    propertyId,
    hotelCode,
    unitId: eleccion.unidad.id,
    roomCode: habitacion.roomId,
    rateplanCode: rateplan,
    metadata: {
      origen: traza?.origen === 'webhook' ? 'vinculacion_automatica_webhook' : 'vinculacion_automatica',
      motivo: eleccion.motivo,
      hotelCode,
      roomCode: habitacion.roomId,
      rateplanCode: rateplan,
      ocupacionReserva: ocupacion?.total ?? null,
      bookingId: traza?.bookingId ?? null,
      channel: traza?.channel ?? null,
      fecha: new Date().toISOString(),
    },
    traza: {
      ...traza,
      origen: traza?.origen ?? 'manual',
      motivo: eleccion.motivo,
      hotelCode,
      roomCode: habitacion.roomId,
      rateplanCode: rateplan,
      ocupacion: ocupacion?.total ?? null,
      unit: eleccion.unidad.nombre,
    },
  });

  return {
    estado: 'aplicada',
    motivo: eleccion.motivo,
    candidatos: [elegida],
    aplicada: { ...elegida, roomCode: habitacion.roomId, rateplanCode: rateplan, motivo: eleccion.motivo },
  };
}

/**
 * Tenant y propiedad de un hotelCode ya vinculado, o `null` si no es
 * inequívoco (varias propiedades o ninguna activa).
 */
async function propiedadDeHotelCode(
  hotelCode: string
): Promise<{ tenantId: string; propertyId: string } | null> {
  const mappings = await prisma.connectivityMapping.findMany({
    where: { provider: PROVIDER_CONECTIVIDAD, externalPropertyId: hotelCode, estado: 'activo' },
    orderBy: { fechaCreacion: 'asc' },
    select: { tenantId: true, propertyId: true },
  });
  const conPropiedad = mappings.filter((m) => !!m.propertyId);
  if (conPropiedad.length === 0) return null;
  const propiedades = new Set(conPropiedad.map((m) => `${m.tenantId}|${m.propertyId}`));
  if (propiedades.size > 1) return null;
  return { tenantId: conPropiedad[0].tenantId, propertyId: conPropiedad[0].propertyId! };
}

/**
 * Capacidad que decide quién es operador: configurar canales y sincronización.
 *
 * El nombre del rol no decide nada (§27). Antes esto era una lista de nombres
 * —`Superadmin`, `Admin`, `Administrador`…—, así que un hotel que bautizara su
 * rol como «Anfitrión» se quedaba sin destinatarios para el aviso. La ficha sale
 * del catálogo de capacidades para que no haya una segunda copia de la regla.
 */
const CAPACIDAD_OPERADOR = CAPACIDADES_HOSPITALITY['integraciones.gestionar'];

/** Marca del origen manual: un vínculo así ya lo confirmó una persona. */
export const ORIGEN_VINCULO_MANUAL = 'manual';

/** Tipo de log con el que el resumen periódico deja su marca de envío. */
export const TIPO_RESUMEN_VINCULOS = 'resumen_vinculos_automaticos';

/**
 * Usuarios que deciden sobre la conectividad del tenant.
 *
 * Se pregunta por la capacidad, no por el nombre del rol: se leen los usuarios
 * del tenant y se filtra con la MISMA regla que autoriza en el servidor
 * (`hasPermisoDeRol`, la que envuelve `puedePorRol`). Los roles del producto
 * —Anfitrión, Agente, Limpieza— pueden llamarse como quiera el hotel.
 *
 * El tope de candidatos es acotado y explícito: sin él, este aviso recorrería
 * la plantilla entera de un cliente grande para elegir diez destinatarios.
 */
export async function operadoresDelTenant(tenantId: string): Promise<Array<{ id: string }>> {
  const candidatos = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, role: true },
    take: 100,
  });

  return candidatos
    .filter((usuario) =>
      hasPermisoDeRol(usuario.role, CAPACIDAD_OPERADOR.modulo, CAPACIDAD_OPERADOR.accion)
    )
    .slice(0, 10)
    .map((usuario) => ({ id: usuario.id }));
}

/** Vínculo creado por el sistema y todavía sin confirmar por una persona. */
export interface VinculoAutomaticoPendiente {
  tenantId: string;
  propertyId: string | null;
  property: string | null;
  hotelCode: string;
  roomCode: string;
  rateplanCode: string | null;
  unitId: string | null;
  unit: string | null;
  motivo: string | null;
  creadoEn: string;
  bookingId: string | null;
  channel: string | null;
}

/**
 * Vínculos automáticos que nadie ha confirmado todavía.
 *
 * Un vínculo deja de estar pendiente cuando una persona guarda los vínculos en
 * el wizard: ese guardado reescribe su `metadata` con origen manual y ya no
 * cuenta como revisado por el sistema.
 */
export async function listarVinculosAutomaticosPendientes(
  tenantId?: string
): Promise<VinculoAutomaticoPendiente[]> {
  const mappings = await prisma.connectivityMapping.findMany({
    where: {
      provider: PROVIDER_CONECTIVIDAD,
      estado: 'activo',
      ...(tenantId ? { tenantId } : {}),
      metadata: { path: ['origen'], equals: 'vinculacion_automatica_webhook' },
    },
    orderBy: { fechaCreacion: 'desc' },
    select: {
      tenantId: true,
      propertyId: true,
      externalPropertyId: true,
      externalUnitCode: true,
      externalRatePlanCode: true,
      metadata: true,
      fechaCreacion: true,
      property: { select: { nombre: true } },
      unit: { select: { id: true, nombre: true } },
    },
  });

  return mappings.map((m) => {
    const meta = (m.metadata ?? null) as Record<string, unknown> | null;
    return {
      tenantId: m.tenantId,
      propertyId: m.propertyId,
      property: m.property?.nombre ?? null,
      hotelCode: m.externalPropertyId,
      roomCode: m.externalUnitCode ?? '',
      rateplanCode: m.externalRatePlanCode,
      unitId: m.unit?.id ?? null,
      unit: m.unit?.nombre ?? null,
      motivo: typeof meta?.motivo === 'string' ? meta.motivo : null,
      creadoEn: m.fechaCreacion.toISOString(),
      bookingId: typeof meta?.bookingId === 'string' ? meta.bookingId : null,
      channel: typeof meta?.channel === 'string' ? meta.channel : null,
    };
  });
}

/** Fecha del último resumen periódico enviado a un tenant (null si nunca). */
export async function ultimoResumenVinculos(tenantId: string): Promise<Date | null> {
  const ultimo = await prisma.hospitalitySyncLog.findFirst({
    where: { tenantId, tipo: TIPO_RESUMEN_VINCULOS },
    orderBy: { fechaCreacion: 'desc' },
    select: { fechaCreacion: true },
  });
  return ultimo?.fechaCreacion ?? null;
}

/**
 * Avisa a los operadores del tenant de que el sistema creó un vínculo solo.
 *
 * Un vínculo automático cambia la configuración de canales sin que nadie lo
 * haya pedido, así que quien decide tiene que enterarse y poder revisarlo: la
 * notificación in-app (y push si está suscrito) lleva directa al panel de
 * incidencias de esa propiedad. Nunca lanza: es un aviso, no parte del flujo.
 */
export async function notificarVinculacionAutomatica(input: {
  tenantId: string;
  propertyId: string;
  hotelCode: string;
  roomCode: string;
  rateplanCode: string | null;
  unit: string;
  motivo: MotivoVinculacion;
  bookingId?: string | null;
  channel?: string | null;
}): Promise<string[]> {
  try {
    const operadores = await operadoresDelTenant(input.tenantId);
    if (operadores.length === 0) return [];

    const reserva = input.bookingId
      ? ` para no perder la reserva ${input.bookingId}${input.channel ? ` (${input.channel})` : ''}`
      : '';
    const cuerpo =
      `La habitación "${input.roomCode}" de ${input.hotelCode} quedó vinculada a la unidad ` +
      `"${input.unit}"${reserva}. Motivo: ${MOTIVO_LEYENDA[input.motivo] ?? input.motivo}. ` +
      'Revisa el vínculo si no es correcto.';

    // Import dinámico: el webhook no debe cargar el stack de push si no hace falta.
    const { sendPushNotification } = await import('@/lib/services/push-notification');
    await Promise.all(
      operadores.map((u) =>
        sendPushNotification(u.id, {
          title: 'Vínculo automático de conectividad',
          body: cuerpo,
          url: `/dashboard/hospitality/onboarding?propertyId=${input.propertyId}`,
          tag: 'conectividad',
          data: {
            hotelCode: input.hotelCode,
            roomCode: input.roomCode,
            rateplanCode: input.rateplanCode,
            unit: input.unit,
            motivo: input.motivo,
            bookingId: input.bookingId ?? null,
            channel: input.channel ?? null,
          },
        }).catch(() => ({ success: false }))
      )
    );
    return operadores.map((u) => u.id);
  } catch (e) {
    console.error('[Hospitality] Error avisando del vínculo automático:', e);
    return [];
  }
}

/** Texto para personas de cada motivo de vinculación. */
const MOTIVO_LEYENDA: Record<MotivoVinculacion, string> = {
  codigo_de_unidad: 'el código de la unidad coincide con la habitación del proveedor',
  nombre_de_unidad: 'el nombre de la unidad coincide con el de la habitación',
  ocupacion_compatible: 'la capacidad de la unidad encaja con la ocupación de la habitación',
  capacidad_exacta: 'la capacidad de la unidad coincide con los huéspedes de la reserva',
  ocupacion_reserva:
    'la unidad puede alojar a los huéspedes de la reserva y ninguna otra libre encaja mejor',
  unica_unidad_libre: 'era la única unidad libre de la propiedad',
  ambiguo: 'hay varias unidades libres y ninguna coincide',
  sin_unidades_libres: 'la propiedad no tiene unidades libres',
  sin_unidad_compatible: 'ninguna unidad libre admite la ocupación de esa habitación',
  sin_capacidad_suficiente: 'ninguna unidad libre tiene capacidad para los huéspedes de la reserva',
  no_esta_en_catalogo: 'la habitación no existe en el catálogo del proveedor',
  catalogo_no_disponible: 'no se pudo consultar el catálogo del proveedor',
  hotel_de_otra_cuenta: 'el código de propiedad está vinculado a otra cuenta',
  sin_propiedad: 'no se pudo determinar la propiedad del código',
  rechazado_por_operador: 'un operador deshizo ese vínculo a propósito',
};

/**
 * Recuperación desde el webhook: una reserva que llegó con una habitación sin
 * vínculo se registra (en vez de rechazarse) si el vínculo es inequívoco.
 * Devuelve `null` cuando no se intenta (interruptor apagado o hotel ambiguo).
 */
export async function vincularHabitacionDesdeWebhook(input: {
  hotelCode: string;
  roomCode: string | null;
  rateplanCode: string | null;
  /** Huéspedes reales que trae la reserva (adults + children del payload). */
  ocupacion?: OcupacionReserva | null;
  /**
   * Payload bruto de la reserva: solo sirve para leer las edades de los niños
   * si el canal las publica (los menores del umbral no consumen capacidad).
   */
  payload?: unknown;
  bookingId?: string | null;
  channel?: string | null;
}): Promise<ResultadoVinculacion | null> {
  if (!vinculacionAutomaticaEnWebhookActiva()) return null;
  if (!input.roomCode) return null;

  const destino = await propiedadDeHotelCode(input.hotelCode);
  if (!destino) return null;

  const resultado = await proponerVinculacion({
    tenantId: destino.tenantId,
    propertyId: destino.propertyId,
    hotelCode: input.hotelCode,
    roomCode: input.roomCode,
    rateplanCode: input.rateplanCode,
    ocupacion: input.ocupacion ?? null,
    payload: input.payload,
    aplicar: true,
    traza: { origen: 'webhook', bookingId: input.bookingId, channel: input.channel },
  });

  // El sistema acaba de cambiar la configuración de canales por su cuenta: los
  // operadores se enteran por notificación (no bloquea el registro de la reserva).
  if (resultado.estado === 'aplicada' && resultado.aplicada) {
    notificarVinculacionAutomatica({
      tenantId: destino.tenantId,
      propertyId: destino.propertyId,
      hotelCode: input.hotelCode,
      roomCode: resultado.aplicada.roomCode,
      rateplanCode: resultado.aplicada.rateplanCode,
      unit: resultado.aplicada.unit,
      motivo: resultado.aplicada.motivo,
      bookingId: input.bookingId,
      channel: input.channel,
    }).catch((e) => console.error('[Hospitality] Error notificando el vínculo automático:', e));
  }

  return resultado;
}

/** Vínculo activo que resuelve ese roomCode (la misma regla del webhook). */
export function vinculoParaRoomCode(
  info: InfoHotelCode | undefined,
  roomCode: string | null
): VinculoActivo | null {
  if (!info) return null;
  const normalizado = normalizeExternalCode(roomCode);
  const exacto = info.activos.find((m) => normalizeExternalCode(m.externalUnitCode) === normalizado);
  if (exacto) return exacto;
  // Los vínculos que no restringen unidad también resuelven cualquier roomCode.
  return info.activos.find((m) => !normalizeExternalCode(m.externalUnitCode)) ?? null;
}
