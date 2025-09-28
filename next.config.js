/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: './tsconfig.json',
  },
  output: 'standalone',
  serverExternalPackages: ['@supabase/ssr'],
}

module.exports = nextConfig
