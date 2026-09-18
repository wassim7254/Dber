import { eq } from "drizzle-orm";

import { disputeEvidence, disputeResolutions, disputes, type CancellationTargetType } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAdminAction, recordAudit } from "@/infrastructure/audit/writer";
import { enqueueOutboxEvents } from "@/infrastructure/outbox/writer";
import {
  createRefundUnderLock,
  findPaymentByTarget,
  refundFullHeadroom,
} from "@/domains/payments/infrastructure/payment-repository";
import type { Identity } from "@/lib/auth/types";
import {
  DisputeStateError,
  ForbiddenError,
  ResourceNotFoundError,
  ValidationError,
} from "@/lib/errors";
import { DomainEvents } from "@/lib/events";
import { positiveMinorSchema } from "@/lib/validation";
import { khidmaBookingMachine } from "@/domains/khidma/domain/machine";
import {
  lockBooking as lockKhidmaBooking,
  transitionBookingState as transitionKhidmaBooking,
} from "@/domains/khidma/infrastructure/khidma-repository";
import { krayaBookingMachine } from "@/domains/kraya/domain/machine";
import {
  getAssetById,
  lockBooking as lockRentalBooking,
  transitionBookingState as transitionRentalBookingState,
} from "@/domains/kraya/infrastructure/kraya-repository";

export type DisputeEntityType = Extract<CancellationTargetType, "khidma_booking" | "kraya_booking">;

export interface OpenDisputeInput {
  entityType: DisputeEntityType;
  entityId: string;
  reason: string;
}

/**
 * Opens a dispute against a booking. The booking transitions to `disputed`
 * via its own state machine; the pre-dispute state is recorded so a
 * dismissal can restore it deterministically.
 */
export async function openDispute(
  tx: Tx,
  identity: Identity,
  input: OpenDisputeInput,
): Promise<{ disputeId: string }> {
  let counterpartId: string;
  let title: string;

  if (input.entityType === "khidma_booking") {
    const booking = await lockKhidmaBooking(tx, input.entityId);
    if (!booking) throw new ResourceNotFoundError("Booking", input.entityId);
    if (
      identity.role !== "admin" &&
      identity.userId !== booking.buyerId &&
      identity.userId !== booking.professionalId
    ) {
      throw new ForbiddenError("You are not a party to this booking");
    }
    const nextState = khidmaBookingMachine.transition(booking.state, "open_dispute");
    const updated = await transitionKhidmaBooking(tx, {
      bookingId: booking.id,
      from: [booking.state],
      to: nextState,
      stateBeforeDispute: booking.state,
    });
    if (!updated) throw new DisputeStateError("The booking state changed concurrently — retry");
    counterpartId = identity.userId === booking.buyerId ? booking.professionalId : booking.buyerId;
    title = booking.serviceTitleSnapshot;
  } else {
    const booking = await lockRentalBooking(tx, input.entityId);
    if (!booking) throw new ResourceNotFoundError("Rental booking", input.entityId);
    if (identity.role !== "admin" && identity.userId !== booking.renterId) {
      // The asset owner may also open a dispute against a rental.
      const asset = await getAssetById(tx, booking.assetId);
      if (!asset || asset.ownerId !== identity.userId) {
        throw new ForbiddenError("You are not a party to this rental");
      }
    }
    const nextState = krayaBookingMachine.transition(booking.state, "open_dispute");
    const updated = await transitionRentalBookingState(tx, {
      bookingId: booking.id,
      from: [booking.state],
      to: nextState,
      stateBeforeDispute: booking.state,
    });
    if (!updated) throw new DisputeStateError("The rental state changed concurrently — retry");
    counterpartId = booking.renterId;
    title = "Rental booking";
  }

  const [dispute] = await tx
    .insert(disputes)
    .values({
      openerId: identity.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      state: "opened",
    })
    .returning({ id: disputes.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "dispute.opened",
    entityType: "dispute",
    entityId: dispute.id,
    after: { state: "opened", targetType: input.entityType, targetId: input.entityId },
    metadata: { reason: input.reason },
  });
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.disputeOpened,
      aggregateType: "dispute",
      aggregateId: dispute.id,
      payload: {
        disputeId: dispute.id,
        notify: {
          userId: counterpartId,
          kind: "dispute_update",
          title: "A dispute was opened",
          body: `A dispute was opened regarding "${title}". Operations will review it.`,
          entityType: "dispute",
          entityId: dispute.id,
        },
      },
    },
  ]);
  return { disputeId: dispute.id };
}

export interface AddEvidenceInput {
  disputeId: string;
  evidenceType: string;
  storageReference: string;
}

export async function addEvidence(
  tx: Tx,
  identity: Identity,
  input: AddEvidenceInput,
): Promise<{ evidenceId: string }> {
  const [dispute] = await tx.select().from(disputes).where(eq(disputes.id, input.disputeId)).limit(1);
  if (!dispute) throw new ResourceNotFoundError("Dispute", input.disputeId);
  if (dispute.state === "resolved") {
    throw new DisputeStateError("This dispute is already resolved");
  }
  if (identity.role !== "admin" && identity.userId !== dispute.openerId) {
    // The other party of the underlying booking may also submit evidence.
    const isCounterparty = await isTargetParty(tx, identity.userId, dispute.entityType, dispute.entityId);
    if (!isCounterparty) throw new ForbiddenError("You are not a party to this dispute");
  }
  const [evidence] = await tx
    .insert(disputeEvidence)
    .values({
      disputeId: dispute.id,
      submittedBy: identity.userId,
      evidenceType: input.evidenceType,
      storageReference: input.storageReference,
    })
    .returning({ id: disputeEvidence.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "dispute.evidence_added",
    entityType: "dispute",
    entityId: dispute.id,
    metadata: { evidenceType: input.evidenceType, evidenceId: evidence.id },
  });
  return { evidenceId: evidence.id };
}

async function isTargetParty(
  tx: Tx,
  userId: string,
  entityType: CancellationTargetType,
  entityId: string,
): Promise<boolean> {
  if (entityType === "khidma_booking") {
    const booking = await lockKhidmaBooking(tx, entityId);
    return Boolean(booking && (booking.buyerId === userId || booking.professionalId === userId));
  }
  if (entityType === "kraya_booking") {
    const booking = await lockRentalBooking(tx, entityId);
    return Boolean(booking && booking.renterId === userId);
  }
  return false;
}

export interface ResolveDisputeInput {
  disputeId: string;
  resolution: "force_refund" | "force_complete" | "partial_refund" | "dismiss";
  rationale: string;
  amountMinor?: number;
}

export interface DisputeResolutionOutcome {
  state: "resolved";
  resolution: ResolveDisputeInput["resolution"];
  refundAmountMinor?: number;
}

/**
 * Admin resolution authority (§39/§40). One transaction: dispute review +
 * target transition through its machine + refunds + permanent audit.
 * `dismiss` restores the recorded pre-dispute state.
 */
export async function resolveDispute(
  db: DbExecutor,
  identity: Identity,
  input: ResolveDisputeInput,
): Promise<DisputeResolutionOutcome> {
  if (input.rationale.trim().length < 3) {
    throw new ValidationError("A resolution rationale is required");
  }
  if (input.resolution === "partial_refund") {
    if (!input.amountMinor || !positiveMinorSchema.safeParse(input.amountMinor).success) {
      throw new ValidationError("A positive amountMinor is required for a partial refund");
    }
  }

  return db.transaction(async (tx) => {
    const [dispute] = await tx
      .select()
      .from(disputes)
      .where(eq(disputes.id, input.disputeId))
      .for("update")
      .limit(1);
    if (!dispute) throw new ResourceNotFoundError("Dispute", input.disputeId);
    if (dispute.state === "resolved") {
      throw new DisputeStateError("This dispute is already resolved");
    }
    if (dispute.state === "opened") {
      // review: opened → under_review, then resolve — both machine-validated.
      const [reviewed] = await tx
        .update(disputes)
        .set({ state: "under_review", updatedAt: new Date() })
        .where(eq(disputes.id, dispute.id))
        .returning();
      if (!reviewed) throw new DisputeStateError("The dispute state changed concurrently");
    }

    let refundAmountMinor: number | undefined;
    let notifyBody = input.rationale;

    if (dispute.entityType === "khidma_booking") {
      const booking = await lockKhidmaBooking(tx, dispute.entityId);
      if (!booking) throw new ResourceNotFoundError("Booking", dispute.entityId);
      if (booking.state !== "disputed") {
        throw new DisputeStateError(`The booking is ${booking.state}, not disputed`);
      }
      refundAmountMinor = await resolveKhidmaTarget(tx, identity, booking.id, input);
      const targetState =
        input.resolution === "force_refund"
          ? "refunded"
          : input.resolution === "dismiss"
            ? null
            : "completed";
      if (targetState) {
        const updated = await transitionKhidmaBooking(tx, {
          bookingId: booking.id,
          from: ["disputed"],
          to: targetState,
          clearStateBeforeDispute: true,
        });
        if (!updated) throw new DisputeStateError("The booking state changed concurrently");
      } else {
        // dismiss → restore the recorded pre-dispute state (strictly guarded).
        const restore = booking.stateBeforeDispute;
        if (!restore || restore === "disputed" || ["cancelled", "refunded"].includes(restore)) {
          throw new DisputeStateError("No restorable pre-dispute state is recorded");
        }
        const updated = await transitionKhidmaBooking(tx, {
          bookingId: booking.id,
          from: ["disputed"],
          to: restore,
          clearStateBeforeDispute: true,
        });
        if (!updated) throw new DisputeStateError("The booking state changed concurrently");
        notifyBody = `The dispute was dismissed and the booking returned to ${restore}. ${input.rationale}`;
      }
      notifyBody = `${notifyBody}`;
    } else {
      const booking = await lockRentalBooking(tx, dispute.entityId);
      if (!booking) throw new ResourceNotFoundError("Rental booking", dispute.entityId);
      if (booking.state !== "disputed") {
        throw new DisputeStateError(`The rental is ${booking.state}, not disputed`);
      }
      refundAmountMinor = await resolveKrayaTarget(tx, identity, booking.id, input);
      const targetState =
        input.resolution === "force_refund"
          ? "refunded"
          : input.resolution === "dismiss"
            ? null
            : "completed";
      if (targetState) {
        const updated = await transitionRentalBookingState(tx, {
          bookingId: booking.id,
          from: ["disputed"],
          to: targetState,
          clearStateBeforeDispute: true,
        });
        if (!updated) throw new DisputeStateError("The rental state changed concurrently");
      } else {
        const restore = booking.stateBeforeDispute;
        if (!restore || restore === "disputed" || ["cancelled", "refunded"].includes(restore)) {
          throw new DisputeStateError("No restorable pre-dispute state is recorded");
        }
        const updated = await transitionRentalBookingState(tx, {
          bookingId: booking.id,
          from: ["disputed"],
          to: restore,
          clearStateBeforeDispute: true,
        });
        if (!updated) throw new DisputeStateError("The rental state changed concurrently");
        notifyBody = `The dispute was dismissed and the rental returned to ${restore}. ${input.rationale}`;
      }
    }

    const [resolved] = await tx
      .update(disputes)
      .set({
        state: "resolved",
        resolution: input.resolution,
        resolvedBy: identity.userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, dispute.id))
      .returning();

    await tx.insert(disputeResolutions).values({
      disputeId: dispute.id,
      resolution: input.resolution,
      amountMinor: refundAmountMinor ?? null,
      rationale: input.rationale,
      decidedBy: identity.userId,
    });
    await recordAdminAction(tx, {
      adminId: identity.userId,
      action: "dispute.resolved",
      entityType: "dispute",
      entityId: dispute.id,
      reason: input.rationale,
      metadata: { resolution: input.resolution, refundAmountMinor: refundAmountMinor ?? null },
    });
    await recordAudit(tx, {
      actorId: identity.userId,
      actorRole: identity.role,
      action: "dispute.resolved",
      entityType: "dispute",
      entityId: dispute.id,
      before: { state: dispute.state },
      after: { state: "resolved", resolution: input.resolution },
      metadata: { refundAmountMinor: refundAmountMinor ?? null },
    });
    await enqueueOutboxEvents(tx, [
      {
        eventType: DomainEvents.disputeResolved,
        aggregateType: "dispute",
        aggregateId: dispute.id,
        payload: {
          disputeId: dispute.id,
          resolution: input.resolution,
          notify: {
            userId: resolved.openerId,
            kind: "dispute_update",
            title: "Your dispute was resolved",
            body: notifyBody,
            entityType: "dispute",
            entityId: dispute.id,
          },
        },
      },
    ]);
    return { state: "resolved", resolution: input.resolution, refundAmountMinor };
  });
}

async function resolveKhidmaTarget(
  tx: Tx,
  identity: Identity,
  bookingId: string,
  input: ResolveDisputeInput,
): Promise<number | undefined> {
  if (input.resolution === "force_refund") {
    const payment = await findPaymentByTarget(tx, { khidmaBookingId: bookingId, category: "khidma_service" });
    if (payment) {
      await refundFullHeadroom(tx, {
        paymentId: payment.id,
        reason: `Dispute resolution (force refund): ${input.rationale}`,
        requestedBy: identity.userId,
      });
      return payment.capturedMinor - payment.refundedMinor;
    }
    return undefined;
  }
  if (input.resolution === "partial_refund" && input.amountMinor) {
    const payment = await findPaymentByTarget(tx, { khidmaBookingId: bookingId, category: "khidma_service" });
    if (payment) {
      await createRefundUnderLock(tx, {
        paymentId: payment.id,
        amountMinor: input.amountMinor,
        reason: `Dispute resolution (partial refund): ${input.rationale}`,
        requestedBy: identity.userId,
      });
      return input.amountMinor;
    }
  }
  return undefined;
}

async function resolveKrayaTarget(
  tx: Tx,
  identity: Identity,
  bookingId: string,
  input: ResolveDisputeInput,
): Promise<number | undefined> {
  if (input.resolution === "force_refund") {
    const rental = await findPaymentByTarget(tx, { krayaBookingId: bookingId, category: "kraya_rental" });
    if (rental) {
      await refundFullHeadroom(tx, {
        paymentId: rental.id,
        reason: `Dispute resolution (force refund): ${input.rationale}`,
        requestedBy: identity.userId,
      });
      return rental.capturedMinor - rental.refundedMinor;
    }
    return undefined;
  }
  if (input.resolution === "partial_refund" && input.amountMinor) {
    const rental = await findPaymentByTarget(tx, { krayaBookingId: bookingId, category: "kraya_rental" });
    if (rental) {
      await createRefundUnderLock(tx, {
        paymentId: rental.id,
        amountMinor: input.amountMinor,
        reason: `Dispute resolution (partial refund): ${input.rationale}`,
        requestedBy: identity.userId,
      });
      return input.amountMinor;
    }
  }
  return undefined;
}

export function assertDisputeResolvePermission(identity: Identity): void {
  if (identity.role !== "admin") {
    throw new ForbiddenError("Only admins can resolve disputes");
  }
}
