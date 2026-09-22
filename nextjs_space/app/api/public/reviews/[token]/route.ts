export const dynamic = 'force-dynamic';

/**
 * GET  /api/public/reviews/[token] — el estado de la reseña del huésped (para
 *      abrir el formulario con lo que ya escribió).
 * PUT  /api/public/reviews/[token] — el huésped envía su reseña desde el
 *      enlace del email (evento `resena`, cron §21).
 *
 * Es pública y el token es la única credencial (el mismo patrón del
 * check-in online): quien tiene el enlace escribe la reseña de ESA estancia
 * y solo esa. La reseña nace `pendiente`: la publica el hotel desde su
 * panel — la web del motor solo enseña reseñas moderadas.
 *
 * El huésped puede CORREGIR su reseña mientras siga pendiente (nadie escribe
 * perfecto a la primera); una vez publicada o rechazada, ya no: es la palabra
 * que el hotel moderó y así se queda. En ese caso la respuesta lo dice y le
 * ofrece escribir al hotel directamente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validarResena } from '@/lib/hospitality/resenas';

type Ctx = { params: Promise<{ token: string }> };

async function reservaPorToken(token: string) {
  const limpio = (token || '').trim();
  if (!limpio) return null;
  return prisma.hospitalityReservation.findFirst({
    where: { tokenResena: limpio },
    select: {
      id: true,
      tenantId: true,
      propertyId: true,
      unitId: true,
      estado: true,
      guestData: true,
      review: {
        select: {
          id: true,
          estado: true,
          puntuacion: true,
          comentario: true,
          nombreHuesped: true,
        },
      },
    },
  });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const reserva = await reservaPorToken(token);
    if (!reserva) {
      return NextResponse.json({ error: 'Enlace de reseña no válido' }, { status: 404 });
    }

    const gd = (reserva.guestData && typeof reserva.guestData === 'object' ? reserva.guestData : {}) as Record<string, unknown>;
    const nombre = [gd.firstName, gd.lastName]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join(' ')
      .trim();

    return NextResponse.json({
      ok: true,
      // La unidad de la estancia (nombre) y el estado de la reseña si existe.
      review: reserva.review
        ? {
            estado: reserva.review.estado,
            puntuacion: reserva.review.puntuacion,
            comentario: reserva.review.comentario,
            nombreHuesped: reserva.review.nombreHuesped,
          }
        : null,
      huesped: { nombre },
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al leer la reseña';
    console.error('Error leyendo reseña por token:', mensaje);
    return NextResponse.json({ error: 'Error al leer la reseña' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const reserva = await reservaPorToken(token);
    if (!reserva) {
      return NextResponse.json({ error: 'Enlace de reseña no válido' }, { status: 404 });
    }

    // La reseña es de la estancia: solo tiene sentido valorar lo que se vivió.
    if (reserva.estado === 'cancelled') {
      return NextResponse.json(
        { error: 'Esta reserva está cancelada: no tiene estancia que valorar' },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => null);
    const resultado = validarResena(body);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }
    const { puntuacion, comentario, nombreHuesped } = resultado.reseña;

    const gd = (reserva.guestData && typeof reserva.guestData === 'object' ? reserva.guestData : {}) as Record<string, unknown>;
    const nombreSistema = [gd.firstName, gd.lastName]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join(' ')
      .trim();

    // Ya moderada (publicada o rechazada): la palabra del huésped ya pasó por
    // el hotel — no se reescribe. La respuesta lo dice sin dejarle sin salida.
    if (reserva.review && reserva.review.estado !== 'pendiente') {
      return NextResponse.json(
        { error: 'Tu reseña ya fue revisada por el hotel y no se puede cambiar' },
        { status: 409 }
      );
    }

    const data = {
      tenantId: reserva.tenantId,
      propertyId: reserva.propertyId,
      unitId: reserva.unitId,
      puntuacion,
      comentario,
      nombreHuesped: nombreHuesped || nombreSistema || 'Huésped',
    };

    const review = await prisma.hospitalityReview.upsert({
      where: { reservationId: reserva.id },
      create: {
        ...data,
        reservationId: reserva.id,
      },
      update: {
        puntuacion,
        comentario,
        nombreHuesped: nombreHuesped || nombreSistema || 'Huésped',
      },
      select: { id: true, estado: true },
    });

    return NextResponse.json({
      ok: true,
      review: { estado: review.estado, puntuacion, comentario },
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al guardar la reseña';
    console.error('Error guardando reseña:', mensaje);
    return NextResponse.json({ error: 'Error al guardar la reseña' }, { status: 500 });
  }
}
