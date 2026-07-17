import { Metadata } from 'next';
import { globalPrisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { parseInmuebles } from '@/lib/real-estate/property-helpers';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { getEffectiveBranding } from '@/lib/branding';
import HeroCarousel from './HeroCarousel';

export const revalidate = 60;

interface Props {
  params: { tenantSlug: string };
  searchParams: {
    q?: string;
    operacion?: string;
    tipo?: string;
    ciudad?: string;
    minPrecio?: string;
    maxPrecio?: string;
  };
}

/**
 * Metadatos SEO dinámicos
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await resolveTenantBySlug(params.tenantSlug);

  if (!tenant) return { title: 'Propiedades no encontradas' };

  const branding = await getEffectiveBranding(tenant.id);

  return {
    title: `Propiedades | ${tenant.nombre}`,
    description: `Catálogo de propiedades inmobiliarias de ${tenant.nombre}`,
    openGraph: {
      title: `Propiedades | ${tenant.nombre}`,
      description: `Catálogo de propiedades inmobiliarias de ${tenant.nombre}`,
      type: 'website',
      ...(branding.logoUrl ? { images: [{ url: branding.logoUrl }] } : {}),
    },
  };
}

/**
 * Obtiene propiedades del tenant con filtros básicos
 */
async function getProperties(
  tenantId: string,
  filters: {
    search?: string;
    operacion?: string;
    tipo?: string;
    ciudad?: string;
    minPrecio?: number;
    maxPrecio?: number;
  }
) {
  const where: any = {
    tenantId,
    tipo: 'inmueble',
    activo: true,
  };

  // OR combinado: búsqueda por texto + ciudad/zona
  const orConditions: any[] = [];

  if (filters.search) {
    orConditions.push(
      { nombre: { contains: filters.search, mode: 'insensitive' } },
      { descripcion: { contains: filters.search, mode: 'insensitive' } },
    );
  }

  if (filters.ciudad) {
    orConditions.push(
      { customFieldValues: { path: ['zona'], string_contains: filters.ciudad } },
      { customFieldValues: { path: ['ciudad'], string_contains: filters.ciudad } },
    );
  }

  if (orConditions.length > 0) {
    where.OR = orConditions;
  }

  // Construir condiciones AND para filtros JSONB
  const andConditions: any[] = [];

  if (filters.operacion) {
    andConditions.push({
      customFieldValues: { path: ['tipo_operacion'], equals: filters.operacion },
    });
  }

  if (filters.tipo) {
    andConditions.push({
      customFieldValues: { path: ['tipo_inmueble'], equals: filters.tipo },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  if (filters.minPrecio !== undefined) {
    where.precioBase = { ...where.precioBase, gte: filters.minPrecio };
  }
  if (filters.maxPrecio !== undefined) {
    where.precioBase = { ...where.precioBase, lte: filters.maxPrecio };
  }

  const items = await globalPrisma.catalogoItem.findMany({
    where,
    orderBy: [
      { destacado: 'desc' },
      { fechaCreacion: 'desc' },
    ],
    take: 50,
  });

  return parseInmuebles(items);
}

/**
 * Obtiene propiedades destacadas para el hero carousel
 */
async function getHeroProperties(tenantId: string) {
  const items = await globalPrisma.catalogoItem.findMany({
    where: {
      tenantId,
      tipo: 'inmueble',
      activo: true,
      destacado: true,
    },
    orderBy: { fechaCreacion: 'desc' },
    take: 6,
  });

  const parsed = parseInmuebles(items);

  // Si no hay destacadas, tomar las 5 más recientes
  if (parsed.length === 0) {
    const recent = await globalPrisma.catalogoItem.findMany({
      where: { tenantId, tipo: 'inmueble', activo: true },
      orderBy: { fechaCreacion: 'desc' },
      take: 5,
    });
    return parseInmuebles(recent);
  }

  return parsed;
}

export default async function PropertyListingPage({ params, searchParams }: Props) {
  const tenant = await resolveTenantBySlug(params.tenantSlug);

  if (!tenant) {
    notFound();
  }

  const [properties, heroProperties] = await Promise.all([
    getProperties(tenant.id, {
      search: searchParams.q,
      operacion: searchParams.operacion,
      tipo: searchParams.tipo,
      ciudad: searchParams.ciudad,
      minPrecio: searchParams.minPrecio ? Number(searchParams.minPrecio) : undefined,
      maxPrecio: searchParams.maxPrecio ? Number(searchParams.maxPrecio) : undefined,
    }),
    getHeroProperties(tenant.id),
  ]);

  const branding = await getEffectiveBranding(tenant.id);
  const brandingColor = branding.primaryColor || '#3b82f6';
  const logoUrl = branding.logoUrl || '';
  const companyName = branding.companyName || tenant.nombre;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Carousel */}
      {heroProperties.length > 0 && (
        <HeroCarousel
          properties={heroProperties}
          tenantSlug={params.tenantSlug}
          brandingColor={brandingColor}
          logoUrl={logoUrl}
          companyName={companyName}
        />
      )}

      {/* Filters Bar */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <form className="flex flex-wrap items-center gap-2.5" method="GET">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                name="q"
                placeholder="Buscar por nombre o descripción..."
                className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:outline-none focus:border-transparent"
                defaultValue={searchParams.q || ''}
              />
            </div>

            <select
              name="operacion"
              className="border rounded-lg px-3 py-2 text-sm bg-white"
              defaultValue={searchParams.operacion || ''}
            >
              <option value="">Todas las ops.</option>
              <option value="venta">En Venta</option>
              <option value="alquiler">En Alquiler</option>
              <option value="traspaso">Traspaso</option>
            </select>

            <select
              name="tipo"
              className="border rounded-lg px-3 py-2 text-sm bg-white"
              defaultValue={searchParams.tipo || ''}
            >
              <option value="">Todos los tipos</option>
              <option value="Casa">Casa</option>
              <option value="Departamento">Departamento</option>
              <option value="Oficina">Oficina</option>
              <option value="Local Comercial">Local Comercial</option>
              <option value="Terreno">Terreno</option>
            </select>

            <input
              type="text"
              name="ciudad"
              placeholder="Ciudad o zona..."
              className="border rounded-lg px-3 py-2 text-sm w-36"
              defaultValue={searchParams.ciudad || ''}
            />

            <div className="flex items-center gap-1">
              <input
                type="number"
                name="minPrecio"
                placeholder="Mín €"
                className="border rounded-lg px-3 py-2 text-sm w-24"
                defaultValue={searchParams.minPrecio || ''}
              />
              <span className="text-gray-400">—</span>
              <input
                type="number"
                name="maxPrecio"
                placeholder="Máx €"
                className="border rounded-lg px-3 py-2 text-sm w-24"
                defaultValue={searchParams.maxPrecio || ''}
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition flex items-center gap-1.5"
              style={{ backgroundColor: brandingColor }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              Filtrar
            </button>

            {/* Active filters count */}
            {Object.values(searchParams).some(v => v) && (
              <a
                href={`/p/${params.tenantSlug}/propiedades`}
                className="text-xs text-gray-500 hover:text-gray-700 underline ml-1"
              >
                Limpiar filtros
              </a>
            )}
          </form>
        </div>
      </div>

      {/* Results Summary */}
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{properties.length}</span>{' '}
          {properties.length === 1 ? 'propiedad encontrada' : 'propiedades encontradas'}
        </p>
      </div>

      {/* Property Grid */}
      <main className="max-w-7xl mx-auto px-4 pb-12">
        {properties.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-400 text-lg mb-2">No hay propiedades disponibles</p>
            <p className="text-gray-400 text-sm">Prueba con otros filtros o revisa más tarde</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => {
              const imagen = Array.isArray(property.media) && property.media.length > 0
                ? (property.media[0] as any)?.url || ''
                : '';

              const pricePerM2 = property.areaM2 && property.areaM2 > 0
                ? Math.round(property.precioBase / property.areaM2)
                : null;

              return (
                <a
                  key={property.id}
                  href={`/p/${params.tenantSlug}/propiedades/${property.id}`}
                  className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group flex flex-col"
                >
                  {/* Image */}
                  <div className="relative h-48 bg-gray-200 overflow-hidden">
                    {imagen ? (
                      <img
                        src={imagen}
                        alt={property.nombre}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-300">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}

                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                      {property.featured && (
                        <span className="bg-amber-400 text-white text-xs font-bold px-2 py-1 rounded-md shadow-md flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          DESTACADA
                        </span>
                      )}
                      <span
                        className="text-xs font-semibold px-2 py-1 rounded-md shadow-md"
                        style={{
                          backgroundColor: property.operationType === 'venta'
                            ? '#3b82f6'
                            : property.operationType === 'alquiler'
                            ? '#8b5cf6'
                            : '#6b7280',
                          color: 'white',
                        }}
                      >
                        {property.operationType === 'venta' ? 'Venta' : property.operationType === 'alquiler' ? 'Alquiler' : property.operationType || 'Propiedad'}
                      </span>
                    </div>

                    {/* Price tag overlay */}
                    <div className="absolute bottom-3 right-3">
                      <div
                        className="text-white text-sm font-bold px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-sm"
                        style={{ backgroundColor: `${brandingColor}dd` }}
                      >
                        {property.precioBase.toLocaleString('es-ES')} {property.moneda}
                        {property.operationType === 'alquiler' && <span className="text-xs font-normal opacity-80">/mes</span>}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {property.nombre}
                    </h3>

                    {property.city && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {property.city}
                      </p>
                    )}

                    {/* Features row with icons */}
                    <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                      {property.areaM2 && (
                        <span className="flex items-center gap-1 text-xs text-gray-500" title={`${property.areaM2} m²`}>
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                            />
                          </svg>
                          {property.areaM2} m²
                        </span>
                      )}
                      {property.bedrooms && (
                        <span className="flex items-center gap-1 text-xs text-gray-500" title={`${property.bedrooms} habitaciones`}>
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                            />
                          </svg>
                          {property.bedrooms}
                        </span>
                      )}
                      {property.bathrooms && (
                        <span className="flex items-center gap-1 text-xs text-gray-500" title={`${property.bathrooms} baños`}>
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
                            />
                          </svg>
                          {property.bathrooms}
                        </span>
                      )}
                      {property.parking && (
                        <span className="flex items-center gap-1 text-xs text-gray-500" title={`${property.parking} estacionamientos`}>
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                            />
                          </svg>
                          {property.parking}
                        </span>
                      )}
                    </div>

                    {/* Bottom row: Price per m² */}
                    <div className="mt-auto pt-3 flex items-center justify-between">
                      {pricePerM2 && (
                        <span className="text-xs text-gray-400">
                          {pricePerM2.toLocaleString('es-ES')} €/m²
                        </span>
                      )}
                      <span
                        className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: brandingColor }}
                      >
                        Ver detalle →
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="h-6 w-auto opacity-50" />
          ) : null}
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} {companyName}
          </p>
        </div>
      </footer>
    </div>
  );
}
