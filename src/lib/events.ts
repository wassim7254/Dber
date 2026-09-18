/**
 * DBER domain event catalog (§66–67). Every outbox event uses one of these
 * names with a payload schema versioned via EVENT_VERSION. Event names are
 * the single registry — no scattered magic strings.
 */
export const EVENT_VERSION = 1;

export const DomainEvents = {
  // SOUQ
  circleOpened: "souq.circle.opened",
  circleJoined: "souq.circle.joined",
  circleLocked: "souq.circle.locked",
  circleExpired: "souq.circle.expired",
  circleCancelled: "souq.circle.cancelled",
  circleFailedClosed: "souq.circle.failed_closed",
  circleDelivered: "souq.circle.delivered",
  circleCompleted: "souq.circle.completed",

  // KHIDMA
  requestCreated: "khidma.request.created",
  quoteSubmitted: "khidma.quote.submitted",
  bookingCreated: "khidma.booking.created",
  bookingConfirmed: "khidma.booking.confirmed",
  bookingStarted: "khidma.booking.started",
  bookingCompleted: "khidma.booking.completed",
  bookingCancelled: "khidma.booking.cancelled",

  // KRAYA
  rentalBookingCreated: "kraya.booking.created",
  rentalBookingConfirmed: "kraya.booking.confirmed",
  rentalBookingStarted: "kraya.booking.started",
  rentalBookingCompleted: "kraya.booking.completed",
  rentalBookingCancelled: "kraya.booking.cancelled",
  contractCreated: "kraya.contract.created",
  assetPublished: "kraya.asset.published",
  payoutRequested: "kraya.payout.requested",
  payoutPaid: "kraya.payout.paid",

  // PAYMENTS
  paymentRequested: "payment.requested",
  paymentCaptureRequested: "payment.capture_requested",
  paymentVoidRequested: "payment.void_requested",
  paymentAuthorized: "payment.authorized",
  paymentCaptured: "payment.captured",
  paymentFailed: "payment.failed",
  paymentVoided: "payment.voided",
  paymentReconciled: "payment.reconciled",

  // REFUNDS
  refundRequested: "refund.requested",
  refundCompleted: "refund.completed",
  refundFailed: "refund.failed",

  // CANCELLATIONS
  cancellationRequested: "cancellation.requested",
  cancellationApproved: "cancellation.approved",
  cancellationRejected: "cancellation.rejected",

  // DISPUTES
  disputeOpened: "dispute.opened",
  disputeResolved: "dispute.resolved",
} as const;

export type DomainEvent = (typeof DomainEvents)[keyof typeof DomainEvents];

export const AGGREGATE_TYPES = [
  "souq_product",
  "souq_circle",
  "souq_participant",
  "khidma_request",
  "khidma_quote",
  "khidma_booking",
  "kraya_asset",
  "kraya_booking",
  "rental_contract",
  "payment",
  "refund",
  "cancellation_request",
  "dispute",
] as const;

export type AggregateType = (typeof AGGREGATE_TYPES)[number];
