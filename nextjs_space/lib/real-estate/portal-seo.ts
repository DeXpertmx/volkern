/**
 * SEO del portal público.
 *
 * Todo lo que se puede calcular sin tocar la base de datos vive aquí y se prueba
 * sin red: el sitemap por cuenta, el robots, los datos estructurados de la ficha
 * y los enlaces de compartir con origen. Las rutas sólo consultan y pintan.
 */
import type { InmuebleParsed } from './property-helpers';

const ORIGENES_PORTAL = ['whatsapp', 'qr', 'email', 'redes', 'cartel'] as const;
export type OrigenPortal = (typeof ORIGENES_PORTAL)[number];

/** Origen de un lead: sólo valores conocidos, para no ensuciar el CRM. */
export function normalizarOrigen(valor: unknown): OrigenPortal | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().toLowerCase();
  return (ORIGENES_PORTAL as readonly string[]).includes(limpio)
    ? (limpio as OrigenPortal)
    : null;
}

/** Base pública de una petición, respetando el proxy delante de Next. */
export function baseUrlDePeticion(headers: Headers): string {
  const host = headers.get('x-forwarded-host') || headers.get('host');
  if (host) {
    const proto = headers.get('x-forwarded-proto') || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
    return `${proto}://${host}`.replace(/\/$/, '');
  }
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/$/, '');
}

function urlAbsoluta(base: string, ruta: string): string {
  const limpiaBase = base.replace(/\/$/, '');
  const limpiaRuta = ruta.startsWith('/') ? ruta : `/${ruta}`;
  return `${limpiaBase}${limpiaRuta}`;
}

export function urlFicha(base: string, tenantSlug: string, propiedadId: string): string {
  return urlAbsoluta(base, `/p/${tenantSlug}/propiedades/${propiedadId}`);
}

/** Añade (o reemplaza) el parámetro de origen sin perder los que ya hubiera. */
export function urlConOrigen(url: string, origen: OrigenPortal): string {
  try {
    const destino = new URL(url);
    destino.searchParams.set('origen', origen);
    return destino.toString();
  } catch {
    const separador = url.includes('?') ? '&' : '?';
    return `${url}${separador}origen=${origen}`;
  }
}

/**
 * Enlace de compartir por WhatsApp.
 *
 * Lleva el origen en la propia URL compartida: cuando el destinatario abra la
 * ficha y envíe el formulario, el lead dirá que llegó por WhatsApp. Sin esto,
 * el clic se perdía en el anonimato del mensaje reenviado.
 */
export function urlCompartirWhatsapp({
  url,
  nombre,
  precio,
}: {
  url: string;
  nombre: string;
  precio?: string | null;
}): string {
  const enlace = urlConOrigen(url, 'whatsapp');
  const texto = precio ? `${nombre} — ${precio}` : nombre;
  return `https://wa.me/?text=${encodeURIComponent(`${texto}\n${enlace}`)}`;
}

// ─── Datos estructurados ────────────────────────────────────────────────────

const TIPO_SCHEMA: Record<string, string> = {
  casa: 'House',
  chalet: 'House',
  departamento: 'Apartment',
  piso: 'Apartment',
  atico: 'Apartment',
  oficina: 'Office',
  local: 'Store',
  local_comercial: 'Store',
  terreno: 'Landform',
};

const DISPONIBILIDAD: Record<string, string> = {
  reservada: 'https://schema.org/LimitedAvailability',
  vendida: 'https://schema.org/SoldOut',
  alquilada: 'https://schema.org/SoldOut',
};

/**
 * JSON-LD de una ficha (`RealEstateListing`).
 *
 * Los buscadores necesitan precio y moneda reales, no el texto formateado: por
 * eso se usa `precioBase` y `moneda` del inmueble, y la disponibilidad sale del
 * estado para que un inmueble vendido no se siga anunciando como oferta viva.
 */
export function construirDatosEstructuradosFicha({
  property,
  tenant,
  url,
  imagenes,
  base,
  tenantSlug,
}: {
  property: InmuebleParsed;
  tenant: { nombre: string };
  url: string;
  imagenes: string[];
  base: string;
  tenantSlug: string;
}): Record<string, unknown> {
  const tipo = TIPO_SCHEMA[String(property.propertyType || '').toLowerCase()] || 'Accommodation';

  const vivienda: Record<string, unknown> = {
    '@type': tipo,
    name: property.nombre,
  };
  if (property.areaM2) {
    vivienda.floorSize = { '@type': 'QuantitativeValue', value: property.areaM2, unitCode: 'MTK' };
  }
  const habitaciones = property.bedrooms ?? property.roomsDetail?.dormitorio ?? null;
  if (habitaciones) vivienda.numberOfRooms = habitaciones;
  if (property.bathrooms) vivienda.numberOfBathroomsTotal = property.bathrooms;
  if (property.address || property.city) {
    vivienda.address = {
      '@type': 'PostalAddress',
      ...(property.address ? { streetAddress: property.address } : {}),
      ...(property.city ? { addressLocality: property.city } : {}),
    };
  }
  if (property.lat != null && property.lng != null) {
    vivienda.geo = {
      '@type': 'GeoCoordinates',
      latitude: property.lat,
      longitude: property.lng,
    };
  }

  const datos: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: property.nombre,
    description: property.descripcion || property.longDescription || property.nombre,
    url,
    datePosted: property.createdAt instanceof Date ? property.createdAt.toISOString() : undefined,
    broker: {
      '@type': 'RealEstateAgent',
      name: tenant.nombre,
      url: urlAbsoluta(base, `/p/${tenantSlug}`),
    },
    about: vivienda,
  };

  if (imagenes.length) datos.image = imagenes;
  if (property.precioBase > 0) {
    datos.offers = {
      '@type': 'Offer',
      price: property.precioBase,
      priceCurrency: property.moneda || 'EUR',
      availability: DISPONIBILIDAD[property.status] || 'https://schema.org/InStock',
      url,
    };
  }

  return datos;
}

// ─── Sitemap y robots ───────────────────────────────────────────────────────

// ─── Revalidación ───────────────────────────────────────────────────────────

/**
 * Rutas del portal que dependen de la cartera de una cuenta.
 *
 * Se invalidan al guardar un inmueble: portada y catálogo siempre, y la ficha
 * concreta (con su imagen OG) cuando se sabe cuál cambió. El alias del portal se
 * invalida igual que el slug porque la ficha responde en ambos.
 */
export function rutasPortalDeCuenta({
  slug,
  alias,
  propiedadId,
}: {
  slug: string;
  alias?: string | null;
  propiedadId?: string | null;
}): string[] {
  const bases = [slug, alias].filter(
    (valor): valor is string => Boolean(valor && valor.trim())
  );
  const rutas = new Set<string>();
  for (const base of bases) {
    rutas.add(`/p/${base}`);
    rutas.add(`/p/${base}/propiedades`);
    if (propiedadId) {
      rutas.add(`/p/${base}/propiedades/${propiedadId}`);
      rutas.add(`/p/${base}/propiedades/${propiedadId}/opengraph-image`);
    }
  }
  return [...rutas];
}

export interface EntradaSitemap {
  url: string;
  lastModified?: Date;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  priority: number;
}

/** Slugs de página que ya ocupa una ruta propia del portal. */
const RUTAS_RESERVADAS = new Set(['propiedades', 'favicon', 'robots.txt', 'sitemap.xml', 'preview']);

export function entradasSitemap({
  base,
  tenantSlug,
  paginas = [],
  inmuebles = [],
  limite = 5000,
}: {
  base: string;
  tenantSlug: string;
  paginas?: Array<{ slug: string; fechaActualizacion?: Date | null }>;
  inmuebles?: Array<{ id: string; fechaActualizacion?: Date | null }>;
  limite?: number;
}): EntradaSitemap[] {
  const entradas: EntradaSitemap[] = [
    {
      url: urlAbsoluta(base, `/p/${tenantSlug}`),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: urlAbsoluta(base, `/p/${tenantSlug}/propiedades`),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  for (const pagina of paginas) {
    if (!pagina.slug || RUTAS_RESERVADAS.has(pagina.slug)) continue;
    entradas.push({
      url: urlAbsoluta(base, `/p/${tenantSlug}/${pagina.slug}`),
      lastModified: pagina.fechaActualizacion || undefined,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  for (const inmueble of inmuebles) {
    entradas.push({
      url: urlAbsoluta(base, `/p/${tenantSlug}/propiedades/${inmueble.id}`),
      lastModified: inmueble.fechaActualizacion || undefined,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  return entradas.slice(0, limite);
}

/** XML del sitemap, con escape de `&` para que los buscadores lo acepten. */
export function sitemapXml(entradas: EntradaSitemap[]): string {
  const escapar = (texto: string) =>
    texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lineas = entradas.map((entrada) =>
    [
      '  <url>',
      `    <loc>${escapar(entrada.url)}</loc>`,
      entrada.lastModified ? `    <lastmod>${entrada.lastModified.toISOString()}</lastmod>` : '',
      `    <changefreq>${entrada.changeFrequency}</changefreq>`,
      `    <priority>${entrada.priority.toFixed(1)}</priority>`,
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n')
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...lineas,
    '</urlset>',
  ].join('\n');
}

/**
 * robots.txt de una cuenta.
 *
 * Una cuenta suspendida o de baja no debe seguir posicionando: se le cierra el
 * rastreo entero en vez de dejar que los buscadores conserven fichas viejas.
 */
export function textoRobots({
  base,
  tenantSlug,
  indexable,
}: {
  base: string;
  tenantSlug: string;
  indexable: boolean;
}): string {
  if (!indexable) {
    return ['User-agent: *', 'Disallow: /', ''].join('\n');
  }
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${urlAbsoluta(base, `/p/${tenantSlug}/sitemap.xml`)}`,
    '',
  ].join('\n');
}
