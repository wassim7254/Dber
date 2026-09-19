import { rentalProviderProfileSchema } from "@/domains/kraya/schemas";
import { updateRentalProviderProfile } from "@/domains/identity/application/provider-profiles";
import { mutationRoute } from "@/lib/http/with-route";

export const PUT = mutationRoute({
  scope: "rental_provider.profile.update",
  auth: ["seller", "rental_owner"],
  body: rentalProviderProfileSchema,
  handler: ({ tx, identity, body }) => updateRentalProviderProfile(tx, identity, body),
});
