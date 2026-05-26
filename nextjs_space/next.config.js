const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  // Excluir pino y thread-stream del bundling de Next.js
  // para que los worker threads (pino/lib/worker.js) puedan
  // resolverse correctamente desde node_modules
  serverExternalPackages: ['pino', 'thread-stream'],
};

module.exports = nextConfig;