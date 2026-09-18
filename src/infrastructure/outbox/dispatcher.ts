import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

import { outboxEvents } from "@/db/schema";
import type { DbExecutor } from "@/db/tx";
import { logger } from "@/infrastructure/logging/logger";
import type { Json } from "@/types/json";

export interface OutboxEventView {
  id: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: Json;
  attemptCount: number;
}

export type OutboxHandler = (db: DbExecutor, event: OutboxEventView) => Promise<void>;

const MAX_ATTEMPTS = 12;
const STUCK_LOCK_MS = 5 * 60_000;

export interface OutboxBatchResult {
  claimed: number;
  processed: number;
  failed: number;
}

/**
 * Outbox worker batch (§11): claims pending events with FOR UPDATE SKIP
 * LOCKED (safe against worker duplication), executes handlers, and applies
 * exponential backoff on failure with a bounded retry ceiling (no infinite
 * loops). Handlers must be idempotent — at-least-once delivery here means
 * effectively-once business semantics at the provider.
 */
export async function processOutboxBatch(
  db: DbExecutor,
  resolveHandler: (eventType: string) => OutboxHandler | null,
  limit = 20,
): Promise<OutboxBatchResult> {
  const now = new Date();
  const claimed = await db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(and(eq(outboxEvents.status, "pending"), lte(outboxEvents.availableAt, now)))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return [];
    return tx
      .update(outboxEvents)
      .set({
        status: "processing",
        lockedAt: now,
        attemptCount: sql`${outboxEvents.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(
        inArray(
          outboxEvents.id,
          candidates.map((candidate) => candidate.id),
        ),
      )
      .returning({
        id: outboxEvents.id,
        eventType: outboxEvents.eventType,
        eventVersion: outboxEvents.eventVersion,
        aggregateType: outboxEvents.aggregateType,
        aggregateId: outboxEvents.aggregateId,
        payload: outboxEvents.payload,
        attemptCount: outboxEvents.attemptCount,
      });
  });

  let processed = 0;
  let failed = 0;
  for (const event of claimed) {
    const handler = resolveHandler(event.eventType);
    try {
      if (!handler) {
        // Events without a registered handler are marked processed — they are
        // audit/notify-only today; new consumers attach by event type.
        logger.debug("outbox_event_no_handler", { eventType: event.eventType, id: event.id });
      } else {
        await handler(db, event);
      }
      await db
        .update(outboxEvents)
        .set({ status: "processed", processedAt: new Date(), updatedAt: new Date() })
        .where(eq(outboxEvents.id, event.id));
      processed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "unknown outbox handler failure";
      if (event.attemptCount >= MAX_ATTEMPTS) {
        await db
          .update(outboxEvents)
          .set({ status: "failed", lastError: message, updatedAt: new Date() })
          .where(eq(outboxEvents.id, event.id));
        logger.error("outbox_event_poisoned", { id: event.id, eventType: event.eventType, error: message });
      } else {
        const backoffMs = Math.min(60_000 * 2 ** (event.attemptCount - 1), 3_600_000);
        await db
          .update(outboxEvents)
          .set({
            status: "pending",
            availableAt: new Date(Date.now() + backoffMs),
            lastError: message,
            updatedAt: new Date(),
          })
          .where(eq(outboxEvents.id, event.id));
        logger.warn("outbox_event_requeued", {
          id: event.id,
          eventType: event.eventType,
          attempt: event.attemptCount,
          backoffMs,
          error: message,
        });
      }
    }
  }
  return { claimed: claimed.length, processed, failed };
}

/**
 * Crash recovery (§12): events stuck in `processing` with a stale lock are
 * requeued — their handlers are idempotent, so redelivery is safe.
 */
export async function requeueStuckOutboxEvents(db: DbExecutor): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_LOCK_MS);
  const unstuck = await db
    .update(outboxEvents)
    .set({ status: "pending", lockedAt: null, updatedAt: new Date() })
    .where(and(eq(outboxEvents.status, "processing"), lte(outboxEvents.lockedAt, cutoff)))
    .returning({ id: outboxEvents.id });
  if (unstuck.length > 0) {
    logger.warn("outbox_stuck_events_requeued", { count: unstuck.length });
  }
  return unstuck.length;
}
