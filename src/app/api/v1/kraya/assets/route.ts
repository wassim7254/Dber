import { mutationRoute } from "@/lib/http/with-route";
import { createAssetSchema } from "@/domains/kraya/schemas";
import { createAsset } from "@/domains/kraya/application/kraya-service";

export const POST = mutationRoute({
  scope: "kraya.asset.create",
  auth: ["seller", "rental_owner", "admin"],
  body: createAssetSchema,
  handler: ({ tx, identity, body }) => createAsset(tx, identity, body),
});
