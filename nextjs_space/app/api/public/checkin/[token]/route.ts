export const dynamic = 'force-dynamic';

/**
 * API pública del check-in online (registro de viajeros, RD 933/2021).
 *
 * GET  /api/public/checkin/[token]
 *      — Datos de la reserva para el formulario: estancia, alojamiento y los
 *        viajeros ya documentados (con su cobertura). Sin sesión: la credencial
 *        es el propio token del enlace que recibe el huésped.
 *
 * POST /api/public/checkin/[token]
 *      — { viajeros: [...], heredarDireccion?: boolean } guarda los documentos
 *        de TODO el grupo (la lista que llega reemplaza a la anterior) y
 *        devuelve qué queda por revisar. Si con esto la documentación queda
 *        completa **y la estancia ya empezó**, envía el parte de viajeros al
 *        Ministerio en el momento; si aún no, lo envía el cron el día de la
 *        entrada (el Servicio de Hospedajes comunica la entrada, no la reserva).
 *
 * Este endpoint existe por una razón concreta: el canal no manda los documentos
 * del huésped, y sin ellos el parte quedaba en `datos_incompletos` esperando a
 * que alguien del hotel lo completara a mano.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  CAMPOS_MINIMOS_VIAJERO,
  normalizarViajeros,
  resumenDocumentacion,
  viajerosDeGuestData,
} from '@/lib/hospitality/guest-checkin';
import {
  enviarParteSiCorresponde,
  guardarDocumentacionCheckin,
  preguntasCheckinDeTenant,
  reservaCerrada,
  reservaParaCheckin,
} from '@/lib/hospitality/checkin-service';

/** Datos del titular de la reserva con los que se prerrellena la primera ficha. */
function titularDesdeGuestData(guestData: unknown): Record<string, unknown> {
  const gd = (guestData || {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  return {
    nombre: texto(gd.firstName) || texto(gd.nombre) || texto(gd.name),
    // El apellido puede venir completo («García López»): se propone tal cual y
    // el huésped lo reparte como quiera. Es un borrador editable, no un dato
    // que mandemos por él.
    apellido1: texto(gd.lastName) || texto(gd.apellidos),
    telefono: texto(gd.phone) || texto(gd.telefono),
    correo: texto(gd.email),
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const reserva = await reservaParaCheckin(token);
    if (!reserva) {
      return NextResponse.json({ error: 'Enlace de check-in no válido' }, { status: 404 });
    }
    if (reservaCerrada(reserva.estado)) {
      return NextResponse.json({ estado: 'cerrada' }, { status: 410 });
    }

    const guardados = viajerosDeGuestData(reserva.guestData);
    // Sin documentación previa se propone una ficha con los datos que el
    // huésped ya dio al reservar: reescribirlos en el móvil es fricción pura.
    // La cobertura se calcula sobre esa propuesta para que la lista de «qué
    // falta» esté a la vista desde el primer segundo, no tras el primer guardado.
    const propuesta = guardados.length > 0 ? [] : normalizarViajeros([titularDesdeGuestData(reserva.guestData)]).viajeros;
    const viajeros = guardados.length > 0 ? guardados : propuesta;

    // Preguntas personalizadas del hotel (bloque vacío si no definió ninguna)
    // y las respuestas que el huésped ya hubiera dejado, para que no las
    // reescriba si vuelve al enlace.
    const preguntas = await preguntasCheckinDeTenant(reserva.tenantId);

    return NextResponse.json({
      referencia: reserva.externalBookingId,
      estado: reserva.estado,
      checkIn: reserva.checkIn,
      checkOut: reserva.checkOut,
      propiedad: reserva.property?.nombre ?? null,
      ciudad: reserva.property?.ciudad ?? null,
      unidad: reserva.unit?.nombre ?? null,
      viajeros,
      documentacion: resumenDocumentacion(viajeros, reserva.checkIn),
      preguntas,
      respuestas: (reserva.respuestasCheckin ?? null) as Record<string, string> | null,
    });
  } catch (error) {
    console.error('[Check-in] Error leyendo la reserva por token:', error);
    return NextResponse.json({ error: 'No se pudo cargar el check-in' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const reserva = await reservaParaCheckin(token);
    if (!reserva) {
      return NextResponse.json({ error: 'Enlace de check-in no válido' }, { status: 404 });
    }
    if (reservaCerrada(reserva.estado)) {
      return NextResponse.json({ estado: 'cerrada' }, { status: 410 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const guardado = await guardarDocumentacionCheckin({
      reserva,
      viajeros: body.viajeros,
      heredarDireccion: body.heredarDireccion === true,
      respuestas: body.respuestas as Record<string, unknown> | undefined,
    });

    if (guardado.error === 'sin_viajeros') {
      // Sin ninguna fila con nombre no hay viajero que documentar: se responde
      // con los campos mínimos (misma forma que el resto de faltantes, para que
      // la pantalla sepa explicarlo) en lugar de una lista vacía.
      return NextResponse.json(
        {
          error: 'Indica al menos el nombre y los apellidos de un viajero',
          faltan: CAMPOS_MINIMOS_VIAJERO,
        },
        { status: 400 }
      );
    }
    if (guardado.error === 'demasiados_viajeros') {
      return NextResponse.json(
        { error: 'Hay demasiados viajeros en esta reserva; contacta con el alojamiento' },
        { status: 400 }
      );
    }

    // El parte solo sale cuando está completo Y la estancia ya empezó: el
    // Servicio de Hospedajes comunica la ENTRADA, no la reserva.
    const envio = guardado.documentacion.completa
      ? await enviarParteSiCorresponde({ ...reserva, checkIn: reserva.checkIn })
      : null;

    return NextResponse.json({
      ok: true,
      viajeros: guardado.viajeros.length,
      descartados: guardado.descartados,
      documentacion: guardado.documentacion,
      envio,
      faltanPreguntas: guardado.faltanPreguntas ?? [],
    });
  } catch (error) {
    console.error('[Check-in] Error guardando la documentación:', error);
    return NextResponse.json({ error: 'No se pudieron guardar los datos' }, { status: 500 });
  }
}
