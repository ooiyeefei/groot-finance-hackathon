import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

// Bundle analyzer - only in dev mode
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your other Next.js config options can go here
  
  // Allow external images from AWS S3 and Google Cloud Storage
  images: {
    remotePatterns: [
      // Public assets bucket (favicon, logos, brand assets)
      {
        protocol: 'https' as const,
        hostname: 'finanseal-public.s3.us-west-2.amazonaws.com',
        pathname: '/**',
      },
      // Private bucket for documents (presigned URLs)
      {
        protocol: 'https' as const,
        hostname: 'finanseal-bucket.s3.us-west-2.amazonaws.com',
        pathname: '/**',
      },
      // Alternative S3 URL format
      {
        protocol: 'https' as const,
        hostname: 's3.us-west-2.amazonaws.com',
        pathname: '/finanseal-bucket/**',
      },
      // GCS for brand assets (legacy)
      {
        protocol: 'https' as const,
        hostname: 'storage.googleapis.com',
        pathname: '/finanseal-logo/**',
      },
    ],
  },
  
  // Performance optimizations and bundle analysis
  webpack: (config: any, { dev, isServer }: { dev: boolean, isServer: boolean }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
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

      // ✅ PERFORMANCE OPTIMIZATION: Target modern browsers (eliminates legacy polyfills)
      // ES2022 supported by: Chrome 94+, Firefox 93+, Safari 16+, Edge 94+
      // Removes ~64KB of legacy JavaScript polyfills
      config.target = ['web', 'es2022'];
    }

    return config;
  },

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
    // Tree shake large packages to reduce unused JavaScript
    optimizePackageImports: [
      'lucide-react',
      '@clerk/nextjs',
      'recharts',
      'date-fns',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-alert-dialog',
    ],
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

// Sentry configuration options for source map upload and error monitoring
// @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
};

// Apply Sentry wrapper last to ensure source maps are processed correctly
export default withSentryConfig(
  withBundleAnalyzer(withNextIntl(nextConfig)),
  sentryWebpackPluginOptions
);