import "server-only";

import { CardDB, type Card as CardApiCard, type RewardRate as CardApiRewardRate } from "@cardapi/client";
import { unstable_cache } from "next/cache";

import { editorialCardCatalog, type EditorialCardConfig } from "@/lib/card-catalog";
import { fallbackCards } from "@/lib/fallback-cards";
import type { Card, CardFilter, RewardRate } from "@/lib/types";

const CARD_CACHE_SECONDS = 24 * 60 * 60;
const CARDAPI_TIMEOUT_MS = 8_000;
const FACT_DERIVED_FILTERS = new Set<CardFilter>(["no-annual-fee", "no-foreign-fee", "intro-apr"]);

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeRewardRates(rates: CardApiRewardRate[] | undefined): RewardRate[] | null {
  if (!rates?.length) return null;

  const normalized = rates
    .filter((rate) => Boolean(rate.category_slug) && typeof rate.rate_multiplier === "number")
    .map((rate) => ({
      category: rate.category_slug!,
      label: titleCase(rate.category_slug!),
      rate: rate.rate_multiplier,
      type: rate.rate_type === "percent_cashback" ? "cashback_percent" as const : "multiplier" as const,
      cap: rate.cap_amount,
      capPeriod: rate.cap_period,
    }))
    .sort((first, second) => second.rate - first.rate);

  return normalized.length ? normalized : null;
}

function formatRewardSummary(rates: RewardRate[]) {
  return rates
    .slice(0, 2)
    .map((rate) => `${rate.rate}${rate.type === "multiplier" ? "×" : "%"} ${rate.label.toLowerCase()}`)
    .join(" · ");
}

function normalizeApplicationRules(value: string | null) {
  if (!value) return [];
  return value
    .split(/\r?\n|;\s+/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function isConsumerCardAvailable(live: CardApiCard) {
  const country = live.issuers?.country.trim().toUpperCase();
  const isUnitedStates = country === "US" || country === "USA" || country === "UNITED STATES";

  return isUnitedStates &&
    live.card_type !== "business" &&
    live.is_active &&
    live.is_published &&
    live.is_discontinued !== true;
}

function selectApprovedUrl(candidate: string | null | undefined, approvedFallback: string) {
  if (!candidate) return approvedFallback;

  try {
    const candidateUrl = new URL(candidate);
    const approvedUrl = new URL(approvedFallback);
    const candidateHost = candidateUrl.hostname.toLowerCase().replace(/^www\./, "");
    const approvedHost = approvedUrl.hostname.toLowerCase().replace(/^www\./, "");
    const isApprovedHost = candidateHost === approvedHost ||
      candidateHost.endsWith(`.${approvedHost}`);

    return candidateUrl.protocol === "https:" && isApprovedHost ? candidateUrl.toString() : approvedFallback;
  } catch {
    return approvedFallback;
  }
}

function deriveFilters(
  baselineFilters: CardFilter[],
  live: CardApiCard,
  annualFee: number,
  foreignTransactionFee: number | null,
) {
  const filters = new Set(baselineFilters.filter((filter) => !FACT_DERIVED_FILTERS.has(filter)));

  if (annualFee === 0) filters.add("no-annual-fee");
  if (foreignTransactionFee === 0) filters.add("no-foreign-fee");

  const hasLiveIntroAprFields = live.intro_apr_purchase !== undefined ||
    live.intro_apr_balance_transfer !== undefined;
  const hasIntroApr = hasLiveIntroAprFields
    ? live.intro_apr_purchase != null || live.intro_apr_balance_transfer != null
    : baselineFilters.includes("intro-apr");
  if (hasIntroApr) filters.add("intro-apr");

  return Array.from(filters);
}

function formatWelcomeAmount(live: CardApiCard) {
  if (live.signup_bonus) return live.signup_bonus;
  if (live.signup_bonus_value == null) return "See current issuer offer";

  const unit = live.reward_currency_name ?? live.reward_currency ?? "rewards";
  return `${live.signup_bonus_value.toLocaleString()} ${unit}`;
}

function normalizeArtworkUrl(candidate: string | null | undefined) {
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("CardAPI request timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function mergeCardApiCard(fallback: Card, live: CardApiCard): Card {
  const rewardRates = normalizeRewardRates(live.reward_rates) ?? fallback.rewardRates;
  const benefitNames = live.benefits?.map((benefit) => benefit.name).filter(Boolean) ?? [];
  const applicationRules = normalizeApplicationRules(live.application_rules);
  const welcomeAmount = formatWelcomeAmount(live);
  const annualFee = live.annual_fee ?? fallback.annualFee;
  const foreignTransactionFee = live.foreign_transaction_fee ??
    (fallback.foreignTransactionFee === "$0" ? 0 : null);

  return {
    ...fallback,
    name: live.name || fallback.name,
    issuer: live.issuers?.name || fallback.issuer,
    network: live.network ? titleCase(live.network) : fallback.network,
    annualFee,
    annualFeeLabel:
      typeof live.annual_fee === "number" ? `$${live.annual_fee.toLocaleString()}` : fallback.annualFeeLabel,
    foreignTransactionFee:
      typeof live.foreign_transaction_fee === "number"
        ? live.foreign_transaction_fee === 0
          ? "$0"
          : `${live.foreign_transaction_fee}%`
        : fallback.foreignTransactionFee,
    purchaseApr:
      typeof live.interest_rate_purchase === "number"
        ? `${live.interest_rate_purchase}% variable`
        : fallback.purchaseApr,
    welcomeOffer:
      welcomeAmount
        ? {
            amount: welcomeAmount,
            requirement: live.signup_min_spend
              ? `After $${live.signup_min_spend.toLocaleString()} in ${live.signup_min_spend_months ?? "the required number of"} months.`
              : fallback.welcomeOffer?.requirement,
          }
        : fallback.welcomeOffer,
    rewardRates,
    rewardSummary: formatRewardSummary(rewardRates) || fallback.rewardSummary,
    benefits: benefitNames.length ? benefitNames : fallback.benefits,
    applicationRules: applicationRules.length ? applicationRules : fallback.applicationRules,
    filters: deriveFilters(fallback.filters, live, annualFee, foreignTransactionFee),
    issuerUrl: selectApprovedUrl(live.product_url, fallback.issuerUrl),
    ratesAndFeesUrl: selectApprovedUrl(live.tc_url ?? live.source_url, fallback.ratesAndFeesUrl),
    updatedAt: live.last_verified ?? live.updated_at ?? fallback.updatedAt,
    dataSource: "cardapi",
  };
}

function createCardApiCard(config: EditorialCardConfig, live: CardApiCard): Card | null {
  const artworkUrl = normalizeArtworkUrl(live.image_url ?? config.artworkAsset);
  if (!artworkUrl) return null;

  const rewardRates = normalizeRewardRates(live.reward_rates) ?? [];
  const annualFee = live.annual_fee ?? -1;
  const foreignTransactionFee = live.foreign_transaction_fee;
  const benefitNames = live.benefits?.map((benefit) => benefit.name).filter(Boolean) ?? [];
  const applicationRules = normalizeApplicationRules(live.application_rules);

  return {
    id: config.cardId,
    name: live.name,
    shortName: live.name,
    issuer: live.issuers.name,
    network: live.network ? titleCase(live.network) : "See issuer",
    category: config.category,
    annualFee,
    annualFeeLabel: live.annual_fee == null ? "See issuer" : `$${live.annual_fee.toLocaleString()}`,
    foreignTransactionFee:
      foreignTransactionFee == null
        ? "See issuer"
        : foreignTransactionFee === 0
          ? "$0"
          : `${foreignTransactionFee}%`,
    purchaseApr:
      live.interest_rate_purchase == null
        ? "See rates & fees"
        : `${live.interest_rate_purchase}% variable`,
    welcomeOffer: {
      amount: formatWelcomeAmount(live),
      requirement: live.signup_min_spend
        ? `After $${live.signup_min_spend.toLocaleString()} in ${live.signup_min_spend_months ?? "the required number of"} months.`
        : undefined,
    },
    rewardRates,
    rewardSummary: formatRewardSummary(rewardRates) || "See current issuer rewards",
    benefits: benefitNames.length ? benefitNames : ["Review the issuer's current benefit guide."],
    applicationRules: applicationRules.length
      ? applicationRules
      : ["Approval and offer eligibility are determined by the issuer."],
    editorialSummary: config.editorialSummary,
    goodToKnow: config.goodToKnow,
    filters: deriveFilters(config.featuredCategories, live, annualFee, foreignTransactionFee),
    artworkUrl,
    issuerUrl: selectApprovedUrl(live.product_url, config.issuerUrl),
    ratesAndFeesUrl: selectApprovedUrl(live.tc_url ?? live.source_url, config.ratesAndFeesUrl),
    updatedAt: live.last_verified ?? live.updated_at,
    dataSource: "cardapi",
    world: config.world,
  };
}

const fallbackById = new Map(fallbackCards.map((card) => [card.id, card]));

const cachedLiveCardLoaders = new Map(editorialCardCatalog.map((config) => [
  config.cardId,
  unstable_cache(async (): Promise<Card | null> => {
    const apiKey = process.env.CARDAPI_API_KEY;
    if (!apiKey) throw new Error("CARDAPI_API_KEY is not configured");

    // The official client owns the trusted https://api.cardapi.dev origin and
    // prevents application code from accidentally forwarding keys elsewhere.
    const client = new CardDB({ apiKey });
    const fallback = fallbackById.get(config.cardId);
    const live = await withTimeout(client.getCard(config.cardId), CARDAPI_TIMEOUT_MS);
    if (!isConsumerCardAvailable(live)) return null;

    return fallback
      ? mergeCardApiCard(fallback, live)
      : createCardApiCard(config, live);
  }, ["cardverse-cardapi-card-v3", config.cardId], {
    revalidate: CARD_CACHE_SECONDS,
    tags: ["cardapi-cards", `cardapi-card:${config.cardId}`],
  }),
]));

export async function getCards(): Promise<Card[]> {
  if (!process.env.CARDAPI_API_KEY) return fallbackCards;

  const cards = await Promise.all(editorialCardCatalog.map(async (config) => {
    const fallback = fallbackById.get(config.cardId);
    const loadLiveCard = cachedLiveCardLoaders.get(config.cardId);
    if (!loadLiveCard) return fallback ?? null;

    try {
      return await loadLiveCard();
    } catch {
      // Failed refreshes stay outside the success-only cache. Existing cached
      // values remain eligible while first-load failures use editorial data.
      return fallback ?? null;
    }
  }));

  return cards.filter((card): card is Card => card !== null);
}
