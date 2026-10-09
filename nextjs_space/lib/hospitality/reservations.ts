import { prisma } from '@/lib/db';
import { Prisma, type HospitalityReservation } from '@prisma/client';
import { monedaEscritura } from '@/lib/moneda';
import { normalizeExternalCode } from '@/lib/hospitality/codigos';
import {
  ocupacionDePayload,
  vincularHabitacionDesdeWebhook,
} from '@/lib/hospitality/incidencias';
import { dispararComunicacionReserva } from '@/lib/hospitality/comunicaciones';
import {
  emitReservationCreated,
  emitReservationModified,
  emitReservationCancelled,
} from '@/lib/hospitality/events';
import { esReservaViva } from '@/lib/hospitality/estados';
import { registrarHoldConfirmado } from '@/lib/hospitality/holds-audit';

/**
 * Reservation Engine — procesa los eventos del webhook de reservas de la capa
 * de conectividad (book / modify / cancel / no_show).
 *
 * Contrato (docs/hospitality-connectivity-contract.md):
 * - Un mismo booking recibido dos veces NO puede generar dos reservas
 *   (idempotencia por [tenantId, channel, externalBookingId]).
 * - `modify` es ESTADO COMPLETO NUEVO: reemplaza el anterior, no mezcla.
 * - Los datos del huésped son opcionales; nunca rechazar por falta de email.
 * - `specialRequests` es texto libre.
 * - Aislamiento multi-tenant: las operaciones siempre filtran por tenantId.
 */

export type WebhookAction = 'book' | 'modify' | 'cancel' | 'no_show';

export interface WebhookReservationPayload {
  action: WebhookAction;
  hotelCode: string;
  channel: string;
  bookingId: string;
  cmBookingId?: string | null;
  bookedOn?: string | null;
  checkin: string;
  checkout: string;
  segment?: string | null;
  specialRequests?: string | null;
  pah?: boolean;
  amount?: {
    amountAfterTax?: number | null;
    amountBeforeTax?: number | null;
    tax?: number | null;
    currency?: string | null;
    commission?: number | null;
    tcs?: number | null;
    tds?: number | null;
  } | null;
  guest?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: {
      line1?: string | null;
      city?: string | null;
      state?: string | null;
      country?: string | null;
      zipCode?: string | null;
    } | null;
  } | null;
  rooms?: Array<{
    roomCode: string;
    rateplanCode?: string | null;
    guestName?: string | null;
    occupancy?: { adults?: number | null; children?: number | null } | null;
    prices?: Array<{ date?: string | null; sellRate?: number | null }> | null;
  }> | null;
  [key: string]: unknown;
}

export interface ProcessResult {
  ok: boolean;
  status: 'creada' | 'actualizada' | 'cancelada' | 'duplicado' | 'no_encontrada' | 'error';
  reservationId?: string;
  error?: string;
  /** Solo en no_show: qué pasó con la penalización (emitida, importe o motivo). */
  penalizacion?: { emitida: boolean; importe: number; motivo: string | null } | null;
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}


/** Primera habitación del payload (el contrato envía rooms[] como lista de estancias). */
function firstRoom(payload: WebhookReservationPayload) {
  return payload.rooms?.[0] || null;
}

/**
 * externalBookingId de la parte `indice` de un booking partido: `BKG-1#2` es
 * la segunda habitación del booking BKG-1. Se usa al crear las partes y al
 * aplicar un cancel posterior del booking completo.
 */
export function externalIdDeParte(bookingId: string, indice: number): string {
  return `${bookingId}#${indice + 1}`;
}

/**
 * Sub-payload de UNA habitación de un booking multi-habitación: mantiene todo
 * lo global (huésped, importe, fechas) y reemplaza `rooms` por esa habitación
 * y `bookingId` por el id derivado de la parte, para que el motor completo
 * (buildReservationData, upsertGuest, ocupación, dedupe) la trate como una
 * reserva normal de una sola habitación.
 */
export function payloadDeHabitacion(
  payload: WebhookReservationPayload,
  indice: number
): WebhookReservationPayload | null {
  const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
  const room = rooms[indice];
  if (!room || !payload.bookingId) return null;
  return {
    ...payload,
    bookingId: externalIdDeParte(payload.bookingId, indice),
    rooms: [room],
  };
}

/** Resultado del registro de una habitación de un booking partido. */
export interface PartePartida {
  indice: number;
  roomCode: string | null;
  externalBookingId: string;
  estado: 'creada' | 'duplicado' | 'error';
  reservationId?: string;
  error?: string;
}

/**
 * Registra manualmente las N habitaciones de un booking multi-habitación como
 * N reservas independientes (una unidad por habitación), a partir del payload
 * guardado del incidente. Es la única vía por la que este sistema acepta un
 * booking con varias habitaciones: el webhook lo rechaza siempre, y aquí el
 * operador decide qué unidad recibe cada una.
 *
 * Garantías:
 * - Idempotente por parte: cada habitación se crea solo si no existe su id
 *   derivado (bookingId#n). Repetir la llamada, o llamarla de nuevo con un
 *   subconjunto, no duplica nada — lo ya registrado responde `duplicado`.
 * - All-or-nothing: la validación (unidades, capacidad, choques de
 *   disponibilidad) corre para TODAS las partes a crear ANTES de escribir
 *   ninguna; si algo falla no queda la partida a medias.
 * - Sin overbooking: la unidad la elige el operador, pero se comprueban los
 *   choques de disponibilidad (reservas vivas en la unidad del rango) y la
 *   capacidad publicada de la unidad contra los huéspedes de cada parte.
 */
export async function registrarReservaPartida(input: {
  tenantId: string;
  payload: WebhookReservationPayload;
  /** Unidad elegida por el operador para cada habitación (índice 0-based). */
  unidades: Array<{ indice: number; unitId: string }>;
}): Promise<
  | { ok: false; error: string }
  | { ok: true; reservationIds: string[]; habitaciones: PartePartida[] }
> {
  const { tenantId, payload, unidades } = input;

  if (!payload?.bookingId || !payload.channel) {
    return { ok: false, error: 'El payload no tiene bookingId o channel' };
  }
  const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
  if (rooms.length <= 1) {
    return {
      ok: false,
      error: 'El payload no es multi-habitación (trae una sola habitación): regístrala con el flujo normal.',
    };
  }
  if (!Array.isArray(unidades) || unidades.length === 0) {
    return { ok: false, error: 'Elige la unidad para cada habitación antes de registrar.' };
  }

  // Validación de la elección: índices en rango, unidades presentes y sin
  // repetir (dos habitaciones en la misma unidad sería overbooking seguro).
  const vistos = new Set<string>();
  for (const u of unidades) {
    if (!Number.isInteger(u.indice) || u.indice < 0 || u.indice >= rooms.length) {
      return {
        ok: false,
        error: `Habitación ${u.indice + 1} fuera de rango (el booking trae ${rooms.length}).`,
      };
    }
    if (!u.unitId || typeof u.unitId !== 'string') {
      return { ok: false, error: 'Hay habitaciones sin unidad elegida.' };
    }
    if (vistos.has(u.unitId)) {
      return {
        ok: false,
        error: 'Dos habitaciones apuntan a la misma unidad: elige una unidad distinta para cada una.',
      };
    }
    vistos.add(u.unitId);
  }

  // Las unidades existen y son del tenant; todas de la misma propiedad.
  const units = await prisma.hospitalityUnit.findMany({
    where: { id: { in: unidades.map((u) => u.unitId) }, tenantId },
    select: { id: true, propertyId: true, capacidad: true },
  });
  if (units.length !== unidades.length) {
    return { ok: false, error: 'Alguna unidad no existe o no pertenece a este tenant.' };
  }
  const propertyIds = new Set(units.map((u) => u.propertyId));
  if (propertyIds.size > 1) {
    return { ok: false, error: 'Las unidades elegidas pertenecen a propiedades distintas.' };
  }
  const propertyId = units[0].propertyId;

  // Partes a crear: las que aún no existen (idempotencia por parte). Las que
  // ya tienen su reserva se reportan como `duplicado` con la reserva existente.
  const ordenadas = [...unidades].sort((a, b) => a.indice - b.indice);
  const yaRegistradas = new Map<number, string>(); // indice → reservationId
  const aCrear: Array<{ indice: number; unitId: string; sub: WebhookReservationPayload }> = [];
  for (const u of ordenadas) {
    const sub = payloadDeHabitacion(payload, u.indice);
    if (!sub) {
      return { ok: false, error: `No se pudo extraer la habitación ${u.indice + 1} del payload.` };
    }
    const existing = await prisma.hospitalityReservation.findUnique({
      where: {
        tenantId_channel_externalBookingId: {
          tenantId,
          channel: payload.channel,
          externalBookingId: sub.bookingId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      yaRegistradas.set(u.indice, existing.id);
      continue;
    }
    aCrear.push({ indice: u.indice, unitId: u.unitId, sub });
  }

  // Validación all-or-nothing de las partes a crear: choques de disponibilidad
  // en la unidad (§16, misma consulta que el cambio manual de unidad) y
  // capacidad publicada contra los huéspedes de la parte.
  for (const parte of aCrear) {
    const unit = units.find((x) => x.id === parte.unitId);
    if (!unit) {
      return { ok: false, error: `Unidad no encontrada para la habitación ${parte.indice + 1}.` };
    }
    const ci = parseDate(parte.sub.checkin) || new Date();
    const co = parseDate(parte.sub.checkout) || new Date();
    const choques = await prisma.hospitalityReservation.findMany({
      where: {
        tenantId,
        unitId: parte.unitId,
        estado: { notIn: ['cancelled', 'no_show'] },
        checkIn: { lt: co },
        checkOut: { gt: ci },
      },
      select: { externalBookingId: true },
      take: 1,
    });
    if (choques.length > 0) {
      return {
        ok: false,
        error:
          `La habitación ${parte.indice + 1} choca con otra reserva de la unidad elegida` +
          (choques[0].externalBookingId ? ` (${choques[0].externalBookingId}).` : '.'),
      };
    }
    const room = parte.sub.rooms?.[0] as { occupancy?: { adults?: unknown; children?: unknown } } | undefined;
    const adultos = Number(room?.occupancy?.adults ?? 1) || 1;
    const ninos = Number(room?.occupancy?.children ?? 0) || 0;
    const huespedes = adultos + ninos;
    if (huespedes > unit.capacidad) {
      return {
        ok: false,
        error: `La habitación ${parte.indice + 1} trae ${huespedes} huésped(es) y la unidad elegida admite ${unit.capacidad}.`,
      };
    }
  }

  // Creación: cada parte pasa por processBook con su sub-payload (id derivado,
  // rooms reducido), así que hereda contacto, eventos §22 y payload tal cual.
  // El resultado reparte TODAS las habitaciones pedidas, en orden.
  const habitaciones: PartePartida[] = [];
  const reservationIds: string[] = [];
  for (const u of ordenadas) {
    const previa = yaRegistradas.get(u.indice);
    if (previa) {
      const subInfo = payloadDeHabitacion(payload, u.indice);
      habitaciones.push({
        indice: u.indice,
        roomCode: null,
        externalBookingId: subInfo?.bookingId ?? externalIdDeParte(payload.bookingId, u.indice),
        estado: 'duplicado',
        reservationId: previa,
      });
      continue;
    }
    const parte = aCrear.find((p) => p.indice === u.indice)!;
    const room = parte.sub.rooms?.[0] as { roomCode?: string } | undefined;
    try {
      const result = await processBook(tenantId, propertyId, parte.unitId, parte.sub);
      habitaciones.push({
        indice: parte.indice,
        roomCode: typeof room?.roomCode === 'string' ? room.roomCode : null,
        externalBookingId: parte.sub.bookingId,
        estado: result.ok && result.status === 'creada' ? 'creada' : result.status === 'duplicado' ? 'duplicado' : 'error',
        ...(result.reservationId ? { reservationId: result.reservationId } : {}),
        ...(result.ok ? {} : { error: result.error }),
      });
      if (result.ok && result.reservationId) reservationIds.push(result.reservationId);
    } catch (e) {
      habitaciones.push({
        indice: parte.indice,
        roomCode: typeof room?.roomCode === 'string' ? room.roomCode : null,
        externalBookingId: parte.sub.bookingId,
        estado: 'error',
        error: e instanceof Error ? e.message : 'Error al registrar la habitación',
      });
    }
  }

  return { ok: true, reservationIds, habitaciones };
}

function buildGuestData(payload: WebhookReservationPayload): Prisma.InputJsonValue | undefined {
  const g = payload.guest;
  if (!g) return undefined;
  return {
    firstName: g.firstName ?? null,
    lastName: g.lastName ?? null,
    email: g.email ?? null,
    phone: g.phone ?? null,
    address: (g.address ?? null) as Prisma.InputJsonValue | null,
    roomGuestName: firstRoom(payload)?.guestName ?? null,
  };
}

/** Carga los mappings activos de un hotelCode con su propiedad y unidad. */
async function cargarMappingsActivos(hotelCode: string) {
  return prisma.connectivityMapping.findMany({
    where: {
      provider: 'channel_connectivity',
      externalPropertyId: hotelCode,
      estado: 'activo',
    },
    include: {
      property: true,
      unit: true,
    },
    // Orden estable: el primer mapping es el fallback determinista.
    orderBy: { fechaCreacion: 'asc' },
  });
}

type MappingActivo = Awaited<ReturnType<typeof cargarMappingsActivos>>[number];

export type MappingMotivo = 'ok' | 'sin_mapping' | 'roomcode_desconocido';

export interface MappingResolution {
  mapping: MappingActivo | null;
  motivo: MappingMotivo;
  /** roomCode del payload que se usó para elegir la unidad. */
  roomCode: string | null;
  /** rateplanCode del payload que se usó como desempate. */
  rateplanCode: string | null;
}

/**
 * Resuelve propiedad y unidad internas a partir del payload:
 * - `hotelCode` selecciona el mapping de la propiedad.
 * - `rooms[0].roomCode` selecciona la UNIDAD (mapping con `externalUnitCode`).
 * - `rooms[0].rateplanCode` desempata cuando varios mappings fijan el mismo
 *   roomCode, y elige entre los mappings que no restringen unidad.
 *
 * Guardia: si el roomCode del payload no corresponde a ningún mapping activo
 * (ni existe un mapping a nivel propiedad/sin unidad) devuelve
 * `motivo: 'roomcode_desconocido'` y `mapping: null`. El webhook NO debe
 * adivinar la habitación ni crear la reserva en otra unidad.
 */
export async function resolveMappingDetailed(
  payload: WebhookReservationPayload
): Promise<MappingResolution> {
  const room = firstRoom(payload);
  const roomCode = (room?.roomCode ?? '').trim() || null;
  const rateplanCode = (room?.rateplanCode ?? '').trim() || null;

  const mappings = await cargarMappingsActivos(payload.hotelCode);
  if (mappings.length === 0) {
    return { mapping: null, motivo: 'sin_mapping', roomCode, rateplanCode };
  }

  // Candidatos: los mappings que fijan exactamente este roomCode. Si el
  // roomCode no aparece en ningún mapping (o el payload no lo trae) se aceptan
  // los mappings que no restringen unidad (a nivel propiedad o tarifa).
  const porRoomCode = roomCode
    ? mappings.filter(
        (m) => normalizeExternalCode(m.externalUnitCode) === normalizeExternalCode(roomCode)
      )
    : [];
  const sinRestriccionDeUnidad = mappings.filter((m) => !normalizeExternalCode(m.externalUnitCode));
  const candidatos = porRoomCode.length > 0 ? porRoomCode : sinRestriccionDeUnidad;

  if (candidatos.length === 0) {
    return { mapping: null, motivo: 'roomcode_desconocido', roomCode, rateplanCode };
  }

  const elegido =
    (rateplanCode
      ? candidatos.find(
          (m) => normalizeExternalCode(m.externalRatePlanCode) === normalizeExternalCode(rateplanCode)
        )
      : undefined) ??
    candidatos.find((m) => !normalizeExternalCode(m.externalRatePlanCode)) ??
    candidatos[0];

  return { mapping: elegido, motivo: 'ok', roomCode, rateplanCode };
}

/**
 * Resuelve propiedad y unidad internas a partir del hotelCode del payload.
 * Usa ConnectivityMapping (hotelCode → property/unit de Volkern).
 * Devuelve `null` cuando no hay mapping usable (ver `resolveMappingDetailed`
 * para conocer el motivo y para el detalle de la guardia de roomCode).
 */
export async function resolveMapping(payload: WebhookReservationPayload): Promise<MappingActivo | null> {
  const { mapping } = await resolveMappingDetailed(payload);
  return mapping;
}

/**
 * Crea/actualiza un Contact (CRM existente de Volkern) con los datos del
 * huésped. Nunca falla por datos incompletos: si no hay email ni nombre,
 * devuelve null (la reserva sigue siendo válida).
 */
export async function upsertGuest(
  tenantId: string,
  payload: WebhookReservationPayload,
  /**
   * Cliente de Prisma sobre el que escribir. El Booking Engine pasa el de su
   * transacción para que el huésped y su reserva se escriban juntos: si la
   * reserva no llega a crearse, no queda un contacto suelto en el CRM.
   */
  cliente: typeof prisma = prisma
): Promise<string | null> {
  const g = payload.guest;
  const roomGuestName = firstRoom(payload)?.guestName;
  const nombre = [g?.firstName, g?.lastName].filter(Boolean).join(' ').trim()
    || roomGuestName?.trim()
    || null;

  const email = g?.email?.trim() || null;
  const telefono = g?.phone?.trim() || null;

  // Sin datos suficientes: el huésped es opcional (regla del contrato).
  if (!nombre && !email && !telefono) return null;

  // Buscar contacto existente del tenant por email o teléfono.
  let contact = null;
  if (email) {
    contact = await cliente.contact.findFirst({
      where: { tenantId, email },
    });
  }
  if (!contact && telefono) {
    contact = await cliente.contact.findFirst({
      where: { tenantId, telefono },
    });
  }

  if (contact) {
    return cliente.contact
      .update({
        where: { id: contact.id },
        data: {
          ...(nombre && { nombre }),
          ...(telefono && { telefono }),
          ...(g?.address?.city && { ciudad: g.address.city }),
          ...(g?.address?.country && { pais: g.address.country }),
          ...(g?.address?.line1 && { direccion: g.address.line1 }),
        },
      })
      .then((c) => c.id);
  }

  return cliente.contact
    .create({
      data: {
        tenantId,
        nombre: nombre || 'Huésped',
        email: email || '',
        telefono,
        tipo: 'person',
        tags: `huesped,${payload.channel}`,
        ...(g?.address?.city && { ciudad: g.address.city }),
        ...(g?.address?.country && { pais: g.address.country }),
        ...(g?.address?.line1 && { direccion: g.address.line1 }),
      },
    })
    .then((c) => c.id);
}

/**
 * Crea la reserva del Booking Engine público (canal «Directa»).
 *
 * Existe para que la ruta pública NO escriba la reserva por su cuenta: la
 * escritura vive en el Reservation Engine, el mismo que procesa el webhook de
 * la conectividad, así que una reserva del motor directo es indistinguible de
 * una de OTA (misma tabla, misma línea de desglose, mismos eventos). La ruta
 * calcula (huésped, disponibilidad, precio); aquí solo se persiste.
 */
export async function crearReservaDeBookingDirecto(input: {
  tenantId: string;
  propertyId: string;
  unitId: string;
  contactId: string | null;
  canal: string;
  referencia: string;
  checkIn: Date;
  checkOut: Date;
  notas: string | null;
  precioTotal: number | null;
  moneda: string;
  guestData: Prisma.InputJsonValue;
}): Promise<{ id: string; externalBookingId: string | null }> {
  return prisma.hospitalityReservation.create({
    data: {
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      unitId: input.unitId,
      contactId: input.contactId,
      channel: input.canal,
      externalBookingId: input.referencia,
      action: 'book',
      estado: 'confirmed',
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      bookedOn: new Date(),
      segment: 'Directa',
      specialRequests: input.notas,
      pah: false,
      amountAfterTax: input.precioTotal,
      currency: input.moneda,
      guestData: input.guestData,
    },
    select: { id: true, externalBookingId: true },
  });
}

/**
 * Divisa del hotel donde entra una reserva entrante.
 *
 * Es el respaldo cuando el canal NO manda la suya: el payload llega de fuera,
 * pero quien lo procesa sí conoce el hotel. Caer al mínimo del esquema (MXN)
 * metía reservas en pesos en hoteles que operan en euros —y con ellas, los
 * informes financieros mezclando divisas—, así que el respaldo es la divisa de
 * la cuenta, nunca el mínimo de la base de datos.
 */
async function monedaDelHotel(tenantId: string): Promise<string | null> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { moneda: true },
    });
    return tenant?.moneda ?? null;
  } catch (e) {
    console.error('[Hospitality] No se pudo leer la divisa del hotel:', e);
    return null;
  }
}

/** Extrae el importe del payload según el contrato. */
function extractAmount(payload: WebhookReservationPayload, monedaRespaldo: string | null) {
  const a = payload.amount;
  if (!a) return {};
  return {
    amountAfterTax: a.amountAfterTax ?? null,
    amountBeforeTax: a.amountBeforeTax ?? null,
    tax: a.tax ?? null,
    // Divisa que manda el canal y, si no la trae, la del hotel.
    currency: monedaEscritura(a.currency, monedaRespaldo),
    commission: a.commission ?? null,
    tcs: a.tcs ?? null,
    tds: a.tds ?? null,
  };
}

function buildReservationData(tenantId: string, propertyId: string, unitId: string | null, contactId: string | null, payload: WebhookReservationPayload, monedaRespaldo: string | null) {
  const room = firstRoom(payload);
  const amount = extractAmount(payload, monedaRespaldo);
  return {
    tenantId,
    propertyId,
    unitId,
    contactId,
    channel: payload.channel,
    externalBookingId: payload.bookingId,
    cmBookingId: payload.cmBookingId ?? null,
    action: payload.action,
    checkIn: parseDate(payload.checkin) || new Date(),
    checkOut: parseDate(payload.checkout) || new Date(),
    bookedOn: parseDate(payload.bookedOn),
    segment: payload.segment ?? null,
    specialRequests: payload.specialRequests ?? null,
    pah: payload.pah ?? false,
    ...amount,
    occupancyAdults: room?.occupancy?.adults ?? 1,
    occupancyChildren: room?.occupancy?.children ?? 0,
    ...(buildGuestData(payload) !== undefined && { guestData: buildGuestData(payload) }),
    payload: payload as Prisma.InputJsonValue,
  };
}

/**
 * Procesa un evento book: crea la reserva si no existe; si ya existe
 * (mismo bookingId), devuelve duplicado sin tocar nada.
 */
export async function processBook(tenantId: string, propertyId: string, unitId: string | null, payload: WebhookReservationPayload): Promise<ProcessResult> {
  const existing = await prisma.hospitalityReservation.findUnique({
    where: {
      tenantId_channel_externalBookingId: {
        tenantId,
        channel: payload.channel,
        externalBookingId: payload.bookingId,
      },
    },
  });

  if (existing) {
    return { ok: true, status: 'duplicado', reservationId: existing.id };
  }

  const contactId = await upsertGuest(tenantId, payload);
  // Divisa de respaldo: el canal puede no mandarla (el proveedor devuelve
  // `amount.currency: null` en hoteles reales) y la reserva no puede quedar en
  // el mínimo del esquema.
  const monedaRespaldo = await monedaDelHotel(tenantId);
  const reservation = await prisma.hospitalityReservation.create({
    data: {
      ...buildReservationData(tenantId, propertyId, unitId, contactId, payload, monedaRespaldo),
      estado: 'confirmed',
    },
  });

  // Comunicación automática §21: confirmación de reserva (no bloqueante).
  dispararComunicacionReserva({ tenantId, reservationId: reservation.id, evento: 'confirmacion' })
    .catch((e: unknown) => console.error('[Hospitality] Error en comunicación de confirmación:', e));

  // Evento §22: reservation.created → reglas de automatización.
  emitReservationCreated({
    tenantId,
    reservationId: reservation.id,
    propertyId,
    unitId,
    contactId,
    channel: payload.channel,
    externalBookingId: payload.bookingId,
    estado: reservation.estado,
    checkIn: reservation.checkIn,
    checkOut: reservation.checkOut,
    guestData: reservation.guestData,
  });

  return { ok: true, status: 'creada', reservationId: reservation.id };
}

/**
 * Procesa modify: el payload es el estado COMPLETO nuevo. Reemplaza los datos
 * de la reserva (nunca mezcla parcial) y actualiza el huésped.
 */
export async function processModify(tenantId: string, propertyId: string, unitId: string | null, payload: WebhookReservationPayload): Promise<ProcessResult> {
  const existing = await prisma.hospitalityReservation.findUnique({
    where: {
      tenantId_channel_externalBookingId: {
        tenantId,
        channel: payload.channel,
        externalBookingId: payload.bookingId,
      },
    },
  });

  if (!existing) {
    // Modify de una reserva que nunca llegó: crearla (equivalente a book).
    return processBook(tenantId, propertyId, unitId, payload);
  }

  const contactId = await upsertGuest(tenantId, payload);

  const eraHold = existing.estado === 'pending';
  const monedaRespaldo = await monedaDelHotel(tenantId);
  const updated = await prisma.hospitalityReservation.update({
    where: { id: existing.id },
    data: {
      ...buildReservationData(tenantId, propertyId, unitId, contactId, payload, monedaRespaldo),
      // El estado no se revierte en modify: conserva checked_in/checked_out
      // si ya se operó. Solo se aplica si está en pending/confirmed.
      estado: ['pending', 'confirmed'].includes(existing.estado) ? 'confirmed' : existing.estado,
    },
  });

  // El canal confirmó un hold que estaba pendiente: es una decisión, no un
  // abandono, y deja su traza para que la tasa de abandono de holds cuadre
  // (el barrido audita el otro desenlace). Nunca lanza.
  if (eraHold && updated.estado === 'confirmed') {
    await registrarHoldConfirmado({
      tenantId,
      reservationId: existing.id,
      propertyId,
      channel: payload.channel,
      origen: 'canal',
    });
  }

  // Evento §22: reservation.modified → reglas de automatización.
  emitReservationModified({
    tenantId,
    reservationId: existing.id,
    propertyId,
    unitId,
    contactId,
    channel: payload.channel,
    externalBookingId: payload.bookingId,
    estado: updated.estado,
    checkIn: updated.checkIn,
    checkOut: updated.checkOut,
    guestData: updated.guestData,
  });

  return { ok: true, status: 'actualizada', reservationId: existing.id };
}

/**
 * Procesa cancel: localiza por bookingId y cambia el estado a cancelled.
 * Conserva el historial (no borra la fila) y registra el payload.
 */
export async function processCancel(tenantId: string, payload: WebhookReservationPayload): Promise<ProcessResult> {
  const existing = await prisma.hospitalityReservation.findUnique({
    where: {
      tenantId_channel_externalBookingId: {
        tenantId,
        channel: payload.channel,
        externalBookingId: payload.bookingId,
      },
    },
  });

  // Si el booking fue registrado partido (bookingId#n), el cancel del booking
  // completo cancela TODAS sus partes vivas. No se toca nada que no sea de
  // este booking (el prefijo es exacto: BKG-1#1 no es parte de BKG-11).
  if (!existing && payload.bookingId) {
    const partes = await prisma.hospitalityReservation.findMany({
      where: {
        tenantId,
        channel: payload.channel,
        externalBookingId: { startsWith: `${payload.bookingId}#` },
        estado: { notIn: ['cancelled'] },
      },
      select: {
        id: true,
        propertyId: true,
        unitId: true,
        contactId: true,
        checkIn: true,
        checkOut: true,
        guestData: true,
      },
    });
    if (partes.length > 0) {
      await prisma.hospitalityReservation.updateMany({
        where: {
          id: { in: partes.map((p) => p.id) },
          estado: { notIn: ['cancelled'] },
        },
        data: { estado: 'cancelled', action: 'cancel', payload: payload as Prisma.InputJsonValue },
      });
      for (const parte of partes) {
        emitReservationCancelled({
          tenantId,
          reservationId: parte.id,
          propertyId: parte.propertyId,
          unitId: parte.unitId,
          contactId: parte.contactId,
          channel: payload.channel,
          externalBookingId: payload.bookingId,
          estado: 'cancelled',
          checkIn: parte.checkIn,
          checkOut: parte.checkOut,
          guestData: parte.guestData,
        });
      }
      return { ok: true, status: 'cancelada', reservationId: partes[0].id };
    }
  }

  if (!existing) {
    return { ok: false, status: 'no_encontrada', error: 'Reserva no encontrada para cancelar' };
  }

  const updated = await prisma.hospitalityReservation.update({
    where: { id: existing.id },
    data: {
      estado: 'cancelled',
      action: 'cancel',
      payload: payload as Prisma.InputJsonValue,
    },
  });

  // Evento §22: reservation.cancelled → reglas de automatización.
  emitReservationCancelled({
    tenantId,
    reservationId: existing.id,
    propertyId: existing.propertyId,
    unitId: existing.unitId,
    contactId: existing.contactId,
    channel: existing.channel,
    externalBookingId: existing.externalBookingId,
    estado: updated.estado,
    checkIn: existing.checkIn,
    checkOut: existing.checkOut,
    guestData: existing.guestData,
  });

  return { ok: true, status: 'cancelada', reservationId: existing.id };
}

/**
 * Procesa no_show: el proveedor reporta que el huésped no se presentó.
 *
 * Es la vía ENTRANTE del no-show (regla 7 del plan): hasta hoy solo lo marcaba
 * el operador con el PATCH, y un no-show reportado por el canal no entraba
 * solo. El enganche es el mismo que el del operador: marcar `no_show` (estado,
 * action y payload del evento) y emitir la penalización con el emisor ya
 * existente (`aplicarPenalizacionNoShow`, regla 8), que es idempotente, respeta
 * la política de la propiedad y no cobra cuando el canal externo cobra la suya.
 *
 * Igual que en el PATCH: el fallo del emisor NUNCA revierte el estado — el
 * inventario manda (la unidad queda vendible) y el cargo se puede emitir a mano.
 */
export async function processNoShow(tenantId: string, payload: WebhookReservationPayload): Promise<ProcessResult> {
  const existing = await prisma.hospitalityReservation.findUnique({
    where: {
      tenantId_channel_externalBookingId: {
        tenantId,
        channel: payload.channel,
        externalBookingId: payload.bookingId,
      },
    },
  });

  if (!existing) {
    return { ok: false, status: 'no_encontrada', error: 'Reserva no encontrada para marcar no_show' };
  }

  // Idempotente por estado: un no_show repetido (o sobre una reserva ya
  // operada: checked_out, cancelled, el propio no_show) no la toca — solo se
  // marca desde una estancia en curso, con la definición única del vocabulario.
  if (!esReservaViva(existing.estado)) {
    return { ok: true, status: 'actualizada', reservationId: existing.id };
  }

  const updated = await prisma.hospitalityReservation.update({
    where: { id: existing.id },
    data: {
      estado: 'no_show',
      action: 'no_show',
      payload: payload as Prisma.InputJsonValue,
    },
  });

  // Evento §22: reservation.modified → reglas de automatización.
  emitReservationModified({
    tenantId,
    reservationId: existing.id,
    propertyId: existing.propertyId,
    unitId: existing.unitId,
    contactId: existing.contactId,
    channel: existing.channel,
    externalBookingId: existing.externalBookingId,
    estado: updated.estado,
    checkIn: existing.checkIn,
    checkOut: existing.checkOut,
    guestData: existing.guestData,
  });

  // Regla 8: la penalización va por el emisor ya existente (el mismo que el
  // PATCH del operador). Nunca rompe el flujo: si falla, el no-show ya está
  // marcado y el cargo se puede emitir a mano desde la ficha de la reserva.
  let penalizacion: ProcessResult['penalizacion'] = null;
  try {
    const { aplicarPenalizacionNoShow } = await import('./penalizaciones');
    const r = await aplicarPenalizacionNoShow(tenantId, existing.id);
    penalizacion = { emitida: r.emitida, importe: r.importe, motivo: r.motivo };
  } catch (e) {
    console.error('[Hospitality] Error emitiendo la penalización del no_show entrante:', e);
  }

  return { ok: true, status: 'actualizada', reservationId: existing.id, penalizacion };
}

/**
 * Dispatcher principal: resuelve mapping y ejecuta la acción.
 * Registra el evento bruto con su estado (recibido/procesado/duplicado/error).
 */
export async function processReservationWebhook(payload: WebhookReservationPayload): Promise<ProcessResult> {
  const action = payload.action;
  if (!['book', 'modify', 'cancel', 'no_show'].includes(action)) {
    return { ok: false, status: 'error', error: `Acción no soportada: ${action}` };
  }
  if (!payload.hotelCode || !payload.bookingId || !payload.channel) {
    return { ok: false, status: 'error', error: 'Faltan hotelCode, bookingId o channel' };
  }

  // Multi-habitación: este motor registra UNA reserva por booking (una unidad,
  // un rango de fechas). Un payload con varias habitaciones no se puede partir
  // solo — registrar solo la primera perdería las demás en silencio — y meter
  // todas en una unidad sería un overbooking. Se rechaza sin tocar datos y con
  // un incidente claro; partir la reserva es decisión del operador. Un `cancel`
  // nunca se rechaza por esto: cancela por bookingId y las rooms sobran.
  if (action !== 'cancel' && Array.isArray(payload.rooms) && payload.rooms.length > 1) {
    const errorMensaje =
      `Reserva multi-habitación no soportada: el booking ${payload.bookingId} trae ` +
      `${payload.rooms.length} habitaciones (` +
      payload.rooms.map((r) => r?.roomCode ?? 'sin roomCode').join(', ') +
      ') y este sistema registra una reserva por booking';
    try {
      await prisma.hospitalityWebhookEvent.create({
        data: {
          action,
          channel: payload.channel,
          hotelCode: payload.hotelCode,
          bookingId: payload.bookingId,
          estado: 'sin_mapping',
          errorMensaje,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      console.error('[Hospitality] Error registrando el evento multi-habitación:', e);
    }
    return { ok: false, status: 'error', error: errorMensaje };
  }

  const resolucion = await resolveMappingDetailed(payload);
  const { roomCode, rateplanCode } = resolucion;
  let mapping = resolucion.mapping;
  let motivo = resolucion.motivo;
  // Por qué no se pudo resolver la habitación sin ayuda humana (si se intentó).
  let motivoAutoVinculacion: string | null = null;

  // Antes de rechazar: la habitación no tiene vínculo, pero si existe en el
  // catálogo del proveedor y hay una única unidad libre que le corresponde, se
  // vincula y la reserva entra. La vinculación automática deja traza de su
  // motivo (metadata del vínculo + HospitalitySyncLog) y solo actúa cuando no
  // hay duda; si hay cualquier ambigüedad sigue ganando la guardia.
  if (!mapping?.property && motivo === 'roomcode_desconocido' && roomCode) {
    try {
      const auto = await vincularHabitacionDesdeWebhook({
        hotelCode: payload.hotelCode,
        roomCode,
        rateplanCode,
        // Huéspedes reales de esta reserva (adults + children): desempatan la
        // unidad cuando el rango del tipo de habitación no distingue. El payload
        // acompaña para que las edades (si el canal las publica) resten bebés.
        ocupacion: ocupacionDePayload(payload),
        payload,
        bookingId: payload.bookingId,
        channel: payload.channel,
      });
      if (auto?.estado === 'aplicada') {
        const relectura = await resolveMappingDetailed(payload);
        mapping = relectura.mapping;
        motivo = relectura.motivo;
      } else if (auto) {
        // Se mantiene la guardia; el motivo viaja al evento bruto para que el
        // operador sepa por qué el sistema no lo resolvió solo.
        motivoAutoVinculacion = auto.detalle ?? auto.motivo;
      }
    } catch (e) {
      console.error('[Hospitality] Error en la vinculación automática:', e);
    }
  }

  if (!mapping?.property) {
    // Sin mapping: se registra igual el evento bruto (tenantId null) para
    // diagnóstico/auditoría, y se informa el fallo de resolución.
    const errorMensaje =
      motivo === 'roomcode_desconocido'
        ? `Sin mapping de unidad para hotelCode ${payload.hotelCode} y roomCode ${roomCode}` +
          (rateplanCode ? ` (rateplan ${rateplanCode})` : '') +
          (motivoAutoVinculacion ? `. Vinculación automática no aplicable: ${motivoAutoVinculacion}` : '')
        : `Sin mapping activo para hotelCode ${payload.hotelCode}`;
    try {
      await prisma.hospitalityWebhookEvent.create({
        data: {
          action,
          channel: payload.channel,
          hotelCode: payload.hotelCode,
          bookingId: payload.bookingId,
          estado: 'sin_mapping',
          errorMensaje,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      console.error('[Hospitality] Error registrando evento sin mapping:', e);
    }
    return { ok: false, status: 'error', error: errorMensaje };
  }

  const tenantId = mapping.property.tenantId;
  const unitId = mapping.unit?.id ?? null;

  let result: ProcessResult;
  if (action === 'book') {
    result = await processBook(tenantId, mapping.property.id, unitId, payload);
  } else if (action === 'modify') {
    result = await processModify(tenantId, mapping.property.id, unitId, payload);
  } else if (action === 'no_show') {
    // El no_show no necesita unidad: localiza la reserva por bookingId.
    result = await processNoShow(tenantId, payload);
  } else {
    result = await processCancel(tenantId, payload);
  }

  // Registrar evento bruto (auditoría). No rompe el flujo si falla.
  try {
    await prisma.hospitalityWebhookEvent.create({
      data: {
        tenantId,
        reservationId: result.reservationId ?? null,
        action,
        channel: payload.channel,
        hotelCode: payload.hotelCode,
        bookingId: payload.bookingId,
        estado: result.status === 'duplicado' ? 'duplicado' : result.ok ? 'procesado' : 'error',
        errorMensaje: result.error ?? null,
        payload: payload as any,
      },
    });
  } catch (e) {
    console.error('[Hospitality] Error registrando evento bruto:', e);
  }

  // ── Push de disponibilidad/tarifas al exterior (plan §15.2) ──
  // Tras un cambio de reserva real (no duplicado), recalcular y empujar.
  // Nunca bloquea ni rompe el flujo: los errores quedan en HospitalitySyncLog.
  if (result.ok && result.status !== 'duplicado') {
    try {
      const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
      const operacion =
        action === 'book'
          ? 'reserva_creada'
          : action === 'modify'
            ? 'reserva_modificada'
            : action === 'no_show'
              ? 'reserva_modificada' // mismo efecto de inventario que el PATCH del operador
              : 'reserva_cancelada';
      await dispatchConnectivityPush(tenantId, mapping.property.id, operacion as any);
    } catch (e) {
      console.error('[Hospitality] Error en push de conectividad:', e);
    }
  }

  return result;
}

export type { HospitalityReservation };