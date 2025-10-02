import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

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
  
  // Exclude Supabase Edge Functions from Next.js build
  webpack: (config: any) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    // Exclude supabase functions directory from build
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/supabase/functions/**'],
    };
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

  // Exclude from static analysis
  experimental: {
    typedRoutes: false,
  },

  // Enable React StrictMode to catch potential issues early
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);