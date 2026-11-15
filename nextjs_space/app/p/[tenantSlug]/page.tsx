import { cache, type CSSProperties } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { globalPrisma } from '@/lib/db';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { getEffectiveBranding } from '@/lib/branding';
import { parseInmuebles, type InmuebleParsed } from '@/lib/real-estate/property-helpers';
import PortalPropertyCard from '@/components/real-estate/PortalPropertyCard';
import HeroCarousel from './propiedades/HeroCarousel';
import PortalHeroMarca from '@/components/real-estate/PortalHeroMarca';
import PortalContactForm from './PortalContactForm';
import PortalAnalyticsBeacon from '@/components/real-estate/PortalAnalyticsBeacon';
import { whereCatalogoVigente } from '@/lib/real-estate/portal-vigencia';
import { colorTextoEnClaro, fondoConTextoBlanco } from '@/lib/real-estate/contraste';
import { tokensPortal } from '@/lib/real-estate/portal-templates';
import { getPlantillaPortal } from '@/lib/real-estate/portal-plantilla';
import {
  OPERACIONES_PORTAL,
  TIPOS_INMUEBLE_PORTAL,
  etiquetaOperacionPortal,
} from '@/lib/real-estate/portal-filtros';

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
  // Cartera viva: un inmueble que nadie guarda en meses no se anuncia, y los
  // contadores de la portada tienen que decir lo mismo que el catálogo.
  const base = await whereCatalogoVigente(tenantId);

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

  const [branding, catalogo, plantilla] = await Promise.all([
    getEffectiveBranding(tenant.id),
    getResumenCatalogo(tenant.id),
    getPlantillaPortal(tenant.id),
  ]);

  return {
    companyName: branding.companyName || tenant.nombre,
    brandingColor: branding.primaryColor || '#3b82f6',
    logoUrl: branding.logoUrl || '',
    claim: branding.claim || '',
    catalogo,
    plantilla,
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

  const { companyName, brandingColor, logoUrl, claim, catalogo, plantilla } = portada;
  const catalogoUrl = `/p/${tenantSlug}/propiedades`;
  // El color de marca se usa derivado: `accion` para fondos con etiqueta
  // blanca y `acento` para textos sobre blanco. Con un color claro el panel
  // sigue mostrando la marca, pero el texto deja de perderse.
  const accion = fondoConTextoBlanco(brandingColor);
  const acento = colorTextoEnClaro(brandingColor);
  const tokens = tokensPortal(plantilla);
  // El anillo de foco de los campos hereda el color de marca desde el formulario.
  const anilloMarca = { '--tw-ring-color': brandingColor } as CSSProperties;
  const claseCampo = `${tokens.radioControl} border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2`;

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
      <PortalAnalyticsBeacon slug={tenantSlug} tipo="visita_portada" />

      {/* Cabecera */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <a href={`/p/${tenantSlug}`} className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-8 w-auto" />
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white"
                style={{ backgroundColor: accion }}
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
              style={{ backgroundColor: accion }}
            >
              Ver catálogo
            </a>
          </nav>
        </div>
      </header>

      {/* Portada según la plantilla elegida por la cuenta */}
      {plantilla === 'marca' ? (
        <PortalHeroMarca
          companyName={companyName}
          brandingColor={brandingColor}
          claim={claim}
          ctaHref="#contacto"
        />
      ) : (
        <HeroCarousel
          properties={catalogo.propiedades}
          tenantSlug={tenantSlug}
          brandingColor={brandingColor}
          logoUrl={logoUrl}
          companyName={companyName}
          showLogo={false}
        />
      )}

      {/* Resumen y buscador, en una banda bajo el hero */}
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6">
          {/* Con el hero de marca el h1 ya va dentro del bloque de color. */}
          {plantilla !== 'marca' && (
            <h1 className="sr-only">{companyName} — inmuebles en venta y alquiler</h1>
          )}
          {plantilla !== 'marca' && claim && (
            <p className="mb-3 max-w-2xl text-sm text-gray-600">{claim}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            {resumen.map(({ valor, etiqueta }) => (
              <span key={etiqueta}>
                <strong className="text-base text-gray-900">{valor}</strong> {etiqueta}
              </span>
            ))}
          </div>

          {/* Buscador: reenvía al catálogo con los filtros ya puestos */}
          <form
            method="GET"
            action={catalogoUrl}
            className="mt-4 flex flex-wrap items-center gap-2"
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
              {OPERACIONES_PORTAL.map((op) => (
                <option key={op} value={op}>
                  {etiquetaOperacionPortal(op)}
                </option>
              ))}
            </select>
            <select name="tipo" aria-label="Tipo de inmueble" className={claseCampo}>
              <option value="">Tipo</option>
              {TIPOS_INMUEBLE_PORTAL.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
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
              className={`${tokens.radioControl} px-4 py-2 text-sm font-medium text-white transition hover:opacity-90`}
              style={{ backgroundColor: accion }}
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      {/* Propiedades de esta oficina */}
      <main className="mx-auto max-w-7xl px-4 py-12">
        <h2 className={`text-2xl ${tokens.titulo} text-gray-900`}>Propiedades destacadas</h2>
        <p className="mt-1 text-sm text-gray-500">Selección del catálogo de {companyName}.</p>

        {catalogo.propiedades.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-lg text-gray-500">Todavía no hay propiedades publicadas.</p>
            <p className="mt-2 text-sm text-gray-400">
              Escríbenos y te contamos qué tenemos en cartera.
            </p>
            <a
              href="#contacto"
              className={`mt-5 inline-block ${tokens.radioControl} px-4 py-2 text-sm font-medium text-white`}
              style={{ backgroundColor: accion }}
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
                  plantilla={plantilla}
                />
              ))}
            </div>
            {catalogo.total > catalogo.propiedades.length && (
              <div className="mt-8 text-center">
                <a
                  href={catalogoUrl}
                  className={`inline-block ${tokens.radio} border px-6 py-3 text-sm font-medium transition hover:bg-white`}
                  style={{ borderColor: acento, color: acento }}
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
                    style={{ backgroundColor: acento }}
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
