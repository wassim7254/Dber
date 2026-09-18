import { mutationRoute } from "@/lib/http/with-route";
import { resolveDisputeSchema } from "@/domains/disputes/schemas";
import { assertDisputeResolvePermission, resolveDispute } from "@/domains/disputes/application/dispute-service";

export const POST = mutationRoute({
  scope: "dispute.resolve",
  auth: ["admin"],
  body: resolveDisputeSchema,
  handler: async ({ tx, identity, body, params }) => {
    assertDisputeResolvePermission(identity);
    return resolveDispute(tx, identity, {
      disputeId: params.id,
      resolution: body.resolution,
      rationale: body.rationale,
      amountMinor: body.amountMinor,
    });
  },
});
