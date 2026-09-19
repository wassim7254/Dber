import type { Currency } from "@/lib/money";

export type GatewayOutcome = "succeeded" | "pending" | "failed";

export interface GatewayResult {
  outcome: GatewayOutcome;
  providerRef: string;
  providerEventId: string;
  failureReason?: string;
}

export interface AuthorizeInput {
  /** Deterministic key, e.g. `auth_${paymentId}` — stable across retries. */
  idempotencyKey: string;
  amountMinor: number;
  currency: Currency;
}

export interface CaptureInput {
  providerRef: string;
  idempotencyKey: string;
  amountMinor: number;
}

export interface VoidInput {
  providerRef: string;
  idempotencyKey: string;
}

export interface RefundInput {
  providerRef: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: Currency;
}

export interface PayoutInput {
  idempotencyKey: string;
  amountMinor: number;
  currency: Currency;
}

export type GatewayPaymentState = "pending" | "authorized" | "captured" | "voided" | "unknown";

/**
 * PaymentGateway port (§68/§69). The domain depends on this abstraction only;
 * provider adapters translate external states into DBER canonical states via
 * the event ingestion pipeline. All adapter operations MUST be retry-safe:
 * the same idempotency key never produces a duplicate financial effect.
 *
 * Outcome semantics:
 *  - "succeeded": the provider confirmed the financial effect — safe to ingest
 *    the corresponding canonical event immediately.
 *  - "pending": the provider accepted the request but the effect awaits
 *    customer confirmation or a provider event. The canonical state must NOT
 *    advance until a verified provider event arrives (§19: the verified
 *    provider result is authoritative, never the browser redirect).
 *  - "failed": the provider rejected the operation.
 */
export interface PaymentGateway {
  readonly provider: "mock" | "stripe";
  authorize(input: AuthorizeInput): Promise<GatewayResult>;
  capture(input: CaptureInput): Promise<GatewayResult>;
  voidPayment(input: VoidInput): Promise<GatewayResult>;
  refund(input: RefundInput): Promise<GatewayResult>;
  /** Settles provider earnings to the owner's account. */
  payout(input: PayoutInput): Promise<GatewayResult>;
  getPayment(providerRef: string): Promise<GatewayPaymentState>;
}
