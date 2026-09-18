import { ValidationError } from "@/lib/errors";

export const SUPPORTED_CURRENCIES = ["MAD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "MAD";

/** Narrows a persisted currency code to the supported set (no unsafe casts). */
export function asCurrency(value: string): Currency {
  const found = SUPPORTED_CURRENCIES.find((candidate) => candidate === value);
  if (!found) {
    throw new ValidationError(`Unsupported currency: ${value}`);
  }
  return found;
}

export const CURRENCY_SYMBOLS: Record<Currency, string> = { MAD: "MAD" };

/**
 * Format integer minor units for display. 12500 → "125.00 MAD".
 * Integer math only — never floating point arithmetic on money.
 */
export function formatMoney(amountMinor: number, currency: Currency | string = DEFAULT_CURRENCY): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new ValidationError(`Money value is not a safe integer: ${amountMinor}`);
  }
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  return `${negative ? "-" : ""}${major}.${minor.toString().padStart(2, "0")} ${currency}`;
}

/** Formats with an explicit sign marker, e.g. refunds ("-25.00 MAD" → "+25.00 MAD" contextually). */
export function formatSignedMoney(amountMinor: number, currency: Currency = DEFAULT_CURRENCY): string {
  return amountMinor >= 0 ? `+${formatMoney(amountMinor, currency)}` : formatMoney(amountMinor, currency);
}

/**
 * Marketplace take rate applied at PAYOUT time (seller side). Buyer-facing
 * totals are never adjusted by this value. 500 bps = 5.00%.
 */
export const PLATFORM_FEE_BPS = 500;

/**
 * Platform fee for a gross amount, floored to the minor unit (integer math).
 */
export function computeMarketplaceFee(grossMinor: number): number {
  if (!Number.isSafeInteger(grossMinor) || grossMinor < 0) {
    throw new ValidationError(`Invalid payout gross amount: ${grossMinor}`);
  }
  return Math.floor((grossMinor * PLATFORM_FEE_BPS) / 10_000);
}

/**
 * Billable days for a rental interval [start, end).
 * Definition (deterministic, server-authoritative):
 *   billableDays = max(1, ceil(durationHours / 24))
 * Computed with integer-safe millisecond math.
 */
export function billableDays(start: Date, end: Date): number {
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) {
    throw new ValidationError("Rental end must be after start");
  }
  const durationHours = durationMs / 3_600_000;
  return Math.max(1, Math.ceil(durationHours / 24));
}

export interface RentalQuote {
  days: number;
  chargeMinor: number;
  depositMinor: number;
  totalAuthorizationMinor: number;
}

/** Deterministic rental pricing: charge = daily rate × billable days; authorization = charge + deposit. */
export function computeRentalQuote(input: {
  dailyRateMinor: number;
  depositMinor: number;
  start: Date;
  end: Date;
}): RentalQuote {
  const days = billableDays(input.start, input.end);
  const chargeMinor = input.dailyRateMinor * days;
  return {
    days,
    chargeMinor,
    depositMinor: input.depositMinor,
    totalAuthorizationMinor: chargeMinor + input.depositMinor,
  };
}
