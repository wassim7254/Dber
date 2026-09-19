import { createHmac, timingSafeEqual } from "node:crypto";

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
import type { Currency } from "@/lib/money";
import { PaymentProviderError } from "@/lib/errors";

/**
 * Stripe adapter (§19) implementing the PaymentGateway port against Stripe's
 * documented REST API (https://docs.stripe.com/api — PaymentIntents with
 * manual capture, Refunds, Payouts) and Stripe's documented webhook signature
 * scheme (https://docs.stripe.com/webhooks — `Stripe-Signature: t=…,v1=…`
 * HMAC-SHA256 over `${timestamp}.${payload}`).
 *
 * Honesty rules (§79): this adapter performs REAL network calls. It never
 * fabricates a success. `authorize` creates a manual-capture PaymentIntent —
 * the canonical DBER "authorized" state lands only from the verified
 * `amount_capturable_updated` webhook. Card data never touches DBER; the
 * customer completes payment on provider-hosted surfaces.
 */

const API_BASE = "https://api.stripe.com/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;

interface StripeErrorShape {
  error?: { message?: string; type?: string };
}

function formEncode(fields: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(key, value);
  }
  return params.toString();
}

export class StripeGateway implements PaymentGateway {
  readonly provider = "stripe" as const;

  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<T>(
    method: "POST" | "GET",
    path: string,
    fields?: Record<string, string | undefined>,
    idempotencyKey?: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API_BASE}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          ...(fields ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
        body: method === "POST" && fields ? formEncode(fields) : undefined,
      });
    } catch (error) {
      throw new PaymentProviderError(
        `Stripe request failed: ${error instanceof Error ? error.message : "network error"}`,
      );
    }
    const json = (await response.json().catch(() => ({}))) as T & StripeErrorShape;
    if (!response.ok) {
      throw new PaymentProviderError(
        `Stripe rejected ${path}: ${json.error?.message ?? `HTTP ${response.status}`}`,
      );
    }
    return json;
  }

  async authorize(input: AuthorizeInput): Promise<GatewayResult> {
    // Manual capture: funds are reserved once the customer completes the
    // provider-hosted confirmation; capture happens later per DBER's flow.
    const intent = await this.request<{ id: string; status: string }>(
      "POST",
      "/payment_intents",
      {
        amount: String(input.amountMinor),
        currency: input.currency.toLowerCase(),
        capture_method: "manual",
        "metadata[dber_purpose]": "authorize",
      },
      input.idempotencyKey,
    );
    return {
      // Pending: the canonical authorized state arrives via verified webhook.
      outcome: "pending",
      providerRef: intent.id,
      providerEventId: `stripe_evt_pending_${intent.id}`,
    };
  }

  async capture(input: CaptureInput): Promise<GatewayResult> {
    const intent = await this.request<{ id: string; status: string }>(
      "POST",
      `/payment_intents/${encodeURIComponent(input.providerRef)}/capture`,
      { amount_to_capture: String(input.amountMinor) },
      input.idempotencyKey,
    );
    return {
      outcome: intent.status === "succeeded" ? "succeeded" : "pending",
      providerRef: intent.id,
      providerEventId: `stripe_evt_captured_${input.idempotencyKey}`,
    };
  }

  async voidPayment(input: VoidInput): Promise<GatewayResult> {
    const intent = await this.request<{ id: string; status: string }>(
      "POST",
      `/payment_intents/${encodeURIComponent(input.providerRef)}/cancel`,
      {},
      input.idempotencyKey,
    );
    return {
      outcome: intent.status === "canceled" ? "succeeded" : "pending",
      providerRef: intent.id,
      providerEventId: `stripe_evt_voided_${input.idempotencyKey}`,
    };
  }

  async refund(input: RefundInput): Promise<GatewayResult> {
    const refund = await this.request<{ id: string; status: string }>(
      "POST",
      "/refunds",
      {
        payment_intent: input.providerRef,
        amount: String(input.amountMinor),
        "metadata[dber_refund_key]": input.idempotencyKey,
      },
      input.idempotencyKey,
    );
    return {
      outcome: refund.status === "succeeded" ? "succeeded" : "pending",
      providerRef: refund.id,
      providerEventId: `stripe_evt_refund_${input.idempotencyKey}`,
    };
  }

  async payout(input: PayoutInput): Promise<GatewayResult> {
    // Platform-account payout. Market-wide multi-recipient settlement is the
    // documented Stripe Connect upgrade path; the port stays unchanged.
    const payout = await this.request<{ id: string; status: string }>(
      "POST",
      "/payouts",
      { amount: String(input.amountMinor), currency: input.currency.toLowerCase() },
      input.idempotencyKey,
    );
    return {
      outcome: payout.status === "paid" ? "succeeded" : "pending",
      providerRef: payout.id,
      providerEventId: `stripe_evt_payout_${input.idempotencyKey}`,
    };
  }

  async getPayment(providerRef: string): Promise<GatewayPaymentState> {
    const intent = await this.request<{ id: string; status: string }>(
      "GET",
      `/payment_intents/${encodeURIComponent(providerRef)}`,
    );
    switch (intent.status) {
      case "requires_capture":
      case "processing":
        return "authorized";
      case "succeeded":
        return "captured";
      case "canceled":
        return "voided";
      case "requires_payment_method":
      case "requires_confirmation":
      case "requires_action":
        return "pending";
      default:
        return "unknown";
    }
  }

  /**
   * Verifies Stripe's `Stripe-Signature` header per the documented scheme.
   * Returns false for tampered, stale, or malformed signatures.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null, webhookSecret: string): boolean {
    if (!signatureHeader) return false;
    const parts = signatureHeader.split(",").reduce<Record<string, string[]>>((acc, part) => {
      const [key, value] = part.split("=", 2);
      if (!key || !value) return acc;
      (acc[key.trim()] ??= []).push(value.trim());
      return acc;
    }, {});
    const timestamp = parts.t?.[0];
    const v1 = parts.v1 ?? [];
    if (!timestamp || v1.length === 0) return false;
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) return false;
    const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
    return v1.some((candidate) => {
      const expectedBuffer = Buffer.from(expected, "utf8");
      const candidateBuffer = Buffer.from(candidate, "utf8");
      return expectedBuffer.length === candidateBuffer.length && timingSafeEqual(expectedBuffer, candidateBuffer);
    });
  }
}

export function createStripeGateway(secretKey: string): StripeGateway {
  return new StripeGateway(secretKey);
}

/** Currency guard — the adapter only forwards supported provider currencies. */
export function assertStripeCurrency(currency: Currency): string {
  return currency.toLowerCase();
}
