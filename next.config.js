/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: './tsconfig.json',
  },
  serverExternalPackages: ['@supabase/ssr'],
}

module.exports = nextConfig
