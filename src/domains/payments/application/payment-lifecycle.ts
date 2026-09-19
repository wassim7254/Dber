import { and, eq, inArray, lt } from "drizzle-orm";

import { payments, refunds } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAudit } from "@/infrastructure/audit/writer";
import { logger } from "@/infrastructure/logging/logger";
import { expectedAuthRef, expectedRefundRef } from "@/infrastructure/payments/mock-gateway";
import { getGateway } from "@/infrastructure/payments/gateway-factory";
import {
  getPaymentById,
  getRefundById,
  transitionPayment,
} from "@/domains/payments/infrastructure/payment-repository";
import { ingestProviderEvent } from "@/domains/payments/application/ingest";
import { asCurrency } from "@/lib/money";

const gateway = getGateway();
type Db = DbExecutor;

/**
 * Outbox handlers driving the payment lifecycle (§12/§14). Every handler is
 * idempotent AND resumable: after a crash between the provider call and the
 * completion record, redelivery re-enters, observes the intermediate state,
 * and repeats the (provider-idempotent) call until the canonical event lands.
 */

export async function handlePaymentRequested(db: Db, payload: { paymentId: string }): Promise<void> {
  const payment = await getPaymentById(db, payload.paymentId);
  if (!payment) return;
  if (payment.state === "created") {
    await db.transaction(async (tx: Tx) => {
      const updated = await transitionPayment(tx, {
        paymentId: payment.id,
        from: ["created"],
        to: "authorization_pending",
        providerRef: expectedAuthRef(`auth_${payment.id}`),
      });
      if (!updated) return;
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "payment.authorization_started",
        entityType: "payment",
        entityId: payment.id,
        after: { state: "authorization_pending" },
      });
    });
  }
  const current = await getPaymentById(db, payment.id);
  if (!current || current.state !== "authorization_pending") return;
  const result = await gateway.authorize({
    idempotencyKey: `auth_${payment.id}`,
    amountMinor: current.amountMinor,
    currency: asCurrency(current.currency),
  });
  if (result.outcome === "pending") {
    // Provider accepted but the effect awaits customer confirmation — the
    // canonical authorized state lands only from a verified provider event.
    logger.info("payment.authorize_pending_provider_event", { paymentId: payment.id });
    return;
  }
  await ingestProviderEvent(
    db,
    result.outcome === "succeeded"
      ? {
          provider: gateway.provider,
          providerEventId: result.providerEventId,
          eventType: "payment.authorized",
          payload: { paymentId: payment.id },
          signatureVerified: true,
        }
      : {
          provider: gateway.provider,
          providerEventId: result.providerEventId,
          eventType: "payment.failed",
          payload: { paymentId: payment.id, reason: result.failureReason ?? "declined" },
          signatureVerified: true,
        },
  );
}

export async function handleCaptureRequested(db: Db, payload: { paymentId: string }): Promise<void> {
  const payment = await getPaymentById(db, payload.paymentId);
  if (!payment) return;
  if (payment.state === "authorized") {
    await db.transaction(async (tx: Tx) => {
      const updated = await transitionPayment(tx, {
        paymentId: payment.id,
        from: ["authorized"],
        to: "capture_pending",
      });
      if (!updated) return;
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "payment.capture_started",
        entityType: "payment",
        entityId: payment.id,
        after: { state: "capture_pending" },
      });
    });
  }
  const current = await getPaymentById(db, payment.id);
  if (!current || current.state !== "capture_pending" || !current.providerRef) return;
  const result = await gateway.capture({
    providerRef: current.providerRef,
    idempotencyKey: `capture_${payment.id}`,
    amountMinor: current.amountMinor,
  });
  await ingestProviderEvent(
    db,
    result.outcome === "succeeded"
      ? {
          provider: gateway.provider,
          providerEventId: result.providerEventId,
          eventType: "payment.captured",
          payload: { paymentId: payment.id },
          signatureVerified: true,
        }
      : {
          provider: gateway.provider,
          providerEventId: result.providerEventId,
          eventType: "payment.capture_failed",
          payload: { paymentId: payment.id, reason: result.failureReason ?? "processor_unavailable" },
          signatureVerified: true,
        },
  );
}

export async function handleVoidRequested(db: Db, payload: { paymentId: string }): Promise<void> {
  const payment = await getPaymentById(db, payload.paymentId);
  if (!payment) return;
  if (payment.state === "authorized" || payment.state === "capture_pending") {
    await db.transaction(async (tx: Tx) => {
      const updated = await transitionPayment(tx, {
        paymentId: payment.id,
        from: ["authorized", "capture_pending"],
        to: "void_pending",
      });
      if (!updated) return;
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "payment.void_started",
        entityType: "payment",
        entityId: payment.id,
        after: { state: "void_pending" },
      });
    });
  }
  const current = await getPaymentById(db, payment.id);
  if (!current || current.state !== "void_pending" || !current.providerRef) return;
  const result = await gateway.voidPayment({
    providerRef: current.providerRef,
    idempotencyKey: `void_${payment.id}`,
  });
  await ingestProviderEvent(db, {
    provider: gateway.provider,
    providerEventId: result.providerEventId,
    eventType: "payment.voided",
    payload: { paymentId: payment.id },
    signatureVerified: true,
  });
}

export async function handleRefundRequested(db: Db, payload: { refundId: string }): Promise<void> {
  const refund = await getRefundById(db, payload.refundId);
  if (!refund) return;
  if (refund.state === "requested") {
    await db.transaction(async (tx: Tx) => {
      const payment = await getPaymentById(tx, refund.paymentId);
      if (!payment) return;
      // captured → refund_pending while the provider processes the refund.
      const updatedPayment = await transitionPayment(tx, {
        paymentId: payment.id,
        from: ["captured"],
        to: "refund_pending",
      });
      const updatedRefund = await tx
        .update(refunds)
        .set({
          state: "provider_pending",
          providerRef: expectedRefundRef(`refund_${refund.id}`),
          updatedAt: new Date(),
        })
        .where(and(eq(refunds.id, refund.id), eq(refunds.state, "requested")))
        .returning({ id: refunds.id });
      if (!updatedPayment && !updatedRefund.length) return;
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "refund.provider_started",
        entityType: "refund",
        entityId: refund.id,
        after: { state: "provider_pending" },
        metadata: { paymentId: refund.paymentId, amountMinor: refund.amountMinor },
      });
    });
  }
  const current = await getRefundById(db, refund.id);
  if (!current || current.state !== "provider_pending") return;
  const paymentForCurrency = await getPaymentById(db, current.paymentId);
  const result = await gateway.refund({
    providerRef: current.providerRef ?? expectedRefundRef(`refund_${current.id}`),
    idempotencyKey: `refund_${current.id}`,
    amountMinor: current.amountMinor,
    currency: asCurrency(paymentForCurrency?.currency ?? "MAD"),
  });
  if (result.outcome === "pending") {
    logger.info("refund.pending_provider_event", { refundId: current.id });
    return;
  }
  await ingestProviderEvent(
    db,
    result.outcome === "succeeded"
      ? {
          provider: gateway.provider,
          providerEventId: result.providerEventId,
          eventType: "refund.completed",
          payload: { refundId: current.id },
          signatureVerified: true,
        }
      : {
          provider: gateway.provider,
          providerEventId: result.providerEventId,
          eventType: "refund.failed",
          payload: { refundId: current.id, reason: result.failureReason ?? "refund_failed" },
          signatureVerified: true,
        },
  );
}

/**
 * Reconciliation (§70): payments stuck in an intermediate state past the SLA
 * are queried at the provider and the canonical state is applied
 * forward-only, fully audited.
 */
export async function reconcileStuckPayments(db: Db): Promise<{ reconciled: number }> {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const stuck = await db
    .select({ id: payments.id, state: payments.state, providerRef: payments.providerRef })
    .from(payments)
    .where(
      and(
        inArray(payments.state, ["authorization_pending"]),
        lt(payments.updatedAt, cutoff),
      ),
    )
    .limit(50);
  let reconciled = 0;
  for (const payment of stuck) {
    if (!payment.providerRef) continue;
    const providerState = await gateway.getPayment(payment.providerRef);
    if (providerState !== "authorized" && providerState !== "captured") continue;
    await ingestProviderEvent(db, {
      provider: gateway.provider,
      providerEventId: `mock_evt_recon_${payment.id}:${providerState}`,
      eventType: providerState === "authorized" ? "payment.authorized" : "payment.captured",
      payload: { paymentId: payment.id, source: "reconciliation" },
      signatureVerified: true,
    });
    await db.transaction(async (tx: Tx) => {
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "payment.reconciled",
        entityType: "payment",
        entityId: payment.id,
        after: { providerState },
        metadata: { source: "reconciliation_job" },
      });
    });
    reconciled += 1;
  }
  if (stuck.length > 0) {
    logger.info("payment.reconciliation_pass", { candidates: stuck.length, reconciled });
  }
  return { reconciled };
}
