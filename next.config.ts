/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your other Next.js config options can go here
  
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
};

export default nextConfig;