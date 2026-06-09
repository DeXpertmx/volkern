// ═══ Bundle Analyzer ═══════════════════════════════════
// Uso: ANALYZE=true npm run build
// Genera reporte interactivo en .next/analyze/
const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')()
  : (config) => config;

const nextConfig = {
  // ═══ Build Output ═══════════════════════════════════════
  // Modo standalone: genera carpeta autocontenida para producción (VPS/Docker)
  // Reduce drásticamente el tamaño del artifact de deploy
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
    // ═══ Server External Packages ═════════════════════════
    // Excluir pino y thread-stream del bundling de Next.js
    // para que los worker threads (pino/lib/worker.js) puedan
    // resolverse correctamente desde node_modules
    serverComponentsExternalPackages: ['pino', 'thread-stream'],
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
      {
        source: '/logistica',
        destination: '/soluciones/logistica',
        permanent: true,
      },
    ];
  },

  // ═══ Output File Tracing ═══════════════════════════════
  // Reduce tamaño del build standalone excluyendo archivos
  // que no son necesarios en producción
  outputFileTracingExcludes: {
    '/**': [
      // Chromium de puppeteer ya no incluido — usamos Chrome del sistema
      // (puppeteer-core no descarga Chromium, el patrón es innecesario)
      // Prisma engine binaries para otros SOs (solo Linux x64 necesario)
      '**/prisma/engines/introspection-engine*',
      '**/prisma/engines/migration-engine*',
      '**/prisma/engines/prisma-fmt*',
      // Documentación empaquetada de dependencias
      '**/*.md',
      '**/*.markdown',
      '**/CHANGELOG*',
      '**/LICENSE*',
    ],
  },
};

module.exports = withBundleAnalyzer(nextConfig);