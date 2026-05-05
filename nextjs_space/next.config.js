const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),
    optimizePackageImports: [
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      'lucide-react',
      'react-select',
      'react-hook-form',
      'recharts',
      'date-fns',
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
    dirs: [],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  
  webpack: (config, { isServer, defaultLoaders }) => {
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

      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          minChunks: 1,
          maxAsyncRequests: 30,
          maxInitialRequests: 30,
          cacheGroups: {
            default: false,
            vendors: false,
            commons: {
              name: 'commons',
              chunks: 'all',
              minChunks: 2,
            },
            lib: {
              test: /[\\/]node_modules[\\/]/,
              name(module) {
                if (!module.context || !module.context.match) return 'vendor.misc';
                const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/);
                if (!packageName) return 'vendor.misc';
                return `vendor.${packageName[1].replace('@', '')}`;
              },
              priority: 10,
            },
            recharts: {
              test: /[\\/]node_modules[\\/](recharts|react-chartjs-2|chart\.js)[\\/]/,
              name: 'vendor.recharts',
              priority: 20,
            },
            radix: {
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              name: 'vendor.radix',
              priority: 20,
            },
            ui: {
              test: /[\\/]node_modules[\\/](lucide-react|clsx|tailwind-merge)[\\/]/,
              name: 'vendor.ui',
              priority: 20,
            },
          },
        },
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