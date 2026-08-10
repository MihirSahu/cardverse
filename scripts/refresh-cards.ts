import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { refreshCardDatabase } = await import("../lib/card-refresh");
  const { getDatabasePath } = await import("../lib/db");
  const summary = await refreshCardDatabase("manual");

  console.log(`Card database: ${getDatabasePath()}`);
  console.log(`Refresh run: ${summary.runId}`);
  console.log(`CardAPI requests: ${summary.requestCount}`);
  console.log(`Curated cards updated: ${summary.cardCount}`);
  console.log(`US cards reported by CardAPI: ${summary.availableCardCount}`);
}

main().catch((error) => {
  const status = typeof error === "object" && error && "status" in error
    ? ` HTTP ${String(error.status)}`
    : "";
  const message = error instanceof Error ? error.message : "Unknown refresh error";
  console.error(`Card refresh failed:${status} ${message}`);
  process.exitCode = 1;
});
