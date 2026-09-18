export type RefundBasis = "full" | "partial" | "none";

export interface CancellationDecision {
  cancellable: boolean;
  basis: RefundBasis;
  /** Integer minor units to refund of the paid service/rental amount (deposit handled separately). */
  refundMinor: number;
  explanation: string;
}

/**
 * KHIDMA cancellation policy (deterministic, unit-tested):
 *  - ≥ 24h before start: full refund.
 *  - < 24h before start (but not started): 50% refund (floored to the minor unit).
 *  - after start: not cancellable — open a dispute instead.
 * Provider-initiated cancellations always refund in full (handled by the caller).
 */
export function khidmaCancellationPolicy(
  now: Date,
  startTime: Date,
  priceMinor: number,
): CancellationDecision {
  const hoursUntilStart = (startTime.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntilStart >= 24) {
    return {
      cancellable: true,
      basis: "full",
      refundMinor: priceMinor,
      explanation: "Cancelled more than 24 hours before the start — full refund.",
    };
  }
  if (hoursUntilStart > 0) {
    return {
      cancellable: true,
      basis: "partial",
      refundMinor: Math.floor(priceMinor / 2),
      explanation: "Cancelled within 24 hours of the start — 50% refund.",
    };
  }
  return {
    cancellable: false,
    basis: "none",
    refundMinor: 0,
    explanation: "The service has already started — open a dispute instead.",
  };
}
