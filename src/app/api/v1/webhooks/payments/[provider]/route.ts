import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db/client";
import { createRequestContext, runWithRequestContext } from "@/infrastructure/request-context/request-context";
import { logger } from "@/infrastructure/logging/logger";
import { ingestProviderEvent, type ProviderEventType } from "@/domains/payments/application/ingest";
import { env } from "@/lib/config/env";

const PROVIDERS = new Set(["mock"]);

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

const DEV_FALLBACK_SECRET = "dber-dev-webhook-secret";

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
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
 * Payment-provider webhook entry point (§38). Signature verified (HMAC over
 * the raw body), then the canonical ingest pipeline handles dedupe,
 * out-of-order safety, and state transitions. Always answers 200 for valid
 * signatures so providers stop retrying; invalid signatures get 401.
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
    if (!verifySignature(rawBody, request.headers.get("x-dber-signature"))) {
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
