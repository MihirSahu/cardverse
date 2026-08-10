import {
  CardDB,
  CardDBError,
  type Card as CardApiCard,
  type RewardRate as CardApiRewardRate,
} from "@cardapi/client";
import { eq } from "drizzle-orm";

import { editorialCardCatalog, type EditorialCardConfig } from "@/lib/card-catalog";
import { getDatabase, getDatabasePath } from "@/lib/db";
import {
  cardSnapshots,
  cardSuppressions,
  refreshRuns,
  type CardSnapshotInsert,
  type CardSuppressionInsert,
} from "@/lib/db/schema";
import { fallbackCards } from "@/lib/fallback-cards";
import type { Card, CardFilter, RewardRate } from "@/lib/types";

type CardApiIssuer = {
  name?: string;
  country?: string;
};

export type CardApiRecord = Omit<Partial<CardApiCard>, "issuers"> & {
  slug: string;
  name: string;
  issuer?: CardApiIssuer;
  issuers?: CardApiIssuer;
  country?: string;
  is_business?: boolean;
};

const CARDAPI_TIMEOUT_MS = 10_000;
// CardAPI's current API reference publishes this Railway deployment as its
// production base URL. Pass it explicitly because @cardapi/client@0.2.0 still
// defaults to the retired https://api.cardapi.dev origin.
const CARDAPI_ORIGIN = "https://adaptable-dream-production-2fce.up.railway.app";
const CARDAPI_CARDS_PATH = "/v1/cards";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_REQUESTS = 30;
const FACT_DERIVED_FILTERS = new Set<CardFilter>(["no-annual-fee", "no-foreign-fee", "intro-apr"]);

export type RefreshTrigger = "manual" | "scheduled";

export type RefreshSummary = {
  runId: number;
  requestCount: number;
  cardCount: number;
  availableCardCount: number;
};

let activeRefresh: Promise<RefreshSummary> | null = null;

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function describeRefreshError(error: unknown) {
  if (error instanceof CardDBError) return `CardAPI HTTP ${error.status}: ${error.message}`;
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error) return `${error.message}: ${cause.message}`;
    if (cause && typeof cause === "object" && "code" in cause) {
      return `${error.message}: ${String(cause.code)}`;
    }
    return error.message;
  }
  return "Unknown CardAPI refresh error";
}

function elapsedMilliseconds(startedAt: Date) {
  return Date.now() - startedAt.getTime();
}

function buildCardApiPageUrl(pageSize: number, offset: number) {
  const url = new URL(CARDAPI_CARDS_PATH, CARDAPI_ORIGIN);
  url.searchParams.set("country", "US");
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("offset", String(offset));
  return url.toString();
}

function buildCardApiDetailUrl(slug: string) {
  return new URL(`${CARDAPI_CARDS_PATH}/${encodeURIComponent(slug)}`, CARDAPI_ORIGIN).toString();
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeNetwork(value: string) {
  const networkNames: Record<string, string> = {
    VISA: "Visa",
    MC: "Mastercard",
    AMEX: "American Express",
    DISCOVER: "Discover",
  };
  return networkNames[value.toUpperCase()] ?? titleCase(value);
}

function getCardApiIssuer(live: CardApiRecord) {
  return live.issuer ?? live.issuers;
}

function hasOwnField(value: object, field: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, field);
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

function normalizeApplicationRules(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(/\r?\n|;\s+/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function normalizeAnnualFee(live: CardApiRecord, fallbackAnnualFee: number) {
  if (typeof live.annual_fee_year2 === "number" && live.annual_fee_year2 >= 0) {
    return live.annual_fee_year2;
  }
  return live.annual_fee ?? fallbackAnnualFee;
}

function formatAnnualFeeLabel(live: CardApiRecord, fallbackLabel: string) {
  if (typeof live.annual_fee !== "number") return fallbackLabel;

  const laterFee = typeof live.annual_fee_year2 === "number"
    ? live.annual_fee_year2
    : live.annual_fee;
  if (live.annual_fee_waived_first_year && laterFee > 0) {
    return `$0 first year, then $${laterFee.toLocaleString()}`;
  }
  if (typeof live.annual_fee_year2 === "number" && live.annual_fee_year2 !== live.annual_fee) {
    return `$${live.annual_fee.toLocaleString()} first year, then $${live.annual_fee_year2.toLocaleString()}`;
  }
  return `$${live.annual_fee.toLocaleString()}`;
}

function formatPurchaseApr(live: CardApiRecord, fallback: string) {
  if (typeof live.intro_apr_purchase === "number") {
    const duration = typeof live.intro_apr_purchase_months === "number"
      ? ` for ${live.intro_apr_purchase_months} months`
      : "";
    const postIntro = typeof live.interest_rate_purchase === "number"
      ? `; then ${live.interest_rate_purchase}% variable`
      : "";
    return `${live.intro_apr_purchase}% intro APR${duration}${postIntro}`;
  }
  return typeof live.interest_rate_purchase === "number"
    ? `${live.interest_rate_purchase}% variable`
    : fallback;
}

function isConsumerCardAvailable(live: CardApiRecord) {
  const country = (getCardApiIssuer(live)?.country ?? live.country)?.trim().toUpperCase();
  const isUnitedStates = country === "US" || country === "USA" || country === "UNITED STATES";

  return isUnitedStates &&
    live.card_type !== "business" &&
    live.is_business !== true &&
    live.is_active !== false &&
    live.is_published !== false &&
    live.is_discontinued !== true;
}

export function isCardApiRecord(value: unknown): value is CardApiRecord {
  return Boolean(
    value &&
    typeof value === "object" &&
    "slug" in value &&
    typeof value.slug === "string" &&
    "name" in value &&
    typeof value.name === "string",
  );
}

function hasMaterialCardApiFacts(live: CardApiRecord) {
  return live.annual_fee != null ||
    live.annual_fee_year2 != null ||
    live.foreign_transaction_fee != null ||
    live.interest_rate_purchase != null ||
    hasOwnField(live, "signup_bonus") ||
    hasOwnField(live, "signup_bonus_value") ||
    Boolean(live.reward_rates?.length) ||
    Boolean(live.benefits?.length) ||
    Boolean(live.application_rules?.trim()) ||
    live.intro_apr_purchase != null ||
    live.intro_apr_balance_transfer != null;
}

function selectApprovedUrl(
  candidate: string | null | undefined,
  approvedReferences: Array<string | null | undefined>,
  fallbackValue = approvedReferences.find(Boolean) ?? "",
) {
  if (!candidate) return fallbackValue;

  try {
    const candidateUrl = new URL(candidate);
    const candidateHost = candidateUrl.hostname.toLowerCase().replace(/^www\./, "");
    const approvedHosts = approvedReferences.flatMap((reference) => {
      if (!reference) return [];

      try {
        return [new URL(reference).hostname.toLowerCase().replace(/^www\./, "")];
      } catch {
        return [];
      }
    });
    const isApprovedHost = approvedHosts.some(
      (approvedHost) => candidateHost === approvedHost || candidateHost.endsWith(`.${approvedHost}`),
    );

    return candidateUrl.protocol === "https:" && isApprovedHost ? candidateUrl.toString() : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function deriveFilters(
  baselineFilters: CardFilter[],
  live: CardApiRecord,
  annualFee: number,
  foreignTransactionFee: number | null | undefined,
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

function formatWelcomeAmount(live: CardApiRecord) {
  if (live.signup_bonus?.trim()) return live.signup_bonus.trim();
  if (live.signup_bonus_value != null && live.signup_bonus_value > 0) {
    const unit = live.reward_currency_name ?? live.reward_currency ?? "rewards";
    return `${live.signup_bonus_value.toLocaleString()} ${unit}`;
  }

  const bonusFieldsWereReturned = hasOwnField(live, "signup_bonus") ||
    hasOwnField(live, "signup_bonus_value");
  return bonusFieldsWereReturned ? null : undefined;
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

export function mergeCardApiCard(fallback: Card, live: CardApiRecord): Card {
  const rewardRates = normalizeRewardRates(live.reward_rates) ?? fallback.rewardRates;
  const benefitNames = live.benefits?.map((benefit) => benefit.name).filter(Boolean) ?? [];
  const applicationRules = normalizeApplicationRules(live.application_rules);
  const welcomeAmount = formatWelcomeAmount(live);
  const annualFee = normalizeAnnualFee(live, fallback.annualFee);
  const foreignTransactionFee = live.foreign_transaction_fee ??
    (fallback.foreignTransactionFee === "$0" ? 0 : null);
  const artworkUrl = normalizeArtworkUrl(fallback.artworkUrl) ??
    normalizeArtworkUrl(live.image_url) ?? fallback.artworkUrl;
  const hasMaterialFacts = hasMaterialCardApiFacts(live);

  return {
    ...fallback,
    name: live.name || fallback.name,
    issuer: getCardApiIssuer(live)?.name || fallback.issuer,
    network: live.network ? normalizeNetwork(live.network) : fallback.network,
    annualFee,
    annualFeeLabel: formatAnnualFeeLabel(live, fallback.annualFeeLabel),
    foreignTransactionFee:
      typeof live.foreign_transaction_fee === "number"
        ? live.foreign_transaction_fee === 0
          ? "$0"
          : `${live.foreign_transaction_fee}%`
        : fallback.foreignTransactionFee,
    purchaseApr: formatPurchaseApr(live, fallback.purchaseApr),
    welcomeOffer:
      welcomeAmount === undefined
        ? fallback.welcomeOffer
        : welcomeAmount === null
          ? null
          : {
            amount: welcomeAmount,
            requirement: live.signup_min_spend
              ? `After $${live.signup_min_spend.toLocaleString()} in ${live.signup_min_spend_months ?? "the required number of"} months.`
              : fallback.welcomeOffer?.requirement,
            },
    rewardRates,
    rewardSummary: formatRewardSummary(rewardRates) || fallback.rewardSummary,
    benefits: benefitNames.length ? benefitNames : fallback.benefits,
    applicationRules: applicationRules.length ? applicationRules : fallback.applicationRules,
    filters: deriveFilters(fallback.filters, live, annualFee, foreignTransactionFee),
    artworkUrl,
    issuerUrl: selectApprovedUrl(live.product_url, [fallback.issuerUrl], fallback.issuerUrl),
    ratesAndFeesUrl: selectApprovedUrl(
      live.tc_url,
      [fallback.issuerUrl, fallback.ratesAndFeesUrl],
      fallback.ratesAndFeesUrl,
    ),
    updatedAt: hasMaterialFacts
      ? live.last_verified ?? live.updated_at ?? fallback.updatedAt
      : fallback.updatedAt,
    dataSource: hasMaterialFacts ? "cardapi" : fallback.dataSource,
  };
}

function createCardApiCard(config: EditorialCardConfig, live: CardApiRecord): Card | null {
  const artworkUrl = normalizeArtworkUrl(config.artworkAsset ?? live.image_url);
  if (!artworkUrl) return null;

  const rewardRates = normalizeRewardRates(live.reward_rates) ?? [];
  const annualFee = normalizeAnnualFee(live, -1);
  const foreignTransactionFee = live.foreign_transaction_fee;
  const benefitNames = live.benefits?.map((benefit) => benefit.name).filter(Boolean) ?? [];
  const applicationRules = normalizeApplicationRules(live.application_rules);
  const welcomeAmount = formatWelcomeAmount(live);

  return {
    id: config.cardId,
    name: live.name,
    shortName: live.name,
    issuer: getCardApiIssuer(live)?.name ?? "See issuer",
    network: live.network ? normalizeNetwork(live.network) : "See issuer",
    category: config.category,
    annualFee,
    annualFeeLabel: formatAnnualFeeLabel(live, "See issuer"),
    foreignTransactionFee:
      foreignTransactionFee == null
        ? "See issuer"
        : foreignTransactionFee === 0
          ? "$0"
          : `${foreignTransactionFee}%`,
    purchaseApr: formatPurchaseApr(live, "See rates & fees"),
    welcomeOffer: welcomeAmount
      ? {
          amount: welcomeAmount,
          requirement: live.signup_min_spend
            ? `After $${live.signup_min_spend.toLocaleString()} in ${live.signup_min_spend_months ?? "the required number of"} months.`
            : undefined,
        }
      : null,
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
    artworkOrientation: config.artworkOrientation,
    issuerUrl: selectApprovedUrl(live.product_url, [config.issuerUrl], config.issuerUrl),
    ratesAndFeesUrl: selectApprovedUrl(
      live.tc_url,
      [config.issuerUrl, config.ratesAndFeesUrl],
      config.ratesAndFeesUrl,
    ),
    updatedAt: live.last_verified ?? live.updated_at ?? "",
    dataSource: "cardapi",
    world: config.world,
  };
}

const fallbackById = new Map(fallbackCards.map((card) => [card.id, card]));

async function performRefresh(trigger: RefreshTrigger): Promise<RefreshSummary> {
  const apiKey = process.env.CARDAPI_API_KEY;
  if (!apiKey) throw new Error("CARDAPI_API_KEY is not configured");

  const database = getDatabase();
  const startedAt = new Date();
  const insertedRuns = database.insert(refreshRuns).values({
    trigger,
    status: "running",
    startedAt,
  }).returning({ id: refreshRuns.id }).all();
  const runId = insertedRuns[0].id;
  const pageSize = positiveInteger(process.env.CARDAPI_PAGE_SIZE, DEFAULT_PAGE_SIZE, 100);
  const maxRequests = positiveInteger(process.env.CARDAPI_MAX_REFRESH_REQUESTS, DEFAULT_MAX_REQUESTS, 90);
  const client = new CardDB({ apiKey, baseUrl: CARDAPI_ORIGIN });
  const liveCards: CardApiRecord[] = [];
  const seenCardSlugs = new Set<string>();
  let requestCount = 0;
  let offset = 0;
  let availableCardCount = 0;
  let reportedTotal: number | null = null;
  let currentRequestUrl: string | null = null;

  console.info(
    `[Cardverse refresh #${runId}] Started (${trigger}). Database: ${getDatabasePath()}. ` +
    `Page size: ${pageSize}. Maximum requests: ${maxRequests}.`,
  );

  try {
    while (requestCount < maxRequests) {
      requestCount += 1;
      currentRequestUrl = buildCardApiPageUrl(pageSize, offset);
      console.info(
        `[Cardverse refresh #${runId}] Request ${requestCount}/${maxRequests}: GET ${currentRequestUrl}`,
      );
      const page = await withTimeout(
        client.getCards({ country: "US", limit: pageSize, offset }),
        CARDAPI_TIMEOUT_MS,
      );
      if (!page || !Array.isArray(page.data) || !page.data.every(isCardApiRecord) ||
          typeof page.total !== "number" || !Number.isInteger(page.total) || page.total < 0 ||
          typeof page.offset !== "number" || !Number.isInteger(page.offset) || page.offset < 0) {
        throw new Error("CardAPI returned an invalid paginated card response");
      }
      if (page.offset !== offset) {
        throw new Error(`CardAPI returned offset ${page.offset} for requested offset ${offset}`);
      }
      if (reportedTotal !== null && page.total !== reportedTotal) {
        throw new Error(`CardAPI total changed from ${reportedTotal} to ${page.total} during pagination`);
      }
      reportedTotal ??= page.total;
      availableCardCount = reportedTotal;
      for (const card of page.data) {
        if (seenCardSlugs.has(card.slug)) {
          throw new Error(`CardAPI returned duplicate card slug ${card.slug} during pagination`);
        }
        seenCardSlugs.add(card.slug);
      }
      liveCards.push(...page.data);
      console.info(
        `[Cardverse refresh #${runId}] Response ${requestCount}: ${page.data.length} card(s), ` +
        `${liveCards.length}/${page.total} received.`,
      );
      currentRequestUrl = null;

      if (!page.data.length || offset + page.data.length >= page.total) break;
      offset += page.data.length;
    }

    if (liveCards.length !== availableCardCount) {
      if (requestCount >= maxRequests) {
        throw new Error(`CardAPI pagination exceeded the ${maxRequests}-request refresh budget`);
      }
      throw new Error(
        `CardAPI pagination ended after ${liveCards.length} of ${availableCardCount} reported cards`,
      );
    }

    const liveBySlug = new Map(liveCards.map((card) => [card.slug, card]));
    const detailSlugs = Array.from(new Set(editorialCardCatalog.flatMap((config) => {
      if (!config.cardApiSlug) return [];
      const summary = liveBySlug.get(config.cardApiSlug);
      return summary && isConsumerCardAvailable(summary) ? [config.cardApiSlug] : [];
    })));

    for (const slug of detailSlugs) {
      if (requestCount >= maxRequests) {
        throw new Error(`CardAPI detail lookups exceeded the ${maxRequests}-request refresh budget`);
      }

      requestCount += 1;
      currentRequestUrl = buildCardApiDetailUrl(slug);
      console.info(
        `[Cardverse refresh #${runId}] Request ${requestCount}/${maxRequests}: GET ${currentRequestUrl}`,
      );
      const detail = await withTimeout(client.getCard(slug), CARDAPI_TIMEOUT_MS);
      if (!isCardApiRecord(detail) || detail.slug !== slug) {
        throw new Error(`CardAPI returned an invalid detail response for ${slug}`);
      }
      liveBySlug.set(slug, detail);
      console.info(`[Cardverse refresh #${runId}] Response ${requestCount}: refreshed ${slug}.`);
      currentRequestUrl = null;
    }

    const fetchedAt = new Date();
    const snapshots: CardSnapshotInsert[] = [];
    const suppressions: CardSuppressionInsert[] = [];
    const missingCatalogSlugs: string[] = [];
    const unavailableCatalogCards: string[] = [];
    const unusableCatalogCards: string[] = [];
    const unsupportedCatalogCards: string[] = [];

    for (const config of editorialCardCatalog) {
      if (!config.cardApiSlug) {
        unsupportedCatalogCards.push(config.cardId);
        continue;
      }

      const live = liveBySlug.get(config.cardApiSlug);
      if (!live) {
        missingCatalogSlugs.push(`${config.cardId} -> ${config.cardApiSlug}`);
        suppressions.push({ slug: config.cardId, reason: "missing", fetchedAt });
        continue;
      }
      if (!isConsumerCardAvailable(live)) {
        unavailableCatalogCards.push(
          `${config.cardId} (country=${getCardApiIssuer(live)?.country ?? live.country ?? "missing"}, type=${live.card_type ?? "missing"}, ` +
          `active=${live.is_active}, published=${live.is_published}, discontinued=${live.is_discontinued})`,
        );
        suppressions.push({ slug: config.cardId, reason: "unavailable", fetchedAt });
        continue;
      }

      const fallback = fallbackById.get(config.cardId);
      const card = fallback ? mergeCardApiCard(fallback, live) : createCardApiCard(config, live);
      if (!card) {
        unusableCatalogCards.push(`${config.cardId} (no valid HTTPS artwork URL)`);
        suppressions.push({ slug: config.cardId, reason: "unusable", fetchedAt });
        continue;
      }

      snapshots.push({
        slug: config.cardId,
        displayRank: config.displayRank,
        payload: card,
        sourcePayload: live,
        sourceUpdatedAt: live.last_verified ?? live.updated_at,
        fetchedAt,
      });
    }

    const skippedCardCount = missingCatalogSlugs.length + unavailableCatalogCards.length +
      unusableCatalogCards.length + unsupportedCatalogCards.length;
    if (skippedCardCount) {
      console.info(
        `[Cardverse refresh #${runId}] Catalog diagnostics: ${snapshots.length} ready, ` +
        `${missingCatalogSlugs.length} slug(s) missing, ` +
        `${unavailableCatalogCards.length} unavailable, ${unusableCatalogCards.length} unusable, ` +
        `${unsupportedCatalogCards.length} unsupported.`,
      );
      if (missingCatalogSlugs.length) {
        console.info(
          `[Cardverse refresh #${runId}] Expected slugs: ${missingCatalogSlugs.join(", ")}`,
        );
        console.info(
          `[Cardverse refresh #${runId}] Provider slug sample: ${liveCards.slice(0, 30).map((card) => card.slug).join(", ")}`,
        );
      }
      if (unavailableCatalogCards.length) {
        console.info(
          `[Cardverse refresh #${runId}] Unavailable matches: ${unavailableCatalogCards.join("; ")}`,
        );
      }
      if (unusableCatalogCards.length) {
        console.info(
          `[Cardverse refresh #${runId}] Unusable matches: ${unusableCatalogCards.join("; ")}`,
        );
      }
      if (unsupportedCatalogCards.length) {
        console.info(
          `[Cardverse refresh #${runId}] No current US CardAPI mapping: ${unsupportedCatalogCards.join(", ")}`,
        );
      }
    }

    if (!snapshots.length) {
      throw new Error("CardAPI returned no usable cards from the curated catalog");
    }

    database.transaction((transaction) => {
      // A fully paged response is authoritative. Replacing the snapshot set
      // prevents removed, unpublished, or newly unusable cards from lingering.
      transaction.delete(cardSnapshots).run();
      transaction.delete(cardSuppressions).run();

      for (const snapshot of snapshots) {
        transaction.insert(cardSnapshots).values(snapshot).onConflictDoUpdate({
          target: cardSnapshots.slug,
          set: {
            displayRank: snapshot.displayRank,
            payload: snapshot.payload,
            sourcePayload: snapshot.sourcePayload,
            sourceUpdatedAt: snapshot.sourceUpdatedAt,
            fetchedAt: snapshot.fetchedAt,
          },
        }).run();
      }

      for (const suppression of suppressions) {
        transaction.insert(cardSuppressions).values(suppression).run();
      }

      transaction.update(refreshRuns).set({
        status: "succeeded",
        completedAt: new Date(),
        requestCount,
        cardCount: snapshots.length,
        error: null,
      }).where(eq(refreshRuns.id, runId)).run();
    });

    console.info(
      `[Cardverse refresh #${runId}] Completed in ${elapsedMilliseconds(startedAt)} ms. ` +
      `Stored ${snapshots.length} curated card(s) from ${requestCount} request(s).`,
    );

    return { runId, requestCount, cardCount: snapshots.length, availableCardCount };
  } catch (error) {
    const baseMessage = describeRefreshError(error);
    const message = currentRequestUrl
      ? `${baseMessage} at GET ${currentRequestUrl}`
      : baseMessage;
    database.update(refreshRuns).set({
      status: "failed",
      completedAt: new Date(),
      requestCount,
      error: message.slice(0, 500),
    }).where(eq(refreshRuns.id, runId)).run();
    console.error(
      `[Cardverse refresh #${runId}] Failed after ${elapsedMilliseconds(startedAt)} ms: ${message}`,
    );
    if (error instanceof CardDBError && error.status === 404) {
      console.error(
        `[Cardverse refresh #${runId}] The installed CardAPI client targets ${CARDAPI_ORIGIN}${CARDAPI_CARDS_PATH}; ` +
        "the provider returned Not Found for that route. No API key or authorization header was logged.",
      );
    }
    throw error;
  }
}

export function refreshCardDatabase(trigger: RefreshTrigger = "manual") {
  if (activeRefresh) return activeRefresh;

  activeRefresh = performRefresh(trigger).finally(() => {
    activeRefresh = null;
  });
  return activeRefresh;
}
