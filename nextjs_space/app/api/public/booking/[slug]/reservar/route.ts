export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { crearReservaDirecta, resolverPaginaPublica } from '@/lib/hospitality/booking-engine';
import { crearSesionDePago, estadoDeCobroDelTenant } from '@/lib/hospitality/booking-payments';
import { urlConfirmacionReserva } from '@/lib/hospitality/booking-link';
import { getEnlaceAppUrl } from '@/lib/hospitality/compliance-link';
import { errorPublico, leerCuerpo, leerRango, textoOpcional } from '../../_comun';

/**
 * POST /api/public/booking/[slug]/reservar — crea la reserva directa.
 *
 * Es el único punto de entrada público que escribe una reserva, y no la escribe
 * él: la pide al Reservation Engine (`crearReservaDirecta`), que es el mismo que
 * atiende las de canal. Aquí solo se validan los datos del formulario, se
 * comprueba si se puede cobrar y se abre el pago.
 *
 * Si el alojamiento exige cobro online y su cuenta todavía no está habilitada, se
 * responde antes de crear nada: dejar una reserva pendiente que nadie puede pagar
 * es peor que no aceptarla.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> | { slug: string } }) {
  try {
    const { slug } = await ctx.params;
    const pagina = await resolverPaginaPublica(slug);
    if (!pagina.ok) {
      return errorPublico(pagina.mensaje, pagina.motivo === 'no_existe' ? 404 : 409);
    }
    const { config, moneda } = pagina;

    const cuerpo = await leerCuerpo(req);

    // Idempotencia del formulario: reintentar el mismo envío no puede crear dos
    // reservas. El identificador lo genera quien reserva, una vez por solicitud.
    const solicitudId = typeof cuerpo.solicitudId === 'string' ? cuerpo.solicitudId.trim() : '';
    if (solicitudId.length < 8) {
      return errorPublico('La solicitud no es válida. Vuelve a intentarlo desde el formulario.');
    }

    const rango = leerRango(cuerpo);
    if (!rango.ok) return errorPublico(rango.error);

    const propertyId = typeof cuerpo.propertyId === 'string' ? cuerpo.propertyId : '';
    const unitId = typeof cuerpo.unitId === 'string' ? cuerpo.unitId : '';
    if (!pagina.propiedades.some((p) => p.id === propertyId && p.unidades.some((u) => u.id === unitId))) {
      return errorPublico('Esa unidad no está publicada para reservar online.', 404);
    }

    const nombre = textoOpcional(cuerpo.nombre, 160);
    const email = textoOpcional(cuerpo.email, 160);
    const telefono = textoOpcional(cuerpo.telefono, 40);
    if (!nombre) return errorPublico('Necesitamos el nombre de quien reserva.');
    if (!email && !telefono) {
      return errorPublico('Deja un email o un teléfono para poder enviarte la confirmación.');
    }

    // Antes de escribir nada: ¿se puede cobrar si el alojamiento lo exige?
    const cobro = await estadoDeCobroDelTenant(config.tenantId);
    if (config.requierePagoOnline && !cobro.disponible) {
      return errorPublico(
        'El pago online no está disponible en este momento. Escríbenos para reservar.',
        503
      );
    }

    const resultado = await crearReservaDirecta({
      tenantId: config.tenantId,
      config,
      propertyId,
      unitId,
      checkIn: rango.rango.checkIn,
      checkOut: rango.rango.checkOut,
      adultos: rango.rango.adultos,
      ninos: rango.rango.ninos,
      moneda,
      solicitudId,
      // El idioma de la página (`?lang=en`) viaja con la reserva: es el idioma en
      // que el huésped recibirá sus comunicaciones automáticas.
      idioma: textoOpcional(cuerpo.lang, 8),
      // Extras y documento viajan tal cual al motor: él resuelve el precio del
      // catálogo y valida el registro de viajeros. La ruta no interpreta ninguno
      // de los dos — hacerlo aquí sería una segunda verdad sobre el dinero y
      // sobre el parte.
      extras: cuerpo.extras,
      huesped: {
        nombre,
        email,
        telefono,
        pais: textoOpcional(cuerpo.pais, 80),
        ciudad: textoOpcional(cuerpo.ciudad, 80),
        notas: textoOpcional(cuerpo.notas, 1000),
        documento:
          cuerpo.documento && typeof cuerpo.documento === 'object'
            ? (cuerpo.documento as Record<string, unknown>)
            : null,
      },
    });

    if (!resultado.ok) {
      const status = resultado.motivo === 'no_disponible' ? 409 : 400;
      return errorPublico(resultado.mensaje, status);
    }

    const appUrl = getEnlaceAppUrl();
    const confirmacionUrl = urlConfirmacionReserva(appUrl, slug, resultado.reservaId);

    // Reserva ya existente (reintento del formulario): se devuelve tal cual, sin
    // volver a abrir un pago.
    if (resultado.yaExistia) {
      return NextResponse.json({
        ok: true,
        referencia: resultado.referencia,
        estado: resultado.estado,
        total: resultado.total,
        moneda: resultado.moneda,
        noches: resultado.noches,
        confirmacionUrl,
        checkinUrl: resultado.checkinUrl,
        pagoUrl: null,
      });
    }

    // Con cobro online activo, la reserva nace pendiente y se abre el pago por el
    // anticipo acordado (o por el total si no hay anticipo).
    let pagoUrl: string | null = null;
    let avisoDePago: string | null = null;
    if (config.requierePagoOnline) {
      // El importe lo dice el motor, que es quien cotizó: el anticipo acordado
      // (o el total de la estancia, con sus extras, si no hay anticipo). Volver
      // a cotizar aquí sería una segunda verdad sobre el mismo precio — y una
      // que no conocería los extras.
      const aCobrar = resultado.anticipo > 0 ? resultado.anticipo : resultado.total;
      const sesion = await crearSesionDePago({
        tenantId: config.tenantId,
        reservaId: resultado.reservaId,
        importe: aCobrar,
        moneda: resultado.moneda,
        descripcion: `Reserva ${resultado.referencia}`,
        urlExito: confirmacionUrl,
        urlCancelacion: confirmacionUrl,
      });

      if (sesion.ok) {
        pagoUrl = sesion.sesion.url;
      } else {
        // La reserva ya existe y es válida; el cobro es lo que no se pudo abrir.
        avisoDePago = sesion.motivo;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        referencia: resultado.referencia,
        estado: resultado.estado,
        total: resultado.total,
        moneda: resultado.moneda,
        noches: resultado.noches,
        totalExtras: resultado.totalExtras,
        confirmacionUrl,
        checkinUrl: resultado.checkinUrl,
        pagoUrl,
        avisoDePago,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[BookingEngine] Error creando la reserva directa:', error);
    return errorPublico('No se pudo completar la reserva. Inténtalo de nuevo.', 500);
  }
}
