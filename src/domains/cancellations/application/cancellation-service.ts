import { eq } from "drizzle-orm";

import {
  cancellationRequests,
  type CancellationTargetType,
} from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAdminAction, recordAudit } from "@/infrastructure/audit/writer";
import { enqueueOutboxEvents } from "@/infrastructure/outbox/writer";
import {
  createRefundUnderLock,
  enqueuePaymentIntent,
  findPaymentByTarget,
  refundFullHeadroom,
} from "@/domains/payments/infrastructure/payment-repository";
import type { Identity } from "@/lib/auth/types";
import { requireSelf } from "@/lib/auth/rbac";
import {
  CancellationStateError,
  ForbiddenError,
  ResourceNotFoundError,
  ValidationError,
} from "@/lib/errors";
import { DomainEvents } from "@/lib/events";
import { khidmaCancellationPolicy } from "@/domains/khidma/domain/policy";
import { khidmaBookingMachine } from "@/domains/khidma/domain/machine";
import {
  lockBooking as lockKhidmaBooking,
  transitionBookingState as transitionKhidmaBooking,
} from "@/domains/khidma/infrastructure/khidma-repository";
import { krayaBookingMachine } from "@/domains/kraya/domain/machine";
import { krayaCancellationPolicy } from "@/domains/kraya/domain/policy";
import {
  lockBooking as lockRentalBooking,
  transitionBookingState as transitionRentalBookingState,
} from "@/domains/kraya/infrastructure/kraya-repository";
import { circleMachine } from "@/domains/souq/domain/machine";
import {
  listCirclePaymentsInStates,
  lockCircle,
  transitionCircleState,
} from "@/domains/souq/infrastructure/souq-repository";
import type { JsonObject } from "@/types/json";

export interface RequestCancellationInput {
  entityType: CancellationTargetType;
  entityId: string;
  reason: string;
}

/** Creates a pending cancellation request. Ownership is enforced per target type. */
export async function requestCancellation(
  tx: Tx,
  identity: Identity,
  input: RequestCancellationInput,
): Promise<{ cancellationId: string }> {
  switch (input.entityType) {
    case "souq_circle": {
      const circle = await lockCircle(tx, input.entityId);
      if (!circle) throw new ResourceNotFoundError("Circle", input.entityId);
      requireSelf(identity, circle.sellerId, "circle");
      if (!circleMachine.can(circle.state, "cancel")) {
        throw new CancellationStateError(`A ${circle.state} circle cannot be cancelled via review`);
      }
      break;
    }
    case "khidma_booking": {
      const booking = await lockKhidmaBooking(tx, input.entityId);
      if (!booking) throw new ResourceNotFoundError("Booking", input.entityId);
      requireSelf(identity, booking.buyerId, "booking");
      if (!khidmaBookingMachine.can(booking.state, "cancel")) {
        throw new CancellationStateError(`A ${booking.state} booking cannot be cancelled via review`);
      }
      break;
    }
    case "kraya_booking": {
      const booking = await lockRentalBooking(tx, input.entityId);
      if (!booking) throw new ResourceNotFoundError("Rental booking", input.entityId);
      requireSelf(identity, booking.renterId, "rental");
      if (!krayaBookingMachine.can(booking.state, "cancel")) {
        throw new CancellationStateError(`A ${booking.state} rental cannot be cancelled via review`);
      }
      break;
    }
  }

  const [request] = await tx
    .insert(cancellationRequests)
    .values({
      requesterId: identity.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      state: "pending",
    })
    .returning({ id: cancellationRequests.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "cancellation.requested",
    entityType: "cancellation_request",
    entityId: request.id,
    after: { state: "pending", targetType: input.entityType, targetId: input.entityId },
    metadata: { reason: input.reason },
  });
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.cancellationRequested,
      aggregateType: "cancellation_request",
      aggregateId: request.id,
      payload: { cancellationId: request.id, entityType: input.entityType, entityId: input.entityId },
    },
  ]);
  return { cancellationId: request.id };
}

export interface ReviewCancellationInput {
  cancellationId: string;
  decision: "approve" | "reject";
  decisionReason: string;
}

export type CancellationReviewOutcome = {
  state: "executed" | "rejected";
  refundAmountMinor?: number;
};

/**
 * Admin review (§35): ONE transaction locks the request and the target,
 * re-validates the current state, transitions the target through its own
 * state machine, creates the refund, writes admin audit, and enqueues
 * events. Concurrent contradictory approvals are impossible (row locks).
 */
export async function reviewCancellation(
  db: DbExecutor,
  identity: Identity,
  input: ReviewCancellationInput,
): Promise<CancellationReviewOutcome> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(cancellationRequests)
      .where(eq(cancellationRequests.id, input.cancellationId))
      .for("update")
      .limit(1);
    if (!request) throw new ResourceNotFoundError("Cancellation request", input.cancellationId);
    if (request.state !== "pending") {
      throw new CancellationStateError(`This request was already ${request.state}`);
    }

    if (input.decision === "reject") {
      const [rejected] = await tx
        .update(cancellationRequests)
        .set({
          state: "rejected",
          reviewedBy: identity.userId,
          reviewedAt: new Date(),
          decisionReason: input.decisionReason,
          updatedAt: new Date(),
        })
        .where(eq(cancellationRequests.id, request.id))
        .returning();
      await recordAdminAction(tx, {
        adminId: identity.userId,
        action: "cancellation.rejected",
        entityType: "cancellation_request",
        entityId: request.id,
        reason: input.decisionReason,
      });
      await recordAudit(tx, {
        actorId: identity.userId,
        actorRole: identity.role,
        action: "cancellation.rejected",
        entityType: "cancellation_request",
        entityId: request.id,
        before: { state: "pending" },
        after: { state: "rejected" },
        metadata: { reason: input.decisionReason },
      });
      await enqueueOutboxEvents(tx, [
        {
          eventType: DomainEvents.cancellationRejected,
          aggregateType: "cancellation_request",
          aggregateId: request.id,
          payload: {
            cancellationId: request.id,
            notify: {
              userId: rejected.requesterId,
              kind: "payment_attention",
              title: "Cancellation rejected",
              body: input.decisionReason,
              entityType: "cancellation_request",
              entityId: request.id,
            },
          },
        },
      ]);
      return { state: "rejected" };
    }

    // Approve + execute.
    let refundAmountMinor = 0;
    let refundPaymentId: string | null = null;
    const notifyTargets: { userId: string; body: string }[] = [];

    if (request.entityType === "souq_circle") {
      const circle = await lockCircle(tx, request.entityId);
      if (!circle) throw new ResourceNotFoundError("Circle", request.entityId);
      if (!circleMachine.can(circle.state, "cancel")) {
        throw new CancellationStateError(`The circle is now ${circle.state} and can no longer be cancelled`);
      }
      circleMachine.transition(circle.state, "cancel");
      const updated = await transitionCircleState(tx, { circleId: circle.id, from: circle.state, to: "cancelled" });
      if (!updated) throw new CancellationStateError("The circle state changed concurrently");
      const authorized = await listCirclePaymentsInStates(tx, circle.id, ["authorized"]);
      for (const payment of authorized) {
        await enqueuePaymentIntent(tx, payment.id, "void");
      }
      notifyTargets.push({ userId: circle.sellerId, body: "Your circle cancellation was approved." });
    } else if (request.entityType === "khidma_booking") {
      const booking = await lockKhidmaBooking(tx, request.entityId);
      if (!booking) throw new ResourceNotFoundError("Booking", request.entityId);
      if (!khidmaBookingMachine.can(booking.state, "cancel")) {
        throw new CancellationStateError(`The booking is now ${booking.state} and can no longer be cancelled`);
      }
      khidmaBookingMachine.transition(booking.state, "cancel");
      const updated = await transitionKhidmaBooking(tx, {
        bookingId: booking.id,
        from: [booking.state],
        to: "cancelled",
      });
      if (!updated) throw new CancellationStateError("The booking state changed concurrently");
      const decision = khidmaCancellationPolicy(new Date(), booking.startTime, booking.priceSnapshotMinor);
      const payment = await findPaymentByTarget(tx, { khidmaBookingId: booking.id, category: "khidma_service" });
      if (payment) {
        if (payment.state === "captured" && decision.refundMinor > 0) {
          const refund = await createRefundUnderLock(tx, {
            paymentId: payment.id,
            amountMinor: decision.refundMinor,
            reason: `Approved cancellation: ${input.decisionReason}`,
            requestedBy: identity.userId,
          });
          refundAmountMinor = decision.refundMinor;
          refundPaymentId = refund.paymentId;
        } else if (payment.state === "authorized") {
          await enqueuePaymentIntent(tx, payment.id, "void");
        }
      }
      notifyTargets.push({ userId: booking.professionalId, body: "A booking with you was cancelled after review." });
    } else {
      const booking = await lockRentalBooking(tx, request.entityId);
      if (!booking) throw new ResourceNotFoundError("Rental booking", request.entityId);
      if (!krayaBookingMachine.can(booking.state, "cancel")) {
        throw new CancellationStateError(`The rental is now ${booking.state} and can no longer be cancelled`);
      }
      krayaBookingMachine.transition(booking.state, "cancel");
      const updated = await transitionRentalBookingState(tx, {
        bookingId: booking.id,
        from: [booking.state],
        to: "cancelled",
      });
      if (!updated) throw new CancellationStateError("The rental state changed concurrently");
      const decision = krayaCancellationPolicy(new Date(), booking.startTime, booking.totalChargeMinor);
      const rentalPayment = await findPaymentByTarget(tx, { krayaBookingId: booking.id, category: "kraya_rental" });
      const depositPayment = await findPaymentByTarget(tx, { krayaBookingId: booking.id, category: "kraya_deposit" });
      if (rentalPayment) {
        if (rentalPayment.state === "captured" && decision.refundMinor > 0) {
          await createRefundUnderLock(tx, {
            paymentId: rentalPayment.id,
            amountMinor: decision.refundMinor,
            reason: `Approved cancellation: ${input.decisionReason}`,
            requestedBy: identity.userId,
          });
          refundAmountMinor = decision.refundMinor;
          refundPaymentId = rentalPayment.id;
        } else if (rentalPayment.state === "authorized") {
          await enqueuePaymentIntent(tx, rentalPayment.id, "void");
        }
      }
      if (depositPayment) {
        if (depositPayment.state === "captured") {
          await refundFullHeadroom(tx, {
            paymentId: depositPayment.id,
            reason: "Deposit released on approved cancellation",
            requestedBy: identity.userId,
          });
        } else if (depositPayment.state === "authorized") {
          await enqueuePaymentIntent(tx, depositPayment.id, "void");
        }
      }
      notifyTargets.push({ userId: booking.renterId, body: "Your rental cancellation was approved." });
    }

    // pending → approved → executed (machine-validated, same transaction).
    const [executed] = await tx
      .update(cancellationRequests)
      .set({
        state: "executed",
        reviewedBy: identity.userId,
        reviewedAt: new Date(),
        decisionReason: input.decisionReason,
        refundPaymentId,
        refundAmountMinor: refundAmountMinor > 0 ? refundAmountMinor : null,
        updatedAt: new Date(),
      })
      .where(eq(cancellationRequests.id, request.id))
      .returning();

    await recordAdminAction(tx, {
      adminId: identity.userId,
      action: "cancellation.approved",
      entityType: "cancellation_request",
      entityId: request.id,
      reason: input.decisionReason,
      metadata: { targetType: request.entityType, targetId: request.entityId, refundAmountMinor },
    });
    await recordAudit(tx, {
      actorId: identity.userId,
      actorRole: identity.role,
      action: "cancellation.executed",
      entityType: "cancellation_request",
      entityId: request.id,
      before: { state: "pending", target: request.entityType },
      after: { state: "executed", refundAmountMinor },
      metadata: { reason: input.decisionReason },
    });
    await enqueueOutboxEvents(tx, [
      {
        eventType: DomainEvents.cancellationApproved,
        aggregateType: "cancellation_request",
        aggregateId: request.id,
        payload: {
          cancellationId: request.id,
          notify: {
            userId: executed.requesterId,
            kind: "refund_completed",
            title: "Cancellation approved",
            body:
              refundAmountMinor > 0
                ? `Your cancellation was approved. A refund of ${(refundAmountMinor / 100).toFixed(2)} is being processed.`
                : "Your cancellation was approved.",
            entityType: "cancellation_request",
            entityId: request.id,
          },
        },
      },
      ...notifyTargets.map((target) => ({
        eventType: DomainEvents.cancellationApproved,
        aggregateType: "cancellation_request" as const,
        aggregateId: request.id,
        payload: {
          cancellationId: request.id,
          notify: {
            userId: target.userId,
            kind: "booking_cancelled" as const,
            title: "Cancellation approved",
            body: target.body,
            entityType: "cancellation_request" as const,
            entityId: request.id,
          },
        },
      })),
    ]);
    return { state: "executed", refundAmountMinor: refundAmountMinor > 0 ? refundAmountMinor : undefined };
  });
}

export async function withdrawCancellation(
  tx: Tx,
  identity: Identity,
  cancellationId: string,
): Promise<{ state: string }> {
  const [request] = await tx
    .select()
    .from(cancellationRequests)
    .where(eq(cancellationRequests.id, cancellationId))
    .for("update")
    .limit(1);
  if (!request) throw new ResourceNotFoundError("Cancellation request", cancellationId);
  requireSelf(identity, request.requesterId, "cancellation request");
  if (request.state !== "pending") {
    throw new CancellationStateError(`Only pending requests can be withdrawn (currently ${request.state})`);
  }
  await tx
    .update(cancellationRequests)
    .set({ state: "withdrawn", updatedAt: new Date() })
    .where(eq(cancellationRequests.id, cancellationId));
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "cancellation.withdrawn",
    entityType: "cancellation_request",
    entityId: cancellationId,
    before: { state: "pending" },
    after: { state: "withdrawn" },
  });
  return { state: "withdrawn" };
}

export function assertCancellationReviewPermission(identity: Identity): void {
  if (identity.role !== "ops_admin" && identity.role !== "admin") {
    throw new ForbiddenError("Only operations can review cancellations");
  }
}

export function validateCancellationReason(reason: string): string {
  if (reason.trim().length < 3) {
    throw new ValidationError("A cancellation reason is required");
  }
  return reason;
}

export type CancellationRow = typeof cancellationRequests.$inferSelect;
export type CancellationJson = JsonObject;
