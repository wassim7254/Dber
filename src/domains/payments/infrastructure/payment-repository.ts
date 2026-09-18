import { and, eq, inArray, sql } from "drizzle-orm";

import { payments, refunds } from "@/db/schema";
import type { paymentCategoryEnum, paymentStateEnum } from "@/db/schema/enums";
import type { Tx } from "@/db/tx";
import type { DbExecutor } from "@/db/tx";
import { enqueueOutboxEvents } from "@/infrastructure/outbox/writer";
import { DomainEvents } from "@/lib/events";
import { PaymentStateError, RefundStateError, ResourceNotFoundError } from "@/lib/errors";
import type { Currency } from "@/lib/money";

export type PaymentRow = typeof payments.$inferSelect;
export type PaymentState = (typeof paymentStateEnum.enumValues)[number];
export type PaymentCategory = (typeof paymentCategoryEnum.enumValues)[number];
export type RefundRow = typeof refunds.$inferSelect;

export interface CreatePaymentInput {
  category: PaymentCategory;
  payerId: string;
  amountMinor: number;
  currency: Currency;
  souqParticipantId?: string;
  khidmaBookingId?: string;
  krayaBookingId?: string;
}

/**
 * Inserts the payment row (state `created`) and enqueues its processing
 * event in the SAME transaction — a payment cannot exist without its
 * lifecycle being driven.
 */
export async function createPaymentWithIntent(tx: Tx, input: CreatePaymentInput): Promise<PaymentRow> {
  const [payment] = await tx
    .insert(payments)
    .values({
      category: input.category,
      payerId: input.payerId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      state: "created",
      ...(input.souqParticipantId ? { souqParticipantId: input.souqParticipantId } : {}),
      ...(input.khidmaBookingId ? { khidmaBookingId: input.khidmaBookingId } : {}),
      ...(input.krayaBookingId ? { krayaBookingId: input.krayaBookingId } : {}),
    })
    .returning();
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.paymentRequested,
      aggregateType: "payment",
      aggregateId: payment.id,
      payload: { paymentId: payment.id },
    },
  ]);
  return payment;
}

/** Enqueues a capture or void intent for an existing payment. */
export async function enqueuePaymentIntent(
  tx: Tx,
  paymentId: string,
  kind: "capture" | "void",
): Promise<void> {
  await enqueueOutboxEvents(tx, [
    {
      eventType:
        kind === "capture" ? DomainEvents.paymentCaptureRequested : DomainEvents.paymentVoidRequested,
      aggregateType: "payment",
      aggregateId: paymentId,
      payload: { paymentId },
    },
  ]);
}

export interface TransitionPaymentInput {
  paymentId: string;
  from: readonly PaymentState[];
  to: PaymentState;
  providerRef?: string;
  capturedMinorAdd?: number;
}

/**
 * State-conditional payment update. Returns the updated row, or null when
 * the payment is not in an expected state (race with another writer) —
 * callers decide whether that is an error or a benign no-op.
 */
export async function transitionPayment(
  tx: Tx,
  input: TransitionPaymentInput,
): Promise<PaymentRow | null> {
  const [row] = await tx
    .update(payments)
    .set({
      state: input.to,
      updatedAt: new Date(),
      ...(input.providerRef !== undefined ? { providerRef: input.providerRef } : {}),
      ...(input.capturedMinorAdd !== undefined
        ? { capturedMinor: sql`${payments.capturedMinor} + ${input.capturedMinorAdd}` }
        : {}),
    })
    .where(and(eq(payments.id, input.paymentId), inArray(payments.state, [...input.from])))
    .returning();
  return row ?? null;
}

/** Row lock for refund headroom decisions — must run inside the caller's transaction. */
export async function lockPayment(tx: Tx, paymentId: string): Promise<PaymentRow | null> {
  const [row] = await tx
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function getPaymentById(executor: DbExecutor, paymentId: string): Promise<PaymentRow | null> {
  const [row] = await executor.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  return row ?? null;
}

export async function getPaymentByProviderRef(
  executor: DbExecutor,
  providerRef: string,
): Promise<PaymentRow | null> {
  const [row] = await executor
    .select()
    .from(payments)
    .where(and(eq(payments.providerRef, providerRef), eq(payments.provider, "mock")))
    .limit(1);
  return row ?? null;
}

export async function getRefundByProviderRef(
  executor: DbExecutor,
  providerRef: string,
): Promise<RefundRow | null> {
  const [row] = await executor
    .select()
    .from(refunds)
    .where(and(eq(refunds.providerRef, providerRef), eq(refunds.provider, "mock")))
    .limit(1);
  return row ?? null;
}

export async function getRefundById(executor: DbExecutor, refundId: string): Promise<RefundRow | null> {
  const [row] = await executor.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  return row ?? null;
}

/** Finds the (single) payment attached to a business target, optionally filtered by category. */
export async function findPaymentByTarget(
  executor: DbExecutor,
  input: {
    souqParticipantId?: string;
    khidmaBookingId?: string;
    krayaBookingId?: string;
    category?: PaymentCategory;
  },
): Promise<PaymentRow | null> {
  const conditions = [
    input.souqParticipantId ? eq(payments.souqParticipantId, input.souqParticipantId) : undefined,
    input.khidmaBookingId ? eq(payments.khidmaBookingId, input.khidmaBookingId) : undefined,
    input.krayaBookingId ? eq(payments.krayaBookingId, input.krayaBookingId) : undefined,
    input.category ? eq(payments.category, input.category) : undefined,
  ].filter((condition) => condition !== undefined);
  if (conditions.length === 0) return null;
  const [row] = await executor
    .select()
    .from(payments)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

export async function setRefundProviderRef(tx: Tx, refundId: string, providerRef: string): Promise<void> {
  await tx.update(refunds).set({ providerRef, updatedAt: new Date() }).where(eq(refunds.id, refundId));
}

/**
 * Creates a refund record + its processing event. The caller MUST hold a row
 * lock on the payment and verify headroom + captured state first.
 */
export async function createRefundRecord(
  tx: Tx,
  input: { paymentId: string; amountMinor: number; reason: string; requestedBy: string },
): Promise<RefundRow> {
  const [refund] = await tx
    .insert(refunds)
    .values({
      paymentId: input.paymentId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      state: "requested",
      requestedBy: input.requestedBy,
    })
    .returning();
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.refundRequested,
      aggregateType: "refund",
      aggregateId: refund.id,
      payload: { refundId: refund.id, paymentId: input.paymentId },
    },
  ]);
  return refund;
}

/**
 * Locks the payment, verifies the captured state and refund headroom
 * (§94: refund ≤ captured − refunded, no duplicate refunds), then creates
 * the refund record. Concurrent refund attempts serialize on the row lock.
 */
export async function createRefundUnderLock(
  tx: Tx,
  input: { paymentId: string; amountMinor: number; reason: string; requestedBy: string },
): Promise<RefundRow> {
  const payment = await lockPayment(tx, input.paymentId);
  if (!payment) {
    throw new ResourceNotFoundError("Payment", input.paymentId);
  }
  if (payment.state !== "captured") {
    throw new PaymentStateError("Refunds require a captured payment", { paymentId: input.paymentId, state: payment.state });
  }
  const headroom = payment.capturedMinor - payment.refundedMinor;
  if (input.amountMinor > headroom) {
    throw new RefundStateError("Refund exceeds the refundable amount");
  }
  return createRefundRecord(tx, input);
}

/** Refunds the entire remaining headroom of a captured payment (or returns null if nothing to refund). */
export async function refundFullHeadroom(
  tx: Tx,
  input: { paymentId: string; reason: string; requestedBy: string },
): Promise<RefundRow | null> {
  const payment = await lockPayment(tx, input.paymentId);
  if (!payment || payment.state !== "captured") return null;
  const headroom = payment.capturedMinor - payment.refundedMinor;
  if (headroom <= 0) return null;
  return createRefundRecord(tx, { paymentId: input.paymentId, amountMinor: headroom, reason: input.reason, requestedBy: input.requestedBy });
}
