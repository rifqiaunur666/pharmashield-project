/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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