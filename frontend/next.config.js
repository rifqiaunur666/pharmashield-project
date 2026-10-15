/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      {
        // Static assets: cache aggressively (1 year)
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Fonts and images: cache for 30 days
        source: '/:path*.(woff|woff2|png|jpg|jpeg|webp|svg|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://pharmashield-project-production.up.railway.app/api/:path*',
      },
      {
        source: '/docs',
        destination: 'https://pharmashield-project-production.up.railway.app/docs',
      },
      {
        source: '/openapi.json',
        destination: 'https://pharmashield-project-production.up.railway.app/openapi.json',
      },
      {
        source: '/redoc',
        destination: 'https://pharmashield-project-production.up.railway.app/redoc',
      },
    ];
  },
};

module.exports = nextConfig;