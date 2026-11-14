import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { globalPrisma } from '@/lib/db';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { getEffectiveBranding } from '@/lib/branding';
import { parseInmuebles, type InmuebleParsed } from '@/lib/real-estate/property-helpers';
import {
  formatOperationLabel,
  formatearPrecioInmueble,
  operationBadgeColor,
  priceSuffix,
} from '@/lib/real-estate/operation-labels';
import PortalContactForm from './PortalContactForm';

export const revalidate = 60;

interface Props {
  params: Promise<{ tenantSlug: string }>;
}

/**
 * Home del portal público de una cuenta (matriz o franquiciado).
 *
 * Es la misma plantilla para toda la red: el diseño no se copia por oficina, se
 * alimenta con su marca y su catálogo. Manda lo que esa cuenta tiene publicado —
 * primero lo marcado como destacado — y solo después el resto, para que la
 * portada de una oficina pequeña no parezca vacía.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantBySlug(tenantSlug);
  if (!tenant) return { title: 'Portal no encontrado' };

  const branding = await getEffectiveBranding(tenant.id);
  const companyName = branding.companyName || tenant.nombre;

  return {
    title: `${companyName} | Inmuebles en venta y alquiler`,
    description: `Catálogo de propiedades de ${companyName}. Contacta directamente con la oficina para visitas y consultas.`,
    openGraph: {
      title: `${companyName} | Inmuebles en venta y alquiler`,
      description: `Catálogo de propiedades de ${companyName}.`,
      type: 'website',
      ...(branding.logoUrl ? { images: [{ url: branding.logoUrl }] } : {}),
    },
  };
}

interface ResumenCatalogo {
  destacadas: InmuebleParsed[];
  total: number;
  enVenta: number;
  enAlquiler: number;
}

/**
 * Inmuebles de la portada: los suyos, con los destacados arriba.
 *
 * El orden lo resuelve la consulta (`destacado desc`) y no una mezcla con otras
 * cuentas: la portada de una oficina enseña su cartera, no la de la matriz.
 */
async function getResumenCatalogo(tenantId: string): Promise<ResumenCatalogo> {
  const base = { tenantId, tipo: 'inmueble', activo: true };

  const [items, total, enVenta, enAlquiler] = await Promise.all([
    globalPrisma.catalogoItem.findMany({
      where: base,
      orderBy: [{ destacado: 'desc' }, { fechaCreacion: 'desc' }],
      take: 6,
    }),
    globalPrisma.catalogoItem.count({ where: base }),
    globalPrisma.catalogoItem.count({
      where: { ...base, customFieldValues: { path: ['tipo_operacion'], equals: 'venta' } },
    }),
    globalPrisma.catalogoItem.count({
      where: { ...base, customFieldValues: { path: ['tipo_operacion'], equals: 'alquiler' } },
    }),
  ]);

  return {
    destacadas: parseInmuebles(items),
    total,
    enVenta,
    enAlquiler,
  };
}

function TarjetaInmueble({
  property,
  tenantSlug,
  brandingColor,
}: {
  property: InmuebleParsed;
  tenantSlug: string;
  brandingColor: string;
}) {
  const imagen = Array.isArray(property.media) && property.media.length > 0
    ? (property.media[0] as any)?.url || ''
    : '';

  return (
    <a
      href={`/p/${tenantSlug}/propiedades/${property.id}`}
      className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-300 hover:shadow-lg focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ outlineColor: brandingColor }}
    >
      <div className="relative h-44 overflow-hidden bg-gray-200">
        {imagen ? (
          <img
            src={imagen}
            alt={property.nombre}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
            </svg>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {property.featured && (
            <span className="rounded-md bg-amber-400 px-2 py-1 text-[10px] font-bold text-white shadow-md">
              DESTACADA
            </span>
          )}
          <span
            className="self-start rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-md"
            style={{ backgroundColor: operationBadgeColor(property.operationType) }}
          >
            {formatOperationLabel(property.operationType)}
          </span>
        </div>

        <div className="absolute bottom-3 right-3 rounded-lg px-3 py-1.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm"
          style={{ backgroundColor: `${brandingColor}dd` }}
        >
          {formatearPrecioInmueble(property.precioBase, property.moneda)}
          {priceSuffix(property.operationType) && (
            <span className="text-xs font-normal opacity-80">{priceSuffix(property.operationType)}</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate font-semibold text-gray-900">{property.nombre}</h3>
        {property.city && (
          <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {property.city}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
          {property.areaM2 ? <span>{property.areaM2} m²</span> : null}
          {property.bedrooms ? <span>{property.bedrooms} hab.</span> : null}
          {property.bathrooms ? <span>{property.bathrooms} baños</span> : null}
          {property.parking ? <span>{property.parking} estac.</span> : null}
        </div>
      </div>
    </a>
  );
}

export default async function PortalHomePage({ params }: Props) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const [branding, catalogo] = await Promise.all([
    getEffectiveBranding(tenant.id),
    getResumenCatalogo(tenant.id),
  ]);

  const brandingColor = branding.primaryColor || '#3b82f6';
  const logoUrl = branding.logoUrl || '';
  const companyName = branding.companyName || tenant.nombre;
  const catalogoUrl = `/p/${tenantSlug}/propiedades`;

  return (
    // Mismo criterio que el catálogo: el portal es claro y cuelga del tema
    // global, donde `foreground` se vuelve casi blanco bajo `.dark`.
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Cabecera */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <a href={`/p/${tenantSlug}`} className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-8 w-auto" />
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white"
                style={{ backgroundColor: brandingColor }}
              >
                {companyName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="text-sm font-semibold text-gray-900">{companyName}</span>
          </a>

          <nav className="flex items-center gap-3 text-sm">
            <a href={catalogoUrl} className="hidden text-gray-600 hover:text-gray-900 sm:inline">
              Propiedades
            </a>
            <a href="#contacto" className="hidden text-gray-600 hover:text-gray-900 sm:inline">
              Contacto
            </a>
            <a
              href={catalogoUrl}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
              style={{ backgroundColor: brandingColor }}
            >
              Ver catálogo
            </a>
          </nav>
        </div>
      </header>

      {/* Portada */}
      <section className="relative overflow-hidden" style={{ backgroundColor: brandingColor }}>
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: `linear-gradient(135deg, ${brandingColor} 0%, ${brandingColor}bb 60%, #0f172a 100%)` }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            Inmobiliaria
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-black leading-tight text-white sm:text-4xl">
            {companyName}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
            Compra, venta y alquiler de inmuebles. Atención directa por parte de la oficina, con
            visitas concertadas y acompañamiento hasta la firma.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-white/80">
            <span>
              <strong className="text-base text-white">{catalogo.total}</strong>{' '}
              {catalogo.total === 1 ? 'propiedad publicada' : 'propiedades publicadas'}
            </span>
            {catalogo.enVenta > 0 && (
              <span>
                <strong className="text-base text-white">{catalogo.enVenta}</strong> en venta
              </span>
            )}
            {catalogo.enAlquiler > 0 && (
              <span>
                <strong className="text-base text-white">{catalogo.enAlquiler}</strong> en alquiler
              </span>
            )}
          </div>

          {/* Buscador: reenvía al catálogo con los filtros ya puestos */}
          <form
            method="GET"
            action={catalogoUrl}
            className="mt-8 flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 p-3 shadow-xl"
          >
            <input
              type="text"
              name="q"
              placeholder="Buscar por nombre o descripción…"
              className="min-w-[180px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as any]: brandingColor }}
            />
            <select name="operacion" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
              <option value="">Operación</option>
              <option value="venta">En venta</option>
              <option value="alquiler">En alquiler</option>
              <option value="alquiler_temporada">Renta vacacional</option>
              <option value="traspaso">Traspaso</option>
            </select>
            <select name="tipo" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
              <option value="">Tipo</option>
              <option value="Casa">Casa</option>
              <option value="Departamento">Departamento</option>
              <option value="Oficina">Oficina</option>
              <option value="Local Comercial">Local Comercial</option>
              <option value="Terreno">Terreno</option>
            </select>
            <input
              type="text"
              name="ciudad"
              placeholder="Ciudad o zona"
              className="w-32 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as any]: brandingColor }}
            />
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              style={{ backgroundColor: brandingColor }}
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      {/* Propiedades: primero lo que esta oficina tiene publicado */}
      <main className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Propiedades destacadas</h2>
            <p className="mt-1 text-sm text-gray-500">
              Selección del catálogo de {companyName}.
            </p>
          </div>
          {catalogo.total > 0 && (
            <a
              href={catalogoUrl}
              className="text-sm font-medium hover:underline"
              style={{ color: brandingColor }}
            >
              Ver las {catalogo.total} propiedades →
            </a>
          )}
        </div>

        {catalogo.destacadas.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-lg text-gray-500">Todavía no hay propiedades publicadas.</p>
            <p className="mt-2 text-sm text-gray-400">
              Escríbenos y te contamos qué tenemos en cartera.
            </p>
            <a
              href="#contacto"
              className="mt-5 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: brandingColor }}
            >
              Contactar
            </a>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {catalogo.destacadas.map((property) => (
                <TarjetaInmueble
                  key={property.id}
                  property={property}
                  tenantSlug={tenantSlug}
                  brandingColor={brandingColor}
                />
              ))}
            </div>
            {catalogo.total > catalogo.destacadas.length && (
              <div className="mt-8 text-center">
                <a
                  href={catalogoUrl}
                  className="inline-block rounded-xl border px-6 py-3 text-sm font-medium transition hover:bg-white"
                  style={{ borderColor: brandingColor, color: brandingColor }}
                >
                  Ver todas las propiedades ({catalogo.total})
                </a>
              </div>
            )}
          </>
        )}
      </main>

      {/* Contacto: el lead nace en la cuenta de esta oficina */}
      <section id="contacto" className="border-t border-gray-200 bg-white py-14">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Hablemos de tu próxima operación</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Cuéntanos qué buscas o qué quieres vender y el equipo de {companyName} te responde con
              opciones concretas. Sin compromiso.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: brandingColor }} />
                Visitas concertadas y acompañamiento hasta la firma.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: brandingColor }} />
                Valoración de tu inmueble y estrategia de publicación.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: brandingColor }} />
                Atención directa de la oficina, sin intermediarios.
              </li>
            </ul>
          </div>

          <PortalContactForm tenantSlug={tenantSlug} brandingColor={brandingColor} />
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4">
          {logoUrl ? <img src={logoUrl} alt={companyName} className="h-6 w-auto opacity-50" /> : null}
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} {companyName}
          </p>
          <a href={catalogoUrl} className="text-xs text-gray-400 hover:text-gray-600">
            Catálogo de propiedades
          </a>
        </div>
      </footer>
    </div>
  );
}
