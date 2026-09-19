import { z } from "zod";

import { activateParticipantRole } from "@/domains/identity/application/role-service";
import { mutationRoute } from "@/lib/http/with-route";

const bodySchema = z.object({
  role: z.enum(["seller", "professional", "rental_owner"]),
});

/** Self-serve role activation (§14/§20): "Become a seller / professional / rental owner". */
export const POST = mutationRoute({
  scope: "account.role.activate",
  auth: ["buyer", "seller", "professional", "rental_owner"],
  body: bodySchema,
  handler: ({ tx, identity, body }) => activateParticipantRole(tx, identity, body.role),
});
