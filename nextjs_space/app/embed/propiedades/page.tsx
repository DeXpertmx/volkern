import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vista previa · Widget de propiedades',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function valorUnico(valor: string | string[] | undefined): string | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return typeof texto === 'string' && texto.trim() ? texto : undefined;
}

/**
 * Serializa un objeto para incrustarlo en un <script> inline sin permitir que
 * un valor con `</script>` cierre la etiqueta antes de tiempo.
 */
function serializarSeguro(valor: unknown): string {
  return JSON.stringify(valor).replace(/</g, '\\u003c');
}

/**
 * Página mínima que carga el widget real de propiedades con la configuración
 * elegida en el panel. Se usa como iframe de vista previa dentro del dashboard,
 * de modo que el cliente ve exactamente el resultado antes de pegar el código.
 *
 * Es pública (el middleware deja pasar `/embed/`) porque no expone nada que la
 * API pública de propiedades no devuelva ya.
 */
export default async function EmbedPreviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tenantId = valorUnico(params.tenantId);

  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <p className="max-w-md text-center text-sm text-gray-500">
          Falta el identificador de la cuenta (tenantId) para generar la vista previa.
        </p>
      </main>
    );
  }

  const atributos: Record<string, string> = { 'data-tenant-id': tenantId };

  const titulo = valorUnico(params.titulo);
  if (titulo) atributos['data-titulo'] = titulo;

  const subtitulo = valorUnico(params.subtitulo);
  if (subtitulo) atributos['data-subtitulo'] = subtitulo;

  const color = valorUnico(params.color);
  if (color) atributos['data-color'] = color;

  const limite = valorUnico(params.limite);
  if (limite) atributos['data-limite'] = limite;

  if (valorUnico(params.modo) === 'lista') atributos['data-modo'] = 'lista';

  const operacion = valorUnico(params.operacion);
  if (operacion) atributos['data-operacion'] = operacion;

  if (valorUnico(params.destacadas) === '1') {
    atributos['data-solo-destacadas'] = 'true';
  }

  if (valorUnico(params.verTodas) === '0') {
    atributos['data-ver-todas'] = 'false';
  }

  // El widget localiza su contenedor y su configuración al ejecutarse; se
  // inyecta como script clásico para que `document.currentScript` (o el fallback
  // por atributos) apunte a este tag.
  const bootstrap = `(function(){var a=${serializarSeguro(atributos)};var s=document.createElement('script');s.src='/propiedades-embed.js';s.async=true;for(var k in a){if(Object.prototype.hasOwnProperty.call(a,k)){s.setAttribute(k,a[k]);}}document.body.appendChild(s);})();`;

  return (
    <main className="min-h-screen bg-white px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div id="volkern-propiedades" />
        <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      </div>
    </main>
  );
}
