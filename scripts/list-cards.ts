import { loadEnvConfig } from "@next/env";
import { desc } from "drizzle-orm";

async function main() {
  loadEnvConfig(process.cwd());

  const { getCards } = await import("../lib/card-repository");
  const { getDatabase, getDatabasePath } = await import("../lib/db");
  const { cardSnapshots, cardSuppressions, refreshRuns } = await import("../lib/db/schema");
  const database = getDatabase();
  const snapshots = database.select({ slug: cardSnapshots.slug }).from(cardSnapshots).all();
  const suppressions = database.select().from(cardSuppressions).all();
  const cards = await getCards();
  const latestRefresh = database
    .select()
    .from(refreshRuns)
    .orderBy(desc(refreshRuns.startedAt))
    .limit(1)
    .get();

  console.log(`Card database: ${getDatabasePath()}`);
  console.log(
    `Effective catalog: ${cards.length} cards ` +
    `(${snapshots.length} CardAPI snapshots, ${suppressions.length} provider suppressions)`,
  );

  if (!cards.length) {
    console.log("No curated cards are currently available.");
  } else {
    console.log("");
    for (const [index, card] of cards.entries()) {
      console.log(
        `${String(index + 1).padStart(2, "0")}. ${card.name} (${card.id}) — ${card.issuer} — ` +
        `${card.annualFeeLabel} annual fee — ${card.dataSource}`,
      );
    }
  }

  console.log("");
  if (!latestRefresh) {
    console.log("Latest refresh: none");
    return;
  }

  const completed = latestRefresh.completedAt?.toISOString() ?? "not completed";
  console.log(
    `Latest refresh: #${latestRefresh.id} ${latestRefresh.status} (${latestRefresh.trigger}) — ` +
    `started ${latestRefresh.startedAt.toISOString()} — ${completed}`,
  );
  console.log(
    `Refresh result: ${latestRefresh.cardCount} snapshots from ${latestRefresh.requestCount} CardAPI request(s)`,
  );
  if (latestRefresh.error) console.log(`Refresh error: ${latestRefresh.error}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown database error";
  console.error(`Could not list cards: ${message}`);
  process.exitCode = 1;
});
