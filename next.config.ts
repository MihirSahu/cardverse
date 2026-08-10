import type { NextConfig } from "next";

import { optimizedArtworkPatterns } from "./lib/artwork";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3"],
  images: {
    remotePatterns: optimizedArtworkPatterns.map((pattern) => ({
      protocol: "https" as const,
      hostname: pattern.hostname,
      pathname: `${pattern.pathnamePrefix}**`,
    })),
  },
};

export default nextConfig;
