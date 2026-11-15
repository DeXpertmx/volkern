import { Metadata } from 'next';
import { cache } from 'react';
import { globalPrisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { parseInmueble } from '@/lib/real-estate/property-helpers';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { getEffectiveBranding } from '@/lib/branding';
import { formatearPrecioInmueble } from '@/lib/real-estate/operation-labels';
import { getPlantillaPortal } from '@/lib/real-estate/portal-plantilla';
import {
  baseUrlDePeticion,
  construirDatosEstructuradosFicha,
  urlFicha,
} from '@/lib/real-estate/portal-seo';
import { headers } from 'next/headers';
import { whereCatalogoVigente } from '@/lib/real-estate/portal-vigencia';
import PropertyDetailClient from './PropertyDetailClient';

export const revalidate = 60;

interface Props {
  params: Promise<{ tenantSlug: string; id: string }>;
}

/**
 * Resuelve tenant y ficha una sola vez por petición.
 *
 * `generateMetadata` y la página pedían exactamente lo mismo por separado; con
 * `cache` de React la consulta se hace una vez y las dos partes trabajan sobre
 * el mismo inmueble ya parseado.
 */
const cargarFicha = cache(async (tenantSlug: string, id: string) => {
  const tenant = await resolveTenantBySlug(tenantSlug);
  if (!tenant) return null;

  const property = await getProperty(tenant.id, id);
  if (!property) return null;

  return { tenant, property };
});

/**
 * Metadatos SEO dinámicos
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug, id } = await params;
  const base = baseUrlDePeticion(await headers());
  const ficha = await cargarFicha(tenantSlug, id);

  let title = 'Propiedad | Volkern';
  let description = 'Detalle de propiedad inmobiliaria';

  if (ficha) {
    const { tenant, property } = ficha;
    title = `${property.nombre} | ${tenant.nombre}`;
    description = `${property.operationType === 'venta' ? 'En venta' : property.operationType === 'alquiler' ? 'En alquiler' : 'Propiedad'} - ${property.areaM2 ? `${property.areaM2} m²` : ''} ${property.bedrooms ? `${property.bedrooms} hab` : ''} ${property.city ? `en ${property.city}` : ''}`.trim();
  }

  const canonical = urlFicha(base, tenantSlug, id);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical,
      siteName: ficha?.tenant.nombre,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

/**
 * Obtiene propiedad del tenant
 */
async function getProperty(tenantId: string, propertyId: string) {
  const item = await globalPrisma.catalogoItem.findFirst({
    where: {
      id: propertyId,
      tenantId,
      tipo: 'inmueble',
      activo: true,
    },
  });

  return item ? parseInmueble(item) : null;
}

/**
 * Obtiene propiedades relacionadas del mismo tipo/ciudad
 */
async function getRelatedProperties(tenantId: string, property: any, limit = 3) {
  if (!property) return [];

  const items = await globalPrisma.catalogoItem.findMany({
    where: {
      ...(await whereCatalogoVigente(tenantId, { id: { not: property.id } })),
      OR: [
        property.propertyType ? { customFieldValues: { path: ['tipo_inmueble'], equals: property.propertyType } } : {},
        property.city ? { customFieldValues: { path: ['zona'], equals: property.city } } : {},
      ].filter(c => Object.keys(c).length > 0),
    },
    orderBy: { fechaCreacion: 'desc' },
    take: limit,
  });

  return items.map((i: any) => parseInmueble(i));
}

export default async function PropertyDetailPage({ params }: Props) {
  const { tenantSlug, id } = await params;
  const ficha = await cargarFicha(tenantSlug, id);

  if (!ficha) {
    notFound();
  }

  const { tenant, property } = ficha;

  const relatedProperties = await getRelatedProperties(tenant.id, property);

  const [branding, plantilla] = await Promise.all([
    getEffectiveBranding(tenant.id),
    getPlantillaPortal(tenant.id),
  ]);
  const brandingColor = branding.primaryColor!;

  // Obtener imágenes del array media
  const images = Array.isArray(property.media)
    ? property.media.map((m: any) => (typeof m === 'string' ? { url: m, alt: property.nombre } : { url: m.url, alt: m.alt || property.nombre }))
    : [];

  // El precio se escribe en la divisa del inmueble (o la del portal), no en euros
  // ni en la convención mexicana por defecto. Los inmuebles que no publican
  // precio se anuncian como «Precio a consultar».
  const formattedPrice = formatearPrecioInmueble(property.precioBase, property.moneda || tenant.moneda);

  // Datos estructurados de la ficha: es lo que permite que el inmueble salga
  // con precio y disponibilidad en los resultados de búsqueda.
  const base = baseUrlDePeticion(await headers());
  const urlPublica = urlFicha(base, tenantSlug, id);
  const datosEstructurados = construirDatosEstructuradosFicha({
    property,
    tenant,
    url: urlPublica,
    imagenes: images.map((imagen) => imagen.url).filter(Boolean),
    base,
    tenantSlug,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // `<` escapado: un nombre de inmueble no debe poder cerrar el script.
          __html: JSON.stringify(datosEstructurados).replace(/</g, '\\u003c'),
        }}
      />
      <PropertyDetailClient
        property={property}
        tenant={tenant}
        tenantSlug={tenantSlug}
        brandingColor={brandingColor}
        brandingNombre={branding.companyName || tenant.nombre}
        brandingLogo={branding.logoUrl || ''}
        brandingClaim={branding.claim || ''}
        brandingTelefono={branding.telefono || ''}
        plantilla={plantilla}
        images={images}
        formattedPrice={formattedPrice}
        relatedProperties={relatedProperties}
      />
    </>
  );
}
