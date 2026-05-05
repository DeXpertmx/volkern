const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),
  },
  eslint: {
    ignoreDuringBuilds: true,
    dirs: [],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.filename = 'static/chunks/[name]-[contenthash:8].js';
      config.output.chunkFilename = 'static/chunks/[contenthash:16].js';
      
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/lib/skills$': false,
        '@/lib/skills/': false,
        '@/lib/workers$': false,
        '@/lib/telegram$': false,
      };
    } else {
      config.externals = [
        ...(config.externals || []),
        'gocardless-nodejs',
      ];
    }

    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false,
      stream: false,
      buffer: false,
      events: false,
      util: false,
      path: false,
      os: false,
      net: false,
      tls: false,
      http: false,
      https: false,
      zlib: false,
      assert: false,
      querystring: false,
      fs: false,
      child_process: false,
      worker_threads: false,
    };

    config.ignoreWarnings = config.ignoreWarnings || [];

    return config;
  },
};

module.exports = nextConfig;