export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cotizarDisponibilidad, resolverPaginaPublica } from '@/lib/hospitality/booking-engine';
import { errorPublico, leerCuerpo, leerRango } from '../../_comun';

/**
 * POST /api/public/booking/[slug]/cotizar — disponibilidad y precio de un rango.
 *
 * La disponibilidad la responde el Availability Engine: esta ruta no compara
 * fechas por su cuenta (regla 2 de la FASE 3). El precio se calcula con la tarifa
 * y las restricciones del plan de tarifa, que son las mismas que se empujan a los
 * canales; así lo que ve el huésped es lo que los canales tienen bloqueado.
 */
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
    const publicadas = pagina.propiedades.map((p) => p.id);
    if (!propertyId || !publicadas.includes(propertyId)) {
      return errorPublico('Elige una de las propiedades publicadas.', 404);
    }

    const resultado = await cotizarDisponibilidad({
      tenantId: pagina.config.tenantId,
      config: pagina.config,
      monedaTenant: pagina.moneda,
      propertyId,
      unitId: typeof cuerpo.unitId === 'string' ? cuerpo.unitId : null,
      checkIn: rango.rango.checkIn,
      checkOut: rango.rango.checkOut,
      adultos: rango.rango.adultos,
      ninos: rango.rango.ninos,
      moneda: pagina.moneda,
    });

    if (!resultado.ok) {
      // Sin disponibilidad no es un error del cliente: es una respuesta que la
      // página tiene que poder explicar con estas palabras.
      return NextResponse.json(
        { ok: false, motivo: resultado.motivo, error: resultado.mensaje },
        { status: 200 }
      );
    }

    return NextResponse.json({
      ok: true,
      noches: resultado.noches,
      moneda: resultado.moneda,
      unidades: resultado.unidades.map((u) => ({
        unitId: u.unitId,
        propertyId: u.propertyId,
        nombre: u.nombre,
        tipo: u.tipo,
        capacidad: u.capacidad,
        tarifaPorNoche: u.tarifaPorNoche,
        desglose: {
          alojamiento: u.cotizacion.alojamiento,
          limpieza: u.cotizacion.limpieza,
          total: u.cotizacion.total,
          anticipo: u.cotizacion.anticipo,
          saldo: u.cotizacion.saldo,
        },
      })),
    });
  } catch (error) {
    console.error('[BookingEngine] Error cotizando:', error);
    return errorPublico('No se pudo calcular el precio. Inténtalo de nuevo.', 500);
  }
}
