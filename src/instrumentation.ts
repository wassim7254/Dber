/**
 * Registers the in-process background worker when the Node.js server starts
 * (dev and single-node production). Serverless deploys drive the same jobs
 * through POST /api/v1/jobs/tick instead.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startWorkerLoop } = await import("@/jobs/worker");
  startWorkerLoop();
}
