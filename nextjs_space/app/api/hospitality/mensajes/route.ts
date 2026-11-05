export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import {
  MAX_BANDEJA,
  hiloDeConversacion,
  listarConversaciones,
  marcarHiloLeido,
  responderConversacion,
} from '@/lib/hospitality/mensajes-service';

/**
 * Bandeja de mensajería del canal (OTAs) del hotel.
 *
 *   GET   /api/hospitality/mensajes                       → hilos del tenant
 *   GET   /api/hospitality/mensajes?conversacionId=…      → un hilo completo
 *   POST  /api/hospitality/mensajes { conversacionId, contenido } → responder
 *   PATCH /api/hospitality/mensajes { conversacionId }    → marcar leído
 *
 * Permisos: leer la bandeja es la capacidad de comunicaciones del módulo
 * (`comunicaciones.ver`) y responder es la de enviar (`comunicaciones.enviar`).
 * No se inventó un permiso nuevo a propósito: hablar con el huésped por el canal
 * es el mismo acto que mandarle una plantilla, y quien puede lo uno puede lo
 * otro — con un permiso nuevo habría que repartirlo en cada rol existente, sin
 * ganar ninguna separación real.
 *
 * La respuesta NO se da por enviada porque la llamada salga bien: si el canal la
 * rechaza, viaja un 502 con el motivo y queda en el hilo marcada como error.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['messaging:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'comunicaciones.ver');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const conversacionId = req.nextUrl.searchParams.get('conversacionId');
    if (conversacionId) {
      const hilo = await hiloDeConversacion(tenantId, conversacionId);
      if (!hilo) {
        return NextResponse.json({ error: 'La conversación no existe' }, { status: 404 });
      }
      return NextResponse.json({
        conversacion: {
          id: hilo.conversacion.id,
          canal: hilo.conversacion.canal,
          huespedNombre: hilo.conversacion.huespedNombre,
          huespedEmail: hilo.conversacion.huespedEmail,
          huespedTelefono: hilo.conversacion.huespedTelefono,
          bookingExterno: hilo.conversacion.bookingExterno,
          sinLeer: hilo.conversacion.sinLeer,
          propertyId: hilo.conversacion.propertyId,
          propiedad: hilo.conversacion.property?.nombre ?? null,
          reservationId: hilo.conversacion.reservationId,
          reserva: hilo.conversacion.reservation
            ? {
                id: hilo.conversacion.reservation.id,
                externalBookingId: hilo.conversacion.reservation.externalBookingId,
                checkIn: hilo.conversacion.reservation.checkIn,
                checkOut: hilo.conversacion.reservation.checkOut,
                estado: hilo.conversacion.reservation.estado,
              }
            : null,
        },
        mensajes: hilo.mensajes.map((m) => ({
          id: m.id,
          direccion: m.direccion,
          emisor: m.emisor,
          contenido: m.contenido,
          tipo: m.tipo,
          adjuntos: m.adjuntos ?? [],
          estado: m.estado,
          error: m.error,
          enviadoEn: m.enviadoEn,
          fechaCreacion: m.fechaCreacion,
        })),
      });
    }

    const propertyId = req.nextUrl.searchParams.get('propertyId');
    const soloSinLeer = req.nextUrl.searchParams.get('sinLeer') === '1';
    const limite = Number(req.nextUrl.searchParams.get('limite')) || MAX_BANDEJA;

    const conversaciones = await listarConversaciones(tenantId, {
      propertyId: propertyId || null,
      soloSinLeer,
      limite,
    });

    return NextResponse.json({ conversaciones, total: conversaciones.length });
  } catch (error) {
    console.error('[Hospitality] Error listando la bandeja de mensajes:', error);
    return NextResponse.json({ error: 'Error al listar los mensajes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['messaging:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'comunicaciones.enviar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = await req.json().catch(() => ({}));
    const conversacionId = typeof body?.conversacionId === 'string' ? body.conversacionId.trim() : '';
    if (!conversacionId) {
      return NextResponse.json({ error: 'Se requiere conversacionId' }, { status: 400 });
    }

    const resultado = await responderConversacion(tenantId, conversacionId, body?.contenido);

    if (resultado.ok) {
      await logAuditAction(
        auth.user!.id,
        tenantId,
        'hospitality_mensaje_canal_respuesta',
        'canal_conversacion',
        conversacionId,
        'Respuesta enviada al huésped por el canal',
        undefined,
        { ok: true, httpStatus: resultado.httpStatus ?? null }
      ).catch(() => {});
      return NextResponse.json({ ok: true, mensajeId: resultado.mensajeId });
    }

    if (resultado.motivo === 'no_encontrada') {
      return NextResponse.json({ error: resultado.error }, { status: 404 });
    }
    if (resultado.motivo === 'invalido') {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }

    // El canal rechazó la respuesta: queda en el hilo con su motivo y el hotel
    // se entera (502), en vez de un 200 que le haría creer que el huésped la leyó.
    await logAuditAction(
      auth.user!.id,
      tenantId,
      'hospitality_mensaje_canal_respuesta',
      'canal_conversacion',
      conversacionId,
      'Respuesta RECHAZADA por el canal (queda en el hilo como error)',
      undefined,
      { ok: false, error: resultado.error }
    ).catch(() => {});
    return NextResponse.json(
      { error: resultado.error, mensajeId: resultado.mensajeId, ok: false },
      { status: 502 }
    );
  } catch (error) {
    console.error('[Hospitality] Error respondiendo por el canal:', error);
    return NextResponse.json({ error: 'Error al responder' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['messaging:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'comunicaciones.ver');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = await req.json().catch(() => ({}));
    const conversacionId = typeof body?.conversacionId === 'string' ? body.conversacionId.trim() : '';
    if (!conversacionId) {
      return NextResponse.json({ error: 'Se requiere conversacionId' }, { status: 400 });
    }

    const marcados = await marcarHiloLeido(tenantId, conversacionId);
    return NextResponse.json({ ok: true, marcados });
  } catch (error) {
    console.error('[Hospitality] Error marcando el hilo como leído:', error);
    return NextResponse.json({ error: 'Error al marcar como leído' }, { status: 500 });
  }
}
