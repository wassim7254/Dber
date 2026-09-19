import { and, eq } from "drizzle-orm";

import { payouts } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAudit } from "@/infrastructure/audit/writer";
import { logger } from "@/infrastructure/logging/logger";
import { enqueueOutboxEvents } from "@/infrastructure/outbox/writer";
import { getGateway } from "@/infrastructure/payments/gateway-factory";
import { DomainEvents } from "@/lib/events";
import { asCurrency, computeMarketplaceFee } from "@/lib/money";

const gateway = getGateway();

type PayoutEntity = (typeof payouts.$inferSelect)["entityType"];

/**
 * Creates the provider payout row for a completed transaction (pending) and
 * enqueues its settlement event — called inside the completion transaction.
 * Idempotent: a second call for the same entity is a no-op.
 */
export async function createPayout(
  tx: Tx,
  input: {
    entityType: PayoutEntity;
    entityId: string;
    ownerId: string;
    grossMinor: number;
    currency: ReturnType<typeof asCurrency>;
  },
): Promise<{ payoutId: string } | null> {
  const existing = await tx
    .select({ id: payouts.id })
    .from(payouts)
    .where(and(eq(payouts.entityType, input.entityType), eq(payouts.entityId, input.entityId)))
    .limit(1);
  if (existing.length > 0) return null;
  const feeMinor = computeMarketplaceFee(input.grossMinor);
  const amountMinor = input.grossMinor - feeMinor;
  if (amountMinor <= 0) return null;
  const [payout] = await tx
    .insert(payouts)
    .values({
      ownerId: input.ownerId,
      entityType: input.entityType,
      entityId: input.entityId,
      grossMinor: input.grossMinor,
      feeMinor,
      amountMinor,
      currency: input.currency,
      state: "pending",
    })
    .returning({ id: payouts.id });
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.payoutRequested,
      aggregateType: input.entityType,
      aggregateId: input.entityId,
      payload: { payoutId: payout.id },
    },
  ]);
  return { payoutId: payout.id };
}

/**
 * Payout settlement (provider flow's final step): pending → processing →
 * paid via the gateway port, driven by the outbox. Idempotent AND resumable
 * — redelivery after a crash re-enters at the recorded state and repeats the
 * (provider-idempotent) call with the same key.
 */
export async function handlePayoutRequested(db: DbExecutor, payload: { payoutId: string }): Promise<void> {
  const [payout] = await db.select().from(payouts).where(eq(payouts.id, payload.payoutId)).limit(1);
  if (!payout) return;

  if (payout.state === "pending") {
    await db.transaction(async (tx: Tx) => {
      const [updated] = await tx
        .update(payouts)
        .set({ state: "processing", updatedAt: new Date() })
        .where(eq(payouts.id, payout.id))
        .returning({ id: payouts.id });
      if (!updated) return;
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "payout.settlement_started",
        entityType: payout.entityType,
        entityId: payout.entityId,
        after: { payoutState: "processing", amountMinor: payout.amountMinor },
      });
    });
  }

  const [current] = await db.select().from(payouts).where(eq(payouts.id, payout.id)).limit(1);
  if (!current || current.state !== "processing") return;

  const result = await gateway.payout({
    idempotencyKey: `payout_${current.id}`,
    amountMinor: current.amountMinor,
    currency: asCurrency(current.currency),
  });

  if (result.outcome === "failed") {
    await db.transaction(async (tx: Tx) => {
      await tx
        .update(payouts)
        .set({ state: "failed", providerRef: result.providerRef, updatedAt: new Date() })
        .where(eq(payouts.id, current.id));
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "payout.failed",
        entityType: current.entityType,
        entityId: current.entityId,
        metadata: { reason: result.failureReason ?? "payout_failed", payoutId: current.id },
      });
    });
    logger.error("payout_failed", { payoutId: current.id, reason: result.failureReason });
    return;
  }

  await db.transaction(async (tx: Tx) => {
    const [paid] = await tx
      .update(payouts)
      .set({ state: "paid", providerRef: result.providerRef, updatedAt: new Date() })
      .where(eq(payouts.id, current.id))
      .returning();
    if (!paid) return;
    await recordAudit(tx, {
      actorId: null,
      actorRole: "system",
      action: "payout.paid",
      entityType: paid.entityType,
      entityId: paid.entityId,
      after: { payoutState: "paid", amountMinor: paid.amountMinor },
      metadata: { providerRef: result.providerRef, feeMinor: paid.feeMinor },
    });
    await enqueueOutboxEvents(tx, [
      {
        eventType: DomainEvents.payoutPaid,
        aggregateType: paid.entityType,
        aggregateId: paid.entityId,
        payload: {
          payoutId: paid.id,
          notify: {
            userId: paid.ownerId,
            kind: "refund_completed",
            title: "Payout sent",
            body: `Your earnings have been settled: ${(paid.amountMinor / 100).toFixed(2)} ${paid.currency}.`,
            entityType: paid.entityType,
            entityId: paid.entityId,
          },
        },
      },
    ]);
  });
}
