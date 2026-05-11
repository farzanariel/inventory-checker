import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright and its stealth/fingerprint dependencies are Node.js-only —
  // they use native binaries and can't be bundled by Turbopack/webpack.
  serverExternalPackages: [
    "playwright",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth",
    "fingerprint-generator",
    "fingerprint-injector",
  ],
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
