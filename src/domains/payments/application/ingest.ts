import { eq, sql } from "drizzle-orm";

import { paymentEvents, payments, refunds } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAudit } from "@/infrastructure/audit/writer";
import { logger } from "@/infrastructure/logging/logger";
import { enqueueOutboxEvents } from "@/infrastructure/outbox/writer";
import { applySouqPaymentEvent } from "@/domains/souq/application/souq-service";
import { applyKhidmaPaymentEvent } from "@/domains/khidma/application/khidma-service";
import { applyKrayaPaymentEvent } from "@/domains/kraya/application/kraya-service";
import {
  getPaymentById,
  getPaymentByProviderRef,
  getRefundById,
  transitionPayment,
} from "@/domains/payments/infrastructure/payment-repository";
import { DomainEvents } from "@/lib/events";
import { InternalError } from "@/lib/errors";
import type { JsonObject } from "@/types/json";

export type ProviderEventType =
  | "payment.authorized"
  | "payment.captured"
  | "payment.capture_failed"
  | "payment.failed"
  | "payment.voided"
  | "refund.completed"
  | "refund.failed";

export interface ProviderEventEnvelope {
  provider: "mock";
  providerEventId: string;
  eventType: ProviderEventType;
  payload: JsonObject;
  signatureVerified: boolean;
}

/**
 * The single ingestion path for provider events (§38): signature verified,
 * deduplicated by (provider, provider_event_id), out-of-order safe
 * (state-conditional transitions), and idempotent. Duplicates are recorded
 * as such and skipped without side effects.
 */
export async function ingestProviderEvent(
  db: DbExecutor,
  envelope: ProviderEventEnvelope,
): Promise<{ duplicate: boolean }> {
  if (!envelope.signatureVerified) {
    throw new InternalError("Refusing to ingest an unverified provider event");
  }
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentEvents)
      .values({
        provider: envelope.provider,
        providerEventId: envelope.providerEventId,
        eventType: envelope.eventType,
        payload: envelope.payload,
        signatureVerified: envelope.signatureVerified,
      })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });
    if (inserted.length === 0) {
      return { duplicate: true };
    }
    await applyEvent(tx, envelope);
    await tx
      .update(paymentEvents)
      .set({ processedAt: new Date() })
      .where(eq(paymentEvents.id, inserted[0].id));
    return { duplicate: false };
  });
}

async function applyEvent(tx: Tx, envelope: ProviderEventEnvelope): Promise<void> {
  if (envelope.eventType.startsWith("refund.")) {
    await applyRefundEvent(tx, envelope);
    return;
  }
  const payment = await resolvePayment(tx, envelope);
  if (!payment) {
    logger.warn("provider_event_unmatched", {
      eventType: envelope.eventType,
      providerEventId: envelope.providerEventId,
    });
    return;
  }

  switch (envelope.eventType) {
    case "payment.authorized": {
      const updated = await transitionPayment(tx, {
        paymentId: payment.id,
        from: ["authorization_pending"],
        to: "authorized",
      });
      if (!updated) return; // out-of-order or duplicate outcome — canonical state already advanced
      await auditTransition(tx, payment.id, "authorization_pending", "authorized", envelope);
      await enqueueOutboxEvents(tx, [
        {
          eventType: DomainEvents.paymentAuthorized,
          aggregateType: "payment",
          aggregateId: payment.id,
          payload: { paymentId: payment.id },
        },
      ]);
      await projectToVertical(tx, updated, "authorized");
      return;
    }
    case "payment.captured": {
      const updated = await transitionPayment(tx, {
        paymentId: payment.id,
        from: ["capture_pending"],
        to: "captured",
        capturedMinorAdd: payment.amountMinor,
      });
      if (!updated) return;
      await auditTransition(tx, payment.id, "capture_pending", "captured", envelope);
      await enqueueOutboxEvents(tx, [
        {
          eventType: DomainEvents.paymentCaptured,
          aggregateType: "payment",
          aggregateId: payment.id,
          payload: { paymentId: payment.id },
        },
      ]);
      await projectToVertical(tx, updated, "captured");
      return;
    }
    case "payment.capture_failed": {
      // Retryable: return to authorized so another capture can be requested.
      const updated = await transitionPayment(tx, {
        paymentId: payment.id,
        from: ["capture_pending"],
        to: "authorized",
      });
      if (!updated) return;
      await auditTransition(tx, payment.id, "capture_pending", "authorized", envelope);
      return;
    }
    case "payment.failed": {
      const updated = await transitionPayment(tx, {
        paymentId: payment.id,
        from: ["authorization_pending"],
        to: "failed",
      });
      if (!updated) return;
      await auditTransition(tx, payment.id, "authorization_pending", "failed", envelope);
      await enqueueOutboxEvents(tx, [
        {
          eventType: DomainEvents.paymentFailed,
          aggregateType: "payment",
          aggregateId: payment.id,
          payload: { paymentId: payment.id },
        },
      ]);
      await projectToVertical(tx, updated, "failed");
      return;
    }
    case "payment.voided": {
      const updated = await transitionPayment(tx, {
        paymentId: payment.id,
        from: ["void_pending"],
        to: "voided",
      });
      if (!updated) return;
      await auditTransition(tx, payment.id, "void_pending", "voided", envelope);
      await enqueueOutboxEvents(tx, [
        {
          eventType: DomainEvents.paymentVoided,
          aggregateType: "payment",
          aggregateId: payment.id,
          payload: { paymentId: payment.id },
        },
      ]);
      await projectToVertical(tx, updated, "voided");
      return;
    }
  }
}

async function resolvePayment(tx: Tx, envelope: ProviderEventEnvelope) {
  const payloadPaymentId = envelope.payload.paymentId;
  if (typeof payloadPaymentId === "string") {
    const payment = await getPaymentById(tx, payloadPaymentId);
    if (payment) return payment;
  }
  const payloadRef = envelope.payload.providerRef;
  if (typeof payloadRef === "string") {
    return getPaymentByProviderRef(tx, payloadRef);
  }
  return null;
}

type VerticalProjectionKind = "authorized" | "captured" | "failed" | "voided" | "refunded";

async function projectToVertical(
  tx: Tx,
  payment: {
    id: string;
    souqParticipantId: string | null;
    khidmaBookingId: string | null;
    krayaBookingId: string | null;
  },
  kind: VerticalProjectionKind,
): Promise<void> {
  await applySouqPaymentEvent(tx, payment, kind);
  await applyKhidmaPaymentEvent(tx, payment, kind);
  await applyKrayaPaymentEvent(tx, payment, kind);
}

async function applyRefundEvent(tx: Tx, envelope: ProviderEventEnvelope): Promise<void> {
  const payloadRefundId = envelope.payload.refundId;
  const refund =
    typeof payloadRefundId === "string" ? await getRefundById(tx, payloadRefundId) : null;
  if (!refund) {
    logger.warn("refund_event_unmatched", {
      eventType: envelope.eventType,
      providerEventId: envelope.providerEventId,
    });
    return;
  }

  if (envelope.eventType === "refund.completed") {
    const [updatedRefund] = await tx
      .update(refunds)
      .set({ state: "completed", updatedAt: new Date() })
      .where(eq(refunds.id, refund.id))
      .returning();
    if (!updatedRefund) return;

    // Ledger increment + forward-only payment state: refund_pending → refunded (full) | captured (partial).
    const [payment] = await tx
      .update(payments)
      .set({
        refundedMinor: sql`${payments.refundedMinor} + ${refund.amountMinor}`,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, refund.paymentId))
      .returning();
    if (!payment) return;
    const fullyRefunded = payment.refundedMinor >= payment.capturedMinor;
    const stateUpdated = await transitionPayment(tx, {
      paymentId: payment.id,
      from: ["refund_pending"],
      to: fullyRefunded ? "refunded" : "captured",
    });
    if (!stateUpdated) {
      // Concurrent refund bookkeeping already advanced the state — safe to continue.
    }
    await auditTransition(tx, refund.id, "provider_pending", "completed", envelope);
    await enqueueOutboxEvents(tx, [
      {
        eventType: DomainEvents.refundCompleted,
        aggregateType: "refund",
        aggregateId: refund.id,
        payload: {
          refundId: refund.id,
          paymentId: refund.paymentId,
          notify: {
            userId: payment.payerId,
            kind: "refund_completed",
            title: "Refund completed",
            body: "Your refund has been processed by the payment provider.",
            entityType: "payment",
            entityId: refund.paymentId,
          },
        },
      },
    ]);
    await projectToVertical(
      tx,
      {
        id: payment.id,
        souqParticipantId: payment.souqParticipantId,
        khidmaBookingId: payment.khidmaBookingId,
        krayaBookingId: payment.krayaBookingId,
      },
      "refunded",
    );
    return;
  }

  // refund.failed → the payment returns to captured (retryable); the refund row records the failure.
  const [failedRefund] = await tx
    .update(refunds)
    .set({ state: "failed", updatedAt: new Date() })
    .where(eq(refunds.id, refund.id))
    .returning();
  if (!failedRefund) return;
  await transitionPayment(tx, { paymentId: refund.paymentId, from: ["refund_pending"], to: "captured" });
  await auditTransition(tx, refund.id, "provider_pending", "failed", envelope);
  const paymentRow = await getPaymentById(tx, refund.paymentId);
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.refundFailed,
      aggregateType: "refund",
      aggregateId: refund.id,
      payload: {
        refundId: refund.id,
        notify: {
          userId: paymentRow?.payerId ?? "",
          kind: "payment_attention",
          title: "Refund needs attention",
          body: "A refund attempt failed and will be retried.",
          entityType: "refund",
          entityId: refund.id,
        },
      },
    },
  ]);
}

async function auditTransition(
  tx: Tx,
  entityId: string,
  from: string,
  to: string,
  envelope: ProviderEventEnvelope,
): Promise<void> {
  await recordAudit(tx, {
    actorId: null,
    actorRole: "system",
    action: `provider.${envelope.eventType}`,
    entityType: "payment",
    entityId,
    before: { state: from },
    after: { state: to },
    metadata: { providerEventId: envelope.providerEventId, provider: envelope.provider },
  });
}
