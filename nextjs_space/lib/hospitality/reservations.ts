import { prisma } from '@/lib/db';
import { Prisma, type HospitalityReservation } from '@prisma/client';

/**
 * Reservation Engine — procesa los eventos del webhook de reservas de la capa
 * de conectividad (book / modify / cancel).
 *
 * Contrato (docs/hospitality-connectivity-contract.md):
 * - Un mismo booking recibido dos veces NO puede generar dos reservas
 *   (idempotencia por [tenantId, channel, externalBookingId]).
 * - `modify` es ESTADO COMPLETO NUEVO: reemplaza el anterior, no mezcla.
 * - Los datos del huésped son opcionales; nunca rechazar por falta de email.
 * - `specialRequests` es texto libre.
 * - Aislamiento multi-tenant: las operaciones siempre filtran por tenantId.
 */

export type WebhookAction = 'book' | 'modify' | 'cancel';

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
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Normaliza un ID de habitación: prioriza roomCode, con fallback al primero. */
function firstRoom(payload: WebhookReservationPayload) {
  return payload.rooms?.[0] || null;
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

/**
 * Resuelve la propiedad y unidad interna a partir del hotelCode del payload.
 * Usa ConnectivityMapping (hotelCode → property/unit de Volkern).
 */
export async function resolveMapping(payload: WebhookReservationPayload) {
  const mapping = await prisma.connectivityMapping.findFirst({
    where: {
      provider: 'channel_connectivity',
      externalPropertyId: payload.hotelCode,
      estado: 'activo',
    },
    include: {
      property: true,
      unit: true,
    },
  });
  return mapping;
}

/**
 * Crea/actualiza un Contact (CRM existente de Volkern) con los datos del
 * huésped. Nunca falla por datos incompletos: si no hay email ni nombre,
 * devuelve null (la reserva sigue siendo válida).
 */
export async function upsertGuest(
  tenantId: string,
  payload: WebhookReservationPayload
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
    contact = await prisma.contact.findFirst({
      where: { tenantId, email },
    });
  }
  if (!contact && telefono) {
    contact = await prisma.contact.findFirst({
      where: { tenantId, telefono },
    });
  }

  if (contact) {
    return prisma.contact
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

  return prisma.contact
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

/** Extrae el importe del payload según el contrato. */
function extractAmount(payload: WebhookReservationPayload) {
  const a = payload.amount;
  if (!a) return {};
  return {
    amountAfterTax: a.amountAfterTax ?? null,
    amountBeforeTax: a.amountBeforeTax ?? null,
    tax: a.tax ?? null,
    currency: a.currency || 'MXN',
    commission: a.commission ?? null,
    tcs: a.tcs ?? null,
    tds: a.tds ?? null,
  };
}

function buildReservationData(tenantId: string, propertyId: string, unitId: string | null, contactId: string | null, payload: WebhookReservationPayload) {
  const room = firstRoom(payload);
  const amount = extractAmount(payload);
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
  const reservation = await prisma.hospitalityReservation.create({
    data: {
      ...buildReservationData(tenantId, propertyId, unitId, contactId, payload),
      estado: 'confirmed',
    },
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

  await prisma.hospitalityReservation.update({
    where: { id: existing.id },
    data: {
      ...buildReservationData(tenantId, propertyId, unitId, contactId, payload),
      // El estado no se revierte en modify: conserva checked_in/checked_out
      // si ya se operó. Solo se aplica si está en pending/confirmed.
      estado: ['pending', 'confirmed'].includes(existing.estado) ? 'confirmed' : existing.estado,
    },
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

  if (!existing) {
    return { ok: false, status: 'no_encontrada', error: 'Reserva no encontrada para cancelar' };
  }

  await prisma.hospitalityReservation.update({
    where: { id: existing.id },
    data: {
      estado: 'cancelled',
      action: 'cancel',
      payload: payload as Prisma.InputJsonValue,
    },
  });

  return { ok: true, status: 'cancelada', reservationId: existing.id };
}

/**
 * Dispatcher principal: resuelve mapping y ejecuta la acción.
 * Registra el evento bruto con su estado (recibido/procesado/duplicado/error).
 */
export async function processReservationWebhook(payload: WebhookReservationPayload): Promise<ProcessResult> {
  const action = payload.action;
  if (!['book', 'modify', 'cancel'].includes(action)) {
    return { ok: false, status: 'error', error: `Acción no soportada: ${action}` };
  }
  if (!payload.hotelCode || !payload.bookingId || !payload.channel) {
    return { ok: false, status: 'error', error: 'Faltan hotelCode, bookingId o channel' };
  }

  const mapping = await resolveMapping(payload);
  if (!mapping?.property) {
    // Sin mapping: se registra igual el evento bruto (tenantId null) para
    // diagnóstico/auditoría, y se informa el fallo de resolución.
    try {
      await prisma.hospitalityWebhookEvent.create({
        data: {
          action,
          channel: payload.channel,
          hotelCode: payload.hotelCode,
          bookingId: payload.bookingId,
          estado: 'sin_mapping',
          errorMensaje: `Sin mapping activo para hotelCode ${payload.hotelCode}`,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      console.error('[Hospitality] Error registrando evento sin mapping:', e);
    }
    return { ok: false, status: 'error', error: `Sin mapping activo para hotelCode ${payload.hotelCode}` };
  }

  const tenantId = mapping.property.tenantId;
  const unitId = mapping.unit?.id ?? null;

  let result: ProcessResult;
  if (action === 'book') {
    result = await processBook(tenantId, mapping.property.id, unitId, payload);
  } else if (action === 'modify') {
    result = await processModify(tenantId, mapping.property.id, unitId, payload);
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

  return result;
}

export type { HospitalityReservation };