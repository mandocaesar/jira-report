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
};

export default nextConfig;
