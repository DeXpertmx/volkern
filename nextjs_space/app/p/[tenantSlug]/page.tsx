import { cache, type CSSProperties } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { globalPrisma } from '@/lib/db';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { getEffectiveBranding } from '@/lib/branding';
import { parseInmuebles, type InmuebleParsed } from '@/lib/real-estate/property-helpers';
import PortalPropertyCard from '@/components/real-estate/PortalPropertyCard';
import PortalContactForm from './PortalContactForm';

export const revalidate = 60;

interface Props {
  params: Promise<{ tenantSlug: string }>;
}

interface ResumenCatalogo {
  propiedades: InmuebleParsed[];
  total: number;
  enVenta: number;
  enAlquiler: number;
}

/**
 * Inmuebles de la portada: los de la cuenta, con los destacados arriba.
 *
 * El orden lo resuelve la consulta (`destacado desc`): la portada de una oficina
 * enseña su cartera, no la de la matriz.
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

  return { propiedades: parseInmuebles(items), total, enVenta, enAlquiler };
}

/**
 * Datos de la portada de una cuenta: tenant, marca y catálogo.
 *
 * `cache` es por petición, así que `generateMetadata` y la página comparten una
 * sola resolución del tenant en vez de hacer cada una su `findUnique`. No cachea
 * entre peticiones: de eso se encarga `revalidate`.
 */
const cargarPortada = cache(async (tenantSlug: string) => {
  const tenant = await resolveTenantBySlug(tenantSlug);
  if (!tenant) return null;

  const [branding, catalogo] = await Promise.all([
    getEffectiveBranding(tenant.id),
    getResumenCatalogo(tenant.id),
  ]);

  return {
    companyName: branding.companyName || tenant.nombre,
    brandingColor: branding.primaryColor || '#3b82f6',
    logoUrl: branding.logoUrl || '',
    catalogo,
  };
});

/**
 * Home del portal público de una cuenta (matriz o franquiciado).
 *
 * Es la misma plantilla para toda la red: el diseño no se copia por oficina, se
 * alimenta con su marca y su catálogo.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug } = await params;
  const portada = await cargarPortada(tenantSlug);
  if (!portada) return { title: 'Portal no encontrado' };

  const { companyName, logoUrl } = portada;
  const title = `${companyName} | Inmuebles en venta y alquiler`;

  return {
    title,
    description: `Catálogo de propiedades de ${companyName}. Contacta directamente con la oficina para visitas y consultas.`,
    openGraph: {
      title,
      description: `Catálogo de propiedades de ${companyName}.`,
      type: 'website',
      ...(logoUrl ? { images: [{ url: logoUrl }] } : {}),
    },
  };
}

export default async function PortalHomePage({ params }: Props) {
  const { tenantSlug } = await params;
  const portada = await cargarPortada(tenantSlug);
  if (!portada) notFound();

  const { companyName, brandingColor, logoUrl, catalogo } = portada;
  const catalogoUrl = `/p/${tenantSlug}/propiedades`;
  // El anillo de foco de los campos hereda el color de marca desde el formulario.
  const anilloMarca = { '--tw-ring-color': brandingColor } as CSSProperties;
  const claseCampo =
    'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2';

  const resumen = [
    {
      valor: catalogo.total,
      etiqueta: catalogo.total === 1 ? 'propiedad publicada' : 'propiedades publicadas',
    },
    ...(catalogo.enVenta > 0 ? [{ valor: catalogo.enVenta, etiqueta: 'en venta' }] : []),
    ...(catalogo.enAlquiler > 0 ? [{ valor: catalogo.enAlquiler, etiqueta: 'en alquiler' }] : []),
  ];

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
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
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
            Compra, venta y alquiler de inmuebles con atención directa de la oficina.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-white/80">
            {resumen.map(({ valor, etiqueta }) => (
              <span key={etiqueta}>
                <strong className="text-base text-white">{valor}</strong> {etiqueta}
              </span>
            ))}
          </div>

          {/* Buscador: reenvía al catálogo con los filtros ya puestos */}
          <form
            method="GET"
            action={catalogoUrl}
            className="mt-8 flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 p-3 shadow-xl"
            style={anilloMarca}
          >
            <input
              type="text"
              name="q"
              aria-label="Buscar por nombre o descripción"
              placeholder="Buscar por nombre o descripción…"
              className={`min-w-[180px] flex-1 ${claseCampo}`}
            />
            <select name="operacion" aria-label="Operación" className={claseCampo}>
              <option value="">Operación</option>
              <option value="venta">En venta</option>
              <option value="alquiler">En alquiler</option>
              <option value="alquiler_temporada">Renta vacacional</option>
              <option value="traspaso">Traspaso</option>
            </select>
            <select name="tipo" aria-label="Tipo de inmueble" className={claseCampo}>
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
              aria-label="Ciudad o zona"
              placeholder="Ciudad o zona"
              className={`w-32 ${claseCampo}`}
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

      {/* Propiedades de esta oficina */}
      <main className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="text-2xl font-bold text-gray-900">Propiedades destacadas</h2>
        <p className="mt-1 text-sm text-gray-500">Selección del catálogo de {companyName}.</p>

        {catalogo.propiedades.length === 0 ? (
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
              {catalogo.propiedades.map((property) => (
                <PortalPropertyCard
                  key={property.id}
                  property={property}
                  tenantSlug={tenantSlug}
                  brandingColor={brandingColor}
                />
              ))}
            </div>
            {catalogo.total > catalogo.propiedades.length && (
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
              {[
                'Visitas concertadas y acompañamiento hasta la firma.',
                'Valoración de tu inmueble y estrategia de publicación.',
                'Atención directa de la oficina, sin intermediarios.',
              ].map((ventaja) => (
                <li key={ventaja} className="flex items-start gap-2">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: brandingColor }}
                  />
                  {ventaja}
                </li>
              ))}
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
