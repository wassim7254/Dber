import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import type { DbExecutor } from "@/db/tx";
import { processOutboxBatch, requeueStuckOutboxEvents } from "@/infrastructure/outbox/dispatcher";
import { resolveEventHandler } from "@/jobs/handlers";
import { expireOpenCircles } from "@/domains/souq/application/souq-service";
import { cancelStalePaymentPendingBookings, expireDueQuotes } from "@/domains/khidma/application/khidma-service";
import { activateDueRentals, cancelStaleRentalBookings } from "@/domains/kraya/application/kraya-service";
import { reconcileStuckPayments } from "@/domains/payments/application/payment-lifecycle";
import { logger } from "@/infrastructure/logging/logger";

/** Idempotency key cleanup (§7): completed reservations past expiry are operational data, not records. */
export async function cleanupIdempotencyKeys(executor: DbExecutor): Promise<{ deleted: number }> {
  const result = await executor.execute(
    sql`DELETE FROM idempotency_keys WHERE status = 'completed' AND expires_at < now()`,
  );
  const rows = "rows" in result ? (result.rows as unknown[]).length : 0;
  return { deleted: rows };
}

export interface JobsPassSummary {
  outbox: { claimed: number; processed: number; failed: number };
  souqExpired: number;
  khidmaTimedOut: number;
  krayaTimedOut: number;
  krayaActivated: number;
  khidmaQuotesExpired: number;
  paymentsReconciled: number;
  idempotencyDeleted: number;
}

/**
 * One deterministic pass of every job (§59). Safe to run concurrently with
 * itself: outbox uses SKIP LOCKED, schedulers use state-conditional updates.
 */
export async function runJobsOnce(executor: DbExecutor = db): Promise<JobsPassSummary> {
  const outbox = await processOutboxBatch(executor, resolveEventHandler);
  const souq = await expireOpenCircles(executor);
  const khidmaTtl = await cancelStalePaymentPendingBookings(executor);
  const krayaTtl = await cancelStaleRentalBookings(executor);
  const krayaActivation = await activateDueRentals(executor);
  const khidmaQuotes = await expireDueQuotes(executor);
  const reconciliation = await reconcileStuckPayments(executor);
  const idempotency = await cleanupIdempotencyKeys(executor);
  await requeueStuckOutboxEvents(executor);
  return {
    outbox,
    souqExpired: souq.expired,
    khidmaTimedOut: khidmaTtl.cancelled,
    krayaTimedOut: krayaTtl.cancelled,
    krayaActivated: krayaActivation.activated,
    khidmaQuotesExpired: khidmaQuotes.expired,
    paymentsReconciled: reconciliation.reconciled,
    idempotencyDeleted: idempotency.deleted,
  };
}

export async function runJobsLogged(): Promise<JobsPassSummary> {
  const summary = await runJobsOnce();
  logger.info("jobs_pass", { ...summary });
  return summary;
}
