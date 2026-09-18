import { eq } from "drizzle-orm";

import { payouts } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAudit } from "@/infrastructure/audit/writer";
import { logger } from "@/infrastructure/logging/logger";
import { enqueueOutboxEvents } from "@/infrastructure/outbox/writer";
import { MockGateway } from "@/infrastructure/payments/mock-gateway";
import { DomainEvents } from "@/lib/events";
import { asCurrency } from "@/lib/money";

const gateway = new MockGateway();

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
        entityType: "kraya_booking",
        entityId: payout.bookingId,
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
        entityType: "kraya_booking",
        entityId: current.bookingId,
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
      entityType: "kraya_booking",
      entityId: current.bookingId,
      after: { payoutState: "paid", amountMinor: paid.amountMinor },
      metadata: { providerRef: result.providerRef, feeMinor: paid.feeMinor },
    });
    await enqueueOutboxEvents(tx, [
      {
        eventType: DomainEvents.payoutPaid,
        aggregateType: "kraya_booking",
        aggregateId: current.bookingId,
        payload: {
          payoutId: paid.id,
          notify: {
            userId: paid.ownerId,
            kind: "refund_completed",
            title: "Payout sent",
            body: `Your earnings for this rental have been settled: ${(paid.amountMinor / 100).toFixed(2)} ${paid.currency}.`,
            entityType: "kraya_booking",
            entityId: current.bookingId,
          },
        },
      },
    ]);
  });
}
