export const dynamic = 'force-dynamic';

/**
 * POST /api/hospitality/incidencias/reintentar
 *
 * Reenvía al Reservation Engine el payload guardado de eventos que quedaron en
 * `sin_mapping`, para no depender de que el canal vuelva a enviar la reserva
 * después de que el operador haya corregido el vínculo de la unidad.
 *
 * Body: { eventoIds: string[] } — los ids que devuelve
 * GET /api/hospitality/incidencias en `eventoIds` (máximo 20 por petición).
 *
 * Garantías:
 * - Nunca duplica: el payload pasa por el mismo motor (`processReservationWebhook`
 *   para book/modify), idempotente por [tenantId, channel, externalBookingId];
 *   un booking ya registrado responde `duplicado` y no crea nada.
 * - No inventa la unidad: si el roomCode sigue sin vínculo, no se reenvía nada
 *   (`sin_vinculo`) y se le dice al operador qué habitación falta vincular.
 * - Un `cancel` no necesita vínculo: se localiza la reserva por
 *   [tenantId, channel, bookingId] con el tenant de la petición, así que se
 *   aplica aunque la habitación siga sin mapping (cancelar no crea nada).
 * - Aislamiento: solo se reenvían eventos cuyo hotelCode pertenece al tenant,
 *   y la resolución debe apuntar a una propiedad de ESE tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import {
  processCancel,
  processReservationWebhook,
  resolveMappingDetailed,
  type WebhookReservationPayload,
} from '@/lib/hospitality/reservations';
import { cargarHotelCodesDelTenant, leerHabitacion, vinculoParaRoomCode } from '@/lib/hospitality/incidencias';

/** Eventos que se reenvían en una sola petición. */
const MAX_REINTENTOS = 20;

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const raw: unknown[] = Array.isArray(body?.eventoIds) ? body.eventoIds : [];
    const eventoIds: string[] = [
      ...new Set(raw.filter((v): v is string => typeof v === 'string' && !!v.trim())),
    ];

    if (eventoIds.length === 0) {
      return NextResponse.json({ error: 'Indica al menos un evento a reenviar' }, { status: 400 });
    }
    if (eventoIds.length > MAX_REINTENTOS) {
      return NextResponse.json(
        { error: `Se pueden reenviar como máximo ${MAX_REINTENTOS} reservas por vez` },
        { status: 400 }
      );
    }

    const porHotelCode = await cargarHotelCodesDelTenant(tenantId);
    if (!porHotelCode || porHotelCode.size === 0) {
      return NextResponse.json(
        { error: 'El tenant no tiene propiedades vinculadas a la conectividad' },
        { status: 404 }
      );
    }

    const eventos = await prisma.hospitalityWebhookEvent.findMany({
      where: { id: { in: eventoIds }, estado: 'sin_mapping' },
      orderBy: { fechaCreacion: 'desc' },
      select: {
        id: true,
        hotelCode: true,
        bookingId: true,
        channel: true,
        action: true,
        payload: true,
      },
    });

    const propios = eventos.filter((e) => !!e.hotelCode && porHotelCode.has(e.hotelCode));
    if (propios.length === 0) {
      return NextResponse.json(
        { error: 'Ninguno de los eventos indicados pertenece a este tenant' },
        { status: 404 }
      );
    }

    // Un mismo booking puede tener varios eventos guardados (reenvíos del
    // canal): basta reenviar el más reciente de cada uno.
    const vistos = new Set<string>();
    const aReenviar = propios.filter((e) => {
      const clave = `${e.channel ?? ''}|${e.bookingId ?? e.id}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });

    let reenviadas = 0;
    let duplicadas = 0;
    let sinVinculo = 0;
    let fallidas = 0;
    const resultados: Array<{
      eventoId: string;
      bookingId: string | null;
      channel: string | null;
      estado: 'registrada' | 'cancelada' | 'duplicado' | 'sin_vinculo' | 'error';
      reservationId?: string;
      error?: string;
      roomCode?: string | null;
    }> = [];

    for (const ev of aReenviar) {
      const payload = ev.payload as unknown as WebhookReservationPayload;
      const { roomCode } = leerHabitacion(ev.payload);
      const base = { eventoId: ev.id, bookingId: ev.bookingId, channel: ev.channel, roomCode };

      let result;
      if (ev.action === 'cancel') {
        // Cancelar no crea nada: la reserva se localiza por bookingId + canal
        // dentro del tenant de la petición, sin depender del vínculo de la
        // habitación (que puede ser justo lo que se rompió antes del cancel).
        result = await processCancel(tenantId, payload);
      } else {
        // Comprobación previa con la MISMA regla que el webhook: si el roomCode
        // sigue sin vínculo no se reenvía (no se ensucia el log de eventos).
        const info = porHotelCode.get(ev.hotelCode!);
        if (!vinculoParaRoomCode(info, roomCode)) {
          sinVinculo += 1;
          resultados.push({
            ...base,
            estado: 'sin_vinculo',
            error: roomCode
              ? `La habitación ${roomCode} sigue sin vínculo con una unidad`
              : 'El payload no trae habitación y la propiedad no tiene vínculo a nivel de propiedad',
          });
          continue;
        }

        // La resolución real debe caer en una propiedad de este tenant.
        const { mapping, motivo } = await resolveMappingDetailed(payload);
        if (!mapping?.property || mapping.property.tenantId !== tenantId) {
          fallidas += 1;
          resultados.push({
            ...base,
            estado: 'error',
            error:
              motivo === 'roomcode_desconocido'
                ? `Sin mapping de unidad para hotelCode ${ev.hotelCode} y roomCode ${roomCode}`
                : 'La reserva no se pudo resolver dentro de este tenant',
          });
          continue;
        }

        result = await processReservationWebhook(payload);
      }
      if (result.ok && result.status === 'duplicado') {
        duplicadas += 1;
        resultados.push({ ...base, estado: 'duplicado', reservationId: result.reservationId });
      } else if (result.ok) {
        reenviadas += 1;
        resultados.push({
          ...base,
          estado: result.status === 'cancelada' ? 'cancelada' : 'registrada',
          reservationId: result.reservationId,
        });
      } else {
        fallidas += 1;
        resultados.push({ ...base, estado: 'error', error: result.error ?? 'No se pudo registrar' });
      }
    }

    if (auth.user?.id && (reenviadas > 0 || duplicadas > 0 || fallidas > 0)) {
      await logAuditAction(
        auth.user.id,
        tenantId,
        'ejecutar',
        'hospitality_incidencia_reserva',
        aReenviar[0]?.hotelCode ?? '',
        `Reenvío de incidencias: ${reenviadas} procesada(s), ${duplicadas} duplicada(s), ` +
          `${sinVinculo} sin vínculo, ${fallidas} con error`
      ).catch(() => {});
    }

    return NextResponse.json({
      ok: fallidas === 0 && sinVinculo === 0,
      reenviadas,
      duplicadas,
      sinVinculo,
      fallidas,
      resultados,
    });
  } catch (error) {
    console.error('Error reenviando incidencias de conectividad:', error);
    return NextResponse.json({ error: 'Error al reenviar las reservas' }, { status: 500 });
  }
}
