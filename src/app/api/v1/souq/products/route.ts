import { mutationRoute } from "@/lib/http/with-route";
import { createProductSchema } from "@/domains/souq/schemas";
import { createProduct } from "@/domains/souq/application/souq-service";

export const POST = mutationRoute({
  scope: "souq.product.create",
  auth: ["seller"],
  body: createProductSchema,
  handler: ({ tx, identity, body }) => createProduct(tx, identity, body),
});
