/**
 * /docs/redoc
 *
 * Página de documentación interactiva de la API externa v1, montada con
 * Redoc Standalone (bundle oficial Redocly via CDN). Carga la especificación
 * OpenAPI 3.0 generada desde `/public/openapi.json` (regenerada por
 * `npm run openapi:generate` en `prebuild`).
 *
 * Por qué client component: `<redoc>` es un custom element del bundle
 * Redocly; necesita ejecutarse en el navegador.
 */

export const dynamic = 'force-static';

export const metadata = {
  title: 'Volkern API · Documentación',
  description:
    'Documentación interactiva de la API externa v1 de Volkern (POST /v1/invoices, Verifactu).',
  robots: {
    index: true,
    follow: true,
  },
};

export default function RedocPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Redocly standalone bundle (UMD). Carga única ~600KB. */}
      <script
        src="https://cdn.redocly.com/redoc/latest/bundles/redoc.standalone.js"
        async
      />

      {/* El custom element <redoc> se monta con el spec URL relativo
          al mismo origen /docs/redoc → /openapi.json. */}
      <div id="redoc-container" className="w-full">
        {/* @ts-expect-error - <redoc> es un custom element registrado
            por el bundle Redocly. */}
        <redoc
          spec-url="/openapi.json"
          hide-download-button="false"
          expand-responses="200,201"
          json-sample-expand-level="2"
          path-in-middle-panel="true"
          required-props-first="true"
          sort-props-alphabetically="false"
          theme={JSON.stringify({
            colors: {
              primary: {
                main: '#2563eb',
              },
              success: { main: '#16a34a' },
              warning: { main: '#f59e0b' },
              error: { main: '#dc2626' },
              text: { primary: '#0f172a', secondary: '#475569' },
              background: { canvas: '#ffffff', section: '#f8fafc' },
            },
            typography: {
              fontSize: '15px',
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              headings: {
                fontFamily: 'inherit',
                fontWeight: '600',
              },
              code: {
                fontSize: '13px',
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              },
            },
            sidebar: {
              backgroundColor: '#f8fafc',
              width: '260px',
            },
            rightPanel: {
              backgroundColor: '#1e293b',
              textColor: '#f8fafc',
            },
          })}
          scroll-y-offset="0"
        />
      </div>

      {/* Fallback inmediato (mientras se carga el bundle CDN) */}
      <noscript>
        <div className="p-8 text-center text-gray-700">
          Esta página requiere JavaScript activo para renderizar Redoc. La
          especificación OpenAPI está disponible en
          {' '}
          <a href="/openapi.json" className="text-blue-600 underline">
            /openapi.json
          </a>
          .
        </div>
      </noscript>
    </main>
  );
}
