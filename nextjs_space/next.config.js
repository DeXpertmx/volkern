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
  /* async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://*.stripe.com https://*.googleusercontent.com https://*.resend.com; font-src 'self' https://fonts.gstatic.com; frame-src https://js.stripe.com https://accounts.google.com; connect-src 'self' https://api.stripe.com https://*.resend.com;",
          },
        ],
      },
    ];
  }, */
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
