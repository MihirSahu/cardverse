import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import type { CardApiRecord } from "../lib/card-refresh";

async function main() {
  process.env.CARDVERSE_DB_PATH = path.join(tmpdir(), `cardverse-cache-${randomUUID()}.db`);
  process.env.CARDAPI_API_KEY = "test-key";
  process.env.CARDAPI_PAGE_SIZE = "1";

  const { CardDB } = await import("@cardapi/client");
  const { eq } = await import("drizzle-orm");
  const { fallbackCards, pendingArtworkUrl } = await import("../lib/fallback-cards");
  const { editorialCardCatalog } = await import("../lib/card-catalog");
  const { shouldBypassImageOptimization } = await import("../lib/artwork");
  const { getCards } = await import("../lib/card-repository");
  const { mergeCardApiCard, refreshCardDatabase } = await import("../lib/card-refresh");
  const { getDatabase } = await import("../lib/db");
  const { cardSnapshots, cardSuppressions } = await import("../lib/db/schema");

  const matched: CardApiRecord = {
    // Mirrors the summary shape returned by the production list endpoint:
    // provider slug, partial issuer, and no is_active/is_published fields.
    slug: "american-express-platinum-card",
    name: "Platinum Card",
    card_type: "personal",
    is_discontinued: false,
    issuer: { name: "American Express", country: "US" },
    updated_at: "2026-08-03T00:00:00.000Z",
  };
  const uncurated = {
    ...matched,
    slug: "uncurated-test-card",
    name: "Uncurated test card",
  };
  const unpublished = {
    ...matched,
    slug: "american-express-gold-card",
    name: "American Express Gold Card",
    is_published: false,
    issuer: { name: "American Express", country: "US" },
  };
  const detailed = {
    ...matched,
    annual_fee: 895,
    last_verified: "2026-08-04T00:00:00.000Z",
  };

  const database = getDatabase();
  assert.equal(fallbackCards.length, 53, "The curated fallback catalog should contain 53 cards");
  assert.equal(
    new Set(fallbackCards.map((card) => card.id)).size,
    fallbackCards.length,
    "Every curated card ID should be unique",
  );
  assert.deepEqual(
    editorialCardCatalog.map((card) => card.cardId),
    fallbackCards.map((card) => card.id),
    "Editorial configuration should preserve the fallback catalog order",
  );
  const markdownCatalog = readFileSync(path.join(process.cwd(), "data", "card-catalog.md"), "utf8");
  const markdownRows = new Map(
    markdownCatalog
      .split(/\r?\n/)
      .filter((line) => line.startsWith("| `"))
      .map((line) => {
        const columns = line.split("|").map((column) => column.trim());
        return [
          columns[1].slice(1, -1),
          { network: columns[8], issuerUrl: columns[9], artworkUrl: columns[10] },
        ] as const;
      }),
  );
  assert.equal(
    markdownRows.size,
    fallbackCards.length,
    "The Markdown source table should contain one row for every curated card",
  );
  for (const card of fallbackCards) {
    assert.deepEqual(
      markdownRows.get(card.id),
      { network: card.network, issuerUrl: card.issuerUrl, artworkUrl: card.artworkUrl },
      `${card.id} should keep its network and URLs synchronized with the Markdown source table`,
    );
  }
  assert.equal(
    fallbackCards.filter((card) => card.artworkUrl === pendingArtworkUrl).length,
    0,
    "Every curated card should have a matched issuer artwork URL",
  );
  assert.equal(
    fallbackCards.filter((card) => card.issuer === "Citi").every(
      (card) => card.artworkUrl.startsWith("https://aemapi.citi.com/"),
    ),
    true,
    "Every Citi card should use its matched issuer artwork URL",
  );
  assert.equal(
    fallbackCards.filter((card) => card.issuer === "U.S. Bank").every(
      (card) => card.artworkOrientation === "portrait",
    ),
    true,
    "U.S. Bank's vertical artwork should be rendered as portrait cards",
  );
  assert.equal(
    fallbackCards.filter((card) => card.issuer !== "U.S. Bank").every(
      (card) => card.artworkOrientation === "landscape",
    ),
    true,
    "Issuer artwork that is not vertical should retain the landscape card shape",
  );
  assert.equal(
    fallbackCards.filter((card) => card.id.includes("savor")).every(
      (card) => card.filters.includes("cash-back"),
    ),
    true,
    "Every Savor variant should appear in the cash-back filter",
  );
  assert.equal(
    fallbackCards.find((card) => card.id === "discover-it-student-chrome")?.filters.includes("cash-back"),
    true,
    "Discover Student Chrome should appear in the cash-back filter",
  );
  const expectedNoForeignFeeCards = [
    ...fallbackCards.filter((card) => card.issuer === "Capital One" || card.issuer === "Discover").map((card) => card.id),
    "citi-strata-elite",
    "citi-strata-premier",
    "wells-fargo-autograph",
    "wells-fargo-autograph-journey",
    "us-bank-altitude-connect",
  ];
  for (const cardId of expectedNoForeignFeeCards) {
    const card = fallbackCards.find((candidate) => candidate.id === cardId);
    assert.ok(card, `${cardId} should be present`);
    assert.equal(card.foreignTransactionFee, "$0", `${cardId} should retain its verified foreign-fee fact`);
    assert.equal(
      card.filters.includes("no-foreign-fee"),
      true,
      `${cardId} should appear in the no-foreign-fee filter`,
    );
  }
  const bankAmericard = fallbackCards.find((card) => card.id === "bankamericard");
  assert.ok(bankAmericard, "BankAmericard should be present");
  assert.equal(
    bankAmericard.network,
    "Mastercard",
    "BankAmericard metadata should match its Mastercard-branded issuer artwork",
  );
  assert.equal(
    fallbackCards.find((card) => card.id === "capital-one-platinum")?.issuerUrl,
    "https://www.capitalone.com/credit-cards/platinum/",
    "Capital One Platinum should link to its current product page",
  );
  for (const card of fallbackCards) {
    assert.match(card.issuerUrl, /^https:\/\//, `${card.id} should have an HTTPS issuer URL`);
    if (card.ratesAndFeesUrl) {
      assert.match(
        card.ratesAndFeesUrl,
        /^https:\/\//,
        `${card.id} should have an HTTPS rates-and-fees URL when the action is available`,
      );
      assert.notEqual(
        card.ratesAndFeesUrl,
        card.issuerUrl,
        `${card.id} should not send both issuer actions to the same URL`,
      );
    }
    assert.ok(
      card.artworkUrl === pendingArtworkUrl || card.artworkUrl.startsWith("https://"),
      `${card.id} should have HTTPS or local placeholder artwork`,
    );
  }
  const splitCard = fallbackCards.find((card) => card.id === "us-bank-split");
  assert.ok(splitCard, "U.S. Bank Split should be present");
  assert.equal(splitCard.annualFee, -1, "An unverified annual fee should remain unknown");
  assert.equal(
    splitCard.filters.includes("no-annual-fee"),
    false,
    "An unverified annual fee should not qualify for the no-annual-fee filter",
  );

  database.insert(cardSnapshots).values({
    slug: fallbackCards[1].id,
    displayRank: 2,
    payload: fallbackCards[1],
    sourcePayload: matched,
    sourceUpdatedAt: matched.updated_at,
    fetchedAt: new Date(),
  }).run();

  const beforeFirstSuccess = await getCards();
  assert.equal(beforeFirstSuccess.length, fallbackCards.length, "Fallback cards should be used before a successful refresh");

  let calls = 0;
  let detailCalls = 0;
  Reflect.set(CardDB.prototype, "getCards", async ({ offset = 0 }: { offset?: number }) => {
    calls += 1;
    return {
      data: [offset === 0 ? matched : offset === 1 ? unpublished : uncurated],
      total: 3,
      limit: 1,
      offset,
    };
  });
  Reflect.set(CardDB.prototype, "getCard", async (slug: string) => {
    detailCalls += 1;
    assert.equal(slug, matched.slug);
    return detailed;
  });

  const summary = await refreshCardDatabase("manual");
  assert.equal(
    summary.requestCount,
    4,
    "Refresh should count list pages and matched-card detail lookups",
  );
  assert.equal(calls, 3, "Refresh should make one provider call per page");
  assert.equal(detailCalls, 1, "Refresh should retrieve full details for available mapped cards");
  assert.equal(summary.cardCount, 1, "Only curated, available cards should be cached");

  const refreshed = await getCards();
  const expectedVisibleIds = editorialCardCatalog
    .filter((config) => config.cardApiSlug === null || config.cardId === fallbackCards[0].id)
    .map((config) => config.cardId);
  assert.deepEqual(
    refreshed.map((card) => card.id),
    expectedVisibleIds,
    "A successful refresh should omit mapped cards the provider reports as missing or unavailable",
  );
  assert.equal(
    database.select().from(cardSuppressions).all().length,
    editorialCardCatalog.filter(
      (config) => config.cardApiSlug !== null && config.cardId !== fallbackCards[0].id,
    ).length,
    "A successful refresh should persist every mapped card suppressed by provider availability",
  );
  assert.equal(
    refreshed.some((card) => card.id === fallbackCards[1].id),
    false,
    "An explicitly unpublished mapped card should not be restored from editorial fallback data",
  );
  assert.equal(refreshed[0].dataSource, "cardapi", "A detailed match should use refreshed CardAPI facts");
  assert.equal(
    refreshed[0].updatedAt,
    detailed.last_verified,
    "A detailed match should use the provider verification date",
  );
  assert.deepEqual(
    refreshed[0].welcomeOffer,
    fallbackCards[0].welcomeOffer,
    "Summary responses without bonus fields should preserve the editorial welcome offer",
  );
  assert.equal(
    refreshed.find((card) => card.id === "capital-one-platinum")?.dataSource,
    "editorial-fallback",
    "A card outside CardAPI coverage should remain available from editorial data",
  );

  const summaryOnly = mergeCardApiCard(fallbackCards[0], matched);
  assert.equal(
    summaryOnly.dataSource,
    "editorial-fallback",
    "A summary-only match should not claim that editorial financial facts were refreshed",
  );
  assert.equal(summaryOnly.updatedAt, fallbackCards[0].updatedAt);

  const materiallyRefreshed = mergeCardApiCard(fallbackCards[0], { ...detailed, annual_fee: 999 });
  assert.equal(materiallyRefreshed.dataSource, "cardapi");
  assert.equal(materiallyRefreshed.annualFee, 999);
  assert.equal(materiallyRefreshed.updatedAt, "2026-08-04T00:00:00.000Z");

  const mastercardNetwork = mergeCardApiCard(fallbackCards[0], { ...detailed, network: "MC" });
  assert.equal(mastercardNetwork.network, "Mastercard");

  const discoverCard = fallbackCards.find((card) => card.id === "discover-it-cash-back");
  assert.ok(discoverCard, "Discover it Cash Back should be present");
  const officialCrossDomainTerms = mergeCardApiCard(discoverCard, {
    slug: "discover-it-cash-back-credit-card",
    name: discoverCard.name,
    issuer: { name: "Discover", country: "US" },
    tc_url: "https://www.capitalone.com/credit-cards/lp/credit-card-agreements/current-discover-terms.pdf",
  });
  assert.equal(
    officialCrossDomainTerms.ratesAndFeesUrl,
    "https://www.capitalone.com/credit-cards/lp/credit-card-agreements/current-discover-terms.pdf",
    "A provider terms URL should be accepted on the configured official terms host",
  );
  const unapprovedCrossDomainTerms = mergeCardApiCard(discoverCard, {
    slug: "discover-it-cash-back-credit-card",
    name: discoverCard.name,
    issuer: { name: "Discover", country: "US" },
    tc_url: "https://example.com/replace-the-real-terms.pdf",
  });
  assert.equal(
    unapprovedCrossDomainTerms.ratesAndFeesUrl,
    discoverCard.ratesAndFeesUrl,
    "An unapproved provider terms host should fall back to the editorial URL",
  );

  const firstYearFeeAndApr = mergeCardApiCard(fallbackCards[2], {
    ...detailed,
    slug: "blue-cash-preferred-card",
    name: "Blue Cash Preferred Card",
    annual_fee: 0,
    annual_fee_waived_first_year: true,
    annual_fee_year2: 95,
    intro_apr_purchase: 0,
    intro_apr_purchase_months: 12,
    interest_rate_purchase: 24.99,
  });
  assert.equal(firstYearFeeAndApr.annualFee, 95);
  assert.equal(firstYearFeeAndApr.annualFeeLabel, "$0 first year, then $95");
  assert.equal(firstYearFeeAndApr.filters.includes("no-annual-fee"), false);
  assert.equal(firstYearFeeAndApr.purchaseApr, "0% intro APR for 12 months; then 24.99% variable");

  const withdrawnOffer = mergeCardApiCard(fallbackCards[0], {
    ...matched,
    signup_bonus: null,
    signup_bonus_value: null,
    last_verified: "2026-08-04T00:00:00.000Z",
  });
  assert.equal(
    withdrawnOffer.welcomeOffer,
    null,
    "Explicit null bonus fields should remove an expired editorial offer",
  );
  assert.equal(withdrawnOffer.dataSource, "cardapi");

  const originalEditorialSummary = fallbackCards[0].editorialSummary;
  const originalArtworkUrl = fallbackCards[0].artworkUrl;
  fallbackCards[0].editorialSummary = "Updated editorial context";
  fallbackCards[0].artworkUrl = "https://example.com/current-approved-artwork.png";
  const afterEditorialUpdate = await getCards();
  assert.equal(
    afterEditorialUpdate[0].editorialSummary,
    "Updated editorial context",
    "Stored provider payloads should be merged with current editorial context at read time",
  );
  assert.equal(
    afterEditorialUpdate[0].artworkUrl,
    "https://example.com/current-approved-artwork.png",
    "Current approved editorial artwork should replace artwork captured by an older snapshot",
  );
  fallbackCards[0].editorialSummary = originalEditorialSummary;
  fallbackCards[0].artworkUrl = originalArtworkUrl;

  Reflect.set(CardDB.prototype, "getCards", async () => ({
    data: [],
    total: 3,
    limit: 1,
    offset: 0,
  }));
  await assert.rejects(
    refreshCardDatabase("manual"),
    /pagination ended after 0 of 3 reported cards/,
    "An incomplete provider traversal should fail instead of replacing the cache",
  );
  const afterIncompleteRefresh = await getCards();
  assert.deepEqual(
    afterIncompleteRefresh.map((card) => card.id),
    expectedVisibleIds,
    "A failed incomplete refresh should preserve the previously successful snapshot set",
  );
  assert.equal(
    database.select().from(cardSnapshots).all().length,
    1,
    "A failed incomplete refresh should not delete existing snapshots",
  );
  assert.equal(
    database.select().from(cardSuppressions).all().length,
    editorialCardCatalog.filter(
      (config) => config.cardApiSlug !== null && config.cardId !== fallbackCards[0].id,
    ).length,
    "A failed incomplete refresh should not delete existing availability suppressions",
  );

  Reflect.set(CardDB.prototype, "getCards", async ({ offset = 0 }: { offset?: number }) => ({
    data: [matched],
    total: 2,
    limit: 1,
    offset,
  }));
  await assert.rejects(
    refreshCardDatabase("manual"),
    /duplicate card slug american-express-platinum-card/,
    "Repeated provider pages should fail instead of being mistaken for a complete catalog",
  );
  assert.deepEqual(
    (await getCards()).map((card) => card.id),
    expectedVisibleIds,
    "A failed duplicate-page refresh should preserve the previously successful catalog state",
  );

  database.delete(cardSnapshots).where(eq(cardSnapshots.slug, fallbackCards[0].id)).run();
  const afterRemoval = await getCards();
  assert.deepEqual(
    afterRemoval.map((card) => card.id),
    expectedVisibleIds,
    "An available card with a missing snapshot should fall back without restoring suppressed entries",
  );
  assert.equal(afterRemoval[0].dataSource, "editorial-fallback");

  for (const path of [
    "https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/example.png",
    "https://icm.aexp-static.com/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/example.png",
    "https://icm.aexp-static.com/acquisition/card-art/NUS000000264_480x304_straight_withname.png",
  ]) {
    assert.equal(
      shouldBypassImageOptimization(path),
      false,
      `${path} should use the configured Next image optimizer`,
    );
  }
  assert.equal(
    shouldBypassImageOptimization("https://icm.aexp-static.com/unconfigured/card.png"),
    true,
    "Unconfigured paths on an otherwise optimized host should bypass the image optimizer",
  );

  console.log("Card cache pagination and per-card editorial fallback verified.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
