import { Metadata } from 'next';
import { globalPrisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { parseInmuebles } from '@/lib/real-estate/property-helpers';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { getEffectiveBranding } from '@/lib/branding';
import { monedaPredominante } from '@/lib/moneda';
import HeroCarousel from './HeroCarousel';
import CalculadoraHipotecaria from '@/components/real-estate/CalculadoraHipotecaria';
import PortalPropertyCard from '@/components/real-estate/PortalPropertyCard';

export const revalidate = 60;

interface Props {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    q?: string;
    operacion?: string;
    tipo?: string;
    ciudad?: string;
    minPrecio?: string;
    maxPrecio?: string;
  }>;
}

/**
 * Metadatos SEO dinámicos
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantBySlug(tenantSlug);

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
  const { tenantSlug } = await params;
  const filters = await searchParams;
  const tenant = await resolveTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const [properties, heroProperties] = await Promise.all([
    getProperties(tenant.id, {
      search: filters.q,
      operacion: filters.operacion,
      tipo: filters.tipo,
      ciudad: filters.ciudad,
      minPrecio: filters.minPrecio ? Number(filters.minPrecio) : undefined,
      maxPrecio: filters.maxPrecio ? Number(filters.maxPrecio) : undefined,
    }),
    getHeroProperties(tenant.id),
  ]);

  const branding = await getEffectiveBranding(tenant.id);
  const brandingColor = branding.primaryColor || '#3b82f6';
  const logoUrl = branding.logoUrl || '';
  const companyName = branding.companyName || tenant.nombre;

  // La calculadora solo tiene sentido si hay algo en venta: arranca con el
  // inmueble más asequible del catálogo, que el visitante puede cambiar.
  const enVenta = properties.filter((p) => p.operationType === 'venta' && p.precioBase > 0);
  const precioVentaReferencia = enVenta.length > 0
    ? Math.min(...enVenta.map((p) => p.precioBase))
    : 0;
  const monedaVenta = monedaPredominante(enVenta.map((p) => p.moneda)) || tenant.moneda;

  return (
    // `text-gray-900`: el portal es un diseño claro, pero cuelga del tema global.
    // Bajo `.dark` el `foreground` es casi blanco y lo que no lleva clase de
    // color (opciones de los select, texto heredado) desaparecía sobre blanco.
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Hero Carousel */}
      {heroProperties.length > 0 && (
        <HeroCarousel
          properties={heroProperties}
          tenantSlug={tenantSlug}
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
                className="w-full bg-white text-gray-900 border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:outline-none focus:border-transparent"
                defaultValue={filters.q || ''}
              />
            </div>

            <select
              name="operacion"
              className="border rounded-lg px-3 py-2 text-sm bg-white"
              defaultValue={filters.operacion || ''}
            >
              <option value="">Todas las ops.</option>
              <option value="venta">En Venta</option>
              <option value="alquiler">En Alquiler</option>
              <option value="alquiler_temporada">Renta Vacacional</option>
              <option value="traspaso">Traspaso</option>
            </select>

            <select
              name="tipo"
              className="border rounded-lg px-3 py-2 text-sm bg-white"
              defaultValue={filters.tipo || ''}
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
              className="bg-white text-gray-900 border rounded-lg px-3 py-2 text-sm w-36"
              defaultValue={filters.ciudad || ''}
            />

            <div className="flex items-center gap-1">
            <input
              type="text"
              name="minPrecio"
              inputMode="numeric"
              placeholder="Mín"
              className="bg-white text-gray-900 border rounded-lg px-3 py-2 text-sm w-24"
              defaultValue={filters.minPrecio || ''}
            />
            <span className="text-gray-400">—</span>
            <input
              type="text"
              name="maxPrecio"
              inputMode="numeric"
              placeholder="Máx"
              className="bg-white text-gray-900 border rounded-lg px-3 py-2 text-sm w-24"
              defaultValue={filters.maxPrecio || ''}
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
                href={`/p/${tenantSlug}/propiedades`}
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
            {properties.map((property) => (
              <PortalPropertyCard
                key={property.id}
                property={property}
                tenantSlug={tenantSlug}
                brandingColor={brandingColor}
              />
            ))}
          </div>
        )}

        {/* Calculadora hipotecaria: se apoya en el precio de venta más bajo
            publicado para que el visitante vea una cuota real desde el inicio. */}
        {precioVentaReferencia > 0 && (
          <div className="mx-auto mt-14 max-w-4xl">
            <CalculadoraHipotecaria
              precioInicial={precioVentaReferencia}
              moneda={monedaVenta}
              color={brandingColor}
            />
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
