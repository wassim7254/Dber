import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db/client";
import { createRequestContext, runWithRequestContext } from "@/infrastructure/request-context/request-context";
import { logger } from "@/infrastructure/logging/logger";
import { ingestProviderEvent, type ProviderEventType } from "@/domains/payments/application/ingest";
import { env } from "@/lib/config/env";
import { StripeGateway } from "@/infrastructure/payments/stripe-gateway";

const PROVIDERS = new Set(["mock", "stripe"]);

const webhookEventSchema = z.object({
  providerEventId: z.string().min(6).max(200),
  eventType: z.enum([
    "payment.authorized",
    "payment.captured",
    "payment.capture_failed",
    "payment.failed",
    "payment.voided",
    "refund.completed",
    "refund.failed",
  ] satisfies ProviderEventType[]),
  providerRef: z.string().min(4).max(200).optional(),
  paymentId: z.string().uuid().optional(),
  refundId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
});

/** Documented Stripe event types we translate into canonical DBER events. */
const STRIPE_EVENT_TRANSLATION: Record<string, ProviderEventType> = {
  "payment_intent.amount_capturable_updated": "payment.authorized",
  "payment_intent.succeeded": "payment.captured",
  "payment_intent.payment_failed": "payment.failed",
  "payment_intent.canceled": "payment.voided",
  "charge.refunded": "refund.completed",
  "charge.refund.updated": "refund.completed",
};

const DEV_FALLBACK_SECRET = "dber-dev-webhook-secret";

function verifyMockSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = env.DBER_WEBHOOK_SECRET ?? DEV_FALLBACK_SECRET;
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Payment-provider webhook entry point (§38). Signature verified per provider
 * (DBER HMAC for mock callbacks, Stripe's documented scheme for stripe), then
 * the canonical ingest pipeline handles dedupe, out-of-order safety, and
 * state transitions. Always answers 200 for valid signatures so providers
 * stop retrying; invalid signatures get 401.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await params;
  return runWithRequestContext(createRequestContext({ kind: "http" }), async () => {
    if (!PROVIDERS.has(provider)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown provider" } }, { status: 404 });
    }
    const rawBody = await request.text();

    if (provider === "stripe") {
      if (!env.STRIPE_WEBHOOK_SECRET) {
        logger.error("webhook_stripe_unconfigured");
        return NextResponse.json(
          { error: { code: "CONFIGURATION", message: "Stripe webhooks are not configured" } },
          { status: 503 },
        );
      }
      const gateway = new StripeGateway(env.STRIPE_SECRET_KEY ?? "");
      if (!gateway.verifyWebhook(rawBody, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET)) {
        logger.warn("webhook_signature_rejected", { provider });
        return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Invalid signature" } }, { status: 401 });
      }
      return ingestStripeEvent(rawBody);
    }

    if (!verifyMockSignature(rawBody, request.headers.get("x-dber-signature"))) {
      logger.warn("webhook_signature_rejected", { provider });
      return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Invalid signature" } }, { status: 401 });
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Malformed JSON" } }, { status: 400 });
    }
    const parsed = webhookEventSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "Invalid webhook event" } },
        { status: 400 },
      );
    }
    const payload: Record<string, string> = {};
    if (parsed.data.providerRef) payload.providerRef = parsed.data.providerRef;
    if (parsed.data.paymentId) payload.paymentId = parsed.data.paymentId;
    if (parsed.data.refundId) payload.refundId = parsed.data.refundId;
    if (parsed.data.reason) payload.reason = parsed.data.reason;

    const result = await ingestProviderEvent(db, {
      provider: "mock",
      providerEventId: parsed.data.providerEventId,
      eventType: parsed.data.eventType,
      payload,
      signatureVerified: true,
    });
    logger.info("webhook_ingested", { provider, eventType: parsed.data.eventType, duplicate: result.duplicate });
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  });
}

/** Translates a verified Stripe event envelope into the canonical pipeline. */
function ingestStripeEvent(rawBody: string): Promise<Response> {
  let parsed: {
    id?: string;
    type?: string;
    data?: { object?: { id?: string; status?: string; metadata?: Record<string, string> } };
  };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Promise.resolve(
      NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Malformed JSON" } }, { status: 400 }),
    );
  }
  if (!parsed.id || !parsed.type) {
    return Promise.resolve(
      NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Invalid Stripe event" } }, { status: 400 }),
    );
  }
  const canonicalType = STRIPE_EVENT_TRANSLATION[parsed.type];
  if (!canonicalType) {
    // Documented behavior: acknowledge unhandled event types without processing.
    logger.info("webhook_stripe_ignored", { type: parsed.type });
    return Promise.resolve(NextResponse.json({ received: true, ignored: true }));
  }
  const object = parsed.data?.object ?? {};
  const metadata = object.metadata ?? {};
  const payload: Record<string, string> = {};
  if (object.id) payload.providerRef = object.id;
  if (metadata.payment_id) payload.paymentId = metadata.payment_id;
  if (metadata.refund_id) payload.refundId = metadata.refund_id;

  return ingestProviderEvent(db, {
    provider: "stripe",
    providerEventId: parsed.id,
    eventType: canonicalType,
    payload,
    signatureVerified: true,
  })
    .then((result) => {
      logger.info("webhook_ingested", { provider: "stripe", eventType: canonicalType, duplicate: result.duplicate });
      return NextResponse.json({ received: true, duplicate: result.duplicate });
    })
    .catch((error: unknown) => {
      logger.error("webhook_stripe_processing_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // 500 so Stripe retries; dedupe makes redelivery safe.
      return NextResponse.json({ error: { code: "INTERNAL", message: "Processing failed" } }, { status: 500 });
    });
}
