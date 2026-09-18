import { mutationRoute } from "@/lib/http/with-route";
import { openDisputeSchema } from "@/domains/disputes/schemas";
import { openDispute } from "@/domains/disputes/application/dispute-service";

export const POST = mutationRoute({
  scope: "dispute.open",
  auth: ["buyer", "seller", "professional", "admin"],
  body: openDisputeSchema,
  handler: ({ tx, identity, body }) => openDispute(tx, identity, body),
});
