import { runJobsLogged } from "@/jobs/run-once";
import { logger } from "@/infrastructure/logging/logger";

const INTERVAL_MS = 2_000;

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  if (running) return; // never overlap passes inside one process
  running = true;
  try {
    await runJobsLogged();
  } catch (error) {
    logger.error("jobs_pass_failed", {
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
  } finally {
    running = false;
  }
}

/** Starts the in-process worker loop (single-node modular monolith). */
export function startWorkerLoop(): void {
  if (timer) return;
  logger.info("worker_started", { intervalMs: INTERVAL_MS });
  timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  void tick();
}

export function stopWorkerLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
