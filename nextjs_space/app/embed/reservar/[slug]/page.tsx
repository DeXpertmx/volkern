export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { datosPaginaPublica } from '@/lib/hospitality/booking-public';
import { BookingWizard } from '@/components/hospitality/booking/BookingWizard';

/**
 * Widget embebible de reserva directa: `/embed/reservar/<slug>`.
 *
 * Es la misma experiencia que la página pública, sin el marco de la página (ni
 * encabezado propio ni fondo), para pegarla en la web del alojamiento con el
 * fragmento de iframe que da la sección de configuración.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedReservarPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await params;
  const pagina = await datosPaginaPublica(slug);

  if (!pagina.ok) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">{pagina.mensaje}</div>
    );
  }

  return (
    <div className="min-h-[640px] bg-background p-4">
      <BookingWizard
        slug={pagina.datos.slug}
        alojamiento={pagina.datos.alojamiento}
        moneda={pagina.datos.moneda}
        config={pagina.datos.config}
        propiedades={pagina.datos.propiedades}
        embebido
      />
    </div>
  );
}
