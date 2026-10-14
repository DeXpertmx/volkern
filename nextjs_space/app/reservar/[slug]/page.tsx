export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { datosPaginaPublica } from '@/lib/hospitality/booking-public';
import { BookingWizard } from '@/components/hospitality/booking/BookingWizard';
import { SeccionResenas } from '@/components/hospitality/booking/SeccionResenas';
import { EnvolturaPlantilla, PlantillaBookingPage, type DatosPlantilla } from '@/components/hospitality/booking/PlantillaBookingPage';
import { formatearImporte } from '@/lib/moneda';
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
  // Sin idioma propio: los metadatos los lee el buscador, no el huésped.
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
  // El idioma entra en la lectura: el catálogo de extras (y sus descripciones)
  // se publica en el idioma del huésped.
  const pagina = await datosPaginaPublica(slug, idioma);

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

  // Galería de la ficha: las fotos del alojamiento con su portada delante y, si
  // el hotel no subió ninguna a la ficha, las de sus unidades —la página no puede
  // quedarse sin portada teniendo fotos en el inventario—.
  const fotosPropiedad = pagina.datos.propiedades.flatMap((p) => p.fotos);
  const fotosUnidades = pagina.datos.propiedades.flatMap((p) => p.unidades).flatMap((u) => u.fotos);
  const fotos = fotosPropiedad.length > 0 ? fotosPropiedad : fotosUnidades;

  // Plantilla y personalización (del módulo puro; lo inválido ya cayó a defaults).
  const datosPlantilla: DatosPlantilla = {
    idioma,
    plantilla: pagina.datos.plantilla,
    personalizacion: pagina.datos.personalizacion,
    // Logo del hotel para la cabecera (normalizado; null = sin logo).
    logo: pagina.datos.logo,
    titulo: pagina.datos.config.titulo || pagina.datos.alojamiento,
    descripcion: pagina.datos.config.descripcion,
    ciudad: pagina.datos.propiedades.find((p) => p.ciudad)?.ciudad ?? null,
    fotos,
    fotoPortada: fotos[0] ?? null,
    tarifaDesde: null,
    tarifaDesdeTexto:
      pagina.datos.propiedades.flatMap((p) => p.unidades).reduce<number | null>(
        (min, u) => (min === null || u.tarifaPorNoche < min ? u.tarifaPorNoche : min),
        null
      ) !== null
        ? formatearImporte(
            Math.min(...pagina.datos.propiedades.flatMap((p) => p.unidades).map((u) => u.tarifaPorNoche)),
            pagina.datos.moneda
          )
        : null,
    capacidadMaxima:
      pagina.datos.propiedades.flatMap((p) => p.unidades).reduce<number | null>(
        (max, u) => (max === null || u.capacidad > max ? u.capacidad : max),
        null
      ),
  };

  // Reseñas publicadas: la prueba social que convierte, servida en el HTML de la
  // página. Se enseña un bloque por propiedad con reseñas (lo normal: una).
  const bloquesResenas = pagina.datos.propiedades.filter((p) => p.resenas && p.resenas.total > 0);

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: 'var(--booking-fondo, hsl(var(--muted, 210 40% 96%)))' }}>
      <EnvolturaPlantilla personalizacion={pagina.datos.personalizacion}>
        <PlantillaBookingPage
          plantilla={pagina.datos.plantilla}
          datos={datosPlantilla}
          wizard={
            <BookingWizard
              slug={pagina.datos.slug}
              alojamiento={pagina.datos.alojamiento}
              moneda={pagina.datos.moneda}
              config={pagina.datos.config}
              propiedades={pagina.datos.propiedades}
              idioma={idioma}
              rutaBase={`/reservar/${slug}`}
            />
          }
        />
        {bloquesResenas.length > 0 ? (
          <div className="mx-auto mt-10 max-w-3xl space-y-8">
            {bloquesResenas.map((propiedad) => (
              <SeccionResenas key={propiedad.id} resumen={propiedad.resenas!} idioma={idioma} />
            ))}
          </div>
        ) : null}
      </EnvolturaPlantilla>
    </main>
  );
}
