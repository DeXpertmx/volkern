export const dynamic = 'force-dynamic';

/**
 * POST /api/public/booking/[slug]/promocion — ¿vale este código para esta
 * estancia, y cuánto descuenta?
 *
 * Es una CONSULTA: no reserva nada ni consume usos. El descuento que devuelve
 * se calcula con el mismo módulo puro que la reserva (`booking-promos`) y sobre
 * el alojamiento real que cotiza el motor, así que lo que se enseña aquí es lo
 * que se va a cobrar. Al reservar se vuelve a evaluar: entre la consulta y el
 * cobro el código puede haberse agotado.
 *
 * Un código inexistente responde con la misma frase que uno inactivo: no se
 * revela si el código existe en otra cuenta.
 *
 * Cada consulta se REGISTRA (aplicada o rechazada) con la sesión del asistente:
 * es el denominador de la conversión de cada código. Sin ese registro solo se
 * verían las reservas que se cerraron y no los intentos que no llegaron a nada.
 * Registrar es best-effort: si falla, la consulta del huésped se responde igual.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cotizarDisponibilidad, resolverPaginaPublica } from '@/lib/hospitality/booking-engine';
import { codigoValido, evaluarPromocion, normalizarCodigo } from '@/lib/hospitality/booking-promos';
import { CONSULTA_APLICADA } from '@/lib/hospitality/promos-consultas';
import { registrarConsultaPromocion } from '@/lib/hospitality/promos-registro';
import { errorPublico, leerCuerpo, leerRango } from '../../_comun';

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> | { slug: string } }) {
  try {
    const { slug } = await ctx.params;
    const pagina = await resolverPaginaPublica(slug);
    if (!pagina.ok) {
      return errorPublico(pagina.mensaje, pagina.motivo === 'no_existe' ? 404 : 409);
    }

    const cuerpo = await leerCuerpo(req);
    const rango = leerRango(cuerpo);
    if (!rango.ok) return errorPublico(rango.error);

    const propertyId = typeof cuerpo.propertyId === 'string' ? cuerpo.propertyId : '';
    const unitId = typeof cuerpo.unitId === 'string' ? cuerpo.unitId : '';
    if (!propertyId || !unitId || !pagina.propiedades.some((p) => p.id === propertyId)) {
      return errorPublico('Esa unidad no está publicada para reservar online.', 404);
    }

    const codigo = normalizarCodigo(cuerpo.codigo);
    if (!codigo) {
      return NextResponse.json({ ok: false, error: 'Escribe un código.' });
    }

    // El alojamiento sale del motor, no de la petición: el descuento se calcula
    // sobre el precio real de la estancia.
    const cotizacion = await cotizarDisponibilidad({
      tenantId: pagina.config.tenantId,
      config: pagina.config,
      monedaTenant: pagina.moneda,
      propertyId,
      unitId,
      checkIn: rango.rango.checkIn,
      checkOut: rango.rango.checkOut,
      adultos: rango.rango.adultos,
      ninos: rango.rango.ninos,
      moneda: pagina.moneda,
    });
    if (!cotizacion.ok) {
      return NextResponse.json({ ok: false, error: cotizacion.mensaje });
    }
    const unidad = cotizacion.unidades.find((u) => u.unitId === unitId);
    if (!unidad) {
      return NextResponse.json({ ok: false, error: 'Esa unidad ya no está disponible para esas fechas.' });
    }

    // Datos comunes del registro. Un texto que no puede ser un código (dos
    // letras, signos) no se guarda: sería ruido y un vector para llenar la tabla
    // desde fuera.
    const registro = {
      tenantId: pagina.config.tenantId,
      codigo,
      propertyId,
      unitId,
      checkIn: rango.rango.checkIn,
      checkOut: rango.rango.checkOut,
      sesionId: typeof cuerpo.sesionPromo === 'string' ? cuerpo.sesionPromo : null,
    };
    const registrar = (resultado: string, motivo: string | null) =>
      codigoValido(codigo)
        ? registrarConsultaPromocion({ ...registro, resultado, motivo })
        : Promise.resolve(false);

    const promo = await prisma.hospitalityPromoCode.findUnique({
      where: { tenantId_codigo: { tenantId: pagina.config.tenantId, codigo } },
    });
    if (!promo) {
      await registrar('no_existe', 'Ese código no existe.');
      return NextResponse.json({ ok: false, error: 'Ese código no existe.' });
    }

    const resultado = evaluarPromocion(promo, {
      checkIn: rango.rango.checkIn,
      noches: cotizacion.noches,
      alojamiento: unidad.cotizacion.alojamiento,
    });
    if (!resultado.ok) {
      // Rechazada, no «no reservada»: el código no llegó a aplicarse. Se cuenta
      // aparte porque dice por qué la promoción no arranca (fechas, mínimo de
      // noches, agotada…).
      await registrar(resultado.motivo, resultado.mensaje);
      return NextResponse.json({ ok: false, error: resultado.mensaje, motivo: resultado.motivo });
    }

    await registrar(CONSULTA_APLICADA, null);

    return NextResponse.json({
      ok: true,
      codigo,
      tipo: resultado.tipo,
      valor: resultado.valor,
      descuento: resultado.descuento,
      moneda: pagina.moneda,
      noches: cotizacion.noches,
      // Lo que pagaría el huésped con el código: la misma cuenta que hace la
      // reserva (alojamiento − descuento + limpieza + tarifas).
      total: Math.round((unidad.cotizacion.total - resultado.descuento) * 100) / 100,
    });
  } catch (error) {
    console.error('[BookingEngine] Error validando el código promocional:', error);
    return errorPublico('No se pudo comprobar el código. Inténtalo de nuevo.', 500);
  }
}
