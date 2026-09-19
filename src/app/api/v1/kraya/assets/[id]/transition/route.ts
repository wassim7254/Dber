import { mutationRoute } from "@/lib/http/with-route";
import { assetTransitionSchema } from "@/domains/kraya/schemas";
import { transitionAsset } from "@/domains/kraya/application/kraya-service";

/** Asset lifecycle: publish (wizard's final step), pause, archive. */
export const POST = mutationRoute({
  scope: "kraya.asset.transition",
  auth: ["seller", "rental_owner", "admin"],
  body: assetTransitionSchema,
  handler: ({ tx, identity, body, params }) =>
    transitionAsset(tx, identity, { assetId: params.id, action: body.action }),
});
