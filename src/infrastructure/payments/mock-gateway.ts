import { createHash } from "node:crypto";

import type {
  AuthorizeInput,
  CaptureInput,
  GatewayPaymentState,
  GatewayResult,
  PaymentGateway,
  PayoutInput,
  RefundInput,
  VoidInput,
} from "@/infrastructure/payments/gateway";

/**
 * Deterministic mock gateway. Real providers are integrated by implementing
 * PaymentGateway — nothing else in the system changes.
 *
 * Deterministic failure rules (used by tests and demo flows):
 *  - authorization fails when `amountMinor % 100 === 13`  (card_declined)
 *  - capture fails when       `amountMinor % 100 === 29`  (processor_unavailable, retryable)
 *  - void and refund always succeed.
 *
 * Provider references are derived from idempotency keys so that retries and
 * crash recovery produce the SAME ref — duplicate delivery is harmless.
 */
function stableId(kind: string, key: string): string {
  return `mock_${kind}_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

/** Deterministic authorization ref, assigned at intent time so reconciliation can query the provider even after a crash. */
export function expectedAuthRef(idempotencyKey: string): string {
  return stableId("auth", idempotencyKey);
}

/** Deterministic refund ref, assigned before the provider call. */
export function expectedRefundRef(idempotencyKey: string): string {
  return stableId("refund", idempotencyKey);
}

export class MockGateway implements PaymentGateway {
  readonly provider = "mock" as const;

  async authorize(input: AuthorizeInput): Promise<GatewayResult> {
    const providerRef = stableId("auth", input.idempotencyKey);
    const providerEventId = stableId("evt", `${input.idempotencyKey}:authorized`);
    if (Math.abs(input.amountMinor) % 100 === 13) {
      return {
        outcome: "failed",
        providerRef,
        providerEventId: stableId("evt", `${input.idempotencyKey}:failed`),
        failureReason: "card_declined",
      };
    }
    return { outcome: "succeeded", providerRef, providerEventId };
  }

  async capture(input: CaptureInput): Promise<GatewayResult> {
    if (Math.abs(input.amountMinor) % 100 === 29) {
      return {
        outcome: "failed",
        providerRef: input.providerRef,
        providerEventId: stableId("evt", `${input.idempotencyKey}:capture_failed`),
        failureReason: "processor_unavailable",
      };
    }
    return {
      outcome: "succeeded",
      providerRef: input.providerRef,
      providerEventId: stableId("evt", `${input.idempotencyKey}:captured`),
    };
  }

  async voidPayment(input: VoidInput): Promise<GatewayResult> {
    return {
      outcome: "succeeded",
      providerRef: input.providerRef,
      providerEventId: stableId("evt", `${input.idempotencyKey}:voided`),
    };
  }

  async refund(input: RefundInput): Promise<GatewayResult> {
    return {
      outcome: "succeeded",
      providerRef: stableId("refund", input.idempotencyKey),
      providerEventId: stableId("evt", `${input.idempotencyKey}:refund_completed`),
    };
  }

  async payout(input: PayoutInput): Promise<GatewayResult> {
    return {
      outcome: "succeeded",
      providerRef: stableId("payout", input.idempotencyKey),
      providerEventId: stableId("evt", `${input.idempotencyKey}:payout_paid`),
    };
  }

  async getPayment(providerRef: string): Promise<GatewayPaymentState> {
    // The mock has no external store; reconciliation treats unknown refs as
    // "still processing" so the payment remains in its DBER state.
    return providerRef.startsWith("mock_auth_") ? "authorized" : "unknown";
  }
}
