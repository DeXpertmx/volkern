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
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.filename = 'static/chunks/[name]-[contenthash:8].js';
      config.output.chunkFilename = 'static/chunks/[contenthash:16].js';
    }

    // Suprimir warning de "Critical dependency" de gocardless-nodejs → keyv
    // Es un false-positive conocido del patrón de require dinámico de keyv
    config.plugins = config.plugins || [];
    const { IgnorePlugin } = require('webpack');
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /node_modules\/keyv\/src\/index\.js/,
        message: /Critical dependency/,
      },
      {
        module: /node_modules\/cacheable-request/,
        message: /Critical dependency/,
      },
    ];

    return config;
  },

};

module.exports = nextConfig;
