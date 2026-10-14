/**
 * URLs públicas del Booking Engine — módulo PURO (sin base de datos).
 *
 * Una sola forma de escribir el enlace en todo el producto: la página pública
 * (`/reservar/<slug>`), el widget embebible (`/embed/reservar/<slug>`) y el
 * fragmento de iframe que el hotel pega en su web.
 *
 * Vive aparte de `booking-config.ts` —que sí lee la base de datos— porque lo
 * consume TAMBIÉN el panel del hotel, que es un componente de cliente: importar
 * el módulo de configuración desde ahí arrastraba Prisma al navegador y rompía
 * la hidratación. `booking-config` las reexporta para no tener dos verdades.
 */

/** URL pública de la página de reserva del alojamiento. */
export function urlPublicaBooking(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, '')}/reservar/${slug}`;
}

/** URL del widget embebible (para la web del hotel). */
export function urlEmbedBooking(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, '')}/embed/reservar/${slug}`;
}

/** Fragmento de iframe que el hotel pega en su web. */
export function codigoEmbedBooking(appUrl: string, slug: string, titulo?: string | null): string {
  const etiqueta = (titulo || 'Reserva').replace(/"/g, '');
  return `<iframe src="${urlEmbedBooking(appUrl, slug)}" title="${etiqueta}" style="width:100%;min-height:720px;border:0" loading="lazy"></iframe>`;
}
