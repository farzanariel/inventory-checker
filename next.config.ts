import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pisces.bbystatic.com",
        pathname: "/image2/BestBuy_US/images/products/**",
      },
    ],
  },
};

export default nextConfig;
