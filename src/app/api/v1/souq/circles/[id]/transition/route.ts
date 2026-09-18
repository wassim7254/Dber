import { mutationRoute } from "@/lib/http/with-route";
import { circleTransitionSchema } from "@/domains/souq/schemas";
import { transitionCircle } from "@/domains/souq/application/souq-service";

export const POST = mutationRoute({
  scope: "souq.circle.transition",
  auth: ["seller", "ops_admin", "admin"],
  body: circleTransitionSchema,
  handler: ({ tx, identity, body, params }) =>
    transitionCircle(tx, { identity, circleId: params.id, action: body.action, reason: body.reason }),
});
