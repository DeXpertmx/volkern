/**
 * Imágenes del portal público.
 *
 * Las fichas y tarjetas usaban la URL original del inmueble en un `<img>`: una
 * foto de 3000 px para un hueco de 380 px. Aquí viven los anchos, los `sizes` y
 * los constructores de `srcset`; las variantes las sirve
 * `/api/public/portal/imagen`, que redimensiona con `sharp` y cachea. Todo es
 * puro para poder probarlo sin navegador ni base de datos.
 */

/** Anchos de las tarjetas de cartera (portada, catálogo y relacionadas). */
export const ANCHOS_TARJETA = [320, 480, 640, 960] as const;

/** Anchos del hero a sangre del catálogo. */
export const ANCHOS_HERO = [480, 768, 1080, 1440] as const;

/** Anchos de la foto principal de la ficha. */
export const ANCHOS_FICHA = [640, 960, 1280, 1600] as const;

/** Anchos de las miniaturas de la galería (se ven a 80 px). */
export const ANCHOS_MINIATURA = [160, 320] as const;

export const SIZES_TARJETA = '(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw';
export const SIZES_HERO = '100vw';
export const SIZES_FICHA = '(min-width: 1280px) 1200px, 100vw';
export const SIZES_MINIATURA = '80px';

/** Ancho mínimo y máximo que acepta el redimensionador. */
export const ANCHO_MINIMO = 160;
export const ANCHO_MAXIMO = 1600;

/**
 * URL de una variante del portal.
 *
 * Va por el mismo origen (y no directa al bucket) para poder redimensionar y
 * convertir a WebP sin depender de que el CDN de turno sepa hacerlo.
 */
/** ¿La URL se puede pedir al redimensionador (http/s absoluta)? */
function esUrlRemota(url: string): boolean {
  try {
    const destino = new URL(url);
    return destino.protocol === 'https:' || destino.protocol === 'http:';
  } catch {
    return false;
  }
}

export function urlImagenPortal(url: string, ancho: number): string {
  // Una ruta relativa (por ejemplo `/uploads/foto.jpg`) se deja tal cual: el
  // redimensionador sólo habla con hosts absolutos y un 400 rompería la foto.
  if (!url || !esUrlRemota(url)) return url;
  return `/api/public/portal/imagen?w=${ancho}&url=${encodeURIComponent(url)}`;
}

/** `srcset` completo de una foto para los anchos indicados. */
export function srcSetImagenPortal(url: string, anchos: readonly number[]): string {
  if (!url || !esUrlRemota(url)) return '';
  return anchos.map((ancho) => `${urlImagenPortal(url, ancho)} ${ancho}w`).join(', ');
}

/** Ancho pedido al redimensionador, acotado; `null` si no es válido. */
export function anchoImagenPortal(valor: unknown): number | null {
  const numero = typeof valor === 'string' ? Number.parseInt(valor, 10) : Number(valor);
  if (!Number.isFinite(numero)) return null;
  const ancho = Math.round(numero);
  if (ancho < ANCHO_MINIMO || ancho > ANCHO_MAXIMO) return null;
  return ancho;
}

/**
 * ¿El host puede pedirse al redimensionador?
 *
 * Lista cerrada a propósito: el endpoint hace una petición saliente con una URL
 * que llega por query, así que sólo se permite el propio origen, el bucket de la
 * plataforma y los CDN de imágenes conocidos. Sin esto el portal sería un proxy
 * abierto hacia la red interna.
 */
export function esHostDeImagenPermitido(host: string, permitidos: readonly string[]): boolean {
  const limpio = host.trim().toLowerCase();
  if (!limpio) return false;
  return permitidos.some(
    (permitido) => limpio === permitido || limpio.endsWith(`.${permitido}`)
  );
}

/** Hosts que el redimensionador acepta por defecto, además del propio origen. */
export function hostsDeImagenPermitidos(propio?: string | null): string[] {
  const hosts = new Set<string>(['images.unsplash.com', 'amazonaws.com', 'cloudfront.net']);
  if (propio) hosts.add(propio.trim().toLowerCase());

  for (const extra of (process.env.PORTAL_IMAGENES_HOSTS || '').split(',')) {
    const limpio = extra.trim().toLowerCase();
    if (limpio) hosts.add(limpio);
  }
  return [...hosts];
}

/** URL de la primera foto de un inmueble, venga como string o como objeto. */
export function urlPortadaInmueble(media: unknown): string {
  if (!Array.isArray(media) || media.length === 0) return '';
  const primera = media[0] as { url?: unknown } | string | null;
  if (typeof primera === 'string') return primera;
  return typeof primera?.url === 'string' ? primera.url : '';
}
