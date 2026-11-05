export const dynamic = 'force-dynamic';

/**
 * POST /api/hospitality/incidencias/registrar-partida
 *
 * Registro manual de un booking multi-habitación como N reservas separadas
 * (una unidad por habitación), a partir del payload guardado del incidente.
 *
 * El webhook rechaza siempre un booking con varias habitaciones (regla dura
 * del contrato: este sistema registra una reserva por booking) y deja el
 * evento en `sin_mapping` con tipo `multi_habitacion` en el panel. Reenviar
 * reproduciría el rechazo: el arreglo no es un vínculo, es partir la reserva —
 * y decidir qué unidad recibe cada habitación es decisión del operador. Este
 * endpoint es esa decisión.
 *
 * Body: { eventoId: string, unidades: Array<{ indice: number, unitId: string }> }
 *
 * Garantías (ver lib/hospitality/reservations.ts → registrarReservaPartida):
 * - Idempotente por parte (externalBookingId derivado `bookingId#n`):
 *   repetir la llamada, o registrar en varias pasadas, no duplica nada.
 * - All-or-nothing: si alguna parte no cabe en su unidad (choque de
 *   disponibilidad o capacidad), no se crea NINGUNA.
 * - Aislamiento: el evento y las unidades deben ser del tenant de la petición,
 *   y las unidades de una sola propiedad.
 *
 * El evento queda `procesado` cuando TODAS las habitaciones del booking tienen
 * su parte registrada; mientras falte alguna sigue visible en el panel para
 * registrar el resto.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { hotelCodesReclamadosPorOtroTenant } from '@/lib/hospitality/incidencias';
import {
  externalIdDeParte,
  registrarReservaPartida,
  type WebhookReservationPayload,
} from '@/lib/hospitality/reservations';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'mantenimiento.gestionar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = await req.json().catch(() => ({}));
    const eventoId = typeof body?.eventoId === 'string' ? body.eventoId.trim() : '';
    const unidades = Array.isArray(body?.unidades) ? body.unidades : [];

    if (!eventoId) {
      return NextResponse.json({ error: 'Indica el evento del incidente' }, { status: 400 });
    }
    if (
      unidades.length === 0 ||
      !unidades.every(
        (u: unknown) =>
          typeof u === 'object' &&
          u !== null &&
          Number.isInteger((u as { indice?: unknown }).indice) &&
          typeof (u as { unitId?: unknown }).unitId === 'string' &&
          (u as { unitId?: string }).unitId!.length > 0
      )
    ) {
      return NextResponse.json(
        { error: 'Indica la unidad para cada habitación: [{ indice, unitId }]' },
        { status: 400 }
      );
    }

    // El evento debe existir, estar sin resolver y pertenecer al tenant: los
    // hotelCodes del evento se validan contra las propiedades del tenant.
    const evento = await prisma.hospitalityWebhookEvent.findUnique({
      where: { id: eventoId },
      select: { id: true, estado: true, hotelCode: true, bookingId: true, payload: true },
    });
    if (!evento) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    if (evento.estado !== 'sin_mapping') {
      return NextResponse.json(
        { error: `El evento ya no está pendiente (estado: ${evento.estado}).` },
        { status: 409 }
      );
    }

    // Aislamiento: el hotelCode del evento debe estar vinculado a una propiedad
    // de este tenant (misma regla que el reenvío).
    //
    // Un vínculo inactivo del propio tenant cuenta como suyo (la incidencia se
    // resuelve precisamente asignando unidades), pero un hotelCode que HOY tiene
    // activo otra cuenta no: los eventos sin mapping se guardan sin tenantId, de
    // modo que sin este corte un tenant podría registrar la reserva partida del
    // nuevo dueño con solo conocer su `eventoId`.
    const codigoEvento = (evento.hotelCode ?? '').trim();
    if (codigoEvento) {
      const reclamados = await hotelCodesReclamadosPorOtroTenant(tenantId, [codigoEvento]);
      if (reclamados.has(codigoEvento)) {
        return NextResponse.json(
          { error: 'El evento no pertenece a este tenant' },
          { status: 404 }
        );
      }
    }

    const properties = await prisma.hospitalityProperty.findMany({
      where: {
        tenantId,
        mappings: {
          some: { provider: 'channel_connectivity', externalPropertyId: evento.hotelCode ?? '' },
        },
      },
      select: { id: true },
    });
    if (properties.length === 0) {
      return NextResponse.json(
        { error: 'El evento no pertenece a este tenant' },
        { status: 404 }
      );
    }

    const payload = evento.payload as unknown as WebhookReservationPayload | null;
    if (!payload?.bookingId || !Array.isArray(payload.rooms) || payload.rooms.length <= 1) {
      return NextResponse.json(
        { error: 'El payload del evento no es un booking multi-habitación.' },
        { status: 409 }
      );
    }

    const result = await registrarReservaPartida({
      tenantId,
      payload,
      unidades: unidades as Array<{ indice: number; unitId: string }>,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    // Cierre del evento: solo cuando TODAS las habitaciones tienen su parte.
    const roomsLen = payload.rooms.length;
    const todasRegistradas = await prisma.hospitalityReservation.findMany({
      where: {
        tenantId,
        channel: payload.channel,
        externalBookingId: {
          in: Array.from({ length: roomsLen }, (_, i) => externalIdDeParte(payload.bookingId, i)),
        },
      },
      select: { id: true },
    });
    let eventoCerrado = false;
    if (todasRegistradas.length >= roomsLen) {
      await prisma.hospitalityWebhookEvent.update({
        where: { id: evento.id },
        data: { estado: 'procesado' },
      });
      eventoCerrado = true;
    }

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'hospitality_reserva_partida_registrada',
      'HospitalityReservation',
      evento.bookingId ?? evento.id,
      `Booking multi-habitación ${payload.bookingId} registrado como ${result.habitaciones.filter((h) => h.estado === 'creada').length} reserva(s) nueva(s) de ${roomsLen} habitaciones`,
      null,
      { habitaciones: result.habitaciones, eventoCerrado }
    );

    return NextResponse.json({
      ok: true,
      eventoCerrado,
      habitaciones: result.habitaciones,
    });
  } catch (error) {
    console.error('Error registrando la reserva partida:', error);
    return NextResponse.json({ error: 'Error al registrar la reserva partida' }, { status: 500 });
  }
}
