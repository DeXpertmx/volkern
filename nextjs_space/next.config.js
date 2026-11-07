// ═══ Bundle Analyzer ═══════════════════════════════════
// Uso: ANALYZE=true npm run build
// Genera reporte interactivo en .next/analyze/
const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')()
  : (config) => config;

const nextConfig = {
  // ═══ Output standalone ═══════════════════════════════
  // Necesario para el Dockerfile (copia .next/standalone).
  // En Vercel no afecta: Vercel usa su propio empaquetado.
  output: 'standalone',

  // ═══ ESLint ════════════════════════════════════════════
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ═══ TypeScript ════════════════════════════════════════
  typescript: {
    ignoreBuildErrors: true,
  },

  // ═══ Images ════════════════════════════════════════════
  images: { unoptimized: true },

  // ═══ Experimental ══════════════════════════════════════
  // Optimiza imports de librerías con barrel exports,
  // transformándolos automáticamente en imports por módulo
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'lodash',
      'date-fns',
    ],
    instrumentationHook: true,

    // ═══ Server Components External Packages ══════════════════
    // Excluir pino y thread-stream del bundling de Next.js
    // para que los worker threads (pino/lib/worker.js) puedan
    // resolverse correctamente desde node_modules.
    // (En Next 14 la clave válida es experimental.*; la top-level
    //  serverExternalPackages no existe hasta versiones posteriores.)
    serverComponentsExternalPackages: ['pino', 'thread-stream'],
  },

  // ═══ Rewrites ═══════════════════════════════════════
  // Mapear rutas de documentación a archivos estáticos en public/
  async rewrites() {
    return [
      {
        source: '/api/partner',
        destination: '/docs/partner-api.html',
      },
      // Alias: /docs/partner → /docs/redoc (la UI interactiva Redoc).
      // Mantiene compatibilidad con enlaces legacy a /docs/partner en docs
      // y README; /docs/redoc sigue siendo la URL canónica.
      {
        source: '/docs/partner',
        destination: '/docs/redoc',
      },
    ];
  },

  // ═══ Headers ═══════════════════════════════════════════
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        // Widget embebible: caché corta y revalidable para que una corrección
        // del script llegue a las webs que lo tienen embebido.
        source: '/propiedades-embed.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ]
  },

  // ═══ Redirects (301) ═══════════════════════════════════
  // Redirigir rutas antiguas de landings verticales a /soluciones/
  async redirects() {
    return [
      {
        source: '/real-estate',
        destination: '/soluciones/real-estate',
        permanent: true,
      },
      {
        source: '/accounting',
        destination: '/soluciones/accounting',
        permanent: true,
      },
      {
        source: '/marketing',
        destination: '/soluciones/marketing',
        permanent: true,
      },
      {
        source: '/academy',
        destination: '/soluciones/academy',
        permanent: true,
      },
      {
        source: '/rrhh',
        destination: '/soluciones/rrhh',
        permanent: true,
      },
      {
        source: '/crm-ventas',
        destination: '/soluciones/crm-ventas',
        permanent: true,
      },
    ];
  },

};

module.exports = withBundleAnalyzer(nextConfig);