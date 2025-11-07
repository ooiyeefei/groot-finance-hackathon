import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

// Bundle analyzer - only in dev mode
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your other Next.js config options can go here
  
  // Allow external images from Google Cloud Storage and Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https' as const,
        hostname: 'storage.googleapis.com',
        pathname: '/finanseal-logo/**',
      },
      {
        protocol: 'https' as const,
        hostname: 'ohxwghdgsuyabgsndfzc.supabase.co',
        pathname: '/storage/v1/object/public/business-profiles/**',
      },
    ],
  },
  
  // Performance optimizations and bundle analysis
  webpack: (config: any, { dev, isServer }: { dev: boolean, isServer: boolean }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };

    // Exclude supabase functions directory from build
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/supabase/functions/**'],
    };

    // ✅ PERFORMANCE OPTIMIZATION: Enhanced production optimizations
    if (!dev && !isServer) {
      // Enable tree shaking for better bundle optimization
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;

      // ✅ PERFORMANCE FIX: Force minification for all JS files (addresses 167 KiB unminified JS issue)
      config.optimization.minimize = true;

      // Note: SWC minifier is enabled by default in Next.js 15.5+ - no additional config needed

      // Split chunks for better caching
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000, // Minimum chunk size (20KB)
        maxSize: 244000, // Maximum chunk size (244KB)
        cacheGroups: {
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: -10,
            chunks: 'all',
          },
          // Separate chunks for heavy libraries
          recharts: {
            test: /[\\/]node_modules[\\/]recharts[\\/]/,
            name: 'recharts',
            priority: 10,
            chunks: 'all',
          },
          lucide: {
            test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
            name: 'lucide',
            priority: 10,
            chunks: 'all',
          },
          // ✅ PERFORMANCE OPTIMIZATION: Separate large UI components
          clerk: {
            test: /[\\/]node_modules[\\/]@clerk[\\/]/,
            name: 'clerk',
            priority: 15,
            chunks: 'all',
          },
          // Separate translation files for better caching
          translations: {
            test: /[\\/]src[\\/]messages[\\/].*\.json$/,
            name: 'translations',
            priority: 15,
            chunks: 'all',
          },
        },
      };

      // ✅ PERFORMANCE OPTIMIZATION: Remove legacy browser support for smaller bundles
      config.target = ['web', 'es2017']; // Modern browsers only (reduces polyfill overhead)
    }

    return config;
  },

  // Exclude supabase directory from type checking
  typescript: {
    ignoreBuildErrors: false,
  },

  // Temporarily ignore ESLint during builds - will address warnings in separate task
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Typed routes configuration (moved from experimental in Next.js 15.5+)
  typedRoutes: false,

  // Performance and experimental features
  experimental: {
    // Increase Server Actions body size limit for file uploads (5MB to match business profile validation)
    serverActions: {
      bodySizeLimit: 5 * 1024 * 1024, // 5MB in bytes to match business profile component limit
    },
    // ✅ PERFORMANCE OPTIMIZATION: Enable advanced optimizations
    optimizePackageImports: ['lucide-react', '@clerk/nextjs'], // Tree shake large packages
    // Note: optimizeCss removed due to critters dependency issues
  },

  // Performance optimizations for production
  productionBrowserSourceMaps: false, // Disable source maps in production for smaller builds
  poweredByHeader: false, // Remove X-Powered-By header
  compress: true, // Enable gzip compression

  // ✅ PERFORMANCE OPTIMIZATION: SWC minifier enabled by default in Next.js 15.5+
  // Note: swcMinify option is deprecated - SWC is the default minifier

  // Enable React StrictMode to catch potential issues early
  reactStrictMode: true,

  // IMPORTANT: 'standalone' output mode is incompatible with Vercel's Edge Runtime
  // Removing this allows Vercel to properly detect and execute middleware
  // output: 'standalone' as const,  // Commented out for Vercel deployment
};

export default withBundleAnalyzer(withNextIntl(nextConfig));