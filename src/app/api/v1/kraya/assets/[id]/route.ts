import { updateAssetSchema } from "@/domains/kraya/schemas";
import { updateAsset } from "@/domains/kraya/application/kraya-service";
import { mutationRoute } from "@/lib/http/with-route";

export const PATCH = mutationRoute({
  scope: "kraya.asset.update",
  auth: ["seller", "rental_owner"],
  body: updateAssetSchema,
  handler: ({ tx, identity, body, params }) => updateAsset(tx, identity, params.id, body),
});
