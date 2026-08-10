export const pendingArtworkUrl = "/cards/artwork-pending.svg";

export const optimizedArtworkPatterns = [
  {
    hostname: "creditcards.chase.com",
    pathnamePrefix: "/content/dam/jpmc-marketplace/card-art/",
  },
  {
    hostname: "icm.aexp-static.com",
    pathnamePrefix: "/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/",
  },
  {
    hostname: "icm.aexp-static.com",
    pathnamePrefix: "/acquisition/card-art/",
  },
] as const;

export function shouldBypassImageOptimization(url: string) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    return !optimizedArtworkPatterns.some((pattern) =>
      hostname === pattern.hostname && pathname.startsWith(pattern.pathnamePrefix),
    );
  } catch {
    return true;
  }
}
