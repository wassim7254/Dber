import type { Currency } from "@/lib/money";

export type RefundBasis = "full" | "partial" | "none";

export interface CancellationDecision {
  cancellable: boolean;
  basis: RefundBasis;
  /** Integer minor units to refund of the paid rental amount (deposit handled separately). */
  refundMinor: number;
  explanation: string;
}

/**
 * KRAYA rental cancellation policy (deterministic, unit-tested):
 *  - ≥ 24h before start: full rental refund.
 *  - < 24h before start (but not started): 50% rental refund (floored).
 *  - after start (active): not cancellable — open a dispute instead.
 * The deposit is ALWAYS released in full on cancellation (caller responsibility).
 * Owner-initiated cancellations refund the rental in full (caller responsibility).
 */
export function krayaCancellationPolicy(
  now: Date,
  startTime: Date,
  totalChargeMinor: number,
): CancellationDecision {
  const hoursUntilStart = (startTime.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntilStart >= 24) {
    return {
      cancellable: true,
      basis: "full",
      refundMinor: totalChargeMinor,
      explanation: "Cancelled more than 24 hours before the rental — full refund.",
    };
  }
  if (hoursUntilStart > 0) {
    return {
      cancellable: true,
      basis: "partial",
      refundMinor: Math.floor(totalChargeMinor / 2),
      explanation: "Cancelled within 24 hours of the rental — 50% refund.",
    };
  }
  return {
    cancellable: false,
    basis: "none",
    refundMinor: 0,
    explanation: "The rental has already started — open a dispute instead.",
  };
}

export interface CheckoutLine {
  label: string;
  amountMinor: number;
}

/** Universal checkout price breakdown for a rental (server-authoritative, §25/§30). */
export function buildRentalCheckoutLines(input: {
  dailyRateMinor: number;
  days: number;
  depositMinor: number;
}): CheckoutLine[] {
  return [
    {
      label: `Rental charge (${input.days} day${input.days === 1 ? "" : "s"} × daily rate)`,
      amountMinor: input.dailyRateMinor * input.days,
    },
    { label: "Refundable deposit hold", amountMinor: input.depositMinor },
  ];
}

export type KrayaCurrency = Currency;
