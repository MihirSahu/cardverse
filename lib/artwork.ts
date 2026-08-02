const OPTIMIZED_ARTWORK_HOSTS = new Set([
  "creditcards.chase.com",
  "icm.aexp-static.com",
]);

export function shouldBypassImageOptimization(url: string) {
  try {
    return !OPTIMIZED_ARTWORK_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return true;
  }
}
