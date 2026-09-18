import { mutationRoute } from "@/lib/http/with-route";
import { ForbiddenError, PaymentStateError, ResourceNotFoundError } from "@/lib/errors";
import { getPaymentById, enqueuePaymentIntent } from "@/domains/payments/infrastructure/payment-repository";
import { recordAudit } from "@/infrastructure/audit/writer";
import { z } from "zod";

const emptyBody = z.object({}).optional();

/**
 * Buyer-initiated capture ("Confirm and pay"). The outbox handler performs
 * the provider call; this route only validates state and enqueues intent.
 */
export const POST = mutationRoute({
  scope: "payment.capture",
  auth: ["buyer", "seller", "professional", "admin"],
  rateLimit: { limit: 20, windowMs: 60_000 },
  body: emptyBody,
  handler: async ({ tx, identity, params }) => {
    const payment = await getPaymentById(tx, params.id);
    if (!payment) throw new ResourceNotFoundError("Payment", params.id);
    if (identity.userId !== payment.payerId && identity.role !== "admin") {
      throw new ForbiddenError("You do not own this payment");
    }
    if (payment.state === "captured" || payment.state === "capture_pending") {
      return { paymentId: payment.id, state: payment.state };
    }
    if (payment.state !== "authorized") {
      throw new PaymentStateError(`Payment is ${payment.state} and cannot be captured`, {
        paymentId: payment.id,
        state: payment.state,
      });
    }
    await recordAudit(tx, {
      actorId: identity.userId,
      actorRole: identity.role,
      action: "payment.capture_requested",
      entityType: "payment",
      entityId: payment.id,
      metadata: { category: payment.category, amountMinor: payment.amountMinor },
    });
    await enqueuePaymentIntent(tx, payment.id, "capture");
    return { paymentId: payment.id, state: "capture_pending" };
  },
});
