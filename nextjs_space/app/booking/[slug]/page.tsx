export const dynamic = 'force-dynamic';

import { permanentRedirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { idiomaDeValor, textosPaginaNoDisponible } from '@/lib/hospitality/booking-i18n';

/**
 * Enlace ANTIGUO de reserva: `/booking/<id de propiedad>`.
 *
 * Era la primera página pública del Booking Engine y quedaba viva junto a la
 * página actual (`/reservar/<slug>`), cada una con su propia idea de «publicada»:
 * la vieja publicaba por el estado de la propiedad (`conectada`) y la nueva por
 * la lista de propiedades que el hotel marca en su configuración. Dos páginas y
 * dos criterios significaban exactamente lo que dolía: una propiedad retirada
 * desde el panel seguía vendiéndose por el enlace viejo, y el huésped que caía en
 * ella no veía los extras ni las reseñas de la página nueva.
 *
 * Ahora hay UNA sola página y UN solo criterio, así que este enlace solo redirige:
 *
 *  - Si la propiedad está publicada en la configuración del hotel → **308** a la
 *    página única (o al widget embebible si venía de un iframe con `?embed=1`),
 *    conservando el idioma (`?lang`).
 *  - Si no lo está → la misma frase de «página no disponible» que da la página
 *    única. El enlace viejo no puede servir nada que el nuevo no sirva.
 *
 * Se resuelve en el servidor (nada de una página en blanco redirigiendo desde el
 * cliente) y con un 308 para que el buscador y los enlaces ya compartidos por los
 * hoteles se queden con la dirección nueva.
 */

type Busqueda = Record<string, string | string[] | undefined>;

function primerValor(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

/** Slug de la página única a la que corresponde una propiedad, o null. */
async function slugDeLaPaginaPublica(propertyId: string): Promise<string | null> {
  const propiedad = await prisma.hospitalityProperty.findFirst({
    where: { id: propertyId },
    select: {
      id: true,
      tenant: {
        select: {
          hospitalityBookingConfig: {
            select: { slug: true, activo: true, propiedadesPublicadas: true },
          },
        },
      },
    },
  });
  const config = propiedad?.tenant?.hospitalityBookingConfig;
  if (!config?.slug || !config.activo) return null;
  // El criterio de publicación es el de la página única; aquí solo se comprueba.
  if (!(config.propiedadesPublicadas || []).includes(propertyId)) return null;
  return config.slug;
}

export default async function BookingLegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }> | { slug: string };
  searchParams?: Promise<Busqueda> | Busqueda;
}) {
  const { slug } = await params;
  const busqueda = (await searchParams) ?? {};
  const idioma = idiomaDeValor(busqueda.lang);

  const slugPublico = await slugDeLaPaginaPublica(slug);
  if (!slugPublico) {
    const { titulo, mensaje } = textosPaginaNoDisponible(idioma, 'no_existe');
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">{titulo}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{mensaje}</p>
        </div>
      </main>
    );
  }

  // El embed tiene su propia ruta (sin marco de página); el resto va a la página
  // pública. El idioma pedido viaja con la redirección.
  const embebido = primerValor(busqueda.embed) === '1';
  const idiomaPedido = primerValor(busqueda.lang);
  const destino = `${embebido ? '/embed/reservar' : '/reservar'}/${slugPublico}${
    idiomaPedido ? `?lang=${encodeURIComponent(idiomaPedido)}` : ''
  }`;

  permanentRedirect(destino);
}
