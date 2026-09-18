import { and, eq } from "drizzle-orm";

import { idempotencyKeys } from "@/db/schema";
import type { Tx } from "@/db/tx";
import { ConflictError, IdempotencyConflictError, InternalError } from "@/lib/errors";
import type { Json } from "@/types/json";

export interface IdempotencyReservationInput {
  scope: string;
  key: string;
  userId: string;
  requestHash: string;
}

export type IdempotencyReservation =
  | { outcome: "created" }
  | { outcome: "replay"; responseStatus: number; responseBody: Json };

/**
 * Reserves the idempotency key INSIDE the caller's transaction (§7/§11).
 *
 * - First request: the INSERT succeeds; the caller executes the business
 *   mutation and completes the reservation in the same transaction.
 * - Concurrent duplicate: the INSERT blocks on the conflicting in-flight
 *   transaction. If that transaction commits, this insert resolves to a
 *   conflict and we replay (or reject on hash mismatch). If it aborts, the
 *   insert succeeds and this request executes cleanly — no orphan state.
 * - Crash before commit: PostgreSQL rolls the whole transaction back,
 *   reservation included, so the retry re-executes from scratch.
 */
export async function reserveIdempotency(
  tx: Tx,
  input: IdempotencyReservationInput,
): Promise<IdempotencyReservation> {
  const inserted = await tx
    .insert(idempotencyKeys)
    .values({
      scope: input.scope,
      key: input.key,
      userId: input.userId,
      requestHash: input.requestHash,
      status: "in_progress",
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });

  if (inserted.length > 0) {
    return { outcome: "created" };
  }

  const existing = await tx
    .select({
      status: idempotencyKeys.status,
      requestHash: idempotencyKeys.requestHash,
      responseStatus: idempotencyKeys.responseStatus,
      responseBody: idempotencyKeys.responseBody,
    })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.scope, input.scope),
        eq(idempotencyKeys.userId, input.userId),
        eq(idempotencyKeys.key, input.key),
      ),
    )
    .limit(1);

  const row = existing[0];
  if (!row) {
    throw new InternalError("Idempotency reservation vanished after conflict");
  }
  if (row.status === "completed") {
    if (row.requestHash !== input.requestHash) {
      throw new IdempotencyConflictError();
    }
    if (row.responseStatus === null || row.responseBody === null) {
      throw new InternalError("Completed idempotency record is missing its response snapshot");
    }
    return { outcome: "replay", responseStatus: row.responseStatus, responseBody: row.responseBody };
  }
  // "in_progress" can only be observed from a transaction that is still
  // running (it would have completed or rolled back otherwise) — treat as a
  // concurrency conflict rather than guessing.
  throw new ConflictError("An identical request is already in progress");
}

export async function completeIdempotency(
  tx: Tx,
  input: IdempotencyReservationInput & { responseStatus: number; responseBody: Json },
): Promise<void> {
  await tx
    .update(idempotencyKeys)
    .set({
      status: "completed",
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(idempotencyKeys.scope, input.scope),
        eq(idempotencyKeys.userId, input.userId),
        eq(idempotencyKeys.key, input.key),
      ),
    );
}
