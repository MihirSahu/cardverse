export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startCardRefreshScheduler } = await import("@/lib/card-refresh-scheduler");
  startCardRefreshScheduler();
}
