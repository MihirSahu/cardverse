import { fallbackCards, pendingArtworkUrl } from "@/lib/fallback-cards";
import type { ArtworkOrientation, CardFilter, WorldPosition } from "@/lib/types";

export type EditorialCardConfig = {
  cardId: string;
  cardApiSlug: string | null;
  displayRank: number;
  category: string;
  featuredCategories: CardFilter[];
  editorialSummary: string;
  goodToKnow: string;
  issuerUrl: string;
  ratesAndFeesUrl: string;
  artworkAsset?: string;
  artworkOrientation: ArtworkOrientation;
  world: WorldPosition;
};

// Only mappings confirmed against CardAPI are listed here. Every other curated
// card remains available from issuer-reviewed editorial data and can receive a
// provider mapping later without changing the database schema.
const cardApiSlugs: Record<string, string> = {
  "amex-gold": "american-express-gold-card",
  "amex-platinum": "american-express-platinum-card",
  "amex-blue-cash-preferred": "blue-cash-preferred-card",
  "amex-blue-cash-everyday": "blue-cash-everyday-card",
  "capital-one-venture-x": "capital-one-venture-x",
  "capital-one-savor-excellent": "savor-rewards-from-capital-one",
  "capital-one-quicksilver-excellent": "quicksilver-cash-back-rewards-card",
  "citi-strata-premier": "citi-strata-premier-card",
  "citi-double-cash": "citi-double-cash-credit-card",
  "wells-fargo-active-cash": "wells-fargo-active-cash-credit-card",
  "wells-fargo-autograph": "wells-fargo-autograph-card",
  "bank-of-america-customized-cash-rewards": "bank-of-america-customized-cash-rewards-credit-card",
  "bank-of-america-travel-rewards": "bank-of-america-travel-rewards-credit-card",
  "discover-it-cash-back": "discover-it-cash-back-credit-card",
  "discover-it-student-cash-back": "discover-it-student-cash-back-card",
  "us-bank-altitude-connect": "us-bank-altitude-connect-visa-signature-card",
  "us-bank-cash-plus": "us-bank-cash-visa-signature-card",
};

export const editorialCardCatalog: EditorialCardConfig[] = fallbackCards.map((card, index) => ({
  cardId: card.id,
  cardApiSlug: cardApiSlugs[card.id] ?? null,
  displayRank: index + 1,
  category: card.category,
  featuredCategories: card.filters,
  editorialSummary: card.editorialSummary,
  goodToKnow: card.goodToKnow,
  issuerUrl: card.issuerUrl,
  ratesAndFeesUrl: card.ratesAndFeesUrl,
  artworkAsset: card.artworkUrl === pendingArtworkUrl ? undefined : card.artworkUrl,
  artworkOrientation: card.artworkOrientation,
  world: card.world,
}));
