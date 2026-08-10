import { asc, desc, eq } from "drizzle-orm";

import { editorialCardCatalog } from "@/lib/card-catalog";
import { isCardApiRecord, mergeCardApiCard } from "@/lib/card-refresh";
import { getDatabase } from "@/lib/db";
import { cardSnapshots, cardSuppressions, refreshRuns } from "@/lib/db/schema";
import { fallbackCards } from "@/lib/fallback-cards";
import type { Card } from "@/lib/types";

const fallbackById = new Map(fallbackCards.map((card) => [card.id, card]));

export async function getCards(): Promise<Card[]> {
  try {
    const database = getDatabase();
    const rows = database
      .select({
        slug: cardSnapshots.slug,
        payload: cardSnapshots.payload,
        sourcePayload: cardSnapshots.sourcePayload,
      })
      .from(cardSnapshots)
      .orderBy(asc(cardSnapshots.displayRank))
      .all();

    const latestSuccessfulRefresh = database
      .select({ id: refreshRuns.id })
      .from(refreshRuns)
      .where(eq(refreshRuns.status, "succeeded"))
      .orderBy(desc(refreshRuns.completedAt))
      .limit(1)
      .get();

    if (!latestSuccessfulRefresh) return fallbackCards;

    const snapshotBySlug = new Map(rows.map((row) => [row.slug, row]));
    const suppressedSlugs = new Set(
      database.select({ slug: cardSuppressions.slug }).from(cardSuppressions).all().map((row) => row.slug),
    );
    return editorialCardCatalog.flatMap((config) => {
      if (suppressedSlugs.has(config.cardId)) return [];
      const snapshot = snapshotBySlug.get(config.cardId);
      const fallback = fallbackById.get(config.cardId);
      if (!snapshot) return fallback ? [fallback] : [];
      if (fallback && isCardApiRecord(snapshot.sourcePayload)) {
        return [mergeCardApiCard(fallback, snapshot.sourcePayload)];
      }
      return fallback ? [fallback] : [snapshot.payload];
    });
  } catch {
    return fallbackCards;
  }
}
