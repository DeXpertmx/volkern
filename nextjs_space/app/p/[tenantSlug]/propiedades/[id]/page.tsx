import { Metadata } from 'next';
import { globalPrisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { parseInmueble } from '@/lib/real-estate/property-helpers';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { getEffectiveBranding } from '@/lib/branding';
import { formatearPrecioInmueble } from '@/lib/real-estate/operation-labels';
import PropertyDetailClient from './PropertyDetailClient';

export const revalidate = 60;

interface Props {
  params: Promise<{ tenantSlug: string; id: string }>;
}

/**
 * Metadatos SEO dinámicos
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug, id } = await params;
  const tenant = await resolveTenantBySlug(tenantSlug);

  let title = 'Propiedad | Volkern';
  let description = 'Detalle de propiedad inmobiliaria';

  if (tenant) {
    const property = await globalPrisma.catalogoItem.findFirst({
      where: {
        id,
        tipo: 'inmueble',
        activo: true,
      },
    });

    if (property) {
      const parsed = parseInmueble(property);
      title = `${parsed.nombre} | ${tenant.nombre}`;
      description = `${parsed.operationType === 'venta' ? 'En venta' : parsed.operationType === 'alquiler' ? 'En alquiler' : 'Propiedad'} - ${parsed.areaM2 ? `${parsed.areaM2} m²` : ''} ${parsed.bedrooms ? `${parsed.bedrooms} hab` : ''} ${parsed.city ? `en ${parsed.city}` : ''}`.trim();
    }
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
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
      tenantId,
      tipo: 'inmueble',
      activo: true,
      id: { not: property.id },
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
  const tenant = await resolveTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const property = await getProperty(tenant.id, id);

  if (!property) {
    notFound();
  }

  const relatedProperties = await getRelatedProperties(tenant.id, property);

  const branding = await getEffectiveBranding(tenant.id);
  const brandingColor = branding.primaryColor!;

  // Obtener imágenes del array media
  const images = Array.isArray(property.media)
    ? property.media.map((m: any) => (typeof m === 'string' ? { url: m, alt: property.nombre } : { url: m.url, alt: m.alt || property.nombre }))
    : [];

  const mainImage = images.length > 0 ? images[0].url : '';

  // El precio se escribe en la divisa del inmueble (o la del portal), no en euros
  // ni en la convención mexicana por defecto. Los inmuebles que no publican
  // precio se anuncian como «Precio a consultar».
  const formattedPrice = formatearPrecioInmueble(property.precioBase, property.moneda || tenant.moneda);

  return (
    <PropertyDetailClient
      property={property}
      tenant={tenant}
      tenantSlug={tenantSlug}
      brandingColor={brandingColor}
      images={images}
      mainImage={mainImage}
      formattedPrice={formattedPrice}
      relatedProperties={relatedProperties}
    />
  );
}
