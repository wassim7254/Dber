import { sellerProfileSchema } from "@/domains/identity/schemas";
import { updateSellerProfile } from "@/domains/identity/application/provider-profiles";
import { mutationRoute } from "@/lib/http/with-route";

export const PUT = mutationRoute({
  scope: "seller.profile.update",
  auth: ["seller"],
  body: sellerProfileSchema,
  handler: ({ tx, identity, body }) => updateSellerProfile(tx, identity, body),
});
