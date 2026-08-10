import { desc, eq } from "drizzle-orm";

import { refreshCardDatabase } from "@/lib/card-refresh";
import { getDatabase } from "@/lib/db";
import { refreshRuns } from "@/lib/db/schema";

type SchedulerState = {
  started: boolean;
  timeout?: ReturnType<typeof setTimeout>;
  interval?: ReturnType<typeof setInterval>;
};

const schedulerState = globalThis as typeof globalThis & {
  __cardverseRefreshScheduler?: SchedulerState;
};

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function schedulerLog(message: string) {
  console.info(`[Cardverse scheduler] ${message}`);
}

async function refreshIfDue(intervalMs: number, retryMs: number) {
  try {
    const database = getDatabase();
    const latestSuccess = database
      .select({ completedAt: refreshRuns.completedAt })
      .from(refreshRuns)
      .where(eq(refreshRuns.status, "succeeded"))
      .orderBy(desc(refreshRuns.completedAt))
      .limit(1)
      .get();

    if (latestSuccess?.completedAt && Date.now() - latestSuccess.completedAt.getTime() < intervalMs) {
      schedulerLog(
        `Skipped refresh: cached data is fresh until ${new Date(latestSuccess.completedAt.getTime() + intervalMs).toISOString()}.`,
      );
      return;
    }

    const latestAttempt = database
      .select({ status: refreshRuns.status, startedAt: refreshRuns.startedAt })
      .from(refreshRuns)
      .orderBy(desc(refreshRuns.startedAt))
      .limit(1)
      .get();
    if (
      latestAttempt &&
      latestAttempt.status !== "succeeded" &&
      Date.now() - latestAttempt.startedAt.getTime() < retryMs
    ) {
      schedulerLog(
        `Skipped refresh: latest attempt is ${latestAttempt.status}; retry is allowed after ${new Date(latestAttempt.startedAt.getTime() + retryMs).toISOString()}.`,
      );
      return;
    }

    schedulerLog("Card data is due; starting a scheduled refresh.");
    const summary = await refreshCardDatabase("scheduled");
    schedulerLog(
      `Refresh #${summary.runId} stored ${summary.cardCount} cards using ${summary.requestCount} CardAPI request(s).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown refresh error";
    console.error(`[Cardverse scheduler] Scheduled refresh failed: ${message}`);
  }
}

export function startCardRefreshScheduler() {
  if (!process.env.CARDAPI_API_KEY) {
    schedulerLog("Not started: CARDAPI_API_KEY is not configured.");
    return;
  }
  if (process.env.CARDAPI_REFRESH_DISABLED === "true") {
    schedulerLog("Not started: CARDAPI_REFRESH_DISABLED is true.");
    return;
  }

  const existingState = schedulerState.__cardverseRefreshScheduler;
  if (existingState?.started) return;

  const state: SchedulerState = { started: true };
  schedulerState.__cardverseRefreshScheduler = state;

  const intervalHours = positiveNumber(process.env.CARDAPI_REFRESH_INTERVAL_HOURS, 24);
  const retryHours = positiveNumber(process.env.CARDAPI_REFRESH_RETRY_HOURS, 6);
  const startupDelaySeconds = positiveNumber(process.env.CARDAPI_REFRESH_STARTUP_DELAY_SECONDS, 15);
  const intervalMs = intervalHours * 60 * 60 * 1_000;
  const retryMs = retryHours * 60 * 60 * 1_000;
  const checkIntervalMs = Math.min(intervalMs, 60 * 60 * 1_000);
  const firstCheckAt = new Date(Date.now() + startupDelaySeconds * 1_000);

  schedulerLog(
    `Started. First check: ${firstCheckAt.toISOString()}. ` +
    `Refresh age: ${intervalHours}h. Failure backoff: ${retryHours}h. ` +
    `Check interval: ${checkIntervalMs / (60 * 1_000)}m.`,
  );

  state.timeout = setTimeout(() => void refreshIfDue(intervalMs, retryMs), startupDelaySeconds * 1_000);
  state.interval = setInterval(() => void refreshIfDue(intervalMs, retryMs), checkIntervalMs);
  state.timeout.unref?.();
  state.interval.unref?.();
}
