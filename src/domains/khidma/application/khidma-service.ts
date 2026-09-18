import { eq } from "drizzle-orm";

import { khidmaAvailability, khidmaServices, khidmaBookings, serviceQuotes, serviceRequests } from "@/db/schema";
import type { Tx, DbExecutor } from "@/db/tx";
import { recordAudit, recordProviderAction } from "@/infrastructure/audit/writer";
import { enqueueOutboxEvents } from "@/infrastructure/outbox/writer";
import {
  createPaymentWithIntent,
  createRefundUnderLock,
  enqueuePaymentIntent,
  findPaymentByTarget,
  getPaymentById,
  refundFullHeadroom,
} from "@/domains/payments/infrastructure/payment-repository";
import type { Identity } from "@/lib/auth/types";
import { requireSelf } from "@/lib/auth/rbac";
import {
  ConflictError,
  InternalError,
  ResourceNotFoundError,
  ValidationError,
} from "@/lib/errors";
import { DomainEvent, DomainEvents } from "@/lib/events";
import { asCurrency } from "@/lib/money";
import {
  assertKhidmaBookingActionPermission,
  khidmaBookingMachine,
  khidmaQuoteMachine,
  khidmaRequestMachine,
  type KhidmaBookingUserAction,
} from "@/domains/khidma/domain/machine";
import { khidmaCancellationPolicy } from "@/domains/khidma/domain/policy";
import {
  getBookingById,
  getServiceById,
  listExpiredQuotes,
  listStalePaymentPendingBookings,
  lockBooking,
  lockQuote,
  lockRequest,
  transitionBookingState,
  transitionQuoteState,
  transitionRequestState,
} from "@/domains/khidma/infrastructure/khidma-repository";
import type { JsonObject } from "@/types/json";

//
// Services (professional listings)
//

export interface CreateServiceInput {
  title: string;
  specialty: string;
  description: string;
  category: string;
  basePriceMinor: number;
  durationMinutes: number;
}

export async function createService(
  tx: Tx,
  identity: Identity,
  input: CreateServiceInput,
): Promise<{ serviceId: string }> {
  const [service] = await tx
    .insert(khidmaServices)
    .values({
      professionalId: identity.userId,
      title: input.title,
      specialty: input.specialty,
      description: input.description,
      category: input.category,
      basePriceMinor: input.basePriceMinor,
      durationMinutes: input.durationMinutes,
      status: "active",
    })
    .returning({ id: khidmaServices.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "khidma.service.created",
    entityType: "khidma_service",
    entityId: service.id,
    after: { title: input.title, basePriceMinor: input.basePriceMinor },
  });
  return { serviceId: service.id };
}

export interface AvailabilitySlotInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** Replaces the professional's weekly availability atomically (deterministic semantics). */
export async function setAvailability(
  tx: Tx,
  identity: Identity,
  slots: AvailabilitySlotInput[],
): Promise<{ replaced: number }> {
  await tx.delete(khidmaAvailability).where(eq(khidmaAvailability.professionalId, identity.userId));
  if (slots.length > 0) {
    await tx.insert(khidmaAvailability).values(
      slots.map((slot) => ({
        professionalId: identity.userId,
        weekday: slot.weekday,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
      })),
    );
  }
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "khidma.availability.replaced",
    entityType: "khidma_service",
    entityId: identity.userId,
    after: { slots: slots.length },
  });
  return { replaced: slots.length };
}

//
// Requests & quotes
//

export interface CreateRequestInput {
  serviceId?: string;
  description: string;
  requestedStart?: Date;
  requestedEnd?: Date;
}

export async function createRequest(
  tx: Tx,
  identity: Identity,
  input: CreateRequestInput,
): Promise<{ requestId: string }> {
  if (input.serviceId) {
    const service = await getServiceById(tx, input.serviceId);
    if (!service) throw new ResourceNotFoundError("Service", input.serviceId);
  }
  const [request] = await tx
    .insert(serviceRequests)
    .values({
      buyerId: identity.userId,
      serviceId: input.serviceId ?? null,
      description: input.description,
      requestedStart: input.requestedStart ?? null,
      requestedEnd: input.requestedEnd ?? null,
      state: "requested",
    })
    .returning({ id: serviceRequests.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "khidma.request.created",
    entityType: "khidma_request",
    entityId: request.id,
    after: { state: "requested" },
  });
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.requestCreated,
      aggregateType: "khidma_request",
      aggregateId: request.id,
      payload: { requestId: request.id, buyerId: identity.userId },
    },
  ]);
  return { requestId: request.id };
}

export interface SubmitQuoteInput {
  requestId: string;
  serviceId?: string;
  amountMinor: number;
  message: string;
  expiresInDays?: number;
}

export async function submitQuote(
  tx: Tx,
  identity: Identity,
  input: SubmitQuoteInput,
): Promise<{ quoteId: string }> {
  const request = await lockRequest(tx, input.requestId);
  if (!request) throw new ResourceNotFoundError("Request", input.requestId);
  if (request.state !== "requested" && request.state !== "quoted") {
    throw new ConflictError(`This request is ${request.state} and no longer accepts quotes`);
  }
  if (request.buyerId === identity.userId) {
    throw new ValidationError("You cannot quote on your own request");
  }

  // Request machine: submit_quote from requested or quoted (self-loop).
  khidmaRequestMachine.transition(request.state, "submit_quote");
  const updatedRequest = await transitionRequestState(tx, {
    requestId: request.id,
    from: ["requested", "quoted"],
    to: "quoted",
  });
  if (!updatedRequest) throw new ConflictError("The request state changed concurrently — retry");

  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 3_600_000);
  const inserted = await tx
    .insert(serviceQuotes)
    .values({
      requestId: request.id,
      professionalId: identity.userId,
      serviceId: input.serviceId ?? null,
      amountMinor: input.amountMinor,
      message: input.message,
      expiresAt,
      state: "submitted",
    })
    .onConflictDoNothing()
    .returning({ id: serviceQuotes.id });
  if (inserted.length === 0) {
    throw new ConflictError("You already submitted a quote for this request");
  }
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "khidma.quote.submitted",
    entityType: "khidma_quote",
    entityId: inserted[0].id,
    after: { amountMinor: input.amountMinor, state: "submitted" },
    metadata: { requestId: request.id },
  });
  await recordProviderAction(tx, {
    providerId: identity.userId,
    providerRole: "professional",
    action: "khidma.quote.submitted",
    entityType: "khidma_quote",
    entityId: inserted[0].id,
  });
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.quoteSubmitted,
      aggregateType: "khidma_quote",
      aggregateId: inserted[0].id,
      payload: {
        quoteId: inserted[0].id,
        requestId: request.id,
        notify: {
          userId: request.buyerId,
          kind: "booking_confirmed",
          title: "New quote received",
          body: `A professional quoted ${input.amountMinor / 100} on your request.`,
          entityType: "khidma_request",
          entityId: request.id,
        },
      },
    },
  ]);
  return { quoteId: inserted[0].id };
}

export interface AcceptQuoteInput {
  quoteId: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Accepts a quote and creates the booking. The booking row starts in
 * `payment_pending`, which HOLDS the professional's slot via the partial
 * exclusion constraint — a concurrent overlapping booking insert fails at
 * the database (§6.2), never in application code.
 */
export async function acceptQuote(
  tx: Tx,
  identity: Identity,
  input: AcceptQuoteInput,
): Promise<{ bookingId: string; paymentId: string }> {
  if (input.endTime.getTime() <= input.startTime.getTime()) {
    throw new ValidationError("The booking end must be after its start");
  }
  const quote = await lockQuote(tx, input.quoteId);
  if (!quote) throw new ResourceNotFoundError("Quote", input.quoteId);
  const request = await lockRequest(tx, quote.requestId);
  if (!request) throw new ResourceNotFoundError("Request", quote.requestId);
  requireSelf(identity, request.buyerId, "request");

  khidmaRequestMachine.transition(request.state, "accept_quote");
  if (quote.state !== "submitted") {
    throw new ConflictError(`This quote is ${quote.state} and can no longer be accepted`);
  }
  if (quote.expiresAt.getTime() <= Date.now()) {
    throw new ConflictError("This quote has expired");
  }

  const service = quote.serviceId ? await getServiceById(tx, quote.serviceId) : null;
  const serviceTitle = service ? service.title : request.description.slice(0, 120);

  const [booking] = await tx
    .insert(khidmaBookings)
    .values({
      requestId: request.id,
      quoteId: quote.id,
      buyerId: request.buyerId,
      professionalId: quote.professionalId,
      serviceId: quote.serviceId,
      serviceTitleSnapshot: serviceTitle,
      startTime: input.startTime,
      endTime: input.endTime,
      priceSnapshotMinor: quote.amountMinor,
      currency: quote.currency,
      state: "payment_pending",
    })
    .returning({ id: khidmaBookings.id });

  const updatedQuote = await transitionQuoteState(tx, { quoteId: quote.id, from: ["submitted"], to: "accepted" });
  if (!updatedQuote) throw new ConflictError("The quote state changed concurrently — retry");
  const updatedRequest = await transitionRequestState(tx, {
    requestId: request.id,
    from: ["quoted"],
    to: "booked",
  });
  if (!updatedRequest) throw new ConflictError("The request state changed concurrently — retry");

  const payment = await createPaymentWithIntent(tx, {
    category: "khidma_service",
    payerId: request.buyerId,
    amountMinor: quote.amountMinor,
    currency: asCurrency(quote.currency),
    khidmaBookingId: booking.id,
  });

  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "khidma.booking.created",
    entityType: "khidma_booking",
    entityId: booking.id,
    after: { state: "payment_pending", priceSnapshotMinor: quote.amountMinor },
    metadata: { quoteId: quote.id, requestId: request.id, paymentId: payment.id },
  });
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.bookingCreated,
      aggregateType: "khidma_booking",
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        paymentId: payment.id,
        notify: {
          userId: quote.professionalId,
          kind: "booking_confirmed",
          title: "Your quote was accepted",
          body: "The buyer accepted your quote. The booking will confirm once payment completes.",
          entityType: "khidma_booking",
          entityId: booking.id,
        },
      },
    },
  ]);
  return { bookingId: booking.id, paymentId: payment.id };
}

//
// Booking lifecycle
//

export interface TransitionBookingInput {
  identity: Identity;
  bookingId: string;
  action: KhidmaBookingUserAction;
  reason?: string;
}

export async function transitionBooking(tx: Tx, input: TransitionBookingInput): Promise<JsonObject> {
  const booking = await lockBooking(tx, input.bookingId);
  if (!booking) throw new ResourceNotFoundError("Booking", input.bookingId);
  assertKhidmaBookingActionPermission(input.action, input.identity, booking);

  if (input.action === "start") {
    const twoHoursBefore = booking.startTime.getTime() - 2 * 3_600_000;
    if (Date.now() < twoHoursBefore) {
      throw new ConflictError("Work can only start within 2 hours of the scheduled time");
    }
  }

  const nextState = khidmaBookingMachine.transition(booking.state, input.action);
  const updated = await transitionBookingState(tx, {
    bookingId: booking.id,
    from: [booking.state],
    to: nextState,
  });
  if (!updated) throw new ConflictError("The booking state changed concurrently — retry");

  if (input.action === "cancel") {
    await applyKhidmaCancellationFinancials(tx, {
      booking,
      actor: input.identity,
      refundFull: input.identity.userId === booking.professionalId,
      reason: input.reason ?? "Booking cancelled",
    });
  }

  const eventType: DomainEvent =
    input.action === "start"
      ? DomainEvents.bookingStarted
      : input.action === "complete"
        ? DomainEvents.bookingCompleted
        : DomainEvents.bookingCancelled;

  await recordAudit(tx, {
    actorId: input.identity.userId,
    actorRole: input.identity.role,
    action: `khidma.booking.${input.action}`,
    entityType: "khidma_booking",
    entityId: booking.id,
    before: { state: booking.state },
    after: { state: nextState },
    metadata: { ...(input.reason ? { reason: input.reason } : {}) },
  });
  if (input.identity.role === "professional") {
    await recordProviderAction(tx, {
      providerId: input.identity.userId,
      providerRole: "professional",
      action: `khidma.booking.${input.action}`,
      entityType: "khidma_booking",
      entityId: booking.id,
    });
  }
  const counterpartId =
    input.identity.userId === booking.buyerId ? booking.professionalId : booking.buyerId;
  await enqueueOutboxEvents(tx, [
    {
      eventType,
      aggregateType: "khidma_booking",
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        action: input.action,
        notify: {
          userId: counterpartId,
          kind: input.action === "cancel" ? ("booking_cancelled" as const) : ("booking_confirmed" as const),
          title:
            input.action === "start"
              ? "Your service is in progress"
              : input.action === "complete"
                ? "Your service is complete"
                : "Your booking was cancelled",
          body: `Booking "${booking.serviceTitleSnapshot}" — state: ${nextState}.`,
          entityType: "khidma_booking",
          entityId: booking.id,
        },
      },
    },
  ]);
  return { bookingId: booking.id, state: nextState };
}

/** Applies the policy-driven financial consequences of a khidma cancellation. */
async function applyKhidmaCancellationFinancials(
  tx: Tx,
  input: {
    booking: typeof khidmaBookings.$inferSelect;
    actor: Identity;
    refundFull: boolean;
    reason: string;
  },
): Promise<void> {
  const payment = await findPaymentByTarget(tx, { khidmaBookingId: input.booking.id });
  if (!payment) return;
  const decision = input.refundFull
    ? { cancellable: true, refundMinor: input.booking.priceSnapshotMinor, basis: "full" as const, explanation: "Provider-initiated cancellation — full refund." }
    : khidmaCancellationPolicy(new Date(), input.booking.startTime, input.booking.priceSnapshotMinor);
  if (!decision.cancellable && !input.refundFull) {
    throw new ConflictError(decision.explanation);
  }
  if (payment.state === "captured" && decision.refundMinor > 0) {
    await createRefundUnderLock(tx, {
      paymentId: payment.id,
      amountMinor: decision.refundMinor,
      reason: input.reason,
      requestedBy: input.actor.userId,
    });
  } else if (payment.state === "authorized") {
    await enqueuePaymentIntent(tx, payment.id, "void");
  }
}

/** TTL job: payment_pending bookings older than the cutoff are cancelled (frees the held slot). */
export async function cancelStalePaymentPendingBookings(
  db: DbExecutor,
  ttlMinutes = 15,
): Promise<{ cancelled: number }> {
  const cutoff = new Date(Date.now() - ttlMinutes * 60_000);
  const stale = await listStalePaymentPendingBookings(db, cutoff, 50);
  let cancelled = 0;
  for (const ref of stale) {
    await db.transaction(async (tx) => {
      khidmaBookingMachine.transition("payment_pending", "timeout");
      const updated = await transitionBookingState(tx, {
        bookingId: ref.id,
        from: ["payment_pending"],
        to: "cancelled",
      });
      if (!updated) return;
      const payment = await findPaymentByTarget(tx, { khidmaBookingId: ref.id });
      if (payment && (payment.state === "authorized" || payment.state === "capture_pending")) {
        await enqueuePaymentIntent(tx, payment.id, "void");
      }
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "khidma.booking.timeout",
        entityType: "khidma_booking",
        entityId: ref.id,
        before: { state: "payment_pending" },
        after: { state: "cancelled" },
        metadata: { reason: "payment_not_completed_in_time" },
      });
      await enqueueOutboxEvents(tx, [
        {
          eventType: DomainEvents.bookingCancelled,
          aggregateType: "khidma_booking",
          aggregateId: ref.id,
          payload: {
            bookingId: ref.id,
            action: "timeout",
            notify: {
              userId: updated.buyerId,
              kind: "payment_attention",
              title: "Booking expired",
              body: "Payment was not completed in time, so the booking was released.",
              entityType: "khidma_booking",
              entityId: ref.id,
            },
          },
        },
      ]);
      cancelled += 1;
    });
  }
  return { cancelled };
}

/** Quote expiry job. */
export async function expireDueQuotes(db: DbExecutor): Promise<{ expired: number }> {
  const now = new Date();
  const due = await listExpiredQuotes(db, now, 100);
  let expired = 0;
  for (const ref of due) {
    await db.transaction(async (tx) => {
      khidmaQuoteMachine.transition("submitted", "expire");
      const updated = await transitionQuoteState(tx, { quoteId: ref.id, from: ["submitted"], to: "expired" });
      if (!updated) return;
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "khidma.quote.expire",
        entityType: "khidma_quote",
        entityId: ref.id,
        before: { state: "submitted" },
        after: { state: "expired" },
      });
      expired += 1;
    });
  }
  return { expired };
}

//
// Payment event projection
//

export type KhidmaPaymentEventKind = "authorized" | "captured" | "failed" | "voided" | "refunded";

export async function applyKhidmaPaymentEvent(
  tx: Tx,
  payment: { id: string; khidmaBookingId: string | null },
  kind: KhidmaPaymentEventKind,
): Promise<void> {
  if (!payment.khidmaBookingId) return;
  if (kind === "captured") {
    await confirmKhidmaBookingOnCapture(tx, payment.khidmaBookingId, payment.id);
    return;
  }
  if (kind === "failed" || kind === "voided") {
    khidmaBookingMachine.transition("payment_pending", "timeout");
    const updated = await transitionBookingState(tx, {
      bookingId: payment.khidmaBookingId,
      from: ["payment_pending"],
      to: "cancelled",
    });
    if (!updated) return;
    await recordAudit(tx, {
      actorId: null,
      actorRole: "system",
      action: "khidma.booking.payment_unwound",
      entityType: "khidma_booking",
      entityId: payment.khidmaBookingId,
      before: { state: "payment_pending" },
      after: { state: "cancelled" },
      metadata: { paymentEvent: kind, paymentId: payment.id },
    });
    await enqueueOutboxEvents(tx, [
      {
        eventType: DomainEvents.bookingCancelled,
        aggregateType: "khidma_booking",
        aggregateId: payment.khidmaBookingId,
        payload: {
          bookingId: payment.khidmaBookingId,
          action: "payment_unwound",
          notify: {
            userId: updated.buyerId,
            kind: "payment_attention",
            title: "Payment did not complete",
            body: "Your booking was released because the payment failed.",
            entityType: "khidma_booking",
            entityId: payment.khidmaBookingId,
          },
        },
      },
    ]);
  }
  // authorized / refunded: no booking-level change (confirm happens on capture).
}

/**
 * Confirms a booking after its payment is captured. If the booking died
 * while payment was in flight (TTL cancel / earlier void), the captured
 * money is refunded automatically — the buyer is never left charged
 * without a booking (§6.2 unhappy path).
 */
async function confirmKhidmaBookingOnCapture(
  tx: Tx,
  bookingId: string,
  paymentId: string,
): Promise<void> {
  const booking = await getBookingById(tx, bookingId);
  if (!booking) throw new InternalError(`Captured payment ${paymentId} references missing booking`);
  if (booking.state !== "payment_pending") {
    if (booking.state === "cancelled") {
      await autoRefundCapturedPayment(tx, paymentId, "Booking was cancelled before confirmation");
    }
    return;
  }
  khidmaBookingMachine.transition("payment_pending", "confirm");
  const updated = await transitionBookingState(tx, {
    bookingId,
    from: ["payment_pending"],
    to: "confirmed",
  });
  if (!updated) return; // raced with timeout/cancel — refund path runs on the winner's side
  await recordAudit(tx, {
    actorId: null,
    actorRole: "system",
    action: "khidma.booking.confirm",
    entityType: "khidma_booking",
    entityId: bookingId,
    before: { state: "payment_pending" },
    after: { state: "confirmed" },
    metadata: { paymentId },
  });
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.bookingConfirmed,
      aggregateType: "khidma_booking",
      aggregateId: bookingId,
      payload: {
        bookingId,
        notify: {
          userId: booking.buyerId,
          kind: "booking_confirmed",
          title: "Booking confirmed",
          body: `Your booking "${booking.serviceTitleSnapshot}" is confirmed.`,
          entityType: "khidma_booking",
          entityId: bookingId,
        },
      },
    },
  ]);
}

export async function autoRefundCapturedPayment(tx: Tx, paymentId: string, reason: string): Promise<void> {
  // System-initiated refunds are attributed to the payer (requested_by has an FK to users).
  const payment = await getPaymentById(tx, paymentId);
  const requestedBy = payment?.payerId ?? paymentId;
  await refundFullHeadroom(tx, { paymentId, reason, requestedBy });
}

/** Payment lookup used by the dispute engine. */
export async function findKhidmaBookingPayment(tx: Tx, bookingId: string) {
  return findPaymentByTarget(tx, { khidmaBookingId: bookingId, category: "khidma_service" });
}
