import { mutationRoute } from "@/lib/http/with-route";
import { joinCircleSchema } from "@/domains/souq/schemas";
import { joinCircle } from "@/domains/souq/application/souq-service";

/**
 * POST /api/v1/souq/circles/:id/join (§64)
 * Auth: buyer. Idempotency: required. Transaction: duplicate-join guard →
 * atomic conditional capacity UPDATE → payment intent → audit → outbox →
 * (lock when target reached) → commit.
 */
export const POST = mutationRoute({
  scope: "souq.circle.join",
  auth: ["buyer"],
  body: joinCircleSchema,
  rateLimit: { limit: 30, windowMs: 60_000 },
  handler: ({ tx, identity, body, params }) =>
    joinCircle(tx, { identity, circleId: params.id, quantity: body.quantity }),
});
