import { mutationRoute } from "@/lib/http/with-route";
import { reviewCancellationSchema } from "@/domains/cancellations/schemas";
import {
  assertCancellationReviewPermission,
  reviewCancellation,
} from "@/domains/cancellations/application/cancellation-service";

export const POST = mutationRoute({
  scope: "cancellation.review",
  auth: ["ops_admin", "admin"],
  body: reviewCancellationSchema,
  handler: async ({ tx, identity, body, params }) => {
    assertCancellationReviewPermission(identity);
    return reviewCancellation(tx, identity, {
      cancellationId: params.id,
      decision: body.decision,
      decisionReason: body.decisionReason,
    });
  },
});
