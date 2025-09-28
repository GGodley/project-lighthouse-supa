/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@supabase/ssr'],
  },
}

module.exports = nextConfig
