import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright and its stealth/fingerprint dependencies are Node.js-only —
  // they use native binaries and can't be bundled by Turbopack/webpack.
  serverExternalPackages: [
    "patchright",
    "patchright-core",
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
      {
        protocol: "https",
        hostname: "productimages.microcenter.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
