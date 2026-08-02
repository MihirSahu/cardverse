export type CardFilter =
  | "all"
  | "travel"
  | "cash-back"
  | "dining"
  | "groceries"
  | "gas"
  | "no-annual-fee"
  | "no-foreign-fee"
  | "intro-apr";

export type RewardRate = {
  category: string;
  label: string;
  rate: number;
  type: "multiplier" | "cashback_percent";
  cap?: number | null;
  capPeriod?: string | null;
};

export type WelcomeOffer = {
  amount: string;
  requirement?: string;
};

export type WorldPosition = {
  x: number;
  y: number;
  scale: number;
  depth: "near" | "mid" | "far";
};

export type CardDataSource = "cardapi" | "editorial-fallback";

export type Card = {
  id: string;
  name: string;
  shortName: string;
  issuer: string;
  network: string;
  category: string;
  annualFee: number;
  annualFeeLabel: string;
  foreignTransactionFee: string;
  purchaseApr: string;
  welcomeOffer: WelcomeOffer | null;
  rewardRates: RewardRate[];
  rewardSummary: string;
  benefits: string[];
  applicationRules: string[];
  editorialSummary: string;
  goodToKnow: string;
  filters: CardFilter[];
  artworkUrl: string;
  issuerUrl: string;
  ratesAndFeesUrl: string;
  updatedAt: string;
  dataSource: CardDataSource;
  world: WorldPosition;
};

export const FILTERS: Array<{ id: CardFilter; label: string }> = [
  { id: "all", label: "All cards" },
  { id: "travel", label: "Travel" },
  { id: "cash-back", label: "Cash back" },
  { id: "dining", label: "Dining" },
  { id: "groceries", label: "Groceries" },
  { id: "gas", label: "Gas" },
  { id: "no-annual-fee", label: "No annual fee" },
  { id: "no-foreign-fee", label: "No foreign fee" },
  { id: "intro-apr", label: "Intro APR" },
];
