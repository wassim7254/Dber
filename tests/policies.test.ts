import { describe, expect, it } from "vitest";

import { billableDays, computeRentalQuote, formatMoney } from "@/lib/money";
import { khidmaCancellationPolicy } from "@/domains/khidma/domain/policy";
import { krayaCancellationPolicy } from "@/domains/kraya/domain/policy";
import { ValidationError } from "@/lib/errors";

describe("money", () => {
  it("formats minor units with integer math", () => {
    expect(formatMoney(12500)).toBe("125.00 MAD");
    expect(formatMoney(5)).toBe("0.05 MAD");
    expect(formatMoney(0)).toBe("0.00 MAD");
  });

  it("billable days: ceil of hours/24, minimum 1", () => {
    const start = new Date("2026-09-20T10:00:00Z");
    expect(billableDays(start, new Date("2026-09-21T10:00:00Z"))).toBe(1); // exactly 24h
    expect(billableDays(start, new Date("2026-09-21T10:01:00Z"))).toBe(2); // 24h1m rounds up
    expect(billableDays(start, new Date("2026-09-20T13:00:00Z"))).toBe(1); // 3h
    expect(() => billableDays(start, start)).toThrow(ValidationError);
    expect(() => billableDays(new Date("2026-09-21T10:00:00Z"), start)).toThrow(ValidationError);
  });

  it("rental quote: charge + deposit, deterministic", () => {
    const quote = computeRentalQuote({
      dailyRateMinor: 45000,
      depositMinor: 150000,
      start: new Date("2026-09-20T10:00:00Z"),
      end: new Date("2026-09-24T10:00:00Z"),
    });
    expect(quote.days).toBe(4);
    expect(quote.chargeMinor).toBe(180000);
    expect(quote.totalAuthorizationMinor).toBe(330000);
  });
});

describe("khidma cancellation policy", () => {
  const start = new Date("2026-09-20T10:00:00Z");
  it("full refund ≥24h before", () => {
    const decision = khidmaCancellationPolicy(new Date("2026-09-19T09:00:00Z"), start, 45000);
    expect(decision).toMatchObject({ cancellable: true, basis: "full", refundMinor: 45000 });
  });
  it("50% refund within 24h (floored)", () => {
    const decision = khidmaCancellationPolicy(new Date("2026-09-20T09:00:00Z"), start, 45001);
    expect(decision).toMatchObject({ cancellable: true, basis: "partial", refundMinor: 22500 });
  });
  it("not cancellable after start", () => {
    const decision = khidmaCancellationPolicy(new Date("2026-09-20T11:00:00Z"), start, 45000);
    expect(decision).toMatchObject({ cancellable: false, basis: "none", refundMinor: 0 });
  });
});

describe("kraya cancellation policy", () => {
  const start = new Date("2026-09-20T10:00:00Z");
  it("full refund ≥24h before", () => {
    expect(krayaCancellationPolicy(new Date("2026-09-18T10:00:00Z"), start, 420000)).toMatchObject({
      basis: "full",
      refundMinor: 420000,
    });
  });
  it("50% within 24h", () => {
    expect(krayaCancellationPolicy(new Date("2026-09-19T22:00:00Z"), start, 420000)).toMatchObject({
      basis: "partial",
      refundMinor: 210000,
    });
  });
  it("active rentals are not cancellable — dispute instead", () => {
    expect(krayaCancellationPolicy(new Date("2026-09-20T15:00:00Z"), start, 420000)).toMatchObject({
      cancellable: false,
    });
  });
});
