import { queryRoute } from "@/lib/http/with-route";
import { ForbiddenError, ResourceNotFoundError, UnauthorizedError } from "@/lib/errors";
import { getPaymentById } from "@/domains/payments/infrastructure/payment-repository";
import { db } from "@/db/client";

export const GET = queryRoute({
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  handler: async ({ params, identity }) => {
    if (!identity) throw new UnauthorizedError();
    const viewer = identity;
    const payment = await getPaymentById(db, params.id);
    if (!payment) throw new ResourceNotFoundError("Payment", params.id);
    if (viewer.userId !== payment.payerId && viewer.role !== "admin" && viewer.role !== "ops_admin") {
      throw new ForbiddenError("You do not own this payment");
    }
    return {
      payment: {
        id: payment.id,
        category: payment.category,
        amountMinor: payment.amountMinor,
        capturedMinor: payment.capturedMinor,
        refundedMinor: payment.refundedMinor,
        currency: payment.currency,
        state: payment.state,
        createdAt: payment.createdAt.toISOString(),
      },
    };
  },
});
