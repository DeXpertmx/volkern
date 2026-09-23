export const dynamic = 'force-dynamic';

/**
 * API pública del Booking Engine (FASE 3.D).
 *
 * GET  /api/public/booking/[slug]?checkIn&checkOut
 *      — Propiedad publicada + cotización por unidad: disponibilidad calculada
 *        por el Availability Engine central y precio = noches × tarifa del
 *        rate plan. Sin sesión: es la página pública de reservas.
 *
 * POST /api/public/booking/[slug]
 *      — Crea la reserva PÚBLICA en el flujo común del Reservation Engine
 *        (canal "Directa"), con su línea de alojamiento, y devuelve la URL de
 *        pago cuando el tenant tiene Stripe Connect activo (FASE 3.C).
 *        Idempotencia por intento del cliente: `idempotencyKey`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { loadAvailabilityContext } from '@/lib/hospitality/availability';
import {
  cotizarEstancia,
  restriccionesDeRatePlan,
  CANAL_BOOKING_ENGINE,
  referenciaBookingEngine,
} from '@/lib/hospitality/booking-engine';
import { crearReservaDeBookingDirecto } from '@/lib/hospitality/reservations';
import { crearCobroReserva } from '@/lib/stripe/connect';
import { dispatchConnectivityPush } from '@/lib/hospitality/sync';
import { dispararComunicacionReserva } from '@/lib/hospitality/comunicaciones';
import { idiomaDeValor } from '@/lib/hospitality/booking-i18n';
import { resumenPublicoResenas } from '@/lib/hospitality/resenas';
import { catalogoPublico, resolverExtras, filasDeItemsExtras, totalDeExtras } from '@/lib/hospitality/booking-extras';
import { normalizarViajero } from '@/lib/hospitality/guest-checkin';
import { asegurarTokenCheckin, enlaceCheckin } from '@/lib/hospitality/checkin-service';
import { monedaEfectiva } from '@/lib/moneda';

const ESTADO_UNIDAD_NO_VENDIBLE = ['maintenance', 'out_of_service'];

async function propiedadPublicada(slug: string) {
  const propiedad = await prisma.hospitalityProperty.findFirst({
    where: { id: slug, estado: 'conectada' },
    include: {
      // La moneda del tenant hace falta como respaldo de la divisa del catálogo
      // público (una propiedad sin unidades con tarifa todavía no tiene divisa).
      tenant: { select: { id: true, nombre: true, moneda: true } },
    },
  });
  return propiedad;
}

async function unidadesConTarifa(propertyId: string) {
  return prisma.hospitalityUnit.findMany({
    where: { propertyId, estado: { notIn: ESTADO_UNIDAD_NO_VENDIBLE } },
    include: {
      ratePlans: { where: { activo: true }, orderBy: { tarifa: 'asc' } },
    },
    orderBy: { nombre: 'asc' },
  });
}

/** Catálogo activo de la propiedad para la web (Auxiliar: si falla, se vende sin extras). */
async function extrasPublicos(propertyId: string, idioma: 'es' | 'en') {
  try {
    const extras = await prisma.hospitalityExtra.findMany({
      where: { propertyId, activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    return catalogoPublico(extras, idioma);
  } catch (e) {
    console.error('[BookingEngine] No se pudo leer el catálogo de extras:', e);
    return [];
  }
}

// GET — cotización pública.
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const propiedad = await propiedadPublicada(slug);
    if (!propiedad) {
      return NextResponse.json({ error: 'Propiedad no disponible' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const checkIn = searchParams.get('checkIn') || '';
    const checkOut = searchParams.get('checkOut') || '';
    const idiomaCatalogo = idiomaDeValor(searchParams.get('lang')) as 'es' | 'en';

    const unidades = await unidadesConTarifa(propiedad.id);

    // Extras del hotel (desayuno, late check-out…): la web los ofrece en el
    // paso de datos; el precio lo pone el servidor, nunca el cliente.
    const extras = await extrasPublicos(propiedad.id, idiomaCatalogo);

    // Reseñas publicadas de la propiedad (hueco nº 1 frente a Lodgify): las
    // ve cualquier visitante — es la prueba social que convierte. Solo lo
    // MODERADO sale aquí, con el resumen del módulo (media, total, recentes).
    // Auxiliar: si la consulta falla, la página vende igual sin reseñas.
    let resenas: ReturnType<typeof resumenPublicoResenas> | null = null;
    try {
      const publicadas = await prisma.hospitalityReview.findMany({
        where: { propertyId: propiedad.id, estado: 'publicada' },
        select: {
          puntuacion: true,
          comentario: true,
          nombreHuesped: true,
          respuestaHotel: true,
          reservation: { select: { checkIn: true } },
        },
        take: 50,
      });
      resenas = resumenPublicoResenas(publicadas);
    } catch (e) {
      console.error('[BookingEngine] No se pudieron leer las reseñas publicadas:', e);
    }

    // Sin fechas: catálogo público (lo que ve el visitante al entrar).
    if (!checkIn || !checkOut) {
      return NextResponse.json({
        propiedad: {
          id: propiedad.id,
          nombre: propiedad.nombre,
          descripcion: propiedad.descripcion,
          ciudad: propiedad.ciudad,
          pais: propiedad.pais,
          fotos: propiedad.fotos || [],
          // La divisa del catálogo: la de las unidades de la propiedad (la
          // predominante) y, si aún no hay ninguna, la de reporte del hotel.
          moneda: monedaEfectiva(
            unidades.map((u) => u.moneda),
            propiedad.tenant?.moneda
          ),
        },
        resenas,
        extras,
        unidades: unidades.map((u) => ({
          id: u.id,
          nombre: u.nombre,
          tipo: u.tipo,
          capacidad: u.capacidad,
          descripcion: u.descripcion,
          fotos: u.fotos || [],
          amenidades: u.amenidades || [],
          tarifaNoche: u.ratePlans[0]?.tarifa ?? u.tarifaBase ?? null,
          moneda: u.moneda,
        })),
      });
    }

    // Con fechas: cotización por unidad (motor central + precio).
    const inicio = new Date(`${checkIn}T00:00:00`);
    const fin = new Date(`${checkOut}T00:00:00`);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      return NextResponse.json({ error: 'Fechas inválidas (usa YYYY-MM-DD)' }, { status: 400 });
    }

    const contexto = await loadAvailabilityContext(prisma, propiedad.tenantId, propiedad.id, inicio, fin);
    const unidadesMap = new Map(unidades.map((u) => [u.id, u]));

    const cotizacion = cotizarEstancia({
      checkIn,
      checkOut,
      unidades: contexto.units
        .filter((u) => unidadesMap.has(u.id))
        .map((u) => {
          const unidad = unidadesMap.get(u.id)!;
          // Precio y restricciones salen del MISMO plan: el que se publica.
          const plan = unidad.ratePlans[0] ?? null;
          return {
            id: u.id,
            tarifaNoche: plan?.tarifa ?? unidad.tarifaBase ?? null,
            moneda: unidad.moneda,
            ratePlan: restriccionesDeRatePlan(plan),
          };
        }),
      reservas: contexto.reservations.map((r) => ({
        unitId: r.unitId,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        estado: r.estado,
      })),
      bloques: contexto.blocks,
    });

    const detalles = unidades.filter((u) => cotizacion.unidades.some((c) => c.unitId === u.id));
    return NextResponse.json({
      propiedad: {
        id: propiedad.id,
        nombre: propiedad.nombre,
        ciudad: propiedad.ciudad,
        moneda: cotizacion.moneda,
      },
      cotizacion: {
        ...cotizacion,
        unidades: cotizacion.unidades.map((c) => {
          const u = detalles.find((x) => x.id === c.unitId)!;
          return {
            ...c,
            nombre: u.nombre,
            tipo: u.tipo,
            capacidad: u.capacidad,
            descripcion: u.descripcion,
            fotos: u.fotos || [],
            amenidades: u.amenidades || [],
            // Tarifa por noche de la que salió el precio: la ficha la muestra
            // junto al total (mismo plan que cotizó).
            tarifaNoche: u.ratePlans[0]?.tarifa ?? u.tarifaBase ?? null,
          };
        }),
      },
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al cotizar';
    const codigo = mensaje.includes('Fechas inválidas') ? 400 : 500;
    console.error('[BookingEngine] Error en cotización pública:', error);
    return NextResponse.json({ error: mensaje }, { status: codigo });
  }
}

// POST — crear reserva pública en el flujo común.
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const propiedad = await propiedadPublicada(slug);
    if (!propiedad) {
      return NextResponse.json({ error: 'Propiedad no disponible' }, { status: 404 });
    }
    const tenantId = propiedad.tenantId;

    const body = await req.json();
    const { unitId, checkIn, checkOut, huespedNombre, huespedEmail, huespedTelefono, notas, idempotencyKey, lang, documento, extras } = body || {};

    if (!unitId) return NextResponse.json({ error: 'Selecciona una unidad' }, { status: 400 });
    if (!huespedNombre || !String(huespedNombre).trim()) {
      return NextResponse.json({ error: 'El nombre del huésped es requerido' }, { status: 400 });
    }
    if (!huespedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(huespedEmail))) {
      return NextResponse.json({ error: 'Un email válido es requerido' }, { status: 400 });
    }

    // Idempotencia: el mismo intento no crea dos reservas (doble click, retry).
    const referencia = typeof idempotencyKey === 'string' && idempotencyKey.trim()
      ? `BE-${idempotencyKey.trim().slice(0, 40)}`
      : referenciaBookingEngine();

    const existente = await prisma.hospitalityReservation.findFirst({
      where: { tenantId, channel: CANAL_BOOKING_ENGINE, externalBookingId: referencia },
      select: { id: true },
    });
    if (existente) {
      return NextResponse.json({ reservationId: existente.id, duplicada: true }, { status: 200 });
    }

    // Unidad publicada de ESTA propiedad, con su rate plan activo.
    const unidades = await unidadesConTarifa(propiedad.id);
    const unidad = unidades.find((u) => u.id === unitId);
    if (!unidad) {
      return NextResponse.json({ error: 'Unidad no disponible' }, { status: 404 });
    }
    const ratePlan = unidad.ratePlans[0] || null;

    // Disponibilidad y precio, recalculados en el servidor con el motor central.
    const contexto = await loadAvailabilityContext(prisma, tenantId, propiedad.id, new Date(`${checkIn}T00:00:00`), new Date(`${checkOut}T00:00:00`));
    const cotizacion = cotizarEstancia({
      checkIn,
      checkOut,
      unidades: [{
        id: unidad.id,
        tarifaNoche: ratePlan?.tarifa ?? unidad.tarifaBase ?? null,
        moneda: unidad.moneda,
        ratePlan: restriccionesDeRatePlan(ratePlan),
      }],
      reservas: contexto.reservations.map((r) => ({
        unitId: r.unitId,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        estado: r.estado,
      })),
      bloques: contexto.blocks,
    });
    const linea = cotizacion.unidades[0];
    if (!linea?.disponible) {
      const motivos: Record<string, string> = {
        ocupada: 'Las fechas ya no están disponibles',
        min_noches: `La estancia mínima es de ${ratePlan?.minNoches || 1} noches`,
        max_noches: `La estancia máxima es de ${ratePlan?.maxNoches} noches`,
        dia_checkin: 'El día de llegada no está permitido para esta unidad',
        dia_checkout: 'El día de salida no está permitido para esta unidad',
        sin_tarifa: 'La unidad no tiene tarifa publicada',
      };
      return NextResponse.json({ error: motivos[linea.motivo || 'ocupada'] || 'No disponible' }, { status: 409 });
    }

    // Contacto CRM: reutilizar si ya existe el email (historial del huésped).
    let contact = await prisma.contact.findFirst({
      where: { tenantId, email: huespedEmail },
      select: { id: true },
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          tenantId,
          nombre: String(huespedNombre).trim(),
          email: huespedEmail,
          telefono: huespedTelefono || null,
          tipo: 'person',
          tags: 'huesped',
        },
        select: { id: true },
      });
    }

    const ci = new Date(`${checkIn}T15:00:00`);
    const co = new Date(`${checkOut}T11:00:00`);

    // Registro de viajeros (RD 933/2021): si el huésped dejó los datos de su
    // documento, se guardan YA en el formato que lee el parte (`viajeros`), en
    // lugar de esperar al check-in. Se guarda solo si hay algo de verdad —el
    // nombre suelto no es documentación— y sin inventar nada: lo que falte lo
    // completa el propio huésped con el enlace de check-in.
    const documentoCrudo = (documento || {}) as Record<string, unknown>;
    const titularDocumentado = normalizarViajero({
      ...documentoCrudo,
      // Si el huésped no repitió su nombre en el bloque del documento, vale el
      // que ya escribió arriba: es la misma persona.
      nombre: documentoCrudo.nombre || huespedNombre,
      correo: documentoCrudo.correo || huespedEmail,
      telefono: documentoCrudo.telefono || huespedTelefono,
    });
    const documentaAlgo = Boolean(
      titularDocumentado &&
        (titularDocumentado.tipoDocumento ||
          titularDocumentado.numeroDocumento ||
          titularDocumentado.fechaNacimiento ||
          titularDocumentado.direccion)
    );

    // El flujo común: la reserva pública es indistinguible de una de OTA
    // (criterio 1) — misma tabla, canal "Directa", línea de desglose. La
    // escritura la hace el Reservation Engine compartido, nunca la ruta: una
    // reserva del motor directo pasa por el mismo camino que una de OTA.
    const reserva = await crearReservaDeBookingDirecto({
      tenantId,
      propertyId: propiedad.id,
      unitId: unidad.id,
      contactId: contact.id,
      canal: CANAL_BOOKING_ENGINE,
      referencia,
      checkIn: ci,
      checkOut: co,
      notas: notas || null,
      precioTotal: linea.precioTotal,
      moneda: unidad.moneda,
      // El idioma en que reservó el huésped viaja en guestData: es lo que
      // las comunicaciones automáticas (§21) leen para enviarle confirmación,
      // pre-llegada y post-estancia en su idioma. "es" para cualquier valor
      // raro (defecto del motor de i18n).
      guestData: {
        firstName: String(huespedNombre).trim(),
        email: huespedEmail,
        phone: huespedTelefono || null,
        idioma: idiomaDeValor(lang),
        ...(documentaAlgo && titularDocumentado ? { viajeros: [titularDocumentado] } : {}),
      } as unknown as Prisma.InputJsonValue,
    });

    // Enlace de check-in desde el minuto uno: el huésped puede completar los
    // documentos de su grupo cuando quiera (y el email de pre-llegada se lo
    // recuerda con el mismo enlace). Sin token no hay forma de que el parte
    // salga completo sin que el hotel persiga a nadie.
    const tokenCheckin = await asegurarTokenCheckin({ id: reserva.id, tokenCheckin: null });
    const checkinUrl = enlaceCheckin(tokenCheckin, lang);

    // Línea de desglose: la reserva nace con rentabilidad desde el minuto uno.
    await prisma.hospitalityReservationItem.create({
      data: {
        tenantId,
        reservationId: reserva.id,
        propertyId: propiedad.id,
        unitId: unidad.id,
        tipo: 'alojamiento',
        concepto: `Alojamiento · ${cotizacion.noches} noches`,
        cantidad: 1,
        importeUnitario: linea.precioTotal!,
        importeTotal: linea.precioTotal!,
        moneda: unidad.moneda,
      },
    });

    // Extras comprables (desayuno, late check-out, traslados…): la selección
    // del huésped se resuelve contra el CATÁLOGO ACTIVO del servidor — el
    // precio del cliente nunca se usa. Cada extra es una línea tipo `extra`
    // del MISMO desglose que suma Finanzas. Un extra que el hotel acaba de
    // desactivar no rompe la venta: se ignora y queda dicho.
    const catalogo = await prisma.hospitalityExtra.findMany({
      where: { propertyId: propiedad.id, activo: true },
    });
    const resolucionExtras = resolverExtras(extras, catalogo, cotizacion.noches);
    let totalExtras = 0;
    if (resolucionExtras.ok && resolucionExtras.lineas.length > 0) {
      await prisma.hospitalityReservationItem.createMany({
        data: filasDeItemsExtras(resolucionExtras.lineas, {
          tenantId,
          reservationId: reserva.id,
          propertyId: propiedad.id,
          unitId: unidad.id,
        }),
      });
      totalExtras = totalDeExtras(resolucionExtras.lineas);
    } else if (!resolucionExtras.ok) {
      console.error('[BookingEngine] Selección de extras inválida:', resolucionExtras.error);
    }
    if (resolucionExtras.ok && resolucionExtras.ignorados.length > 0) {
      console.log('[BookingEngine] Extras ignorados en la reserva', reserva.externalBookingId, resolucionExtras.ignorados);
    }
    const totalReserva = (linea.precioTotal ?? 0) + totalExtras;

    // Push de disponibilidad: la reserva directa ocupa la unidad en los canales
    // igual que una de OTA (criterio 1). Sin esto el canal seguiría vendiendo
    // una habitación que la web acaba de vender — sobreventa por defecto.
    // No bloquea la venta: los errores quedan en HospitalitySyncLog.
    try {
      await dispatchConnectivityPush(tenantId, propiedad.id, 'reserva_creada', { skipRates: true });
    } catch (e) {
      console.error('[BookingEngine] Error en el push de conectividad:', e);
    }

    // Comunicación automática §21: confirmación al huésped, en el idioma en
    // que reservó. Era un hueco real: la reserva pública no la enviaba (solo
    // el flujo de webhook y el alta manual lo hacían). No bloqueante: si no
    // hay plantilla o falla el envío, la reserva ya está creada y la respuesta
    // sale igual; los errores quedan en consola.
    dispararComunicacionReserva({ tenantId, reservationId: reserva.id, evento: 'confirmacion' }).catch((e) =>
      console.error('[BookingEngine] Error en la confirmación automática:', e)
    );

    // Pago: si el tenant tiene Stripe Connect activo, el cobro va contra SU
    // cuenta (criterio 4). Si no, la reserva queda confirmada y el operador
    // la cobra por otro medio desde Finanzas.
    let paymentUrl: string | null = null;
    try {
      const origen = new URL(req.url).origin;
      const { url } = await crearCobroReserva({
        tenantId,
        reservationId: reserva.id,
        importe: totalReserva,
        moneda: unidad.moneda,
        concepto: `Reserva ${reserva.externalBookingId} · ${propiedad.nombre}`,
        email: huespedEmail,
        origen: `${origen}/booking/${propiedad.id}`,
      });
      paymentUrl = url;
    } catch (e) {
      // Sin cuenta Connect activa el flujo continúa sin pago en línea.
      console.log('[BookingEngine] Reserva sin cobro en línea:', e instanceof Error ? e.message : e);
    }

    return NextResponse.json(
      {
        reservationId: reserva.id,
        referencia: reserva.externalBookingId,
        total: totalReserva,
        totalExtras,
        moneda: unidad.moneda,
        paymentUrl,
        checkinUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[BookingEngine] Error creando reserva pública:', error);
    return NextResponse.json({ error: 'No se pudo completar la reserva' }, { status: 500 });
  }
}
