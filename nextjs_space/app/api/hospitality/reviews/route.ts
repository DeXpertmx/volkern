export const dynamic = 'force-dynamic';

/**
 * API del hotel para las reseñas de sus huéspedes (hueco nº 1 frente a
 * Lodgify) — panel, no pública.
 *
 * GET    /api/hospitality/reviews?estado=pendiente
 *        — Lista las reseñas del tenant con su reserva (huésped, unidad,
 *          fechas) y la media global de lo ya publicado. La moderación vive
 *          aquí: lo que el hotel ve, lo decide.
 *
 * POST   /api/hospitality/reviews
 *        { reviewId, accion: 'publicar'|'rechazar'|'reponer', respuesta? }
 *        — La única puerta de la moderación. Las transiciones las decide el
 *          módulo puro (puedeModerar), no la ruta; la respuesta pública del
 *          hotel es SU palabra (respuestaHotel) y nunca toca la del huésped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import {
  puedeModerar,
  estadoTrasAccion,
  mediaDeResenas,
  validarRespuestaHotel,
  type AccionModeracion,
} from '@/lib/hospitality/resenas';

const ACCIONES_VALIDAS: AccionModeracion[] = ['publicar', 'rechazar', 'reponer'];

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const tenantId = auth.tenant!.id;

    const { searchParams } = new URL(req.url);
    const estado = searchParams.get('estado') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '200') || 200, 500);

    const reviews = await prisma.hospitalityReview.findMany({
      where: {
        tenantId,
        ...(estado ? { estado } : {}),
      },
      include: {
        reservation: {
          select: {
            id: true,
            checkIn: true,
            checkOut: true,
            externalBookingId: true,
            unit: { select: { nombre: true } },
            property: { select: { nombre: true } },
          },
        },
      },
      // Orden por estancia: las importadas (sin reserva) llevan su fecha
      // propia; para el panel, la reciente primero por creación basta.
      orderBy: { fechaCreacion: 'desc' },
      take: limit,
    });

    // Media de las PUBLICADAS — la misma cifra que verán los futuros huéspedes
    // en la web. Se calcula en una sola consulta para no arrastrar dos listas.
    const publicadas = await prisma.hospitalityReview.findMany({
      where: { tenantId, estado: 'publicada' },
      select: { puntuacion: true },
    });

    return NextResponse.json({
      reviews: reviews.map((r) => ({
        id: r.id,
        estado: r.estado,
        origen: r.origen,
        puntuacion: r.puntuacion,
        comentario: r.comentario,
        nombreHuesped: r.nombreHuesped,
        respuestaHotel: r.respuestaHotel,
        fechaCreacion: r.fechaCreacion,
        fechaEstancia: r.fechaEstancia,
        propiedad: r.reservation?.property?.nombre || null,
        unidad: r.reservation?.unit?.nombre || null,
        checkIn: r.reservation?.checkIn || r.fechaEstancia || null,
        checkOut: r.reservation?.checkOut || null,
        referencia: r.reservation?.externalBookingId || null,
      })),
      media: mediaDeResenas(publicadas),
      totalPublicadas: publicadas.length,
    });
  } catch (error) {
    console.error('[Hospitality Reviews] Error listando reseñas:', error);
    return NextResponse.json({ error: 'Error al listar reseñas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const tenantId = auth.tenant!.id;

    const body = await req.json().catch(() => null);
    const reviewId = typeof body?.reviewId === 'string' ? body.reviewId : '';
    // `find` estrecha el tipo a la acción válida (o undefined): sin bifurcación
    // de «string suelto» llegando a puedeModerar.
    const accion = ACCIONES_VALIDAS.find((a) => a === body?.accion);
    if (!reviewId || !accion) {
      return NextResponse.json(
        { error: 'Se requieren reviewId y accion (publicar | rechazar | reponer)' },
        { status: 400 },
      );
    }

    // La reseña existe y es DEL tenant: ni por descuido se modera la de otro.
    const review = await prisma.hospitalityReview.findFirst({
      where: { id: reviewId, tenantId },
      select: { id: true, estado: true, reservationId: true, origen: true },
    });
    if (!review) {
      return NextResponse.json({ error: 'Reseña no encontrada' }, { status: 404 });
    }

    // Las importadas son histórico (ya se publicó en el canal): se puede
    // reponer o rechazar, pero el ciclo de moderación real es el de las nativas.
    if (review.origen === 'importada' && accion === 'publicar') {
      return NextResponse.json(
        { error: 'Esta reseña ya se publicó en el canal de origen: nace publicada' },
        { status: 409 },
      );
    }

    if (!puedeModerar(review.estado, accion)) {
      return NextResponse.json(
        { error: `No se puede ${accion} una reseña en estado ${review.estado}` },
        { status: 409 },
      );
    }

    // La respuesta pública del hotel es opcional y solo acompaña a publicar /
    // rechazar (en reponer no aplica: la reseña vuelve a pendiente).
    let respuestaHotel: string | null | undefined;
    if (accion !== 'reponer' && body?.respuesta !== undefined) {
      const r = validarRespuestaHotel(body.respuesta);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      respuestaHotel = r.texto || null;
    }

    const nuevoEstado = estadoTrasAccion(accion);
    const data: Record<string, unknown> = { estado: nuevoEstado };
    if (respuestaHotel !== undefined) data.respuestaHotel = respuestaHotel;

    const actualizada = await prisma.hospitalityReview.update({
      where: { id: review.id },
      data,
      select: { id: true, estado: true, respuestaHotel: true },
    });

    // Trazabilidad de la moderación: quién publicó (o rechazó) qué y cuándo.
    // Con reserva lleva su id; las importadas se trazan sobre la propia reseña.
    const entidadId = review.reservationId || review.id;
    await logAuditAction(
      auth.user!.id,
      tenantId,
      'hospitality_review_moderacion',
      review.reservationId ? 'reservation' : 'review',
      entidadId,
      `Reseña ${nuevoEstado} (puntuación y comentario del huésped intactos)`,
      { estado: review.estado },
      { estado: nuevoEstado, accion },
    ).catch(() => {});

    return NextResponse.json({ ok: true, review: actualizada });
  } catch (error) {
    console.error('[Hospitality Reviews] Error moderando reseña:', error);
    return NextResponse.json({ error: 'Error al moderar la reseña' }, { status: 500 });
  }
}
