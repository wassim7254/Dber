import { updateProductSchema } from "@/domains/souq/schemas";
import { updateProduct } from "@/domains/souq/application/souq-service";
import { mutationRoute } from "@/lib/http/with-route";

export const PATCH = mutationRoute({
  scope: "souq.product.update",
  auth: ["seller"],
  body: updateProductSchema,
  handler: ({ tx, identity, body, params }) => updateProduct(tx, identity, params.id, body),
});
