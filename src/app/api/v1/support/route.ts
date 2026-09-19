import { createSupportSchema } from "@/domains/engagement/support-service";
import { createSupportRequest } from "@/domains/engagement/support-service";
import { mutationRoute } from "@/lib/http/with-route";

export const POST = mutationRoute({
  scope: "support.create",
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  body: createSupportSchema,
  handler: ({ tx, identity, body }) => createSupportRequest(tx, identity, body),
});
