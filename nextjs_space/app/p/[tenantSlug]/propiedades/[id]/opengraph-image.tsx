import { ImageResponse } from 'next/og';
import { globalPrisma } from '@/lib/db';
import { parseInmueble } from '@/lib/real-estate/property-helpers';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { getEffectiveBranding } from '@/lib/branding';
import { formatearPrecioInmueble } from '@/lib/real-estate/operation-labels';
import { fondoConTextoBlanco } from '@/lib/real-estate/contraste';

export const revalidate = 600;
export const alt = 'Ficha de inmueble';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Descarga la foto de portada para incrustarla en la imagen.
 *
 * Satori no siempre puede traer imágenes remotas (hosts lentos o con bloqueo de
 * hotlink), y una imagen OG rota es peor que una sin foto: si falla, se pinta la
 * tarjeta tipográfica.
 */
async function cargarImagen(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const tipo = res.headers.get('content-type') || 'image/jpeg';
    if (!tipo.startsWith('image/')) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > 4_000_000) return null;
    return `data:${tipo};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;

  const tenant = await resolveTenantBySlug(tenantSlug);
  const item = tenant
    ? await globalPrisma.catalogoItem.findFirst({
        where: { id, tenantId: tenant.id, tipo: 'inmueble', activo: true },
      })
    : null;

  if (!tenant || !item) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            color: '#ffffff',
            fontSize: 48,
          }}
        >
          Inmueble no disponible
        </div>
      ),
      size
    );
  }

  const property = parseInmueble(item);
  const branding = await getEffectiveBranding(tenant.id);
  const marca = fondoConTextoBlanco(branding.primaryColor || '#0f172a');
  const precio = formatearPrecioInmueble(property.precioBase, property.moneda || tenant.moneda);

  const media = Array.isArray(property.media) ? property.media : [];
  const portada = media[0];
  const fotoUrl = typeof portada === 'string' ? portada : portada?.url;
  const foto = await cargarImagen(fotoUrl);

  const ubicacion = [property.city, property.address].filter(Boolean).join(' · ');
  const detalles = [
    property.areaM2 ? `${property.areaM2} m²` : null,
    property.bedrooms ? `${property.bedrooms} hab.` : null,
    property.bathrooms ? `${property.bathrooms} baños` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            width: foto ? '54%' : '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px 48px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                background: marca,
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: 999,
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              {tenant.nombre}
            </div>
            <div
              style={{
                marginTop: 28,
                fontSize: 52,
                lineHeight: 1.1,
                fontWeight: 700,
                color: '#111827',
                display: 'flex',
              }}
            >
              {property.nombre.length > 62
                ? `${property.nombre.slice(0, 59)}…`
                : property.nombre}
            </div>
            {ubicacion && (
              <div style={{ marginTop: 14, fontSize: 26, color: '#4b5563', display: 'flex' }}>
                {ubicacion}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 60, fontWeight: 700, color: marca, display: 'flex' }}>
              {precio}
            </div>
            {detalles && (
              <div style={{ marginTop: 10, fontSize: 26, color: '#374151', display: 'flex' }}>
                {detalles}
              </div>
            )}
          </div>
        </div>

        {foto && (
          <div style={{ width: '46%', height: '100%', display: 'flex' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={foto}
              alt=""
              width={552}
              height={630}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}
      </div>
    ),
    size
  );
}
