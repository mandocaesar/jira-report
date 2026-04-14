import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'secure.gravatar.com',
      },
      {
        protocol: 'https',
        hostname: 'avatar-management--avatars.us-west-2.prod.public.atl-paas.net',
      },
    ],
  },
  async redirects() {
    return [
      { source: '/squads', destination: '/metrics', permanent: true },
      { source: '/squads/:id', destination: '/organisation/squads/:id', permanent: true },
      { source: '/settings/leave', destination: '/planning/capacity', permanent: true },
      { source: '/settings/team', destination: '/organisation/squads', permanent: true },
      { source: '/reports/team', destination: '/organisation/squads', permanent: true },
      { source: '/sprint-performance', destination: '/analytics', permanent: true },
      { source: '/planning/velocity', destination: '/analytics', permanent: true },
      { source: '/metrics', destination: '/analytics', permanent: true },
    ];
  },
};

export default nextConfig;
