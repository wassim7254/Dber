import { updateSupportSchema } from "@/domains/engagement/support-service";
import { updateSupportRequest } from "@/domains/engagement/support-service";
import { mutationRoute } from "@/lib/http/with-route";

export const POST = mutationRoute({
  scope: "support.update",
  auth: ["ops_admin", "admin"],
  body: updateSupportSchema,
  handler: ({ tx, identity, body, params }) => updateSupportRequest(tx, identity, params.id, body),
});
