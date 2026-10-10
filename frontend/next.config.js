/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://pharmashield-project-production.up.railway.app/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;