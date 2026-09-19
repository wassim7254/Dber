import { switchActiveRole } from "@/domains/identity/application/role-service";
import { switchRoleSchema } from "@/domains/identity/schemas";
import { mutationRoute } from "@/lib/http/with-route";

/** Switches the active workspace context (§21). Server-validated entitlement. */
export const POST = mutationRoute({
  scope: "account.role.switch",
  auth: ["buyer", "seller", "professional", "rental_owner"],
  body: switchRoleSchema,
  handler: ({ tx, identity, body }) => switchActiveRole(tx, identity, body.role),
});
