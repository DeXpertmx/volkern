// ═══ Bundle Analyzer ═══════════════════════════════════
// Uso: ANALYZE=true npm run build
// Genera reporte interactivo en .next/analyze/
const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')()
  : (config) => config;

const nextConfig = {
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
  },

  // ═══ Server External Packages ═════════════════════════
  // Excluir pino y thread-stream del bundling de Next.js
  // para que los worker threads (pino/lib/worker.js) puedan
  // resolverse correctamente desde node_modules
  serverExternalPackages: ['pino', 'thread-stream'],

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