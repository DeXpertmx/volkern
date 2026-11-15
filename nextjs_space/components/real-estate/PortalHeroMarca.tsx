import { fondoHeroMarca } from '@/lib/real-estate/contraste';

/**
 * Portada de la plantilla «hero de marca»: el bloque de color de la cuenta.
 *
 * El texto y el degradado salen de `fondoHeroMarca`, que elige blanco o casi
 * negro según la luminancia del color y ajusta el fondo hasta cumplir contraste:
 * una cuenta con amarillo no acaba con un titular blanco ilegible.
 */
/**
 * @param ctaHref Destino del botón. Es opcional a propósito: el catálogo no
 *   tiene sección de contacto, así que ahí no se pinta un enlace a `#contacto`
 *   que no lleva a ninguna parte.
 */
export default function PortalHeroMarca({
  companyName,
  brandingColor,
  ctaHref,
}: {
  companyName: string;
  brandingColor: string;
  ctaHref?: string;
}) {
  const { base, fin, texto } = fondoHeroMarca(brandingColor);

  return (
    <section
      className="w-full"
      style={{ backgroundImage: `linear-gradient(135deg, ${base} 0%, ${fin} 100%)`, color: texto }}
    >
      <div className="mx-auto max-w-7xl px-4 py-14 md:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
          Inmobiliaria
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight md:text-5xl">{companyName}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-90 md:text-base">
          Compra, venta y alquiler de inmuebles con atención directa de la oficina.
        </p>
        {ctaHref && (
          <a
            href={ctaHref}
            className="mt-7 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition hover:opacity-90"
            style={{ borderColor: `${texto}66`, color: texto }}
          >
            Hablar con la oficina
          </a>
        )}
      </div>
    </section>
  );
}
