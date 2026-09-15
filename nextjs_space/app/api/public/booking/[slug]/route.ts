export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolverPaginaPublica } from '@/lib/hospitality/booking-engine';
import { estadoDeCobroDelTenant } from '@/lib/hospitality/booking-payments';
import { errorPublico } from '../_comun';

/**
 * GET /api/public/booking/[slug] — página pública de reserva de un tenant.
 *
 * Devuelve lo que el huésped necesita para decidir: el nombre del alojamiento, su
 * política, la divisa con la que se publican los precios y las unidades que se
 * pueden reservar. Nada más: ni huéspedes, ni importes ajenos, ni los
 * identificadores externos de los canales.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> | { slug: string } }) {
  try {
    const { slug } = await ctx.params;
    const pagina = await resolverPaginaPublica(slug);
    if (!pagina.ok) {
      return errorPublico(pagina.mensaje, pagina.motivo === 'no_existe' ? 404 : 409);
    }

    // El estado del cobro online se consulta en vivo: enseñar un botón de pago
    // que no puede funcionar es peor que no enseñarlo.
    const cobro = await estadoDeCobroDelTenant(pagina.config.tenantId);

    return NextResponse.json({
      ok: true,
      alojamiento: pagina.tenant.nombre,
      config: {
        titulo: pagina.config.titulo,
        descripcion: pagina.config.descripcion,
        emailContacto: pagina.config.emailContacto,
        telefonoContacto: pagina.config.telefonoContacto,
        politicaCancelacion: pagina.config.politicaCancelacion,
        anticipoPorcentaje: pagina.config.anticipoPorcentaje,
        tarifaLimpieza: pagina.config.tarifaLimpieza,
        requierePagoOnline: pagina.config.requierePagoOnline,
        moneda: pagina.moneda,
        pagoOnlineDisponible: cobro.disponible,
      },
      propiedades: pagina.propiedades,
    });
  } catch (error) {
    console.error('[BookingEngine] Error sirviendo la página pública:', error);
    return errorPublico('No se pudo cargar la página de reservas.', 500);
  }
}
