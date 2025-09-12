/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your other Next.js config options can go here
  
  // Allow external images from Google Cloud Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/finanseal-logo/**',
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

  // Exclude from static analysis
  experimental: {
    typedRoutes: false,
  },

  // Disable React StrictMode in development to prevent double-firing
  // This prevents useEffect from running twice in development mode
  reactStrictMode: false,
};

export default nextConfig;