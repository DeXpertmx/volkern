export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { datosPaginaPublica } from '@/lib/hospitality/booking-public';
import { BookingWizard } from '@/components/hospitality/booking/BookingWizard';
import { EnvolturaPlantilla } from '@/components/hospitality/booking/PlantillaBookingPage';
import { idiomaDeValor, textosPaginaNoDisponible } from '@/lib/hospitality/booking-i18n';

/**
 * Widget embebible de reserva directa: `/embed/reservar/<slug>`.
 *
 * Es la misma experiencia que la página pública, sin el marco de la página (ni
 * encabezado propio ni fondo), para pegarla en la web del alojamiento con el
 * fragmento de iframe que da la sección de configuración.
 *
 * El idioma se lee aquí (`?lang=en`), en el servidor: el widget se pinta entero en
 * el idioma pedido desde el primer byte y el conmutador funciona dentro del iframe.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Busqueda = Record<string, string | string[] | undefined>;

export default async function EmbedReservarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }> | { slug: string };
  searchParams?: Promise<Busqueda> | Busqueda;
}) {
  const { slug } = await params;
  const busqueda = (await searchParams) ?? {};
  const idioma = idiomaDeValor(busqueda.lang);
  const pagina = await datosPaginaPublica(slug);

  if (!pagina.ok) {
    const { mensaje } = textosPaginaNoDisponible(idioma, pagina.motivo);
    return <div className="p-6 text-center text-sm text-muted-foreground">{mensaje}</div>;
  }

  return (
    <div className="min-h-[640px] p-4" style={{ background: 'var(--booking-fondo, hsl(var(--background)))' }}>
      <EnvolturaPlantilla personalizacion={pagina.datos.personalizacion}>
        <BookingWizard
          slug={pagina.datos.slug}
          alojamiento={pagina.datos.alojamiento}
          moneda={pagina.datos.moneda}
          config={pagina.datos.config}
          propiedades={pagina.datos.propiedades}
          idioma={idioma}
          rutaBase={`/embed/reservar/${slug}`}
          embebido
        />
      </EnvolturaPlantilla>
    </div>
  );
}
