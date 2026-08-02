import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "creditcards.chase.com",
        pathname: "/content/dam/jpmc-marketplace/card-art/**",
      },
      {
        protocol: "https",
        hostname: "icm.aexp-static.com",
        pathname: "/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/**",
      },
    ],
  },
};

export default nextConfig;
