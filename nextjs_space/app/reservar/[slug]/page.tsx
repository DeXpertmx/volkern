export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { datosPaginaPublica } from '@/lib/hospitality/booking-public';
import { BookingWizard } from '@/components/hospitality/booking/BookingWizard';
import { idiomaDeValor, textosPaginaNoDisponible } from '@/lib/hospitality/booking-i18n';

/**
 * Página pública de reserva directa de un alojamiento: `/reservar/<slug>`.
 *
 * Es una ruta top-level (y está en `TOP_LEVEL`) para que el middleware no la tome
 * por el slug de un tenant. Aquí no se decide nada de negocio: los datos salen de
 * `datosPaginaPublica` y la reserva la crea la API pública, que a su vez la pide
 * al Reservation Engine.
 *
 * El idioma se lee aquí (`?lang=en`), en el servidor: la página se pinta entera en
 * el idioma pedido, sin parpadeo ni hidratación distinta. Sin `lang` —o con un
 * valor desconocido— sigue siendo español, como siempre.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}): Promise<Metadata> {
  const { slug } = await params;
  const pagina = await datosPaginaPublica(slug);
  if (!pagina.ok) return { title: 'Reservas' };

  return {
    title: pagina.datos.config.titulo || `Reserva en ${pagina.datos.alojamiento}`,
    description: pagina.datos.config.descripcion || `Reserva tu estancia en ${pagina.datos.alojamiento}.`,
    robots: { index: true, follow: true },
  };
}

type Busqueda = Record<string, string | string[] | undefined>;

export default async function ReservarPage({
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
    const { titulo, mensaje } = textosPaginaNoDisponible(idioma, pagina.motivo);
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">{titulo}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{mensaje}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <BookingWizard
        slug={pagina.datos.slug}
        alojamiento={pagina.datos.alojamiento}
        moneda={pagina.datos.moneda}
        config={pagina.datos.config}
        propiedades={pagina.datos.propiedades}
        idioma={idioma}
        rutaBase={`/reservar/${slug}`}
      />
    </main>
  );
}
