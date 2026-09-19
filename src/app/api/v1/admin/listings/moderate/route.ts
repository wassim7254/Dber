import { moderateListingSchema } from "@/domains/identity/application/listing-moderation";
import { moderateListing } from "@/domains/identity/application/listing-moderation";
import { mutationRoute } from "@/lib/http/with-route";

export const POST = mutationRoute({
  scope: "admin.listings.moderate",
  auth: ["ops_admin", "admin"],
  body: moderateListingSchema,
  handler: ({ tx, identity, body }) => moderateListing(tx, identity, body),
});
